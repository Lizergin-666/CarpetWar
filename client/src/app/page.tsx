"use client";

import { io, Socket } from "socket.io-client";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { buildSoloCoach, CoachReport } from "../lib/coach";
import { CarpetBoard } from "../components/CarpetBoard";

const BOARD_SIZE = 10;
const SHOTS_PER_TURN = 3;
const BOT_TURN_DELAY_MS = 750;
const PLAYER_TURN_SECONDS = 20;
const WATER = -1;
const MISS_SOUND_URL = "/sound/smash1.mp3";
const THEME_SOUND_URL = "/sound/Theme.mp3";
const HMM_SOUND_URL = "/sound/hmm.mp3";
const LAUGH_SOUND_URL = "/sound/lought.mp3";
const HISTORY_LIMIT = 25;
const STORAGE_HISTORY_KEY = "sea-war.match-history.v1";
const STORAGE_DIFFICULTY_KEY = "sea-war.bot-difficulty.v1";
const STORAGE_SOUND_ENABLED_KEY = "sea-war.sound-enabled.v1";
const STORAGE_PVP_PROFILE_KEY = "sea-war.pvp-profile.v1";
const FLEET = [5, 4, 4, 3, 3, 3, 2, 2, 2, 2] as const;
const UI_LOGO_URL = "/ui/logo-main.png";
const UI_MENU_BUTTON_URL = "/ui/btn-menu.png";
const UI_START_BUTTON_URL = "/ui/btn-start.png";
const UI_MENU_PANEL_URL = "/ui/menu-panel.png";
const UI_ONLINE_PANEL_URL = "/ui/panel-online.png";
const UI_LEVEL_PANEL_URL = "/ui/panel-level.png";
const UI_DECOR_BLUE_URL = "/ui/character-blue-anim.gif";
const UI_DECOR_RED_URL = "/ui/character-red-anim.gif";
const UI_HEALTH_BLUE_URL = "/ui/health-blue.png";
const UI_HEALTH_RED_URL = "/ui/health-red.png";
const UI_DOOR_LEFT_URL = "/ui/door-left.png";
const UI_DOOR_RIGHT_URL = "/ui/door-right.png";
const UI_BUTTON_STAT_URL = "/ui/btn-stat.png";
const UI_BUTTON_SOUND_URL = "/ui/btn-sound.png";
const UI_BUTTON_LOGIN_URL = "/ui/btn-login.png";
const UI_BUTTON_LEADER_URL = "/ui/btn-leader.png";
const UI_BUTTON_GOOGLE_URL = "/ui/btn-google.png";
const UI_BUTTON_NIGHTMARE_URL = "/ui/btn-nightmare.png";
const UI_BUTTON_OFFLINE_URL = "/ui/btn-offline.png";
const UI_BUTTON_ONLINE_GREEN_URL = "/ui/btn-online-green.png";
const UI_BUTTON_BABY_URL = "/ui/btn-baby.png";
const UI_BUTTON_MAN_URL = "/ui/btn-man.png";
const BUTTON_SOUND_URL = "/ui/button.mp3";
const MODAL_BUTTON_MOTION_CLASS =
  "transition-transform duration-150 ease-out hover:-translate-y-[2px] hover:scale-[1.03] active:translate-y-[1px] active:scale-[0.98]";
const MENU_BUTTON_RIGHT_PCT = 1.9;
const MENU_BUTTON_TOP_PCT = 2.3;
const MENU_BUTTON_WIDTH_PCT = 16;
const MENU_PANEL_WIDTH_PCT = 19.6;
const MENU_PANEL_CENTER_X_PCT =
  100 - MENU_BUTTON_RIGHT_PCT - MENU_BUTTON_WIDTH_PCT / 2;

type Turn = "player" | "bot" | "finished";
type Mark = "unknown" | "miss" | "hit";
type BotDifficulty = "easy" | "medium" | "hard";
type StartPanel = "online" | "level";
type GameMode = "solo" | "online";
type RoomPhase = "lobby" | "playing" | "finished";
type Role = "host" | "guest";
type RoomMode = "classic" | "blitz3m";

interface PlayerProfile {
  name: string;
  city: string;
}

interface RoomViewPayload {
  roomCode: string;
  mode: RoomMode;
  phase: RoomPhase;
  youRole: Role;
  yourProfile: PlayerProfile;
  opponentProfile: PlayerProfile | null;
  opponentConnected: boolean;
  yourTurn: boolean;
  shotsLeft: number;
  turnSecondsLeft: number;
  matchSecondsLeft: number;
  round: number;
  winner: "you" | "opponent" | "draw" | null;
  canRematch: boolean;
  youRequestedRematch: boolean;
  opponentRequestedRematch: boolean;
  playerRadar: Mark[][];
  defenseRadar: Mark[][];
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

interface RoomClosedPayload {
  reason?: string;
}

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

interface HitEffect {
  id: string;
  row: number;
  col: number;
  startedAtMs: number;
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

function readStoredPvpProfile(): PlayerProfile {
  if (typeof window === "undefined") {
    return { name: "", city: "" };
  }

  try {
    const raw = localStorage.getItem(STORAGE_PVP_PROFILE_KEY);
    if (!raw) return { name: "", city: "" };
    const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      city: typeof parsed.city === "string" ? parsed.city : "",
    };
  } catch {
    return { name: "", city: "" };
  }
}

function sanitizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

function readRoomCodeFromUrl(): string {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return sanitizeRoomCode(params.get("room") ?? "");
}

function syncRoomCodeToUrl(roomCode: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (roomCode) {
    url.searchParams.set("room", roomCode);
  } else {
    url.searchParams.delete("room");
  }
  window.history.replaceState({}, "", url.toString());
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
        const forceHorizontal = length === 5 || length === 2;
        const horizontal = forceHorizontal ? true : Math.random() < 0.5;
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

function countMisses(radar: Mark[][]): number {
  let misses = 0;
  for (const row of radar) {
    for (const mark of row) {
      if (mark === "miss") misses += 1;
    }
  }
  return misses;
}

function deriveShipHits(
  shipGrid: number[][],
  defenseRadar: Mark[][],
  waterValue: number
): number[] {
  let maxShipId = -1;
  for (let row = 0; row < shipGrid.length; row += 1) {
    for (let col = 0; col < shipGrid[row].length; col += 1) {
      const shipId = shipGrid[row][col];
      if (shipId !== waterValue) {
        maxShipId = Math.max(maxShipId, shipId);
      }
    }
  }

  if (maxShipId < 0) return [];

  const hits = Array.from({ length: maxShipId + 1 }, () => 0);
  for (let row = 0; row < shipGrid.length; row += 1) {
    for (let col = 0; col < shipGrid[row].length; col += 1) {
      const shipId = shipGrid[row][col];
      if (shipId === waterValue) continue;
      if (defenseRadar[row]?.[col] === "hit") {
        hits[shipId] += 1;
      }
    }
  }
  return hits;
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
  const [gameMode, setGameMode] = useState<GameMode>("solo");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>(() =>
    readStoredDifficulty()
  );
  const [game, setGame] = useState<GameState>(() =>
    createGameState(readStoredDifficulty())
  );
  const [history, setHistory] = useState<MatchSummary[]>(() => readStoredHistory());
  const [coachReport, setCoachReport] = useState<CoachReport | null>(null);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isStatsOpen, setIsStatsOpen] = useState<boolean>(false);
  const [startPanel, setStartPanel] = useState<StartPanel | null>(null);
  const [isOnlineLobbyOpen, setIsOnlineLobbyOpen] = useState<boolean>(false);
  const [isDoorOverlayVisible, setIsDoorOverlayVisible] = useState<boolean>(true);
  const [isDoorOpened, setIsDoorOpened] = useState<boolean>(false);
  const [isSceneDimmed, setIsSceneDimmed] = useState<boolean>(true);

  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [roomView, setRoomView] = useState<RoomViewPayload | null>(null);
  const [joinCode, setJoinCode] = useState<string>("");
  const [roomMode, setRoomMode] = useState<RoomMode>("classic");
  const [onlineNotice, setOnlineNotice] = useState<string>(
    "Login with Google, then create or join a room."
  );
  const [profileName, setProfileName] = useState<string>(() => readStoredPvpProfile().name);
  const [profileCity, setProfileCity] = useState<string>(() => readStoredPvpProfile().city);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const savedResultGameIdRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const autoJoinTriedRef = useRef(false);
  const impactSoundRef = useRef<HTMLAudioElement | null>(null);
  const themeSoundRef = useRef<HTMLAudioElement | null>(null);
  const hmmSoundRef = useRef<HTMLAudioElement | null>(null);
  const laughSoundRef = useRef<HTMLAudioElement | null>(null);
  const buttonSoundRef = useRef<HTMLAudioElement | null>(null);
  const missEventCountRef = useRef<number>(0);
  const hitEventCountRef = useRef<number>(0);
  const radarSnapshotRef = useRef<Mark[][]>(createGrid<Mark>("unknown"));
  const onlineRadarSnapshotRef = useRef<Mark[][]>(createGrid<Mark>("unknown"));
  const enemyShipHitsSnapshotRef = useRef<number[]>(Array.from({ length: FLEET.length }, () => 0));

  const socketUrl = useMemo(
    () => process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000",
    []
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(() => {
    if (!supabaseUrl || !supabasePublishableKey) return null;
    return createClient(supabaseUrl, supabasePublishableKey);
  }, [supabasePublishableKey, supabaseUrl]);

  const tryPlayTheme = useCallback((): void => {
    const theme = themeSoundRef.current;
    if (!theme) return;
    void theme.play().catch(() => {
      // Ignore autoplay restrictions.
    });
  }, []);

  const playSound = useCallback((ref: { current: HTMLAudioElement | null }): void => {
    const base = ref.current;
    if (!base) return;
    const instance = base.cloneNode(true) as HTMLAudioElement;
    instance.volume = base.volume;
    void instance.play().catch(() => {
      // Ignore autoplay/user-gesture restrictions.
    });
  }, []);

  const appendHitEffects = useCallback((effects: HitEffect[]): void => {
    if (effects.length === 0) return;
    setHitEffects((prev) => [...prev, ...effects]);
    window.setTimeout(() => {
      setHitEffects((prev) =>
        prev.filter((effect) => !effects.some((added) => added.id === effect.id))
      );
    }, 1700);
  }, []);

  const resetHitEffects = useCallback((): void => {
    setHitEffects([]);
  }, []);

  useEffect(() => {
    const socket: Socket = io(socketUrl, {
      transports: ["polling", "websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("leaderboard:get");

      if (!autoJoinTriedRef.current) {
        autoJoinTriedRef.current = true;
        const urlRoomCode = readRoomCodeFromUrl();
        if (urlRoomCode) {
          setJoinCode(urlRoomCode);
          socket.emit(
            "room:join",
            { roomCode: urlRoomCode },
            (response: RoomActionAck): void => {
              if (!response.ok) {
                setOnlineNotice(response.error ?? "Auto-join failed.");
                return;
              }
              setGameMode("online");
              setOnlineNotice(`Joined room from invite: ${response.roomCode}`);
              setIsOnlineLobbyOpen(true);
            }
          );
        }
      }
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
    });

    socket.on("room:state", (payload: RoomViewPayload) => {
      setRoomView(payload);
      setRoomMode(payload.mode);
      setJoinCode(payload.roomCode);
      setOnlineNotice(payload.status);
      setGameMode("online");
      setIsOnlineLobbyOpen(true);
      syncRoomCodeToUrl(payload.roomCode);
    });

    socket.on("room:closed", (payload: RoomClosedPayload) => {
      setRoomView(null);
      setOnlineNotice(payload.reason ?? "Room closed.");
      syncRoomCodeToUrl(null);
    });

    socket.on("system", (payload: SystemPayload) => {
      const eventLabel = payload.event ? ` (${payload.event})` : "";
      const item = `${payload.type}${eventLabel}`;
      setOnlineNotice(item);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl]);

  useEffect(() => {
    const impactAudio = new Audio(MISS_SOUND_URL);
    impactAudio.preload = "auto";
    impactAudio.volume = 0.7;
    impactSoundRef.current = impactAudio;

    const themeAudio = new Audio(THEME_SOUND_URL);
    themeAudio.preload = "auto";
    themeAudio.loop = true;
    themeAudio.volume = 0.33;
    themeSoundRef.current = themeAudio;
    if (isSoundEnabled) {
      void themeAudio.play().catch(() => {
        // Ignore autoplay restrictions.
      });
    }

    const hmmAudio = new Audio(HMM_SOUND_URL);
    hmmAudio.preload = "auto";
    hmmAudio.volume = 0.68;
    hmmSoundRef.current = hmmAudio;

    const laughAudio = new Audio(LAUGH_SOUND_URL);
    laughAudio.preload = "auto";
    laughAudio.volume = 0.72;
    laughSoundRef.current = laughAudio;

    const buttonAudio = new Audio(BUTTON_SOUND_URL);
    buttonAudio.preload = "auto";
    buttonAudio.volume = 0.7;
    buttonSoundRef.current = buttonAudio;

    return () => {
      for (const ref of [
        impactSoundRef,
        themeSoundRef,
        hmmSoundRef,
        laughSoundRef,
        buttonSoundRef,
      ]) {
        if (!ref.current) continue;
        ref.current.pause();
        ref.current.src = "";
        ref.current = null;
      }
    };
  }, [isSoundEnabled]);

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
    try {
      localStorage.setItem(STORAGE_SOUND_ENABLED_KEY, isSoundEnabled ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }, [isSoundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_PVP_PROFILE_KEY,
        JSON.stringify({ name: profileName, city: profileCity })
      );
    } catch {
      // Ignore storage failures.
    }
  }, [profileCity, profileName]);

  useEffect(() => {
    if (!socketConnected) return;
    socketRef.current?.emit("player:profile", {
      name: profileName,
      city: profileCity,
    });
  }, [profileCity, profileName, socketConnected]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setAuthUser(data.session?.user ?? null);
      })
      .catch(() => {
        setAuthUser(null);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!authUser) return;
    if (profileName.trim().length > 0) return;
    const suggestedName =
      (authUser.user_metadata?.full_name as string | undefined) ??
      authUser.email?.split("@")[0] ??
      "";
    if (suggestedName.trim().length > 0) {
      setProfileName(suggestedName.trim());
    }
  }, [authUser, profileName]);

  useEffect(() => {
    const openTimer = window.setTimeout(() => {
      setIsDoorOpened(true);
      setIsSceneDimmed(false);
    }, 2000);
    const hideTimer = window.setTimeout(() => {
      setIsDoorOverlayVisible(false);
    }, 4100);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    const theme = themeSoundRef.current;
    if (!theme) return;
    if (isSoundEnabled) {
      tryPlayTheme();
    } else {
      theme.pause();
      theme.currentTime = 0;
    }
  }, [isSoundEnabled, tryPlayTheme]);

  useEffect(() => {
    if (!isSoundEnabled) return;
    tryPlayTheme();
    const unlockAudio = (): void => {
      tryPlayTheme();
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("touchstart", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [isSoundEnabled, tryPlayTheme]);

  useEffect(() => {
    if (gameMode !== "solo") return;
    const prevRadar = radarSnapshotRef.current;
    const prevEnemyHits = enemyShipHitsSnapshotRef.current;
    const nextRadar = game.playerRadar;
    const nextEnemyHits = game.enemyShipHits;

    if (isSoundEnabled && themeSoundRef.current && themeSoundRef.current.paused) {
      tryPlayTheme();
    }

    const sunkShipIds = new Set<number>();
    for (let shipId = 0; shipId < game.enemyShipLengths.length; shipId += 1) {
      const prevHits = prevEnemyHits[shipId] ?? 0;
      const nextHits = nextEnemyHits[shipId] ?? 0;
      const shipLength = game.enemyShipLengths[shipId] ?? 0;
      if (shipLength > 0 && prevHits < shipLength && nextHits >= shipLength) {
        sunkShipIds.add(shipId);
      }
    }

    const newHitEffects: HitEffect[] = [];
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const before = prevRadar[row]?.[col] ?? "unknown";
        const after = nextRadar[row]?.[col] ?? "unknown";
        if (before !== "unknown" || after === "unknown") continue;

        playSound(impactSoundRef);

        if (after === "miss") {
          missEventCountRef.current += 1;
          if (missEventCountRef.current % 3 === 0) {
            playSound(hmmSoundRef);
          }
          continue;
        }

        if (after === "hit") {
          newHitEffects.push({
            id: `${Date.now()}-${row}-${col}-${Math.random().toString(16).slice(2, 6)}`,
            row,
            col,
            startedAtMs: Date.now(),
          });

          const shipId = game.enemyShipGrid[row][col];
          if (sunkShipIds.has(shipId)) {
            playSound(laughSoundRef);
          } else {
            hitEventCountRef.current += 1;
            if (hitEventCountRef.current % 2 === 0) {
              playSound(laughSoundRef);
            }
          }
        }
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    appendHitEffects(newHitEffects);

    radarSnapshotRef.current = nextRadar.map((row) => row.slice());
    enemyShipHitsSnapshotRef.current = [...nextEnemyHits];
  }, [
    appendHitEffects,
    gameMode,
    game.enemyShipGrid,
    game.enemyShipHits,
    game.enemyShipLengths,
    game.playerRadar,
    isSoundEnabled,
    tryPlayTheme,
    playSound,
  ]);

  useEffect(() => {
    if (gameMode !== "online") {
      onlineRadarSnapshotRef.current = createGrid<Mark>("unknown");
      return;
    }

    const nextRadar = roomView?.playerRadar ?? createGrid<Mark>("unknown");
    const prevRadar = onlineRadarSnapshotRef.current;
    const newHitEffects: HitEffect[] = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const before = prevRadar[row]?.[col] ?? "unknown";
        const after = nextRadar[row]?.[col] ?? "unknown";
        if (before !== "unknown" || after === "unknown") continue;

        playSound(impactSoundRef);
        if (after === "hit") {
          newHitEffects.push({
            id: `online-${Date.now()}-${row}-${col}-${Math.random()
              .toString(16)
              .slice(2, 6)}`,
            row,
            col,
            startedAtMs: Date.now(),
          });
        }
      }
    }

    appendHitEffects(newHitEffects);
    onlineRadarSnapshotRef.current = nextRadar.map((row) => row.slice());
  }, [appendHitEffects, gameMode, playSound, roomView?.playerRadar]);

  useEffect(() => {
    if (gameMode !== "solo") return;
    if (game.turn !== "bot") return;
    if (game.winner !== null) return;
    const timer = window.setTimeout(() => {
      setGame((prev) => resolveBotSalvo(prev, botDifficulty));
    }, 720);
    return () => {
      window.clearTimeout(timer);
    };
  }, [botDifficulty, game.turn, game.winner, gameMode]);

  useEffect(() => {
    if (gameMode !== "solo") return;
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
    gameMode,
  ]);

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
  const showDefenseLayer = game.turn === "bot" || (game.turn === "finished" && game.winner === "bot");
  const onlinePlayerRadar = roomView?.playerRadar ?? createGrid<Mark>("unknown");
  const onlineDefenseRadar = roomView?.defenseRadar ?? createGrid<Mark>("unknown");
  const onlineShipGrid = roomView?.playerShipGrid ?? createGrid<number>(WATER);
  const onlineShipHits = useMemo(
    () => deriveShipHits(onlineShipGrid, onlineDefenseRadar, WATER),
    [onlineDefenseRadar, onlineShipGrid]
  );
  const hiddenEnemyShipGrid = useMemo(() => createGrid<number>(WATER), []);
  const hiddenEnemyShipHits = useMemo(() => [] as number[], []);
  const onlineShowDefenseLayer =
    roomView?.phase === "playing" ? !roomView.yourTurn : roomView !== null;
  const onlineCanShoot =
    gameMode === "online" &&
    socketConnected &&
    roomView?.phase === "playing" &&
    roomView.yourTurn &&
    roomView.winner === null;
  const canStartOnlineMatch =
    roomView?.phase === "lobby" &&
    roomView.youRole === "host" &&
    roomView.opponentConnected;
  const canChangeOnlineMode =
    roomView?.phase === "lobby" &&
    roomView.youRole === "host" &&
    socketConnected;
  const avgPlayerAccuracy =
    totalGames > 0
      ? Math.round(
          history.reduce((sum, match) => sum + match.playerAccuracy, 0) / totalGames
        )
      : 0;

  useEffect(() => {
    if (gameMode !== "solo") return;
    radarSnapshotRef.current = game.playerRadar.map((row) => row.slice());
    enemyShipHitsSnapshotRef.current = [...game.enemyShipHits];
    missEventCountRef.current = 0;
    hitEventCountRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetHitEffects();
  }, [game.enemyShipHits, game.id, game.playerRadar, resetHitEffects, gameMode]);

  function resetGame(nextDifficulty?: BotDifficulty): void {
    const difficulty = nextDifficulty ?? botDifficulty;
    setGame(createGameState(difficulty));
    setCoachReport(null);
    setHitEffects([]);
    setGameMode("solo");
  }

  function handleOnlineShot(row: number, col: number): void {
    if (!onlineCanShoot) return;
    if (onlinePlayerRadar[row]?.[col] !== "unknown") return;

    socketRef.current?.emit(
      "room:shoot",
      { row, col },
      (response: RoomActionAck): void => {
        if (!response.ok) {
          setOnlineNotice(response.error ?? "Shot failed.");
        }
      }
    );
  }

  function handleCellClick(row: number, col: number): void {
    if (gameMode === "online") {
      handleOnlineShot(row, col);
      return;
    }
    setGame((prev) => applyPlayerShot(prev, row, col, false));
  }

  function playButtonClickSound(): void {
    playSound(buttonSoundRef);
  }

  function handleMenuToggle(): void {
    playButtonClickSound();
    setIsMenuOpen((prev) => !prev);
  }

  function handleStartClick(): void {
    playButtonClickSound();
    setStartPanel("online");
    setIsMenuOpen(false);
    setIsStatsOpen(false);
  }

  function handleCloseStartPanel(): void {
    setStartPanel(null);
  }

  function handleOnlineModeClick(): void {
    playButtonClickSound();
    setStartPanel(null);
    setIsOnlineLobbyOpen(true);
    setGameMode("online");
  }

  function handleOfflineModeClick(): void {
    playButtonClickSound();
    setGameMode("solo");
    setStartPanel("level");
  }

  function handleLevelChoice(nextDifficulty: BotDifficulty): void {
    playButtonClickSound();
    setBotDifficulty(nextDifficulty);
    resetGame(nextDifficulty);
    setStartPanel(null);
  }

  async function handleGoogleLogin(): Promise<void> {
    if (!supabase) {
      setOnlineNotice(
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in client env."
      );
      return;
    }
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setOnlineNotice(error.message);
    }
  }

  async function handleGoogleLogout(): Promise<void> {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setOnlineNotice(error.message);
      return;
    }
    setOnlineNotice("Signed out.");
  }

  function saveOnlineProfile(): void {
    if (!socketConnected) return;
    socketRef.current?.emit(
      "player:profile",
      {
        name: profileName,
        city: profileCity,
      },
      (response: { ok: boolean; profile?: PlayerProfile }): void => {
        if (!response.ok || !response.profile) {
          setOnlineNotice("Failed to save profile.");
          return;
        }
        setProfileName(response.profile.name);
        setProfileCity(response.profile.city);
        setOnlineNotice(
          `Profile saved: ${response.profile.name} (${response.profile.city})`
        );
      }
    );
  }

  function createOnlineRoom(): void {
    if (!socketConnected) return;
    socketRef.current?.emit("room:create", (response: RoomActionAck): void => {
      if (!response.ok) {
        setOnlineNotice(response.error ?? "Failed to create room.");
        return;
      }
      setGameMode("online");
      setOnlineNotice(`Room created: ${response.roomCode}`);
    });
  }

  function joinOnlineRoom(): void {
    if (!socketConnected) return;
    const roomCode = sanitizeRoomCode(joinCode);
    if (!roomCode) {
      setOnlineNotice("Enter room code.");
      return;
    }
    socketRef.current?.emit(
      "room:join",
      { roomCode },
      (response: RoomActionAck): void => {
        if (!response.ok) {
          setOnlineNotice(response.error ?? "Failed to join room.");
          return;
        }
        setGameMode("online");
        setOnlineNotice(`Joined room: ${response.roomCode}`);
      }
    );
  }

  function quickFindOnline(): void {
    if (!socketConnected) return;
    const roomCode = sanitizeRoomCode(joinCode);
    if (roomCode) {
      joinOnlineRoom();
      return;
    }
    socketRef.current?.emit("room:create", (response: RoomActionAck): void => {
      if (!response.ok) {
        setOnlineNotice(response.error ?? "Failed to create room.");
        return;
      }
      setGameMode("online");
      setOnlineNotice(
        `Room ${response.roomCode} created. Share code or invite link with friend.`
      );
    });
  }

  function startOnlineMatch(): void {
    if (!socketConnected) return;
    socketRef.current?.emit("room:start", (response: RoomActionAck): void => {
      if (!response.ok) {
        setOnlineNotice(response.error ?? "Failed to start match.");
      }
    });
  }

  function leaveOnlineRoom(): void {
    socketRef.current?.emit("room:leave");
    setRoomView(null);
    setOnlineNotice("Left room.");
    syncRoomCodeToUrl(null);
  }

  async function copyOnlineInvite(): Promise<void> {
    if (!roomView?.roomCode || typeof window === "undefined") return;
    const inviteUrl = `${window.location.origin}/?room=${roomView.roomCode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setOnlineNotice("Invite link copied.");
    } catch {
      setOnlineNotice("Failed to copy invite link.");
    }
  }

  function changeOnlineMode(nextMode: RoomMode): void {
    if (!socketConnected) return;
    socketRef.current?.emit(
      "room:setMode",
      { mode: nextMode },
      (response: RoomActionAck): void => {
        if (!response.ok) {
          setOnlineNotice(response.error ?? "Failed to change mode.");
          return;
        }
        setRoomMode(nextMode);
      }
    );
  }

  function handleOpenStatistics(): void {
    playButtonClickSound();
    setIsMenuOpen(false);
    setIsStatsOpen(true);
  }

  function handleCloseStatistics(): void {
    setIsStatsOpen(false);
  }

  function handleSetSoundEnabled(nextEnabled: boolean): void {
    playButtonClickSound();
    setIsSoundEnabled(nextEnabled);
    if (nextEnabled) {
      tryPlayTheme();
    }
  }

  function handleToggleSound(): void {
    handleSetSoundEnabled(!isSoundEnabled);
  }

  return (
    <main className="h-[100dvh] w-screen overflow-hidden bg-black">
      <div className="relative h-full w-full">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="relative overflow-hidden"
            style={{ width: "min(95vw, calc(90dvh * 1.3333), 1860px)" }}
          >
            <CarpetBoard
              attackRadar={gameMode === "online" ? onlinePlayerRadar : game.playerRadar}
              defenseRadar={gameMode === "online" ? onlineDefenseRadar : game.botRadar}
              shipGrid={gameMode === "online" ? onlineShipGrid : game.playerShipGrid}
              playerShipHits={gameMode === "online" ? onlineShipHits : game.playerShipHits}
              enemyShipGrid={
                gameMode === "online" ? hiddenEnemyShipGrid : game.enemyShipGrid
              }
              enemyShipHits={
                gameMode === "online" ? hiddenEnemyShipHits : game.enemyShipHits
              }
              hitEffects={hitEffects}
              showDefenseLayer={
                gameMode === "online" ? onlineShowDefenseLayer : showDefenseLayer
              }
              canShoot={
                gameMode === "online"
                  ? Boolean(onlineCanShoot)
                  : game.turn === "player" && game.winner === null
              }
              onCellClick={handleCellClick}
              waterValue={WATER}
              showSetupUi={false}
              containerClassName="mx-auto w-full max-w-none"
              enableHandStrike={false}
              calibrationStorageKey="sea-war.carpet-board-boundary.v3"
            />

            <Image
              src={UI_LOGO_URL}
              alt="Logo"
              width={564}
              height={314}
              className="pointer-events-none absolute left-[1.5%] top-[1.8%] w-[22%] max-w-[320px] select-none"
            />

            <button
              type="button"
              onClick={handleMenuToggle}
              className="absolute z-30 w-[16%] max-w-[230px] min-w-[120px] -translate-x-[22px] cursor-pointer transition duration-150 hover:scale-[1.02] active:scale-[0.98]"
              style={{
                right: `${MENU_BUTTON_RIGHT_PCT}%`,
                top: `${MENU_BUTTON_TOP_PCT}%`,
              }}
            >
              <Image src={UI_MENU_BUTTON_URL} alt="Menu" width={489} height={150} />
            </button>

            <button
              type="button"
              onClick={handleStartClick}
              className="absolute bottom-[0.7%] left-1/2 z-30 w-[18%] max-w-[260px] min-w-[150px] -translate-x-1/2 -translate-y-[14px] cursor-pointer transition duration-150 hover:scale-[1.03] active:scale-[0.97]"
            >
              <Image src={UI_START_BUTTON_URL} alt="Start" width={489} height={150} />
            </button>

            <img
              src={UI_DECOR_BLUE_URL}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[-8.6%] left-[0.5%] w-[22.8%] min-w-[190px] max-w-[430px] -translate-y-[44px] select-none"
            />
            <img
              src={UI_DECOR_RED_URL}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[-8.6%] right-[0.5%] w-[22.8%] min-w-[190px] max-w-[430px] -translate-y-[44px] select-none"
            />

            <Image
              src={UI_HEALTH_BLUE_URL}
              alt=""
              width={2244}
              height={412}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[0.55%] left-[1.25%] w-[30.5%] -translate-y-[14px] select-none"
            />
            <Image
              src={UI_HEALTH_RED_URL}
              alt=""
              width={2214}
              height={422}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[0.45%] right-[1.1%] w-[30.2%] -translate-y-[14px] select-none"
            />

            {startPanel !== null && (
              <>
                <button
                  type="button"
                  aria-label="Close start panel"
                  onClick={handleCloseStartPanel}
                  className="absolute inset-0 z-[45]"
                />
                <div className="absolute bottom-[12.5%] left-1/2 z-50 w-[25.8%] min-w-[250px] max-w-[390px] -translate-x-1/2">
                  <div className="relative">
                    <Image
                      src={startPanel === "online" ? UI_ONLINE_PANEL_URL : UI_LEVEL_PANEL_URL}
                      alt={startPanel === "online" ? "Select game mode" : "Select bot level"}
                      width={startPanel === "online" ? 819 : 1122}
                      height={startPanel === "online" ? 1024 : 1402}
                    />

                    {startPanel === "online" ? (
                      <>
                        <button
                          type="button"
                          onClick={handleOnlineModeClick}
                          className={`absolute left-[8.5%] top-[41.4%] h-[15.4%] w-[83%] rounded-xl ${MODAL_BUTTON_MOTION_CLASS}`}
                          aria-label="Online mode"
                        >
                          <Image
                            src={UI_BUTTON_ONLINE_GREEN_URL}
                            alt=""
                            fill
                            sizes="(max-width: 768px) 60vw, 320px"
                            className="object-contain"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={handleOfflineModeClick}
                          className={`absolute left-[8.5%] top-[59.1%] h-[15.4%] w-[83%] rounded-xl ${MODAL_BUTTON_MOTION_CLASS}`}
                          aria-label="Offline mode"
                        >
                          <Image
                            src={UI_BUTTON_OFFLINE_URL}
                            alt=""
                            fill
                            sizes="(max-width: 768px) 60vw, 320px"
                            className="object-contain"
                          />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleLevelChoice("easy")}
                          className={`absolute left-[7.6%] top-[37.9%] h-[15.6%] w-[84.8%] rounded-xl ${MODAL_BUTTON_MOTION_CLASS}`}
                          aria-label="Baby level"
                        >
                          <Image
                            src={UI_BUTTON_BABY_URL}
                            alt=""
                            fill
                            sizes="(max-width: 768px) 60vw, 330px"
                            className="object-contain"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLevelChoice("medium")}
                          className={`absolute left-[7.6%] top-[56.4%] h-[15.6%] w-[84.8%] rounded-xl ${MODAL_BUTTON_MOTION_CLASS}`}
                          aria-label="Man level"
                        >
                          <Image
                            src={UI_BUTTON_MAN_URL}
                            alt=""
                            fill
                            sizes="(max-width: 768px) 60vw, 330px"
                            className="object-contain"
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLevelChoice("hard")}
                          className={`absolute left-[7.6%] top-[74.8%] h-[15.6%] w-[84.8%] rounded-xl ${MODAL_BUTTON_MOTION_CLASS}`}
                          aria-label="Nightmare level"
                        >
                          <Image
                            src={UI_BUTTON_NIGHTMARE_URL}
                            alt=""
                            fill
                            sizes="(max-width: 768px) 60vw, 330px"
                            className="object-contain"
                          />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}

            {isMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setIsMenuOpen(false)}
                  className="absolute inset-0 z-[35]"
                />
                <div
                  className="absolute z-40 w-[19.6%] min-w-[210px] max-w-[330px]"
                  style={{
                    left: `${MENU_PANEL_CENTER_X_PCT}%`,
                    top: `calc(${MENU_BUTTON_TOP_PCT}% + 96px)`,
                    transform: "translate(calc(-50% - 10px), 0)",
                  }}
                >
                  <div className="relative">
                    <Image src={UI_MENU_PANEL_URL} alt="Menu panel" width={1058} height={1322} />
                    <button
                      type="button"
                      onClick={handleToggleSound}
                      className={`absolute left-[11.1%] top-[20.4%] h-[13.2%] w-[77.8%] ${MODAL_BUTTON_MOTION_CLASS}`}
                      aria-label="Toggle music"
                    >
                      <Image
                        src={UI_BUTTON_SOUND_URL}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 55vw, 260px"
                        className="object-contain"
                      />
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-[31.1%] -translate-x-1/2 text-[clamp(10px,0.8vw,13px)] font-semibold tracking-[0.15em] text-[#f4e2b8]">
                      {isSoundEnabled ? "MUSIC ON" : "MUSIC OFF"}
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenStatistics}
                      className={`absolute left-[11.1%] top-[38.2%] h-[13.2%] w-[77.8%] ${MODAL_BUTTON_MOTION_CLASS}`}
                      aria-label="Open statistics"
                    >
                      <Image
                        src={UI_BUTTON_STAT_URL}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 55vw, 260px"
                        className="object-contain"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClickSound();
                        setIsMenuOpen(false);
                        setIsStatsOpen(true);
                      }}
                      className={`absolute left-[11.1%] top-[55.9%] h-[13.2%] w-[77.8%] ${MODAL_BUTTON_MOTION_CLASS}`}
                      aria-label="Open leaderboard"
                    >
                      <Image
                        src={UI_BUTTON_LEADER_URL}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 55vw, 260px"
                        className="object-contain"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        playButtonClickSound();
                        setIsMenuOpen(false);
                        setIsOnlineLobbyOpen(true);
                      }}
                      className={`absolute left-[11.1%] top-[73.6%] h-[13.2%] w-[77.8%] ${MODAL_BUTTON_MOTION_CLASS}`}
                      aria-label="Open login"
                    >
                      <Image
                        src={UI_BUTTON_LOGIN_URL}
                        alt=""
                        fill
                        sizes="(max-width: 768px) 55vw, 260px"
                        className="object-contain"
                      />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {isStatsOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/72 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-[#6c5130] bg-[#131313] p-5 text-[#f3e8d0] shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-bold">Statistics</h2>
                <button
                  type="button"
                  onClick={handleCloseStatistics}
                  className="rounded-md border border-[#8d6a42] px-3 py-1 text-sm hover:bg-[#272727]"
                >
                  Close
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div>Total games: {totalGames}</div>
                <div>Wins: {totalWins}</div>
                <div>Losses: {totalLosses}</div>
                <div>Win rate: {winRate}%</div>
                <div>Avg accuracy: {avgPlayerAccuracy}%</div>
                <div>Rounds (now): {game.round}</div>
              </div>
              <div className="mt-4">
                <h3 className="mb-2 text-base font-semibold">Recent Matches</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-[#d1c1a5]">No matches yet.</p>
                ) : (
                  <ul className="max-h-52 space-y-1 overflow-auto rounded-lg border border-[#3f3f3f] bg-black/30 p-2 text-sm">
                    {history.slice(0, 8).map((match) => (
                      <li key={match.id}>
                        {new Date(match.finishedAtMs).toLocaleString()} |{" "}
                        {match.winner === "player" ? "Win" : "Loss"} | acc:{" "}
                        {match.playerAccuracy}% | {match.durationSec}s
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-4 rounded-lg border border-[#6b532f]/70 bg-[#1a1a1a] p-3 text-sm text-[#dcc8a3]">
                Leaderboard section reserved.
              </div>
            </div>
          </div>
        )}

        {isOnlineLobbyOpen && (
          <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/72 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-[#6c5130] bg-[#131313] p-5 text-[#f3e8d0] shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Online Lobby</h2>
                <div className="flex items-center gap-2">
                  {authUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        void handleGoogleLogout();
                      }}
                      className="rounded-md border border-[#8d6a42] px-3 py-1 text-sm hover:bg-[#272727]"
                    >
                      Logout
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        void handleGoogleLogin();
                      }}
                      className={`relative h-10 w-36 ${MODAL_BUTTON_MOTION_CLASS}`}
                    >
                      <Image
                        src={UI_BUTTON_GOOGLE_URL}
                        alt="Login with Google"
                        fill
                        sizes="160px"
                        className="object-contain"
                      />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOnlineLobbyOpen(false)}
                    className="rounded-md border border-[#8d6a42] px-3 py-1 text-sm hover:bg-[#272727]"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-[#d1c1a5]">Auth:</span>{" "}
                  {authUser ? authUser.email ?? "Google user" : "Not logged in"}
                </div>
                <div>
                  <span className="text-[#d1c1a5]">Socket:</span>{" "}
                  {socketConnected ? "Connected" : "Disconnected"}
                </div>
                <div>
                  <span className="text-[#d1c1a5]">Room:</span>{" "}
                  {roomView?.roomCode ?? "-"}
                </div>
                <div>
                  <span className="text-[#d1c1a5]">Mode:</span>{" "}
                  {roomView?.mode ?? roomMode}
                </div>
              </div>

              <div className="mb-4 grid gap-2 sm:grid-cols-2">
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder="Player name"
                  className="rounded-lg border border-[#6c5130] bg-[#0f0f0f] px-3 py-2 text-sm outline-none placeholder:text-[#8e816e]"
                />
                <input
                  value={profileCity}
                  onChange={(event) => setProfileCity(event.target.value)}
                  placeholder="City"
                  className="rounded-lg border border-[#6c5130] bg-[#0f0f0f] px-3 py-2 text-sm outline-none placeholder:text-[#8e816e]"
                />
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveOnlineProfile}
                  disabled={!socketConnected}
                  className="rounded-lg border border-cyan-500/70 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save profile
                </button>
                <button
                  type="button"
                  onClick={createOnlineRoom}
                  disabled={!socketConnected}
                  className="rounded-lg border border-emerald-500/70 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Create room
                </button>
                <button
                  type="button"
                  onClick={copyOnlineInvite}
                  disabled={!roomView?.roomCode}
                  className="rounded-lg border border-violet-500/70 bg-violet-500/20 px-3 py-2 text-sm text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy invite
                </button>
                <button
                  type="button"
                  onClick={leaveOnlineRoom}
                  disabled={!roomView}
                  className="rounded-lg border border-rose-500/70 bg-rose-500/20 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Leave room
                </button>
              </div>

              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(sanitizeRoomCode(event.target.value))}
                  placeholder="Find / Join by room code"
                  className="rounded-lg border border-[#6c5130] bg-[#0f0f0f] px-3 py-2 text-sm outline-none placeholder:text-[#8e816e]"
                />
                <button
                  type="button"
                  onClick={joinOnlineRoom}
                  disabled={!socketConnected}
                  className="rounded-lg border border-cyan-500/70 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Join
                </button>
                <button
                  type="button"
                  onClick={quickFindOnline}
                  disabled={!socketConnected}
                  className="rounded-lg border border-amber-500/70 bg-amber-500/20 px-3 py-2 text-sm text-amber-100 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Find
                </button>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => changeOnlineMode("classic")}
                  disabled={!canChangeOnlineMode}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    roomMode === "classic"
                      ? "bg-cyan-500 text-slate-950"
                      : "border border-[#6c5130] bg-[#191919] text-[#f3e8d0]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Classic
                </button>
                <button
                  type="button"
                  onClick={() => changeOnlineMode("blitz3m")}
                  disabled={!canChangeOnlineMode}
                  className={`rounded-lg px-3 py-2 text-sm transition ${
                    roomMode === "blitz3m"
                      ? "bg-cyan-500 text-slate-950"
                      : "border border-[#6c5130] bg-[#191919] text-[#f3e8d0]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Blitz 3m
                </button>
                <button
                  type="button"
                  onClick={startOnlineMatch}
                  disabled={!canStartOnlineMatch}
                  className="rounded-lg border border-emerald-500/70 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start match
                </button>
              </div>

              <div className="rounded-lg border border-[#6c5130] bg-black/30 p-3 text-sm text-[#dcc8a3]">
                {onlineNotice}
              </div>
            </div>
          </div>
        )}

        <div
          className={`pointer-events-none absolute inset-0 z-[60] bg-black transition-opacity duration-[2000ms] ${
            isSceneDimmed ? "opacity-100" : "opacity-0"
          }`}
        />

        {isDoorOverlayVisible && (
          <div className="absolute inset-0 z-[70] overflow-hidden bg-black">
            <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
              <Image
                src={UI_DOOR_LEFT_URL}
                alt=""
                fill
                sizes="50vw"
                className={`object-cover object-left transition-transform duration-[1300ms] ease-in-out ${
                  isDoorOpened ? "-translate-x-[102%]" : "translate-x-0"
                }`}
              />
            </div>
            <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
              <Image
                src={UI_DOOR_RIGHT_URL}
                alt=""
                fill
                sizes="50vw"
                className={`object-cover object-right transition-transform duration-[1300ms] ease-in-out ${
                  isDoorOpened ? "translate-x-[102%]" : "translate-x-0"
                }`}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}


