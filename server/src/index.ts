import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Server, Socket } from "socket.io";

const app = express();
const httpServer = createServer(app);

const port = Number(process.env.PORT ?? 4000);
const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";

const BOARD_SIZE = 10;
const SHOTS_PER_TURN = 3;
const ROOM_TURN_SECONDS = 20;
const ROOM_PLACEMENT_SECONDS = 20;
const BLITZ_MATCH_SECONDS = 180;
const ROOM_TIMEOUT_SWEEP_MS = 500;
const WATER = -1;
const ROOM_FLEET = [5, 4, 3, 2, 1] as const;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STATS_FILE_PATH = path.resolve(process.cwd(), "data", "pvp-stats.json");
const ROOM_FLEET_SORTED_ASC = [...ROOM_FLEET].sort((a, b) => a - b);
const STATS_PERSISTENCE_MODE = String(
  process.env.STATS_PERSISTENCE_MODE ?? "local"
).toLowerCase();
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

type OpponentId = string | null;
type TurnMark = "unknown" | "miss" | "hit";
type RoomPhase = "lobby" | "placement" | "playing" | "finished";
type RoomMode = "classic" | "blitz3m";
type RoundOutcome = "win" | "loss" | "draw";
type StatsPersistenceMode = "local" | "supabase" | "hybrid";

interface PlayerProfile {
  name: string;
  city: string;
}

interface PlayerStat {
  playerKey: string;
  name: string;
  city: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  shots: number;
  hits: number;
  updatedAtMs: number;
}

interface LeaderboardEntry {
  playerKey: string;
  name: string;
  city: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  accuracy: number;
  winRate: number;
  score: number;
}

interface CityLeaderboard {
  city: string;
  totalGames: number;
  players: LeaderboardEntry[];
}

interface LeaderboardPayload {
  updatedAtMs: number;
  global: LeaderboardEntry[];
  byCity: CityLeaderboard[];
}

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

interface PlacementShipInput {
  length: number;
  row: number;
  col: number;
  horizontal: boolean;
}

interface RoomPlacementState {
  deadlineMs: number | null;
  lastSecondBroadcast: number | null;
  readySockets: Set<string>;
  drafts: Map<string, Placement>;
}

interface RoomState {
  code: string;
  hostId: string;
  guestId: string | null;
  mode: RoomMode;
  phase: RoomPhase;
  turnSocketId: string | null;
  shotsLeft: number;
  round: number;
  winnerSocketId: string | null;
  isDraw: boolean;
  turnDeadlineMs: number | null;
  matchDeadlineMs: number | null;
  lastTimerSecondBroadcast: number | null;
  lastMatchSecondBroadcast: number | null;
  rematchRequestedBy: Set<string>;
  players: Map<string, RoomPlayerState>;
  placement: RoomPlacementState;
  log: string[];
}

interface RoomViewPayload {
  roomCode: string;
  mode: RoomMode;
  phase: RoomPhase;
  youRole: "host" | "guest";
  yourProfile: PlayerProfile;
  opponentProfile: PlayerProfile | null;
  opponentConnected: boolean;
  yourTurn: boolean;
  shotsLeft: number;
  placementSecondsLeft: number;
  turnSecondsLeft: number;
  matchSecondsLeft: number;
  round: number;
  winner: "you" | "opponent" | "draw" | null;
  canRematch: boolean;
  youRequestedRematch: boolean;
  opponentRequestedRematch: boolean;
  playerRadar: TurnMark[][];
  defenseRadar: TurnMark[][];
  playerShipGrid: number[][];
  yourPlacementReady: boolean;
  opponentPlacementReady: boolean;
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

interface StatsFilePayload {
  version: number;
  updatedAtMs: number;
  stats: PlayerStat[];
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
const socketProfiles = new Map<string, PlayerProfile>();
const playerStats = new Map<string, PlayerStat>();

function normalizePersistenceMode(raw: string): StatsPersistenceMode {
  if (raw === "supabase") return "supabase";
  if (raw === "hybrid") return "hybrid";
  return "local";
}

const configuredPersistenceMode = normalizePersistenceMode(STATS_PERSISTENCE_MODE);
const hasSupabaseCredentials = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const useSupabasePersistence =
  (configuredPersistenceMode === "supabase" ||
    configuredPersistenceMode === "hybrid") &&
  hasSupabaseCredentials;
const useLocalPersistence =
  configuredPersistenceMode === "local" ||
  configuredPersistenceMode === "hybrid" ||
  !hasSupabaseCredentials;

const supabaseClient: SupabaseClient | null = useSupabasePersistence
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

function logServerInfo(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[SeaWar] ${message}`);
}

function ensureStatsDirectory(): void {
  const dirPath = path.dirname(STATS_FILE_PATH);
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function loadPlayerStatsFromDisk(): void {
  try {
    if (!useLocalPersistence) return;
    if (!existsSync(STATS_FILE_PATH)) return;
    const raw = readFileSync(STATS_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StatsFilePayload>;
    if (!parsed || !Array.isArray(parsed.stats)) return;

    for (const item of parsed.stats) {
      if (!isValidPlayerStat(item)) continue;
      mergePlayerStat(item);
    }
  } catch {
    // Ignore load errors and keep empty stats.
  }
}

function persistPlayerStatsToDisk(): void {
  try {
    if (!useLocalPersistence) return;
    ensureStatsDirectory();
    const payload: StatsFilePayload = {
      version: 1,
      updatedAtMs: Date.now(),
      stats: Array.from(playerStats.values()),
    };
    const tempPath = `${STATS_FILE_PATH}.tmp`;
    writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
    renameSync(tempPath, STATS_FILE_PATH);
  } catch {
    // Ignore write errors to avoid impacting gameplay.
  }
}

function isValidPlayerStat(item: unknown): item is PlayerStat {
  if (!item || typeof item !== "object") return false;
  const stat = item as Partial<PlayerStat>;
  return (
    typeof stat.playerKey === "string" &&
    typeof stat.name === "string" &&
    typeof stat.city === "string" &&
    typeof stat.games === "number" &&
    typeof stat.wins === "number" &&
    typeof stat.losses === "number" &&
    typeof stat.shots === "number" &&
    typeof stat.hits === "number"
  );
}

function normalizePlayerStat(item: PlayerStat): PlayerStat {
  return {
    ...item,
    draws: typeof item.draws === "number" ? item.draws : 0,
    updatedAtMs: typeof item.updatedAtMs === "number" ? item.updatedAtMs : Date.now(),
  };
}

function mergePlayerStat(nextStatRaw: PlayerStat): void {
  const nextStat = normalizePlayerStat(nextStatRaw);
  const prev = playerStats.get(nextStat.playerKey);
  if (!prev) {
    playerStats.set(nextStat.playerKey, nextStat);
    return;
  }
  if (nextStat.updatedAtMs >= prev.updatedAtMs) {
    playerStats.set(nextStat.playerKey, nextStat);
  }
}

async function loadPlayerStatsFromSupabase(): Promise<void> {
  if (!useSupabasePersistence || !supabaseClient) return;
  const { data, error } = await supabaseClient
    .from("player_stats")
    .select(
      "player_key,name,city,games,wins,draws,losses,shots,hits,updated_at_ms"
    );
  if (error) {
    logServerInfo(`Supabase stats load failed: ${error.message}`);
    return;
  }

  if (!Array.isArray(data)) return;
  for (const row of data) {
    const candidate: PlayerStat = {
      playerKey: String(row.player_key ?? ""),
      name: String(row.name ?? ""),
      city: String(row.city ?? ""),
      games: Number(row.games ?? 0),
      wins: Number(row.wins ?? 0),
      draws: Number(row.draws ?? 0),
      losses: Number(row.losses ?? 0),
      shots: Number(row.shots ?? 0),
      hits: Number(row.hits ?? 0),
      updatedAtMs: Number(row.updated_at_ms ?? Date.now()),
    };

    if (!isValidPlayerStat(candidate)) continue;
    mergePlayerStat(candidate);
  }
  logServerInfo(`Supabase stats loaded: ${data.length}`);
}

function persistPlayerStatsToSupabase(): void {
  if (!useSupabasePersistence || !supabaseClient) return;
  const rows = Array.from(playerStats.values()).map((stat) => ({
    player_key: stat.playerKey,
    name: stat.name,
    city: stat.city,
    games: stat.games,
    wins: stat.wins,
    draws: stat.draws,
    losses: stat.losses,
    shots: stat.shots,
    hits: stat.hits,
    updated_at_ms: stat.updatedAtMs,
  }));
  if (rows.length === 0) return;

  void supabaseClient
    .from("player_stats")
    .upsert(rows, { onConflict: "player_key" })
    .then(({ error }) => {
      if (error) {
        logServerInfo(`Supabase stats persist failed: ${error.message}`);
      }
    });
}

function logPersistenceConfiguration(): void {
  if (
    (configuredPersistenceMode === "supabase" ||
      configuredPersistenceMode === "hybrid") &&
    !hasSupabaseCredentials
  ) {
    logServerInfo(
      "Supabase credentials are missing. Falling back to local stats persistence."
    );
  }

  const activeMode = useSupabasePersistence
    ? useLocalPersistence
      ? "hybrid"
      : "supabase"
    : "local";
  logServerInfo(
    `Stats persistence mode: ${activeMode} (configured: ${configuredPersistenceMode}).`
  );
}

function bootstrapStatsPersistence(): void {
  loadPlayerStatsFromDisk();
  logPersistenceConfiguration();
  if (!useSupabasePersistence) return;

  void loadPlayerStatsFromSupabase()
    .then(() => {
      if (useLocalPersistence) {
        persistPlayerStatsToDisk();
      }
      emitLeaderboardUpdate();
    })
    .catch((error: unknown) => {
      if (error instanceof Error) {
        logServerInfo(`Supabase bootstrap failed: ${error.message}`);
        return;
      }
      logServerInfo("Supabase bootstrap failed with unknown error.");
    });
}

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

function normalizePlacementShipInput(raw: PlacementShipInput): PlacementShipInput | null {
  const length = Number(raw.length);
  const row = Number(raw.row);
  const col = Number(raw.col);
  const horizontal = Boolean(raw.horizontal);
  if (!Number.isInteger(length) || length < 1 || length > BOARD_SIZE) return null;
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
  return { length, row, col, horizontal };
}

function buildPlacementFromShips(
  ships: PlacementShipInput[]
): { ok: true; placement: Placement } | { ok: false; error: string } {
  if (!Array.isArray(ships) || ships.length !== ROOM_FLEET.length) {
    return {
      ok: false,
      error: `Need exactly ${ROOM_FLEET.length} ships for placement.`,
    };
  }

  const normalized: PlacementShipInput[] = [];
  for (const ship of ships) {
    const next = normalizePlacementShipInput(ship);
    if (!next) {
      return { ok: false, error: "Invalid ship placement payload." };
    }
    normalized.push(next);
  }

  const lengths = normalized.map((ship) => ship.length).sort((a, b) => a - b);
  for (let i = 0; i < ROOM_FLEET_SORTED_ASC.length; i += 1) {
    if (lengths[i] !== ROOM_FLEET_SORTED_ASC[i]) {
      return {
        ok: false,
        error: `Fleet must contain lengths: ${ROOM_FLEET.join(", ")}.`,
      };
    }
  }

  const grid = createGrid<number>(WATER);
  const shipLengths: number[] = [];
  for (let shipId = 0; shipId < normalized.length; shipId += 1) {
    const ship = normalized[shipId];
    if (!canPlaceShip(grid, ship.row, ship.col, ship.length, ship.horizontal)) {
      return {
        ok: false,
        error: `Ship length ${ship.length} has invalid position or intersects another ship.`,
      };
    }

    for (let i = 0; i < ship.length; i += 1) {
      const r = ship.horizontal ? ship.row : ship.row + i;
      const c = ship.horizontal ? ship.col + i : ship.col;
      grid[r][c] = shipId;
    }
    shipLengths.push(ship.length);
  }

  return { ok: true, placement: { shipGrid: grid, shipLengths } };
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

function sanitizeName(raw: unknown): string {
  const normalized = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.slice(0, 24);
}

function sanitizeCity(raw: unknown): string {
  const normalized = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.slice(0, 32);
}

function defaultProfileForSocket(socketId: string): PlayerProfile {
  return {
    name: `Player-${socketId.slice(0, 4)}`,
    city: "Unknown",
  };
}

function getSocketProfile(socketId: string): PlayerProfile {
  return socketProfiles.get(socketId) ?? defaultProfileForSocket(socketId);
}

function makePlayerKey(profile: PlayerProfile): string {
  return `${profile.name.toLowerCase()}::${profile.city.toLowerCase()}`;
}

function percent(hits: number, shots: number): number {
  if (shots <= 0) return 0;
  return Math.round((hits / shots) * 100);
}

function scoreFromStat(stat: PlayerStat): number {
  const accuracy = percent(stat.hits, stat.shots);
  return stat.wins * 100 + stat.draws * 35 - stat.losses * 30 + accuracy * 2;
}

function asLeaderboardEntry(stat: PlayerStat): LeaderboardEntry {
  return {
    playerKey: stat.playerKey,
    name: stat.name,
    city: stat.city,
    games: stat.games,
    wins: stat.wins,
    draws: stat.draws,
    losses: stat.losses,
    accuracy: percent(stat.hits, stat.shots),
    winRate: percent(stat.wins, stat.games),
    score: scoreFromStat(stat),
  };
}

function buildLeaderboard(): LeaderboardPayload {
  const entries = Array.from(playerStats.values()).map(asLeaderboardEntry);
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return a.name.localeCompare(b.name);
  });

  const byCityMap = new Map<string, LeaderboardEntry[]>();
  for (const entry of entries) {
    if (!byCityMap.has(entry.city)) byCityMap.set(entry.city, []);
    byCityMap.get(entry.city)?.push(entry);
  }

  const byCity: CityLeaderboard[] = Array.from(byCityMap.entries())
    .map(([city, cityEntries]) => {
      const totalGames = cityEntries.reduce((sum, entry) => sum + entry.games, 0);
      return {
        city,
        totalGames,
        players: cityEntries.slice(0, 5),
      };
    })
    .sort((a, b) => {
      if (b.players.length !== a.players.length) return b.players.length - a.players.length;
      return b.totalGames - a.totalGames;
    })
    .slice(0, 8);

  return {
    updatedAtMs: Date.now(),
    global: entries.slice(0, 20),
    byCity,
  };
}

function emitLeaderboardUpdate(targetSocketId?: string): void {
  const payload = buildLeaderboard();
  if (targetSocketId) {
    getSocketById(targetSocketId)?.emit("leaderboard:update", payload);
    return;
  }
  io.emit("leaderboard:update", payload);
}

function updateProfile(socketId: string, rawName: unknown, rawCity: unknown): PlayerProfile {
  const current = getSocketProfile(socketId);
  const nextName = sanitizeName(rawName) || current.name;
  const nextCity = sanitizeCity(rawCity) || current.city;
  const profile: PlayerProfile = {
    name: nextName,
    city: nextCity,
  };
  socketProfiles.set(socketId, profile);
  return profile;
}

function upsertPlayerStat(
  profile: PlayerProfile,
  outcome: RoundOutcome,
  shots: number,
  hits: number
): void {
  const key = makePlayerKey(profile);
  const prev = playerStats.get(key);
  const next: PlayerStat = prev
      ? {
        ...prev,
        games: prev.games + 1,
        wins: prev.wins + (outcome === "win" ? 1 : 0),
        draws: prev.draws + (outcome === "draw" ? 1 : 0),
        losses: prev.losses + (outcome === "loss" ? 1 : 0),
        shots: prev.shots + shots,
        hits: prev.hits + hits,
        updatedAtMs: Date.now(),
      }
    : {
        playerKey: key,
        name: profile.name,
        city: profile.city,
        games: 1,
        wins: outcome === "win" ? 1 : 0,
        draws: outcome === "draw" ? 1 : 0,
        losses: outcome === "loss" ? 1 : 0,
        shots,
        hits,
        updatedAtMs: Date.now(),
      };

  playerStats.set(key, next);
}

function recordRoomResult(
  room: RoomState,
  winnerSocketId: string | null,
  loserSocketId: string | null,
  isDraw: boolean
): void {
  if (isDraw) {
    const hostState = room.players.get(room.hostId);
    const guestId = room.guestId;
    const guestState = guestId ? room.players.get(guestId) : undefined;
    if (!hostState || !guestState || !guestId) return;

    upsertPlayerStat(
      getSocketProfile(room.hostId),
      "draw",
      hostState.shotsFired,
      hostState.hits
    );
    upsertPlayerStat(
      getSocketProfile(guestId),
      "draw",
      guestState.shotsFired,
      guestState.hits
    );
    persistPlayerStatsToDisk();
    persistPlayerStatsToSupabase();
    emitLeaderboardUpdate();
    return;
  }

  if (!winnerSocketId || !loserSocketId) return;
  const winnerRoundState = room.players.get(winnerSocketId);
  const loserRoundState = room.players.get(loserSocketId);
  if (!winnerRoundState || !loserRoundState) return;

  const winnerProfile = getSocketProfile(winnerSocketId);
  const loserProfile = getSocketProfile(loserSocketId);
  upsertPlayerStat(winnerProfile, "win", winnerRoundState.shotsFired, winnerRoundState.hits);
  upsertPlayerStat(loserProfile, "loss", loserRoundState.shotsFired, loserRoundState.hits);
  persistPlayerStatsToDisk();
  persistPlayerStatsToSupabase();
  emitLeaderboardUpdate();
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
    room.isDraw = false;
    room.turnDeadlineMs = null;
    room.matchDeadlineMs = null;
    room.lastTimerSecondBroadcast = null;
    room.lastMatchSecondBroadcast = null;
    room.log.unshift(`${actor} wins the match.`);
    trimLog(room);
    recordRoomResult(room, shooterId, opponentId, false);
    return { ok: true, roomCode: room.code };
  }

  room.shotsLeft -= 1;
  if (room.shotsLeft <= 0) {
    advanceRoomTurn(room, opponentId);
  }

  return { ok: true, roomCode: room.code };
}

function resolvePlacementTimeout(room: RoomState): boolean {
  if (room.phase !== "placement") return false;
  if (!room.placement.deadlineMs) return false;
  if (Date.now() < room.placement.deadlineMs) return false;

  const hostReady = room.placement.readySockets.has(room.hostId);
  const guestReady = room.guestId ? room.placement.readySockets.has(room.guestId) : false;
  const autoNotes: string[] = [];
  if (!hostReady) autoNotes.push("Host auto-placed.");
  if (!guestReady) autoNotes.push("Guest auto-placed.");
  const suffix = autoNotes.length > 0 ? ` ${autoNotes.join(" ")}` : "";

  const result = finalizePlacementAndStart(
    room,
    `Placement timer ended. Match started. Host shoots first.${suffix}`
  );
  return result.ok;
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

function resolveMatchTimeout(room: RoomState): boolean {
  if (room.phase !== "playing") return false;
  if (room.mode !== "blitz3m") return false;
  if (!room.matchDeadlineMs) return false;
  if (Date.now() < room.matchDeadlineMs) return false;
  if (!room.guestId) return false;

  const hostState = room.players.get(room.hostId);
  const guestState = room.players.get(room.guestId);
  if (!hostState || !guestState) return false;

  const hostDecksLeft = countRemainingDecks(hostState.shipHits, hostState.shipLengths);
  const guestDecksLeft = countRemainingDecks(guestState.shipHits, guestState.shipLengths);
  const hostAccuracy = percent(hostState.hits, hostState.shotsFired);
  const guestAccuracy = percent(guestState.hits, guestState.shotsFired);

  let winnerSocketId: string | null = null;
  let loserSocketId: string | null = null;
  let isDraw = false;

  if (hostDecksLeft > guestDecksLeft) {
    winnerSocketId = room.hostId;
    loserSocketId = room.guestId;
  } else if (guestDecksLeft > hostDecksLeft) {
    winnerSocketId = room.guestId;
    loserSocketId = room.hostId;
  } else if (hostState.hits > guestState.hits) {
    winnerSocketId = room.hostId;
    loserSocketId = room.guestId;
  } else if (guestState.hits > hostState.hits) {
    winnerSocketId = room.guestId;
    loserSocketId = room.hostId;
  } else if (hostAccuracy > guestAccuracy) {
    winnerSocketId = room.hostId;
    loserSocketId = room.guestId;
  } else if (guestAccuracy > hostAccuracy) {
    winnerSocketId = room.guestId;
    loserSocketId = room.hostId;
  } else {
    isDraw = true;
  }

  room.phase = "finished";
  room.turnSocketId = null;
  room.shotsLeft = 0;
  room.winnerSocketId = winnerSocketId;
  room.isDraw = isDraw;
  room.turnDeadlineMs = null;
  room.matchDeadlineMs = null;
  room.lastTimerSecondBroadcast = null;
  room.lastMatchSecondBroadcast = null;

  if (isDraw) {
    room.log.unshift("Blitz timer ended. Match is a draw.");
  } else if (winnerSocketId) {
    const winnerRole = getRole(room, winnerSocketId) === "host" ? "Host" : "Guest";
    room.log.unshift(`Blitz timer ended. ${winnerRole} wins on tiebreak.`);
  }
  trimLog(room);
  recordRoomResult(room, winnerSocketId, loserSocketId, isDraw);
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

function createRoomPlayerState(socketId: string, placement: Placement): RoomPlayerState {
  return {
    socketId,
    shipGrid: placement.shipGrid,
    shipLengths: placement.shipLengths,
    shipHits: Array.from({ length: placement.shipLengths.length }, () => 0),
    radar: createGrid<TurnMark>("unknown"),
    shotsFired: 0,
    hits: 0,
  };
}

function createRoomPlacementState(): RoomPlacementState {
  return {
    deadlineMs: null,
    lastSecondBroadcast: null,
    readySockets: new Set<string>(),
    drafts: new Map<string, Placement>(),
  };
}

function clearRoomPlacement(room: RoomState): void {
  room.placement.deadlineMs = null;
  room.placement.lastSecondBroadcast = null;
  room.placement.readySockets.clear();
  room.placement.drafts.clear();
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
  room.isDraw = false;
  clearRoomPlacement(room);
  room.turnDeadlineMs = null;
  room.matchDeadlineMs = null;
  room.lastTimerSecondBroadcast = null;
  room.lastMatchSecondBroadcast = null;
  room.rematchRequestedBy.clear();
  room.players.clear();
  room.log = [message];
}

function finalizePlacementAndStart(room: RoomState, openerMessage: string): RoomActionAck {
  if (!room.guestId) {
    return { ok: false, error: "Need second player to start." };
  }

  const hostPlacement =
    room.placement.drafts.get(room.hostId) ?? placeFleetRandomly(ROOM_FLEET);
  const guestPlacement =
    room.placement.drafts.get(room.guestId) ?? placeFleetRandomly(ROOM_FLEET);

  room.players.clear();
  room.players.set(room.hostId, createRoomPlayerState(room.hostId, hostPlacement));
  room.players.set(room.guestId, createRoomPlayerState(room.guestId, guestPlacement));
  clearRoomPlacement(room);
  room.phase = "playing";
  room.turnSocketId = room.hostId;
  room.shotsLeft = SHOTS_PER_TURN;
  room.round = 1;
  room.winnerSocketId = null;
  room.isDraw = false;
  room.turnDeadlineMs = Date.now() + ROOM_TURN_SECONDS * 1000;
  room.matchDeadlineMs =
    room.mode === "blitz3m" ? Date.now() + BLITZ_MATCH_SECONDS * 1000 : null;
  room.lastTimerSecondBroadcast = null;
  room.lastMatchSecondBroadcast = null;
  room.rematchRequestedBy.clear();
  room.log = [openerMessage];
  return { ok: true, roomCode: room.code };
}

function startRoomPlacementPhase(room: RoomState, openerMessage: string): RoomActionAck {
  if (!room.guestId) {
    return { ok: false, error: "Need second player to start." };
  }

  room.players.clear();
  room.phase = "placement";
  room.turnSocketId = null;
  room.shotsLeft = SHOTS_PER_TURN;
  room.round = 1;
  room.winnerSocketId = null;
  room.isDraw = false;
  room.placement.deadlineMs = Date.now() + ROOM_PLACEMENT_SECONDS * 1000;
  room.placement.lastSecondBroadcast = null;
  room.placement.readySockets.clear();
  room.placement.drafts.clear();
  room.turnDeadlineMs = null;
  room.matchDeadlineMs = null;
  room.lastTimerSecondBroadcast = null;
  room.lastMatchSecondBroadcast = null;
  room.rematchRequestedBy.clear();
  room.log = [openerMessage];
  return { ok: true, roomCode: room.code };
}

function makeRoomView(room: RoomState, socketId: string): RoomViewPayload {
  const youRole = getRole(room, socketId);
  const opponentId = getOpponentId(room, socketId);
  const yourProfile = getSocketProfile(socketId);
  const opponentProfile = opponentId ? getSocketProfile(opponentId) : null;
  const youRequestedRematch = room.rematchRequestedBy.has(socketId);
  const opponentRequestedRematch = opponentId
    ? room.rematchRequestedBy.has(opponentId)
    : false;
  const youState = room.players.get(socketId) ?? null;
  const opponentState = opponentId ? room.players.get(opponentId) ?? null : null;
  const yourPlacementDraft = room.placement.drafts.get(socketId) ?? null;
  const opponentPlacementReady = opponentId
    ? room.placement.readySockets.has(opponentId)
    : false;
  const yourPlacementReady = room.placement.readySockets.has(socketId);

  const yourTurn =
    room.phase === "playing" && room.turnSocketId !== null && room.turnSocketId === socketId;
  const placementSecondsLeft =
    room.phase === "placement" && room.placement.deadlineMs
      ? Math.max(0, Math.ceil((room.placement.deadlineMs - Date.now()) / 1000))
      : 0;
  const turnSecondsLeft =
    yourTurn && room.turnDeadlineMs
      ? Math.max(0, Math.ceil((room.turnDeadlineMs - Date.now()) / 1000))
      : 0;
  const matchSecondsLeft =
    room.phase === "playing" && room.mode === "blitz3m" && room.matchDeadlineMs
      ? Math.max(0, Math.ceil((room.matchDeadlineMs - Date.now()) / 1000))
      : 0;

  let winner: "you" | "opponent" | "draw" | null = null;
  if (room.phase === "finished") {
    if (room.isDraw) {
      winner = "draw";
    } else if (room.winnerSocketId) {
      winner = room.winnerSocketId === socketId ? "you" : "opponent";
    }
  }

  let status = "Room ready.";
  if (room.phase === "lobby") {
    status = room.guestId
      ? "Opponent connected. Host can start match."
      : "Waiting for opponent to join via room code.";
  } else if (room.phase === "placement") {
    const you = yourPlacementReady ? "ready" : "placing";
    const opp = opponentPlacementReady ? "ready" : "placing";
    status = `Placement phase: ${placementSecondsLeft}s left. You: ${you}, opponent: ${opp}.`;
  } else if (room.phase === "playing") {
    const blitzSuffix =
      room.mode === "blitz3m" ? ` | Match: ${matchSecondsLeft}s` : "";
    status = yourTurn
      ? `Your turn: ${room.shotsLeft} shots left (${turnSecondsLeft}s).${blitzSuffix}`
      : `Opponent turn. Wait for incoming salvo.${blitzSuffix}`;
  } else if (winner === "you") {
    status = "You win this match.";
  } else if (winner === "opponent") {
    status = "Opponent wins this match.";
  } else if (winner === "draw") {
    status = "Match ended in a draw.";
  }

  if (room.phase === "finished" && room.guestId !== null) {
    if (youRequestedRematch && !opponentRequestedRematch) {
      status = "Rematch requested. Waiting for opponent.";
    } else if (!youRequestedRematch && opponentRequestedRematch) {
      status = "Opponent requested rematch.";
    } else if (youRequestedRematch && opponentRequestedRematch) {
      status = "Rematch confirmed. Starting...";
    }
  }

  return {
    roomCode: room.code,
    mode: room.mode,
    phase: room.phase,
    youRole,
    yourProfile,
    opponentProfile,
    opponentConnected: room.guestId !== null,
    yourTurn,
    shotsLeft: room.shotsLeft,
    turnSecondsLeft,
    matchSecondsLeft,
    round: room.round,
    winner,
    canRematch: room.phase === "finished" && room.guestId !== null,
    youRequestedRematch,
    opponentRequestedRematch,
    playerRadar: youState ? cloneGrid(youState.radar) : createGrid<TurnMark>("unknown"),
    defenseRadar: opponentState
      ? cloneGrid(opponentState.radar)
      : createGrid<TurnMark>("unknown"),
    playerShipGrid:
      room.phase === "placement"
        ? yourPlacementDraft
          ? cloneGrid(yourPlacementDraft.shipGrid)
          : createGrid<number>(WATER)
        : youState
        ? cloneGrid(youState.shipGrid)
        : createGrid<number>(WATER),
    yourPlacementReady,
    opponentPlacementReady,
    placementSecondsLeft,
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

bootstrapStatsPersistence();

setInterval(() => {
  for (const room of rooms.values()) {
    const placementChanged = resolvePlacementTimeout(room);
    if (placementChanged) {
      room.lastTimerSecondBroadcast = null;
      room.lastMatchSecondBroadcast = null;
      emitRoomState(room.code);
      continue;
    }

    const matchChanged = resolveMatchTimeout(room);
    if (matchChanged) {
      room.lastTimerSecondBroadcast = null;
      room.lastMatchSecondBroadcast = null;
      emitRoomState(room.code);
      continue;
    }

    const changed = resolveTurnTimeout(room);
    if (changed) {
      room.lastTimerSecondBroadcast = null;
      room.lastMatchSecondBroadcast = null;
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

    if (room.phase === "playing" && room.mode === "blitz3m" && room.matchDeadlineMs) {
      const matchSecondsLeft = Math.max(
        0,
        Math.ceil((room.matchDeadlineMs - Date.now()) / 1000)
      );
      if (room.lastMatchSecondBroadcast !== matchSecondsLeft) {
        room.lastMatchSecondBroadcast = matchSecondsLeft;
        emitRoomState(room.code);
      }
    }

    if (room.phase === "placement" && room.placement.deadlineMs) {
      const secondsLeft = Math.max(
        0,
        Math.ceil((room.placement.deadlineMs - Date.now()) / 1000)
      );
      if (room.placement.lastSecondBroadcast !== secondsLeft) {
        room.placement.lastSecondBroadcast = secondsLeft;
        emitRoomState(room.code);
      }
    }
  }
}, ROOM_TIMEOUT_SWEEP_MS);

io.on("connection", (socket) => {
  addClient(socket);
  socketProfiles.set(socket.id, defaultProfileForSocket(socket.id));

  socket.emit("server:welcome", {
    message: "Sea War socket server online",
    socketId: socket.id,
  });
  emitLeaderboardUpdate(socket.id);

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

  socket.on(
    "player:profile",
    (
      payload: { name?: string; city?: string },
      callback?: (response: { ok: boolean; profile?: PlayerProfile }) => void
    ) => {
      const profile = updateProfile(socket.id, payload?.name, payload?.city);
      const roomCode = socketToRoom.get(socket.id);
      if (roomCode) emitRoomState(roomCode);
      emitLeaderboardUpdate();
      callback?.({
        ok: true,
        profile,
      });
    }
  );

  socket.on("leaderboard:get", () => {
    emitLeaderboardUpdate(socket.id);
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
      mode: "classic",
      phase: "lobby",
      turnSocketId: null,
      shotsLeft: SHOTS_PER_TURN,
      round: 1,
      winnerSocketId: null,
      isDraw: false,
      turnDeadlineMs: null,
      matchDeadlineMs: null,
      lastTimerSecondBroadcast: null,
      lastMatchSecondBroadcast: null,
      rematchRequestedBy: new Set<string>(),
      players: new Map<string, RoomPlayerState>(),
      placement: createRoomPlacementState(),
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

  socket.on(
    "room:setMode",
    (
      payload: { mode?: RoomMode },
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

      if (room.hostId !== socket.id) {
        callback?.({ ok: false, error: "Only host can change mode." });
        return;
      }

      if (room.phase !== "lobby") {
        callback?.({ ok: false, error: "Mode can be changed only in lobby." });
        return;
      }

      const mode = payload?.mode === "blitz3m" ? "blitz3m" : "classic";
      room.mode = mode;
      room.log.unshift(
        mode === "blitz3m"
          ? "Mode switched to Blitz 3m."
          : "Mode switched to Classic."
      );
      trimLog(room);
      emitRoomState(roomCode);
      callback?.({ ok: true, roomCode });
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

    if (room.phase !== "lobby") {
      callback?.({ ok: false, error: "Match can start only from lobby." });
      return;
    }

    const result = startRoomPlacementPhase(
      room,
      room.mode === "blitz3m"
        ? "Blitz 3m: placement started (20s)."
        : "Placement started (20s)."
    );
    if (!result.ok) {
      callback?.(result);
      return;
    }
    emitRoomState(roomCode);
    callback?.(result);
  });

  socket.on("room:rematch", (callback?: (response: RoomActionAck) => void) => {
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

    if (room.phase !== "finished") {
      callback?.({ ok: false, error: "Rematch is available only after match end." });
      return;
    }

    if (!room.guestId) {
      callback?.({ ok: false, error: "Need second player for rematch." });
      return;
    }

    room.rematchRequestedBy.add(socket.id);
    const actor = getRole(room, socket.id) === "host" ? "Host" : "Guest";
    room.log.unshift(`${actor} requested rematch.`);
    trimLog(room);

    const bothConfirmed =
      room.rematchRequestedBy.has(room.hostId) &&
      room.rematchRequestedBy.has(room.guestId);

    if (!bothConfirmed) {
      emitRoomState(roomCode);
      callback?.({ ok: true, roomCode });
      return;
    }

    const result = startRoomPlacementPhase(
      room,
      room.mode === "blitz3m"
        ? "Blitz 3m rematch: placement started (20s)."
        : "Rematch: placement started (20s)."
    );
    if (!result.ok) {
      callback?.(result);
      return;
    }

    emitRoomState(roomCode);
    callback?.(result);
  });

  socket.on(
    "room:placement:set",
    (
      payload: { ships?: PlacementShipInput[] },
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

      if (room.phase !== "placement") {
        callback?.({ ok: false, error: "Placement phase is not active." });
        return;
      }

      if (socket.id !== room.hostId && socket.id !== room.guestId) {
        callback?.({ ok: false, error: "You are not a room participant." });
        return;
      }

      const ships = payload?.ships;
      const result = buildPlacementFromShips(Array.isArray(ships) ? ships : []);
      if (!result.ok) {
        callback?.({ ok: false, error: result.error });
        return;
      }

      room.placement.drafts.set(socket.id, result.placement);
      room.placement.readySockets.add(socket.id);
      const actor = getRole(room, socket.id) === "host" ? "Host" : "Guest";
      room.log.unshift(`${actor} locked fleet.`);
      trimLog(room);

      const bothReady =
        room.guestId !== null &&
        room.placement.readySockets.has(room.hostId) &&
        room.placement.readySockets.has(room.guestId);

      if (bothReady) {
        const startResult = finalizePlacementAndStart(
          room,
          "Both fleets locked. Match started. Host shoots first."
        );
        emitRoomState(roomCode);
        callback?.(startResult);
        return;
      }

      emitRoomState(roomCode);
      callback?.({ ok: true, roomCode });
    }
  );

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
    socketProfiles.delete(socket.id);
  });
});

httpServer.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Socket server running on http://localhost:${port}`);
});
