import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";

const app = express();
const httpServer = createServer(app);

const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

const BOARD_SIZE = 10;
const SHOTS_PER_TURN = 3;
const ROOM_TURN_SECONDS = 20;
const ROOM_TIMEOUT_SWEEP_MS = 500;
const WATER = -1;
const FLEET = [5, 4, 4, 3, 3, 3, 2, 2, 2, 2] as const;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type OpponentId = string | null;
type TurnMark = "unknown" | "miss" | "hit";
type RoomPhase = "lobby" | "playing" | "finished";

interface Placement {
  shipGrid: number[][];
  shipLengths: number[];
}

interface RoomPlayerState {
  socketId: string;
  shipGrid: number[][];
  shipLengths: number[];
  shipHits: number[];
  radar: TurnMark[][];
  shotsFired: number;
  hits: number;
}

interface RoomState {
  code: string;
  hostId: string;
  guestId: string | null;
  phase: RoomPhase;
  turnSocketId: string | null;
  shotsLeft: number;
  round: number;
  winnerSocketId: string | null;
  turnDeadlineMs: number | null;
  lastTimerSecondBroadcast: number | null;
  players: Map<string, RoomPlayerState>;
  log: string[];
}

interface RoomViewPayload {
  roomCode: string;
  phase: RoomPhase;
  youRole: "host" | "guest";
  opponentConnected: boolean;
  yourTurn: boolean;
  shotsLeft: number;
  turnSecondsLeft: number;
  round: number;
  winner: "you" | "opponent" | null;
  playerRadar: TurnMark[][];
  defenseRadar: TurnMark[][];
  playerShipGrid: number[][];
  yourDecksLeft: number;
  enemyDecksLeft: number;
  status: string;
  log: string[];
}

interface RoomActionAck {
  ok: boolean;
  error?: string;
  roomCode?: string;
}

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sea-war-socket",
    timestamp: new Date().toISOString(),
  });
});

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
    credentials: true,
  },
  transports: ["polling", "websocket"],
});

const clients = new Map<string, OpponentId>();
const rooms = new Map<string, RoomState>();
const socketToRoom = new Map<string, string>();

function getSocketById(socketId: string): Socket | undefined {
  return io.of("/").sockets.get(socketId);
}

function createGrid<T>(value: T): T[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => value)
  );
}

function cloneGrid<T>(grid: T[][]): T[][] {
  return grid.map((row) => row.slice());
}

function randomInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

function isInside(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function canPlaceShip(
  grid: number[][],
  row: number,
  col: number,
  length: number,
  horizontal: boolean
): boolean {
  for (let i = 0; i < length; i += 1) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;

    if (!isInside(r, c)) return false;
    if (grid[r][c] !== WATER) return false;

    for (let rr = r - 1; rr <= r + 1; rr += 1) {
      for (let cc = c - 1; cc <= c + 1; cc += 1) {
        if (isInside(rr, cc) && grid[rr][cc] !== WATER) {
          return false;
        }
      }
    }
  }

  return true;
}

function placeFleetRandomly(fleet: readonly number[]): Placement {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const grid = createGrid<number>(WATER);
    const lengths: number[] = [];
    let failed = false;

    for (let shipId = 0; shipId < fleet.length; shipId += 1) {
      const length = fleet[shipId];
      let placed = false;

      for (let tries = 0; tries < 500; tries += 1) {
        const horizontal = Math.random() < 0.5;
        const row = randomInt(horizontal ? BOARD_SIZE : BOARD_SIZE - length + 1);
        const col = randomInt(horizontal ? BOARD_SIZE - length + 1 : BOARD_SIZE);
        if (!canPlaceShip(grid, row, col, length, horizontal)) continue;

        for (let i = 0; i < length; i += 1) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;
          grid[r][c] = shipId;
        }

        lengths.push(length);
        placed = true;
        break;
      }

      if (!placed) {
        failed = true;
        break;
      }
    }

    if (!failed) return { shipGrid: grid, shipLengths: lengths };
  }

  throw new Error("Failed to place fleet in room state.");
}

function isFleetDestroyed(shipHits: number[], shipLengths: number[]): boolean {
  return shipHits.every((hits, index) => hits >= shipLengths[index]);
}

function countRemainingDecks(shipHits: number[], shipLengths: number[]): number {
  return shipLengths.reduce((sum, length, index) => {
    return sum + Math.max(0, length - shipHits[index]);
  }, 0);
}

function formatCoord(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

interface Coord {
  row: number;
  col: number;
}

function getUnknownRadarCells(radar: TurnMark[][]): Coord[] {
  const cells: Coord[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (radar[row][col] === "unknown") {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

function advanceRoomTurn(room: RoomState, nextSocketId: string): void {
  room.turnSocketId = nextSocketId;
  room.shotsLeft = SHOTS_PER_TURN;
  room.round += 1;
  room.turnDeadlineMs = Date.now() + ROOM_TURN_SECONDS * 1000;
  room.lastTimerSecondBroadcast = null;
  room.log.unshift("Turn switched.");
  trimLog(room);
}

function applyRoomShot(
  room: RoomState,
  shooterId: string,
  row: number,
  col: number,
  source: "manual" | "timeout"
): RoomActionAck {
  if (room.phase !== "playing") {
    return { ok: false, error: "Match has not started yet." };
  }

  if (room.turnSocketId !== shooterId) {
    return { ok: false, error: "It is not your turn." };
  }

  if (!Number.isInteger(row) || !Number.isInteger(col) || !isInside(row, col)) {
    return { ok: false, error: "Invalid target cell." };
  }

  const shooter = room.players.get(shooterId);
  const opponentId = getOpponentId(room, shooterId);
  const opponent = opponentId ? room.players.get(opponentId) : undefined;

  if (!shooter || !opponent || !opponentId) {
    return { ok: false, error: "Match state is incomplete." };
  }

  if (shooter.radar[row][col] !== "unknown") {
    return { ok: false, error: "This cell was already targeted." };
  }

  const coord = formatCoord(row, col);
  const actor = getRole(room, shooterId) === "host" ? "Host" : "Guest";
  const prefix = source === "timeout" ? "Auto-fire: " : "";
  shooter.shotsFired += 1;

  const shipId = opponent.shipGrid[row][col];
  if (shipId !== WATER) {
    shooter.radar[row][col] = "hit";
    shooter.hits += 1;
    opponent.shipHits[shipId] += 1;
    room.log.unshift(`${prefix}${actor} hit at ${coord}.`);
  } else {
    shooter.radar[row][col] = "miss";
    room.log.unshift(`${prefix}${actor} missed at ${coord}.`);
  }
  trimLog(room);

  if (isFleetDestroyed(opponent.shipHits, opponent.shipLengths)) {
    room.phase = "finished";
    room.turnSocketId = null;
    room.shotsLeft = 0;
    room.winnerSocketId = shooterId;
    room.turnDeadlineMs = null;
    room.lastTimerSecondBroadcast = null;
    room.log.unshift(`${actor} wins the match.`);
    trimLog(room);
    return { ok: true, roomCode: room.code };
  }

  room.shotsLeft -= 1;
  if (room.shotsLeft <= 0) {
    advanceRoomTurn(room, opponentId);
  }

  return { ok: true, roomCode: room.code };
}

function resolveTurnTimeout(room: RoomState): boolean {
  if (room.phase !== "playing") return false;
  if (!room.turnSocketId) return false;
  if (!room.turnDeadlineMs) return false;
  if (Date.now() < room.turnDeadlineMs) return false;

  const timedOutSocketId = room.turnSocketId;
  const actor = getRole(room, timedOutSocketId) === "host" ? "Host" : "Guest";
  room.log.unshift(`${actor} turn timer expired. Auto-fire engaged.`);
  trimLog(room);

  while (
    room.phase === "playing" &&
    room.turnSocketId === timedOutSocketId &&
    room.shotsLeft > 0
  ) {
    const shooter = room.players.get(timedOutSocketId);
    if (!shooter) break;

    const unknownCells = getUnknownRadarCells(shooter.radar);
    const target =
      unknownCells.length > 0
        ? unknownCells[randomInt(unknownCells.length)]
        : null;
    if (!target) {
      const opponentId = getOpponentId(room, timedOutSocketId);
      if (opponentId) {
        advanceRoomTurn(room, opponentId);
      }
      break;
    }

    const result = applyRoomShot(
      room,
      timedOutSocketId,
      target.row,
      target.col,
      "timeout"
    );

    if (!result.ok) break;
  }

  return true;
}

function waitingCount(): number {
  let waiting = 0;
  for (const opponentId of clients.values()) {
    if (opponentId === null) waiting += 1;
  }
  return waiting;
}

function emitQueueStats(): void {
  io.emit("queue:size", {
    waiting: waitingCount(),
    connected: clients.size,
  });
}

function findWaitingClient(excludedIds: Set<string>): string | null {
  for (const [socketId, opponentId] of clients.entries()) {
    if (opponentId === null && !excludedIds.has(socketId)) {
      return socketId;
    }
  }
  return null;
}

function pairClients(firstSocketId: string, secondSocketId: string): void {
  clients.set(firstSocketId, secondSocketId);
  clients.set(secondSocketId, firstSocketId);
  getSocketById(firstSocketId)?.emit("opponent", secondSocketId);
  getSocketById(secondSocketId)?.emit("opponent", firstSocketId);
}

function addClient(socket: Socket, avoidOpponentId?: string): void {
  if (!clients.has(socket.id)) {
    clients.set(socket.id, null);
  }

  const excludedIds = new Set<string>([socket.id]);
  if (avoidOpponentId) excludedIds.add(avoidOpponentId);
  const waitingSocketId = findWaitingClient(excludedIds);

  if (waitingSocketId) {
    pairClients(waitingSocketId, socket.id);
  } else {
    clients.set(socket.id, null);
    socket.emit("opponent", null);
  }

  emitQueueStats();
}

function removeClient(socket: Socket): void {
  const opponentId = clients.get(socket.id) ?? null;
  clients.delete(socket.id);

  if (opponentId) {
    clients.set(opponentId, null);
    const opponentSocket = getSocketById(opponentId);
    opponentSocket?.emit("opponent", null);
    opponentSocket?.emit("system", { type: "opponent-left" });
  }

  emitQueueStats();
}

function relayToOpponent(socket: Socket, eventName: string, payload: unknown): void {
  const opponentId = clients.get(socket.id);
  if (!opponentId) {
    socket.emit("system", {
      type: "no-opponent",
      event: eventName,
    });
    return;
  }

  const opponentSocket = getSocketById(opponentId);
  if (!opponentSocket) {
    clients.set(socket.id, null);
    socket.emit("opponent", null);
    socket.emit("system", {
      type: "opponent-offline",
      event: eventName,
    });
    emitQueueStats();
    return;
  }

  opponentSocket.emit(eventName, payload);
}

function generateRoomCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)];
  }
  return code;
}

function getOpponentId(room: RoomState, socketId: string): string | null {
  if (room.hostId === socketId) return room.guestId;
  if (room.guestId === socketId) return room.hostId;
  return null;
}

function getRole(room: RoomState, socketId: string): "host" | "guest" {
  return room.hostId === socketId ? "host" : "guest";
}

function createRoomPlayerState(socketId: string): RoomPlayerState {
  const placement = placeFleetRandomly(FLEET);
  return {
    socketId,
    shipGrid: placement.shipGrid,
    shipLengths: placement.shipLengths,
    shipHits: Array.from({ length: FLEET.length }, () => 0),
    radar: createGrid<TurnMark>("unknown"),
    shotsFired: 0,
    hits: 0,
  };
}

function trimLog(room: RoomState): void {
  room.log = room.log.slice(0, 12);
}

function resetRoomToLobby(room: RoomState, message: string): void {
  room.phase = "lobby";
  room.turnSocketId = null;
  room.shotsLeft = SHOTS_PER_TURN;
  room.round = 1;
  room.winnerSocketId = null;
  room.turnDeadlineMs = null;
  room.lastTimerSecondBroadcast = null;
  room.players.clear();
  room.log = [message];
}

function makeRoomView(room: RoomState, socketId: string): RoomViewPayload {
  const youRole = getRole(room, socketId);
  const opponentId = getOpponentId(room, socketId);
  const youState = room.players.get(socketId) ?? null;
  const opponentState = opponentId ? room.players.get(opponentId) ?? null : null;

  const yourTurn =
    room.phase === "playing" && room.turnSocketId !== null && room.turnSocketId === socketId;
  const turnSecondsLeft =
    yourTurn && room.turnDeadlineMs
      ? Math.max(0, Math.ceil((room.turnDeadlineMs - Date.now()) / 1000))
      : 0;

  let winner: "you" | "opponent" | null = null;
  if (room.phase === "finished" && room.winnerSocketId) {
    winner = room.winnerSocketId === socketId ? "you" : "opponent";
  }

  let status = "Room ready.";
  if (room.phase === "lobby") {
    status = room.guestId
      ? "Opponent connected. Host can start match."
      : "Waiting for opponent to join via room code.";
  } else if (room.phase === "playing") {
    status = yourTurn
      ? `Your turn: ${room.shotsLeft} shots left (${turnSecondsLeft}s).`
      : "Opponent turn. Wait for incoming salvo.";
  } else if (winner === "you") {
    status = "You win this match.";
  } else if (winner === "opponent") {
    status = "Opponent wins this match.";
  }

  return {
    roomCode: room.code,
    phase: room.phase,
    youRole,
    opponentConnected: room.guestId !== null,
    yourTurn,
    shotsLeft: room.shotsLeft,
    turnSecondsLeft,
    round: room.round,
    winner,
    playerRadar: youState ? cloneGrid(youState.radar) : createGrid<TurnMark>("unknown"),
    defenseRadar: opponentState
      ? cloneGrid(opponentState.radar)
      : createGrid<TurnMark>("unknown"),
    playerShipGrid: youState ? cloneGrid(youState.shipGrid) : createGrid<number>(WATER),
    yourDecksLeft: youState
      ? countRemainingDecks(youState.shipHits, youState.shipLengths)
      : 0,
    enemyDecksLeft: opponentState
      ? countRemainingDecks(opponentState.shipHits, opponentState.shipLengths)
      : 0,
    status,
    log: room.log.slice(0, 12),
  };
}

function emitRoomState(roomCode: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;

  const participants = [room.hostId, room.guestId].filter(
    (id): id is string => Boolean(id)
  );

  for (const socketId of participants) {
    const peer = getSocketById(socketId);
    if (!peer) continue;
    peer.emit("room:state", makeRoomView(room, socketId));
  }
}

function leaveRoomBySocketId(socketId: string, reason?: string): void {
  const roomCode = socketToRoom.get(socketId);
  if (!roomCode) return;

  socketToRoom.delete(socketId);
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.hostId === socketId) {
    const guestId = room.guestId;
    rooms.delete(roomCode);

    if (guestId) {
      socketToRoom.delete(guestId);
      const guestSocket = getSocketById(guestId);
      guestSocket?.emit("room:closed", {
        reason: reason ?? "Room closed: host left.",
      });
      if (guestSocket) addClient(guestSocket);
    }
    return;
  }

  if (room.guestId === socketId) {
    room.guestId = null;
    resetRoomToLobby(room, reason ?? "Opponent left. Waiting for a new challenger.");
    emitRoomState(roomCode);
  }
}

setInterval(() => {
  for (const room of rooms.values()) {
    const changed = resolveTurnTimeout(room);
    if (changed) {
      room.lastTimerSecondBroadcast = null;
      emitRoomState(room.code);
      continue;
    }

    if (room.phase === "playing" && room.turnDeadlineMs) {
      const secondsLeft = Math.max(
        0,
        Math.ceil((room.turnDeadlineMs - Date.now()) / 1000)
      );
      if (room.lastTimerSecondBroadcast !== secondsLeft) {
        room.lastTimerSecondBroadcast = secondsLeft;
        emitRoomState(room.code);
      }
    }
  }
}, ROOM_TIMEOUT_SWEEP_MS);

io.on("connection", (socket) => {
  addClient(socket);

  socket.emit("server:welcome", {
    message: "Sea War socket server online",
    socketId: socket.id,
  });

  socket.on("newGame", () => {
    const previousOpponentId = clients.get(socket.id) ?? undefined;
    removeClient(socket);
    addClient(socket, previousOpponentId);
  });

  socket.on("ships", (shipsPayload: unknown) => {
    relayToOpponent(socket, "opponentShips", shipsPayload);
  });

  socket.on("shot", (shotPayload: unknown) => {
    relayToOpponent(socket, "shot", shotPayload);
  });

  socket.on("end", (endPayload: unknown) => {
    relayToOpponent(socket, "end", endPayload);
  });

  socket.on("room:create", (callback?: (response: RoomActionAck) => void) => {
    leaveRoomBySocketId(socket.id, "Player switched room.");
    removeClient(socket);

    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const room: RoomState = {
      code: roomCode,
      hostId: socket.id,
      guestId: null,
      phase: "lobby",
      turnSocketId: null,
      shotsLeft: SHOTS_PER_TURN,
      round: 1,
      winnerSocketId: null,
      turnDeadlineMs: null,
      lastTimerSecondBroadcast: null,
      players: new Map<string, RoomPlayerState>(),
      log: ["Room created. Share code with your friend."],
    };

    rooms.set(roomCode, room);
    socketToRoom.set(socket.id, roomCode);
    emitRoomState(roomCode);
    callback?.({ ok: true, roomCode });
  });

  socket.on(
    "room:join",
    (
      payload: { roomCode?: string },
      callback?: (response: RoomActionAck) => void
    ) => {
      const normalizedCode = String(payload?.roomCode ?? "")
        .trim()
        .toUpperCase();

      if (!normalizedCode) {
        callback?.({ ok: false, error: "Enter a room code." });
        return;
      }

      const room = rooms.get(normalizedCode);
      if (!room) {
        callback?.({ ok: false, error: "Room not found." });
        return;
      }

      if (room.hostId === socket.id || room.guestId === socket.id) {
        socketToRoom.set(socket.id, normalizedCode);
        emitRoomState(normalizedCode);
        callback?.({ ok: true, roomCode: normalizedCode });
        return;
      }

      if (room.guestId && room.guestId !== socket.id) {
        callback?.({ ok: false, error: "Room is full." });
        return;
      }

      leaveRoomBySocketId(socket.id, "Player switched room.");
      removeClient(socket);

      room.guestId = socket.id;
      room.log.unshift("Guest joined the room.");
      trimLog(room);
      socketToRoom.set(socket.id, normalizedCode);
      emitRoomState(normalizedCode);
      callback?.({ ok: true, roomCode: normalizedCode });
    }
  );

  socket.on("room:start", (callback?: (response: RoomActionAck) => void) => {
    const roomCode = socketToRoom.get(socket.id);
    if (!roomCode) {
      callback?.({ ok: false, error: "Join a room first." });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      callback?.({ ok: false, error: "Room not found." });
      return;
    }

    if (room.hostId !== socket.id) {
      callback?.({ ok: false, error: "Only host can start the match." });
      return;
    }

    if (!room.guestId) {
      callback?.({ ok: false, error: "Need second player to start." });
      return;
    }

    room.players.clear();
    room.players.set(room.hostId, createRoomPlayerState(room.hostId));
    room.players.set(room.guestId, createRoomPlayerState(room.guestId));
    room.phase = "playing";
    room.turnSocketId = room.hostId;
    room.shotsLeft = SHOTS_PER_TURN;
    room.round = 1;
    room.winnerSocketId = null;
    room.turnDeadlineMs = Date.now() + ROOM_TURN_SECONDS * 1000;
    room.lastTimerSecondBroadcast = null;
    room.log = ["Match started. Host shoots first."];

    emitRoomState(roomCode);
    callback?.({ ok: true, roomCode });
  });

  socket.on(
    "room:shoot",
    (
      payload: { row: number; col: number },
      callback?: (response: RoomActionAck) => void
    ) => {
      const roomCode = socketToRoom.get(socket.id);
      if (!roomCode) {
        callback?.({ ok: false, error: "Join a room first." });
        return;
      }

      const room = rooms.get(roomCode);
      if (!room) {
        callback?.({ ok: false, error: "Room not found." });
        return;
      }
      const row = Number(payload?.row);
      const col = Number(payload?.col);
      const result = applyRoomShot(room, socket.id, row, col, "manual");
      if (!result.ok) {
        callback?.(result);
        return;
      }

      emitRoomState(roomCode);
      callback?.(result);
    }
  );

  socket.on("room:leave", () => {
    leaveRoomBySocketId(socket.id, "Opponent left room.");
    addClient(socket);
  });

  socket.on("client:ping", () => {
    socket.emit("server:pong", {
      serverTime: Date.now(),
    });
  });

  socket.on("disconnect", () => {
    leaveRoomBySocketId(socket.id, "Opponent disconnected.");
    removeClient(socket);
  });
});

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Socket server running on http://localhost:${port}`);
});
