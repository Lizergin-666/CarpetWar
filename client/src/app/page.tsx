"use client";

import { io, Socket } from "socket.io-client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildSoloCoach, CoachReport } from "../lib/coach";
import { CarpetBoard } from "../components/CarpetBoard";

const BOARD_SIZE = 10;
const SHOTS_PER_TURN = 3;
const BOT_TURN_DELAY_MS = 750;
const PLAYER_TURN_SECONDS = 20;
const WATER = -1;
const HISTORY_LIMIT = 25;
const STORAGE_HISTORY_KEY = "sea-war.match-history.v1";
const STORAGE_DIFFICULTY_KEY = "sea-war.bot-difficulty.v1";
const FLEET = [5, 4, 4, 3, 3, 3, 2, 2, 2, 2] as const;

type Turn = "player" | "bot" | "finished";
type Mark = "unknown" | "miss" | "hit";
type BotDifficulty = "easy" | "medium" | "hard";

interface Placement {
  shipGrid: number[][];
  shipLengths: number[];
}

interface BotCell {
  row: number;
  col: number;
}

interface QueueStatsPayload {
  waiting: number;
  connected: number;
}

interface SystemPayload {
  type: string;
  event?: string;
}

interface GameState {
  id: string;
  difficulty: BotDifficulty;
  startedAtMs: number;
  playerShipGrid: number[][];
  enemyShipGrid: number[][];
  playerShipLengths: number[];
  enemyShipLengths: number[];
  playerShipHits: number[];
  enemyShipHits: number[];
  playerShotsFired: number;
  playerHits: number;
  botShotsFired: number;
  botHits: number;
  playerRadar: Mark[][];
  botRadar: Mark[][];
  botTried: boolean[][];
  turn: Turn;
  shotsLeft: number;
  winner: "player" | "bot" | null;
  status: string;
  log: string[];
  round: number;
}

interface MatchSummary {
  id: string;
  finishedAtMs: number;
  durationSec: number;
  winner: "player" | "bot";
  difficulty: BotDifficulty;
  rounds: number;
  playerShots: number;
  playerHits: number;
  playerAccuracy: number;
  botShots: number;
  botHits: number;
  botAccuracy: number;
}

const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  easy: "Easy (random)",
  medium: "Medium (hunt + target)",
  hard: "Hard (probability map)",
};

function createGameId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function toPercent(hits: number, shots: number): number {
  if (shots <= 0) return 0;
  return Math.round((hits / shots) * 100);
}

function isBotDifficulty(value: unknown): value is BotDifficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function readStoredDifficulty(): BotDifficulty {
  if (typeof window === "undefined") return "medium";
  try {
    const raw = localStorage.getItem(STORAGE_DIFFICULTY_KEY);
    if (raw && isBotDifficulty(raw)) return raw;
  } catch {
    // Ignore storage read errors.
  }
  return "medium";
}

function readStoredHistory(): MatchSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => {
        return (
          item &&
          typeof item.id === "string" &&
          typeof item.finishedAtMs === "number" &&
          typeof item.durationSec === "number" &&
          (item.winner === "player" || item.winner === "bot") &&
          isBotDifficulty(item.difficulty)
        );
      })
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
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

function pickRandomItem<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[randomInt(items.length)];
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

    // Classic no-touch rule: ships cannot touch even diagonally.
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

    if (!failed) {
      return { shipGrid: grid, shipLengths: lengths };
    }
  }

  throw new Error("Failed to place fleet. Try again.");
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

function getUntriedCells(botTried: boolean[][]): BotCell[] {
  const cells: BotCell[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!botTried[row][col]) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

function getOrthogonalNeighbors(row: number, col: number): BotCell[] {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ];
}

function collectTargetCandidates(botRadar: Mark[][], botTried: boolean[][]): BotCell[] {
  const candidates = new Map<string, BotCell>();
  const hitCells: BotCell[] = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (botRadar[row][col] === "hit") {
        hitCells.push({ row, col });
      }
    }
  }

  const addCandidate = (row: number, col: number): void => {
    if (!isInside(row, col)) return;
    if (botTried[row][col]) return;

    const key = `${row}:${col}`;
    if (!candidates.has(key)) {
      candidates.set(key, { row, col });
    }
  };

  const isHitCell = (row: number, col: number): boolean => {
    return isInside(row, col) && botRadar[row][col] === "hit";
  };

  for (const hit of hitCells) {
    for (const neighbor of getOrthogonalNeighbors(hit.row, hit.col)) {
      addCandidate(neighbor.row, neighbor.col);
    }

    // If we have at least two aligned hits, extend line ends first.
    if (isHitCell(hit.row, hit.col - 1) || isHitCell(hit.row, hit.col + 1)) {
      let left = hit.col;
      let right = hit.col;
      while (isHitCell(hit.row, left - 1)) left -= 1;
      while (isHitCell(hit.row, right + 1)) right += 1;
      addCandidate(hit.row, left - 1);
      addCandidate(hit.row, right + 1);
    }

    if (isHitCell(hit.row - 1, hit.col) || isHitCell(hit.row + 1, hit.col)) {
      let top = hit.row;
      let bottom = hit.row;
      while (isHitCell(top - 1, hit.col)) top -= 1;
      while (isHitCell(bottom + 1, hit.col)) bottom += 1;
      addCandidate(top - 1, hit.col);
      addCandidate(bottom + 1, hit.col);
    }
  }

  return Array.from(candidates.values());
}

function pickEasyShot(botTried: boolean[][]): BotCell | null {
  return pickRandomItem(getUntriedCells(botTried));
}

function pickParityShot(botTried: boolean[][]): BotCell | null {
  const allUntried = getUntriedCells(botTried);
  const parity = allUntried.filter((cell) => (cell.row + cell.col) % 2 === 0);
  return pickRandomItem(parity.length > 0 ? parity : allUntried);
}

function getUnsunkShipLengths(shipHits: number[], shipLengths: number[]): number[] {
  const lengths: number[] = [];
  for (let i = 0; i < shipLengths.length; i += 1) {
    if (shipHits[i] < shipLengths[i]) {
      lengths.push(shipLengths[i]);
    }
  }
  return lengths;
}

function pickHardShot(
  botRadar: Mark[][],
  botTried: boolean[][],
  unsunkShipLengths: number[]
): BotCell | null {
  const scores = createGrid<number>(0);

  for (const length of unsunkShipLengths) {
    // Horizontal placements.
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col <= BOARD_SIZE - length; col += 1) {
        let valid = true;
        let hitsInside = 0;

        for (let i = 0; i < length; i += 1) {
          const mark = botRadar[row][col + i];
          if (mark === "miss") {
            valid = false;
            break;
          }
          if (mark === "hit") hitsInside += 1;
        }

        if (!valid) continue;

        const weight = hitsInside > 0 ? 6 : 1;
        for (let i = 0; i < length; i += 1) {
          if (!botTried[row][col + i]) {
            scores[row][col + i] += weight;
          }
        }
      }
    }

    // Vertical placements.
    for (let row = 0; row <= BOARD_SIZE - length; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        let valid = true;
        let hitsInside = 0;

        for (let i = 0; i < length; i += 1) {
          const mark = botRadar[row + i][col];
          if (mark === "miss") {
            valid = false;
            break;
          }
          if (mark === "hit") hitsInside += 1;
        }

        if (!valid) continue;

        const weight = hitsInside > 0 ? 6 : 1;
        for (let i = 0; i < length; i += 1) {
          if (!botTried[row + i][col]) {
            scores[row + i][col] += weight;
          }
        }
      }
    }
  }

  // Strongly prioritize cells adjacent to confirmed hits.
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (botRadar[row][col] !== "hit") continue;
      for (const neighbor of getOrthogonalNeighbors(row, col)) {
        if (isInside(neighbor.row, neighbor.col) && !botTried[neighbor.row][neighbor.col]) {
          scores[neighbor.row][neighbor.col] += 12;
        }
      }
    }
  }

  let bestScore = -1;
  const bestCells: BotCell[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (botTried[row][col]) continue;
      const score = scores[row][col];
      if (score > bestScore) {
        bestScore = score;
        bestCells.length = 0;
        bestCells.push({ row, col });
      } else if (score === bestScore) {
        bestCells.push({ row, col });
      }
    }
  }

  if (bestCells.length > 0 && bestScore > 0) {
    return pickRandomItem(bestCells);
  }

  return null;
}

function chooseBotShot(state: GameState, difficulty: BotDifficulty): BotCell | null {
  if (difficulty === "easy") {
    return pickEasyShot(state.botTried);
  }

  if (difficulty === "medium") {
    const targetCandidates = collectTargetCandidates(state.botRadar, state.botTried);
    if (targetCandidates.length > 0) {
      return pickRandomItem(targetCandidates);
    }
    return pickParityShot(state.botTried);
  }

  const remainingLengths = getUnsunkShipLengths(
    state.playerShipHits,
    state.playerShipLengths
  );
  const hardShot = pickHardShot(state.botRadar, state.botTried, remainingLengths);
  if (hardShot) return hardShot;

  const targetCandidates = collectTargetCandidates(state.botRadar, state.botTried);
  if (targetCandidates.length > 0) {
    return pickRandomItem(targetCandidates);
  }

  return pickParityShot(state.botTried);
}

function getUnknownPlayerTargets(playerRadar: Mark[][]): BotCell[] {
  const cells: BotCell[] = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (playerRadar[row][col] === "unknown") {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

function pickRandomPlayerTarget(playerRadar: Mark[][]): BotCell | null {
  return pickRandomItem(getUnknownPlayerTargets(playerRadar));
}

function applyPlayerShot(
  state: GameState,
  row: number,
  col: number,
  isAutoShot: boolean
): GameState {
  if (state.turn !== "player") return state;
  if (state.shotsLeft <= 0) return state;
  if (state.playerRadar[row][col] !== "unknown") return state;

  const nextRadar = cloneGrid(state.playerRadar);
  const nextEnemyShipHits = [...state.enemyShipHits];
  const nextLog = [...state.log];
  let nextPlayerHits = state.playerHits;

  const enemyShipId = state.enemyShipGrid[row][col];
  const coord = formatCoord(row, col);
  const actorPrefix = isAutoShot ? "Auto-fire" : "You";

  if (enemyShipId !== WATER) {
    nextRadar[row][col] = "hit";
    nextEnemyShipHits[enemyShipId] += 1;
    nextPlayerHits += 1;
    nextLog.unshift(`${actorPrefix} hit enemy ship at ${coord}.`);
  } else {
    nextRadar[row][col] = "miss";
    nextLog.unshift(`${actorPrefix} missed at ${coord}.`);
  }

  if (isFleetDestroyed(nextEnemyShipHits, state.enemyShipLengths)) {
    return {
      ...state,
      playerRadar: nextRadar,
      enemyShipHits: nextEnemyShipHits,
      playerShotsFired: state.playerShotsFired + 1,
      playerHits: nextPlayerHits,
      turn: "finished",
      winner: "player",
      shotsLeft: 0,
      status: "You win this match.",
      log: nextLog.slice(0, 12),
    };
  }

  const shotsLeft = state.shotsLeft - 1;
  if (shotsLeft > 0) {
    return {
      ...state,
      playerRadar: nextRadar,
      enemyShipHits: nextEnemyShipHits,
      playerShotsFired: state.playerShotsFired + 1,
      playerHits: nextPlayerHits,
      shotsLeft,
      status: `Your turn: ${shotsLeft} shots left.`,
      log: nextLog.slice(0, 12),
    };
  }

  return {
    ...state,
    playerRadar: nextRadar,
    enemyShipHits: nextEnemyShipHits,
    playerShotsFired: state.playerShotsFired + 1,
    playerHits: nextPlayerHits,
    turn: "bot",
    shotsLeft: 0,
    status: `Bot thinking (${BOT_DIFFICULTY_LABELS[state.difficulty]})...`,
    log: nextLog.slice(0, 12),
  };
}

function autoFireRemainingShots(state: GameState): GameState {
  if (state.turn !== "player") return state;
  if (state.shotsLeft <= 0) return state;
  if (state.winner !== null) return state;

  let nextState = state;
  while (nextState.turn === "player" && nextState.shotsLeft > 0) {
    const target = pickRandomPlayerTarget(nextState.playerRadar);
    if (!target) {
      return {
        ...nextState,
        turn: "bot",
        shotsLeft: 0,
        status: `Bot thinking (${BOT_DIFFICULTY_LABELS[nextState.difficulty]})...`,
      };
    }
    nextState = applyPlayerShot(nextState, target.row, target.col, true);
  }

  return nextState;
}

function createGameState(botDifficulty: BotDifficulty): GameState {
  const playerPlacement = placeFleetRandomly(FLEET);
  const enemyPlacement = placeFleetRandomly(FLEET);

  return {
    id: createGameId(),
    difficulty: botDifficulty,
    startedAtMs: Date.now(),
    playerShipGrid: playerPlacement.shipGrid,
    enemyShipGrid: enemyPlacement.shipGrid,
    playerShipLengths: playerPlacement.shipLengths,
    enemyShipLengths: enemyPlacement.shipLengths,
    playerShipHits: Array.from({ length: FLEET.length }, () => 0),
    enemyShipHits: Array.from({ length: FLEET.length }, () => 0),
    playerShotsFired: 0,
    playerHits: 0,
    botShotsFired: 0,
    botHits: 0,
    playerRadar: createGrid<Mark>("unknown"),
    botRadar: createGrid<Mark>("unknown"),
    botTried: createGrid<boolean>(false),
    turn: "player",
    shotsLeft: SHOTS_PER_TURN,
    winner: null,
    status: "Your turn: fire 3 shots.",
    log: [
      `Game started. Fleet placed automatically. Bot: ${BOT_DIFFICULTY_LABELS[botDifficulty]}.`,
    ],
    round: 1,
  };
}

function resolveBotSalvo(state: GameState, difficulty: BotDifficulty): GameState {
  if (state.turn !== "bot") return state;

  const nextState: GameState = {
    ...state,
    botRadar: cloneGrid(state.botRadar),
    botTried: cloneGrid(state.botTried),
    playerShipHits: [...state.playerShipHits],
    log: [...state.log],
  };

  const botEvents: string[] = [];

  for (let shot = 0; shot < SHOTS_PER_TURN; shot += 1) {
    const target = chooseBotShot(nextState, difficulty);
    if (!target) break;

    nextState.botTried[target.row][target.col] = true;
    nextState.botShotsFired += 1;
    const shipId = nextState.playerShipGrid[target.row][target.col];
    const coord = formatCoord(target.row, target.col);

    if (shipId !== WATER) {
      nextState.botRadar[target.row][target.col] = "hit";
      nextState.playerShipHits[shipId] += 1;
      nextState.botHits += 1;
      botEvents.push(`Bot hit your ship at ${coord}.`);
    } else {
      nextState.botRadar[target.row][target.col] = "miss";
      botEvents.push(`Bot missed at ${coord}.`);
    }
  }

  nextState.log.unshift(...botEvents.reverse());

  if (isFleetDestroyed(nextState.playerShipHits, nextState.playerShipLengths)) {
    return {
      ...nextState,
      turn: "finished",
      winner: "bot",
      shotsLeft: 0,
      status: "Bot wins this match.",
      log: nextState.log.slice(0, 12),
    };
  }

  return {
    ...nextState,
    turn: "player",
    shotsLeft: SHOTS_PER_TURN,
    status: "Your turn: fire 3 shots.",
    log: nextState.log.slice(0, 12),
    round: state.round + 1,
  };
}

export default function Home() {
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() =>
    readStoredDifficulty()
  );
  const [game, setGame] = useState<GameState>(() =>
    createGameState(readStoredDifficulty())
  );
  const [history, setHistory] = useState<MatchSummary[]>(() => readStoredHistory());
  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);
  const [showDefenseLayer, setShowDefenseLayer] = useState<boolean>(false);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState<number>(PLAYER_TURN_SECONDS);

  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketId, setSocketId] = useState<string>("-");
  const [welcomeMessage, setWelcomeMessage] = useState<string>("-");
  const [lastPong, setLastPong] = useState<string>("-");
  const [matchedOpponentId, setMatchedOpponentId] = useState<string | null>(null);
  const [queueWaiting, setQueueWaiting] = useState<number>(0);
  const [queueConnected, setQueueConnected] = useState<number>(0);
  const [socketSystemLog, setSocketSystemLog] = useState<string[]>([]);
  const savedResultGameIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const turnDeadlineMsRef = useRef<number | null>(null);

  const socketUrl = useMemo(
    () => process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000",
    []
  );

  useEffect(() => {
    const socket: Socket = io(socketUrl, {
      transports: ["polling", "websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      setSocketId(socket.id ?? "-");
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
      setSocketId("-");
    });

    socket.on("server:welcome", (payload: { message: string }) => {
      setWelcomeMessage(payload.message);
    });

    socket.on("server:pong", (payload: { serverTime: number }) => {
      setLastPong(new Date(payload.serverTime).toLocaleTimeString());
    });

    socket.on("opponent", (opponentId: string | null) => {
      setMatchedOpponentId(opponentId);
    });

    socket.on("queue:size", (payload: QueueStatsPayload) => {
      setQueueWaiting(Math.max(0, payload.waiting));
      setQueueConnected(Math.max(0, payload.connected));
    });

    socket.on("system", (payload: SystemPayload) => {
      const eventLabel = payload.event ? ` (${payload.event})` : "";
      const item = `${payload.type}${eventLabel}`;
      setSocketSystemLog((prev) => [item, ...prev].slice(0, 6));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DIFFICULTY_KEY, botDifficulty);
    } catch {
      // Ignore storage failures.
    }
  }, [botDifficulty]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage failures.
    }
  }, [history]);

  useEffect(() => {
    if (game.turn !== "player" || game.winner !== null) {
      turnDeadlineMsRef.current = null;
      return;
    }

    turnDeadlineMsRef.current = Date.now() + PLAYER_TURN_SECONDS * 1000;

    let hasTriggeredAutoFire = false;
    const timer = setInterval(() => {
      const deadlineMs = turnDeadlineMsRef.current;
      if (!deadlineMs) return;

      const msLeft = deadlineMs - Date.now();
      const nextSeconds = Math.max(0, Math.ceil(msLeft / 1000));
      setTurnSecondsLeft(nextSeconds);

      if (msLeft <= 0 && !hasTriggeredAutoFire) {
        hasTriggeredAutoFire = true;
        setGame((prev) => autoFireRemainingShots(prev));
      }
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [game.id, game.round, game.turn, game.winner]);

  useEffect(() => {
    if (game.winner === null) return;
    if (savedResultGameIdRef.current === game.id) return;

    const now = Date.now();
    const summary: MatchSummary = {
      id: game.id,
      finishedAtMs: now,
      durationSec: Math.max(1, Math.round((now - game.startedAtMs) / 1000)),
      winner: game.winner,
      difficulty: game.difficulty,
      rounds: game.round,
      playerShots: game.playerShotsFired,
      playerHits: game.playerHits,
      playerAccuracy: toPercent(game.playerHits, game.playerShotsFired),
      botShots: game.botShotsFired,
      botHits: game.botHits,
      botAccuracy: toPercent(game.botHits, game.botShotsFired),
    };

    savedResultGameIdRef.current = game.id;
    setHistory((prev) => [summary, ...prev].slice(0, HISTORY_LIMIT));
    setCoachReport(
      buildSoloCoach({
        difficulty: game.difficulty,
        winner: game.winner,
        rounds: game.round,
        playerShots: game.playerShotsFired,
        playerHits: game.playerHits,
        botShots: game.botShotsFired,
        botHits: game.botHits,
        durationSec: summary.durationSec,
      })
    );
  }, [
    game.botHits,
    game.botShotsFired,
    game.difficulty,
    game.id,
    game.playerHits,
    game.playerShotsFired,
    game.round,
    game.startedAtMs,
    game.winner,
  ]);

  useEffect(() => {
    if (game.turn !== "bot" || game.winner !== null) return;

    const timer = setTimeout(() => {
      setGame((prev) => resolveBotSalvo(prev, prev.difficulty));
    }, BOT_TURN_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [game.turn, game.winner]);

  const playerRemainingDecks = countRemainingDecks(
    game.playerShipHits,
    game.playerShipLengths
  );
  const enemyRemainingDecks = countRemainingDecks(
    game.enemyShipHits,
    game.enemyShipLengths
  );
  const totalGames = history.length;
  const totalWins = history.filter((match) => match.winner === "player").length;
  const totalLosses = totalGames - totalWins;
  const winRate = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
  const avgPlayerAccuracy =
    totalGames > 0
      ? Math.round(
          history.reduce((sum, match) => sum + match.playerAccuracy, 0) / totalGames
        )
      : 0;
  const turnTimerCritical = game.turn === "player" && turnSecondsLeft <= 6;

  function resetGame(nextDifficulty?: BotDifficulty): void {
    const difficulty = nextDifficulty ?? botDifficulty;
    setGame(createGameState(difficulty));
    setCoachReport(null);
  }

  function handleDifficultyChange(nextDifficulty: BotDifficulty): void {
    setBotDifficulty(nextDifficulty);
    resetGame(nextDifficulty);
  }

  function handleCellClick(row: number, col: number): void {
    setGame((prev) => applyPlayerShot(prev, row, col, false));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs text-cyan-100">
            Solo Mode
          </span>
          <Link
            href="/pvp"
            className="rounded-lg border border-cyan-500/70 bg-slate-900/80 px-3 py-1 text-sm text-cyan-100 transition hover:bg-slate-800"
          >
            Open PvP by Link
          </Link>
          <button className="rounded-lg border border-amber-400/70 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-500/30">
            Upgrade to Pro
          </button>
        </div>
        <h1 className="text-2xl font-bold text-cyan-100">Sea War: Single Board</h1>
        <p className="mt-1 text-sm text-cyan-200/80">
          One board mode. Fleet is auto-placed: 1x5, 2x4, 3x3, 4x2. Each turn:
          3 player shots, then 3 bot shots.
        </p>
      </header>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Game Status</h2>
        <div className="mb-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Round: {game.round}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Turn: {game.turn}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Shots left: {game.turn === "player" ? game.shotsLeft : 0}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${
              turnTimerCritical
                ? "border-amber-300/70 bg-amber-400/20 text-amber-100"
                : "border-cyan-900/60 bg-slate-900/80 text-cyan-100/90"
            }`}
          >
            Turn timer: {game.turn === "player" ? `${turnSecondsLeft}s` : "-"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Your decks left: {playerRemainingDecks}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Enemy decks left: {enemyRemainingDecks}
          </span>
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-100">
            {game.status}
          </span>
          {game.winner && (
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-100">
              Winner: {game.winner}
            </span>
          )}
          <button
            onClick={() => resetGame()}
            className="rounded-lg bg-cyan-500 px-3 py-1 font-medium text-slate-950 transition hover:bg-cyan-400"
          >
            New game
          </button>
          <button
            onClick={() => setGame((prev) => autoFireRemainingShots(prev))}
            disabled={game.turn !== "player" || game.winner !== null}
            className="rounded-lg border border-cyan-400/60 bg-slate-900/80 px-3 py-1 text-cyan-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Auto-complete turn
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-cyan-100/90">Bot difficulty:</span>
          {(["easy", "medium", "hard"] as const).map((level) => (
            <button
              key={level}
              onClick={() => handleDifficultyChange(level)}
              className={`rounded-lg px-3 py-1 text-sm ${
                botDifficulty === level
                  ? "bg-cyan-500 text-slate-950"
                  : "bg-slate-900/80 text-cyan-100 hover:bg-slate-800"
              }`}
            >
              {BOT_DIFFICULTY_LABELS[level]}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Career Stats</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Total games: {totalGames}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Wins: {totalWins}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Losses: {totalLosses}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Win rate: {winRate}%
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Avg accuracy: {avgPlayerAccuracy}%
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Match History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-cyan-200/80">No finished matches yet.</p>
        ) : (
          <ul className="space-y-2 text-sm text-cyan-100/90">
            {history.slice(0, 8).map((match) => (
              <li key={match.id} className="rounded-lg border border-cyan-900/50 bg-slate-900/70 p-2">
                {new Date(match.finishedAtMs).toLocaleString()} |{" "}
                {match.winner === "player" ? "Win" : "Loss"} |{" "}
                {BOT_DIFFICULTY_LABELS[match.difficulty]} | rounds: {match.rounds} |
                acc: {match.playerAccuracy}% | duration: {match.durationSec}s
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">AI Coach</h2>
        {!coachReport ? (
          <p className="text-sm text-cyan-200/80">
            Finish a match to get strategic feedback.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs text-cyan-100">
                {coachReport.headline}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  coachReport.verdict === "excellent"
                    ? "bg-emerald-500/20 text-emerald-100"
                    : coachReport.verdict === "solid"
                    ? "bg-cyan-500/20 text-cyan-100"
                    : "bg-amber-500/20 text-amber-100"
                }`}
              >
                Verdict: {coachReport.verdict}
              </span>
            </div>
            <ul className="space-y-1 text-sm text-cyan-100/90">
              {coachReport.notes.map((note, index) => (
                <li key={`${note}-${index}`}>- {note}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Battle Board</h2>
        <p className="mb-3 text-sm text-cyan-200/80">
          You always see shot marks. Defense layer only reveals your ship
          placement under those marks.
        </p>
        <div className="mb-3">
          <label className="flex items-center gap-2 text-sm text-cyan-100/90">
            <input
              type="checkbox"
              checked={showDefenseLayer}
              onChange={(event) => setShowDefenseLayer(event.target.checked)}
            />
            Show defense layer (my ships and bot shots)
          </label>
        </div>
        <CarpetBoard
          attackRadar={game.playerRadar}
          defenseRadar={game.botRadar}
          shipGrid={game.playerShipGrid}
          showDefenseLayer={showDefenseLayer}
          canShoot={game.turn === "player" && game.winner === null}
          onCellClick={handleCellClick}
          waterValue={WATER}
        />
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Recent Events</h2>
        <ul className="space-y-1 text-sm text-cyan-100/90">
          {game.log.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Realtime</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <span
            className={`rounded-full px-3 py-1 font-medium ${
              socketConnected
                ? "bg-emerald-500/20 text-emerald-100"
                : "bg-slate-900/80 text-cyan-100/90"
            }`}
          >
            {socketConnected ? "Connected" : "Disconnected"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Socket: {socketId}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Welcome: {welcomeMessage}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Last pong: {lastPong}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Queue waiting: {queueWaiting}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Connected clients: {queueConnected}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Opponent: {matchedOpponentId ?? "none"}
          </span>
          <button
            onClick={() => socketRef.current?.emit("client:ping")}
            className="rounded-lg border border-cyan-500/70 bg-cyan-500/20 px-3 py-1 text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!socketConnected}
          >
            Ping server
          </button>
          <button
            onClick={() => socketRef.current?.emit("newGame")}
            className="rounded-lg border border-cyan-500/70 bg-slate-900/80 px-3 py-1 text-cyan-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!socketConnected}
          >
            Find opponent
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-xs text-cyan-200/80">
          {socketSystemLog.length === 0 ? (
            <li>No system events yet.</li>
          ) : (
            socketSystemLog.map((item, index) => (
              <li key={`${item}-${index}`}>- {item}</li>
            ))
          )}
        </ul>
        <p className="mt-3 text-xs text-cyan-300/70">
          Multiplayer relay events are server-ready (`newGame`, `ships`, `shot`,
          `end`) and can be wired into a dedicated PvP screen next.
        </p>
      </section>
    </main>
  );
}


