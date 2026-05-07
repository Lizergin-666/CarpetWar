"use client";

import { io, Socket } from "socket.io-client";
import Image from "next/image";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient, type User } from "@supabase/supabase-js";
import { buildPvpCoach, buildSoloCoach, CoachReport } from "../lib/coach";
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
const FLEET = [5, 4, 3, 2, 1] as const;
const UI_LOGO_URL = "/ui/logo-main.png";
const UI_MENU_BUTTON_URL = "/ui/btn-menu.png";
const UI_START_BUTTON_URL = "/ui/btn-start.png";
const UI_MENU_PANEL_URL = "/ui/menu-panel.png";
const UI_ONLINE_PANEL_URL = "/ui/panel-online.png";
const UI_LEVEL_PANEL_URL = "/ui/panel-level.png";
const UI_DECOR_BLUE_URL = "/ui/character-blue1.png";
const UI_DECOR_RED_URL = "/ui/character-red1-v2.png";
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
const UI_CALIBRATION_STORAGE_KEY = "sea-war.ui-calibration.v1";
const MODAL_BUTTON_MOTION_CLASS =
  "transition-transform duration-150 ease-out hover:-translate-y-[2px] hover:scale-[1.03] active:translate-y-[1px] active:scale-[0.98]";
const MENU_BUTTON_RIGHT_PCT = 1.9;
const MENU_BUTTON_TOP_PCT = 2.3;
const MENU_BUTTON_WIDTH_PCT = 16;
const MENU_PANEL_WIDTH_PCT = 19.6;
const MENU_PANEL_CENTER_X_PCT =
  100 - MENU_BUTTON_RIGHT_PCT - MENU_BUTTON_WIDTH_PCT / 2;
const ONLINE_PLACEMENT_FLEET = FLEET;
const SHIP_ICON_BY_LENGTH: Record<number, string> = {
  1: "/ui/ships/ship-1.png",
  2: "/ui/ships/ship-2.png",
  3: "/ui/ships/ship-3.png",
  4: "/ui/ships/ship-4.png",
  5: "/ui/ships/ship-5.png",
};

type Turn = "player" | "bot" | "finished";
type Mark = "unknown" | "miss" | "hit";
type BotDifficulty = "easy" | "medium" | "hard";
type StartPanel = "online" | "level";
type GameMode = "solo" | "online";
type RoomPhase = "lobby" | "placement" | "playing" | "finished";
type Role = "host" | "guest";
type RoomMode = "classic" | "blitz3m";

interface PlayerProfile {
  name: string;
  city: string;
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
  placementSecondsLeft: number;
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
  yourPlacementReady: boolean;
  opponentPlacementReady: boolean;
  yourDecksLeft: number;
  enemyDecksLeft: number;
  status: string;
  log: string[];
}

interface PlacementShipPayload {
  length: number;
  row: number;
  col: number;
  horizontal: boolean;
}

interface OnlinePlacementShipDraft {
  length: number;
  row: number;
  col: number;
  horizontal: boolean;
  placed: boolean;
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

interface CalibrationRect {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

interface ShipCursorCalibration {
  deckSizePx: number;
  thicknessPx: number;
  minLengthPx: number;
  anchorXPct: number;
  anchorYPct: number;
  offsetXPx: number;
  offsetYPx: number;
  rotationDeg: number;
}

interface UiCalibrationConfig {
  onlineButton: CalibrationRect;
  offlineButton: CalibrationRect;
  babyButton: CalibrationRect;
  manButton: CalibrationRect;
  nightmareButton: CalibrationRect;
  soundButton: CalibrationRect;
  statButton: CalibrationRect;
  leaderButton: CalibrationRect;
  loginButton: CalibrationRect;
  shipCursorHorizontal: ShipCursorCalibration;
  shipCursorVertical: ShipCursorCalibration;
}

type ShipCursorHandle = "move" | "resize-width" | "resize-height" | "resize-both" | "rotate";

interface ShipCursorDragState {
  handle: ShipCursorHandle;
  orientation: "horizontal" | "vertical";
  startClientX: number;
  startClientY: number;
  startConfig: ShipCursorCalibration;
  startWidth: number;
  startHeight: number;
  length: number;
}

const DEFAULT_UI_CALIBRATION: UiCalibrationConfig = {
  onlineButton: { leftPct: 8.5, topPct: 41.4, widthPct: 83, heightPct: 15.4 },
  offlineButton: { leftPct: 8.5, topPct: 59.1, widthPct: 83, heightPct: 15.4 },
  babyButton: { leftPct: 7.6, topPct: 37.9, widthPct: 84.8, heightPct: 15.6 },
  manButton: { leftPct: 7.6, topPct: 56.4, widthPct: 84.8, heightPct: 15.6 },
  nightmareButton: { leftPct: 7.6, topPct: 74.8, widthPct: 84.8, heightPct: 15.6 },
  soundButton: { leftPct: 11.1, topPct: 20.4, widthPct: 77.8, heightPct: 13.2 },
  statButton: { leftPct: 11.1, topPct: 38.2, widthPct: 77.8, heightPct: 13.2 },
  leaderButton: { leftPct: 11.1, topPct: 55.9, widthPct: 77.8, heightPct: 13.2 },
  loginButton: { leftPct: 11.1, topPct: 73.6, widthPct: 77.8, heightPct: 13.2 },
  shipCursorHorizontal: {
    deckSizePx: 44,
    thicknessPx: 42,
    minLengthPx: 70,
    anchorXPct: 18,
    anchorYPct: 42,
    offsetXPx: 0,
    offsetYPx: 0,
    rotationDeg: 0,
  },
  shipCursorVertical: {
    deckSizePx: 44,
    thicknessPx: 42,
    minLengthPx: 70,
    anchorXPct: 18,
    anchorYPct: 42,
    offsetXPx: 0,
    offsetYPx: 0,
    rotationDeg: 0,
  },
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCalibrationRect(rect: CalibrationRect): CalibrationRect {
  return {
    leftPct: clampNumber(rect.leftPct, -20, 120),
    topPct: clampNumber(rect.topPct, -20, 120),
    widthPct: clampNumber(rect.widthPct, 5, 95),
    heightPct: clampNumber(rect.heightPct, 5, 60),
  };
}

function normalizeShipCursorCalibration(config: ShipCursorCalibration): ShipCursorCalibration {
  return {
    deckSizePx: clampNumber(config.deckSizePx, 24, 130),
    thicknessPx: clampNumber(config.thicknessPx, 16, 120),
    minLengthPx: clampNumber(config.minLengthPx, 30, 220),
    anchorXPct: clampNumber(config.anchorXPct, -40, 140),
    anchorYPct: clampNumber(config.anchorYPct, -40, 140),
    offsetXPx: clampNumber(config.offsetXPx, -240, 240),
    offsetYPx: clampNumber(config.offsetYPx, -240, 240),
    rotationDeg: clampNumber(config.rotationDeg, -180, 180),
  };
}

function normalizeUiCalibration(config: UiCalibrationConfig): UiCalibrationConfig {
  return {
    onlineButton: normalizeCalibrationRect(config.onlineButton),
    offlineButton: normalizeCalibrationRect(config.offlineButton),
    babyButton: normalizeCalibrationRect(config.babyButton),
    manButton: normalizeCalibrationRect(config.manButton),
    nightmareButton: normalizeCalibrationRect(config.nightmareButton),
    soundButton: normalizeCalibrationRect(config.soundButton),
    statButton: normalizeCalibrationRect(config.statButton),
    leaderButton: normalizeCalibrationRect(config.leaderButton),
    loginButton: normalizeCalibrationRect(config.loginButton),
    shipCursorHorizontal: normalizeShipCursorCalibration(config.shipCursorHorizontal),
    shipCursorVertical: normalizeShipCursorCalibration(config.shipCursorVertical),
  };
}

function cloneUiCalibration(config: UiCalibrationConfig): UiCalibrationConfig {
  return {
    onlineButton: { ...config.onlineButton },
    offlineButton: { ...config.offlineButton },
    babyButton: { ...config.babyButton },
    manButton: { ...config.manButton },
    nightmareButton: { ...config.nightmareButton },
    soundButton: { ...config.soundButton },
    statButton: { ...config.statButton },
    leaderButton: { ...config.leaderButton },
    loginButton: { ...config.loginButton },
    shipCursorHorizontal: { ...config.shipCursorHorizontal },
    shipCursorVertical: { ...config.shipCursorVertical },
  };
}

function readStoredUiCalibration(): UiCalibrationConfig {
  if (typeof window === "undefined") return cloneUiCalibration(DEFAULT_UI_CALIBRATION);
  try {
    const raw = localStorage.getItem(UI_CALIBRATION_STORAGE_KEY);
    if (!raw) return cloneUiCalibration(DEFAULT_UI_CALIBRATION);
    const parsed = JSON.parse(raw) as Partial<UiCalibrationConfig>;
    const merged: UiCalibrationConfig = {
      onlineButton: { ...DEFAULT_UI_CALIBRATION.onlineButton, ...parsed.onlineButton },
      offlineButton: { ...DEFAULT_UI_CALIBRATION.offlineButton, ...parsed.offlineButton },
      babyButton: { ...DEFAULT_UI_CALIBRATION.babyButton, ...parsed.babyButton },
      manButton: { ...DEFAULT_UI_CALIBRATION.manButton, ...parsed.manButton },
      nightmareButton: { ...DEFAULT_UI_CALIBRATION.nightmareButton, ...parsed.nightmareButton },
      soundButton: { ...DEFAULT_UI_CALIBRATION.soundButton, ...parsed.soundButton },
      statButton: { ...DEFAULT_UI_CALIBRATION.statButton, ...parsed.statButton },
      leaderButton: { ...DEFAULT_UI_CALIBRATION.leaderButton, ...parsed.leaderButton },
      loginButton: { ...DEFAULT_UI_CALIBRATION.loginButton, ...parsed.loginButton },
      shipCursorHorizontal: {
        ...DEFAULT_UI_CALIBRATION.shipCursorHorizontal,
        ...parsed.shipCursorHorizontal,
      },
      shipCursorVertical: {
        ...DEFAULT_UI_CALIBRATION.shipCursorVertical,
        ...parsed.shipCursorVertical,
      },
    };
    return normalizeUiCalibration(merged);
  } catch {
    return cloneUiCalibration(DEFAULT_UI_CALIBRATION);
  }
}

function rectStyle(rect: CalibrationRect): CSSProperties {
  return {
    left: `${rect.leftPct}%`,
    top: `${rect.topPct}%`,
    width: `${rect.widthPct}%`,
    height: `${rect.heightPct}%`,
  };
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

function createOnlinePlacementDraft(): OnlinePlacementShipDraft[] {
  return ONLINE_PLACEMENT_FLEET.map((length) => ({
    length,
    row: 0,
    col: 0,
    horizontal: true,
    placed: false,
  }));
}

function isInsideBoard(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function canPlaceDraftShip(
  grid: number[][],
  row: number,
  col: number,
  length: number,
  horizontal: boolean
): boolean {
  for (let i = 0; i < length; i += 1) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (!isInsideBoard(r, c)) return false;
    if (grid[r][c] !== WATER) return false;
    for (let rr = r - 1; rr <= r + 1; rr += 1) {
      for (let cc = c - 1; cc <= c + 1; cc += 1) {
        if (isInsideBoard(rr, cc) && grid[rr][cc] !== WATER) {
          return false;
        }
      }
    }
  }
  return true;
}

function buildPlacementGrid(
  draftShips: OnlinePlacementShipDraft[],
  ignoreLength?: number
): number[][] {
  const grid = createGrid<number>(WATER);
  let shipId = 0;
  for (const ship of draftShips) {
    if (!ship.placed) continue;
    if (ignoreLength !== undefined && ship.length === ignoreLength) continue;
    for (let i = 0; i < ship.length; i += 1) {
      const r = ship.horizontal ? ship.row : ship.row + i;
      const c = ship.horizontal ? ship.col + i : ship.col;
      if (!isInsideBoard(r, c)) continue;
      grid[r][c] = shipId;
    }
    shipId += 1;
  }
  return grid;
}

function getShipCells(
  row: number,
  col: number,
  length: number,
  horizontal: boolean
): Array<{ row: number; col: number }> {
  return Array.from({ length }, (_, i) => ({
    row: horizontal ? row : row + i,
    col: horizontal ? col + i : col,
  }));
}

function allDraftShipsPlaced(draftShips: OnlinePlacementShipDraft[]): boolean {
  return draftShips.every((ship) => ship.placed);
}

function completeDraftWithAutoPlacement(
  draftShips: OnlinePlacementShipDraft[]
): OnlinePlacementShipDraft[] {
  const next = draftShips.map((ship) => ({ ...ship }));

  for (const ship of next) {
    if (ship.placed) continue;
    let placed = false;

    for (let tries = 0; tries < 1800; tries += 1) {
      const horizontal = Math.random() < 0.5;
      const row = randomInt(horizontal ? BOARD_SIZE : BOARD_SIZE - ship.length + 1);
      const col = randomInt(horizontal ? BOARD_SIZE - ship.length + 1 : BOARD_SIZE);
      const occupied = buildPlacementGrid(next, ship.length);
      if (!canPlaceDraftShip(occupied, row, col, ship.length, horizontal)) continue;
      ship.row = row;
      ship.col = col;
      ship.horizontal = horizontal;
      ship.placed = true;
      placed = true;
      break;
    }

    if (!placed) {
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          for (const horizontal of [true, false]) {
            const occupied = buildPlacementGrid(next, ship.length);
            if (!canPlaceDraftShip(occupied, row, col, ship.length, horizontal)) continue;
            ship.row = row;
            ship.col = col;
            ship.horizontal = horizontal;
            ship.placed = true;
            placed = true;
            break;
          }
          if (placed) break;
        }
        if (placed) break;
      }
    }
  }

  return next;
}

function placementFromDraft(draftShips: OnlinePlacementShipDraft[]): Placement {
  const shipGrid = createGrid<number>(WATER);
  const shipLengths: number[] = [];
  let shipId = 0;

  for (const ship of draftShips) {
    if (!ship.placed) continue;
    for (let i = 0; i < ship.length; i += 1) {
      const row = ship.horizontal ? ship.row : ship.row + i;
      const col = ship.horizontal ? ship.col + i : ship.col;
      if (!isInsideBoard(row, col)) continue;
      shipGrid[row][col] = shipId;
    }
    shipLengths.push(ship.length);
    shipId += 1;
  }

  return { shipGrid, shipLengths };
}

function countRadarMarks(radar: Mark[][]): { shots: number; hits: number } {
  let shots = 0;
  let hits = 0;
  for (let row = 0; row < radar.length; row += 1) {
    for (let col = 0; col < radar[row].length; col += 1) {
      const mark = radar[row][col];
      if (mark === "hit") {
        hits += 1;
        shots += 1;
      } else if (mark === "miss") {
        shots += 1;
      }
    }
  }
  return { shots, hits };
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

function createGameState(botDifficulty: BotDifficulty, playerPlacementOverride?: Placement): GameState {
  const playerPlacement = playerPlacementOverride ?? placeFleetRandomly(FLEET);
  const enemyPlacement = placeFleetRandomly(FLEET);

  return {
    id: createGameId(),
    difficulty: botDifficulty,
    startedAtMs: Date.now(),
    playerShipGrid: playerPlacement.shipGrid,
    enemyShipGrid: enemyPlacement.shipGrid,
    playerShipLengths: playerPlacement.shipLengths,
    enemyShipLengths: enemyPlacement.shipLengths,
    playerShipHits: Array.from({ length: playerPlacement.shipLengths.length }, () => 0),
    enemyShipHits: Array.from({ length: enemyPlacement.shipLengths.length }, () => 0),
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
      playerPlacementOverride
        ? `Game started. Your fleet locked manually. Bot: ${BOT_DIFFICULTY_LABELS[botDifficulty]}.`
        : `Game started. Fleet placed automatically. Bot: ${BOT_DIFFICULTY_LABELS[botDifficulty]}.`,
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
  const [leaderboard, setLeaderboard] = useState<LeaderboardPayload | null>(null);
  const [hitEffects, setHitEffects] = useState<HitEffect[]>([]);
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [isStatsOpen, setIsStatsOpen] = useState<boolean>(false);
  const [startPanel, setStartPanel] = useState<StartPanel | null>(null);
  const [isOnlineLobbyOpen, setIsOnlineLobbyOpen] = useState<boolean>(false);
  const [isDoorOverlayVisible, setIsDoorOverlayVisible] = useState<boolean>(true);
  const [isDoorOpened, setIsDoorOpened] = useState<boolean>(false);
  const [isSceneDimmed, setIsSceneDimmed] = useState<boolean>(true);
  const [uiCalibration, setUiCalibration] = useState<UiCalibrationConfig>(() =>
    readStoredUiCalibration()
  );
  const [uiCalibrationDraft, setUiCalibrationDraft] = useState<UiCalibrationConfig>(() =>
    readStoredUiCalibration()
  );
  const [isUiCalibrationMode, setIsUiCalibrationMode] = useState<boolean>(false);
  const [shipCalibrationOrientation, setShipCalibrationOrientation] = useState<
    "horizontal" | "vertical"
  >("horizontal");
  const [shipCursorDragState, setShipCursorDragState] = useState<ShipCursorDragState | null>(null);
  const [shipCursorPinned, setShipCursorPinned] = useState<boolean>(false);

  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [roomView, setRoomView] = useState<RoomViewPayload | null>(null);
  const [joinCode, setJoinCode] = useState<string>("");
  const [roomMode, setRoomMode] = useState<RoomMode>("classic");
  const [soloPlacementActive, setSoloPlacementActive] = useState<boolean>(false);
  const [soloPlacementDifficulty, setSoloPlacementDifficulty] = useState<BotDifficulty>(
    readStoredDifficulty()
  );
  const [placementDraft, setPlacementDraft] = useState<OnlinePlacementShipDraft[]>(
    () => createOnlinePlacementDraft()
  );
  const [selectedPlacementLength, setSelectedPlacementLength] = useState<number | null>(
    ONLINE_PLACEMENT_FLEET[0]
  );
  const [placementHoverCell, setPlacementHoverCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [placementCursorPos, setPlacementCursorPos] = useState<{ x: number; y: number } | null>(
    null
  );
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
  const lastPlacementSignatureRef = useRef<string>("");
  const boardFrameRef = useRef<HTMLDivElement | null>(null);

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
      if (payload.phase === "placement" || payload.phase === "playing") {
        setIsOnlineLobbyOpen(false);
      }
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

    socket.on("leaderboard:update", (payload: LeaderboardPayload) => {
      setLeaderboard(payload);
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
    if (!isStatsOpen) return;
    socketRef.current?.emit("leaderboard:get");
  }, [isStatsOpen]);

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
  const isOnlinePlacementPhase = gameMode === "online" && roomView?.phase === "placement";
  const isPlacementInteractionActive =
    soloPlacementActive || (isOnlinePlacementPhase && !roomView?.yourPlacementReady);
  const placedDraftGrid = useMemo(() => buildPlacementGrid(placementDraft), [placementDraft]);
  const selectedPlacementShip =
    selectedPlacementLength === null
      ? null
      : placementDraft.find((ship) => ship.length === selectedPlacementLength) ?? null;
  const selectedPlacementHorizontal = selectedPlacementShip?.horizontal ?? true;
  const activeUiCalibration = isUiCalibrationMode ? uiCalibrationDraft : uiCalibration;
  const activeShipCursorCalibration = selectedPlacementHorizontal
    ? activeUiCalibration.shipCursorHorizontal
    : activeUiCalibration.shipCursorVertical;
  const placementCursorLength = selectedPlacementLength ?? 1;
  const placementCursorLongSide = Math.max(
    24,
    placementCursorLength * activeShipCursorCalibration.deckSizePx
  );
  const placementCursorWidth = selectedPlacementHorizontal
    ? placementCursorLongSide
    : activeShipCursorCalibration.thicknessPx;
  const placementCursorHeight = selectedPlacementHorizontal
    ? activeShipCursorCalibration.thicknessPx
    : placementCursorLongSide;
  const isShipPlacementComplete = allDraftShipsPlaced(placementDraft);
  const placementPreview = useMemo(() => {
    if (!isPlacementInteractionActive) return null;
    if (!selectedPlacementShip) return null;
    if (!placementHoverCell) return null;
    const occupiedWithoutSelected = buildPlacementGrid(placementDraft, selectedPlacementShip.length);
    const valid = canPlaceDraftShip(
      occupiedWithoutSelected,
      placementHoverCell.row,
      placementHoverCell.col,
      selectedPlacementShip.length,
      selectedPlacementShip.horizontal
    );
    const cells = getShipCells(
      placementHoverCell.row,
      placementHoverCell.col,
      selectedPlacementShip.length,
      selectedPlacementShip.horizontal
    );
    return { valid, cells };
  }, [
    isPlacementInteractionActive,
    selectedPlacementShip,
    placementHoverCell,
    placementDraft,
  ]);
  const placementHighlights = useMemo(() => {
    if (!placementPreview) return [];
    return placementPreview.cells
      .filter((cell) => isInsideBoard(cell.row, cell.col))
      .map((cell) => ({
        row: cell.row,
        col: cell.col,
        valid: placementPreview.valid,
      }));
  }, [placementPreview]);
  const onlineShipGrid =
    roomView?.phase === "placement"
      ? roomView.yourPlacementReady
        ? roomView.playerShipGrid
        : placedDraftGrid
      : roomView?.playerShipGrid ?? createGrid<number>(WATER);
  const onlineShipHits = useMemo(
    () => deriveShipHits(onlineShipGrid, onlineDefenseRadar, WATER),
    [onlineDefenseRadar, onlineShipGrid]
  );
  const soloEmptyRadar = useMemo(() => createGrid<Mark>("unknown"), []);
  const soloAttackRadar = soloPlacementActive ? soloEmptyRadar : game.playerRadar;
  const soloDefenseRadar = soloPlacementActive ? soloEmptyRadar : game.botRadar;
  const soloShipGrid = soloPlacementActive ? placedDraftGrid : game.playerShipGrid;
  const soloShowDefenseLayer = soloPlacementActive ? true : showDefenseLayer;
  const soloCanShoot = !soloPlacementActive && game.turn === "player" && game.winner === null;
  const hiddenEnemyShipGrid = useMemo(() => createGrid<number>(WATER), []);
  const hiddenEnemyShipHits = useMemo(() => [] as number[], []);
  const onlineShowDefenseLayer =
    roomView?.phase === "playing"
      ? !roomView.yourTurn
      : roomView?.phase === "placement"
      ? true
      : roomView !== null;
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
  const canLockPlacement =
    gameMode === "online" &&
    socketConnected &&
    roomView?.phase === "placement" &&
    !roomView.yourPlacementReady &&
    allDraftShipsPlaced(placementDraft);
  const avgPlayerAccuracy =
    totalGames > 0
      ? Math.round(
          history.reduce((sum, match) => sum + match.playerAccuracy, 0) / totalGames
        )
      : 0;
  const pvpCoachReport: CoachReport | null = useMemo(() => {
    if (!roomView) return null;
    if (roomView.phase !== "finished" || roomView.winner === null) return null;

    const yourStats = countRadarMarks(roomView.playerRadar);
    const opponentStats = countRadarMarks(roomView.defenseRadar);

    return buildPvpCoach({
      winner: roomView.winner,
      rounds: roomView.round,
      yourShots: yourStats.shots,
      yourHits: yourStats.hits,
      opponentShots: opponentStats.shots,
      opponentHits: opponentStats.hits,
      yourDecksLeft: roomView.yourDecksLeft,
      enemyDecksLeft: roomView.enemyDecksLeft,
    });
  }, [roomView]);
  const activeCoachReport = pvpCoachReport ?? coachReport;
  const coachSourceLabel = pvpCoachReport
    ? "PvP match analysis"
    : coachReport
    ? "Solo match analysis"
    : null;
  const activePlacementYouReady = soloPlacementActive
    ? allDraftShipsPlaced(placementDraft)
    : Boolean(roomView?.yourPlacementReady);
  const activePlacementOpponentReady = soloPlacementActive
    ? false
    : Boolean(roomView?.opponentPlacementReady);
  const soloPlacementReady = soloPlacementActive && allDraftShipsPlaced(placementDraft);
  const finalizeSoloPlacement = useCallback((): void => {
    const completedDraft = completeDraftWithAutoPlacement(placementDraft);
    const placement = placementFromDraft(completedDraft);
    setPlacementDraft(completedDraft);
    setSoloPlacementActive(false);
    setSelectedPlacementLength(null);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
    setGame(createGameState(soloPlacementDifficulty, placement));
  }, [placementDraft, soloPlacementDifficulty]);

  useEffect(() => {
    if (gameMode !== "solo") return;
    radarSnapshotRef.current = game.playerRadar.map((row) => row.slice());
    enemyShipHitsSnapshotRef.current = [...game.enemyShipHits];
    missEventCountRef.current = 0;
    hitEventCountRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetHitEffects();
  }, [game.enemyShipHits, game.id, game.playerRadar, resetHitEffects, gameMode]);

  useEffect(() => {
    if (gameMode !== "online") return;
    if (roomView?.phase !== "placement") {
      setPlacementHoverCell(null);
      setPlacementCursorPos(null);
      setShipCursorPinned(false);
      setShipCursorDragState(null);
      return;
    }
    if (!roomView.yourPlacementReady) {
      setPlacementDraft(createOnlinePlacementDraft());
      setSelectedPlacementLength(ONLINE_PLACEMENT_FLEET[0]);
      setPlacementHoverCell(null);
      setPlacementCursorPos(null);
      lastPlacementSignatureRef.current = "";
    }
  }, [gameMode, roomView?.phase, roomView?.roomCode, roomView?.yourPlacementReady]);

  useEffect(() => {
    if (isPlacementInteractionActive) return;
    setShipCursorPinned(false);
    setShipCursorDragState(null);
  }, [isPlacementInteractionActive]);

  function resetGame(nextDifficulty?: BotDifficulty): void {
    const difficulty = nextDifficulty ?? botDifficulty;
    setGame(createGameState(difficulty));
    setCoachReport(null);
    setHitEffects([]);
    setGameMode("solo");
    setSoloPlacementActive(false);
  }

  function beginSoloPlacement(nextDifficulty: BotDifficulty): void {
    setBotDifficulty(nextDifficulty);
    setSoloPlacementDifficulty(nextDifficulty);
    setGameMode("solo");
    setSoloPlacementActive(true);
    setPlacementDraft(createOnlinePlacementDraft());
    setSelectedPlacementLength(ONLINE_PLACEMENT_FLEET[0]);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
    setCoachReport(null);
    setHitEffects([]);
  }

  function togglePlacementOrientation(): void {
    if (!isPlacementInteractionActive) return;
    if (selectedPlacementLength === null) return;
    setPlacementDraft((prev) =>
      prev.map((ship) =>
        ship.length === selectedPlacementLength
          ? { ...ship, horizontal: !ship.horizontal }
          : ship
      )
    );
  }

  function handlePlacementHover(row: number, col: number): void {
    if (!isPlacementInteractionActive) return;
    setPlacementHoverCell({ row, col });
  }

  function handlePlacementLeave(): void {
    setPlacementHoverCell(null);
  }

  function submitPlacementIfReady(nextDraft: OnlinePlacementShipDraft[]): void {
    if (!roomView || roomView.phase !== "placement") return;
    if (roomView.yourPlacementReady) return;
    if (!allDraftShipsPlaced(nextDraft)) return;

    const ships: PlacementShipPayload[] = nextDraft.map((ship) => ({
      length: ship.length,
      row: ship.row,
      col: ship.col,
      horizontal: ship.horizontal,
    }));

    const signature = JSON.stringify(
      ships
        .slice()
        .sort((a, b) => a.length - b.length)
        .map((ship) => `${ship.length}:${ship.row}:${ship.col}:${ship.horizontal ? "H" : "V"}`)
    );
    if (lastPlacementSignatureRef.current === signature) return;
    lastPlacementSignatureRef.current = signature;

    socketRef.current?.emit(
      "room:placement:set",
      { ships },
      (response: RoomActionAck): void => {
        if (!response.ok) {
          setOnlineNotice(response.error ?? "Failed to lock placement.");
          lastPlacementSignatureRef.current = "";
          return;
        }
        setOnlineNotice("Fleet locked. Waiting for opponent.");
      }
    );
  }

  function handlePlacementCellClick(row: number, col: number): void {
    if (!isPlacementInteractionActive) return;
    if (selectedPlacementLength === null) return;
    const selected = placementDraft.find((ship) => ship.length === selectedPlacementLength);
    if (!selected) return;

    const occupiedWithoutSelected = buildPlacementGrid(placementDraft, selected.length);
    const valid = canPlaceDraftShip(
      occupiedWithoutSelected,
      row,
      col,
      selected.length,
      selected.horizontal
    );
    if (!valid) return;

    setPlacementDraft((prev) => {
      const next = prev.map((ship) =>
        ship.length === selected.length
          ? { ...ship, row, col, placed: true }
          : ship
      );
      if (isOnlinePlacementPhase) {
        submitPlacementIfReady(next);
      }
      const unplaced = next.find((ship) => !ship.placed);
      if (unplaced) {
        setSelectedPlacementLength(unplaced.length);
      } else if (soloPlacementActive) {
        setSelectedPlacementLength(null);
      }
      return next;
    });
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
    if (soloPlacementActive) {
      handlePlacementCellClick(row, col);
      return;
    }
    if (gameMode === "online") {
      if (roomView?.phase === "placement") {
        handlePlacementCellClick(row, col);
        return;
      }
      handleOnlineShot(row, col);
      return;
    }
    setGame((prev) => applyPlayerShot(prev, row, col, false));
  }

  function playButtonClickSound(): void {
    playSound(buttonSoundRef);
  }

  function handleMenuToggle(): void {
    if (isUiCalibrationMode) return;
    playButtonClickSound();
    setIsMenuOpen((prev) => !prev);
  }

  function handleStartClick(): void {
    if (isUiCalibrationMode) return;
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
    beginSoloPlacement(nextDifficulty);
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
    setIsOnlineLobbyOpen(false);
    socketRef.current?.emit("room:start", (response: RoomActionAck): void => {
      if (!response.ok) {
        setOnlineNotice(response.error ?? "Failed to start match.");
        setIsOnlineLobbyOpen(true);
      }
    });
  }

  function lockPlacementNow(): void {
    if (!roomView || roomView.phase !== "placement") return;
    if (roomView.yourPlacementReady) return;
    if (!allDraftShipsPlaced(placementDraft)) {
      setOnlineNotice("Place all ships first.");
      return;
    }
    submitPlacementIfReady(placementDraft);
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
    socketRef.current?.emit("leaderboard:get");
  }

  function handleCloseStatistics(): void {
    setIsStatsOpen(false);
  }

  function handleRefreshLeaderboard(): void {
    socketRef.current?.emit("leaderboard:get");
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

  function enterUiCalibrationMode(): void {
    setUiCalibrationDraft(cloneUiCalibration(uiCalibration));
    setIsUiCalibrationMode(true);
    setShipCursorPinned(false);
    setShipCursorDragState(null);
    setStartPanel("online");
    setIsMenuOpen(true);
  }

  function cancelUiCalibrationMode(): void {
    setUiCalibrationDraft(cloneUiCalibration(uiCalibration));
    setIsUiCalibrationMode(false);
    setShipCursorPinned(false);
    setShipCursorDragState(null);
  }

  function saveUiCalibrationMode(): void {
    const normalized = normalizeUiCalibration(uiCalibrationDraft);
    setUiCalibration(normalized);
    setUiCalibrationDraft(cloneUiCalibration(normalized));
    setIsUiCalibrationMode(false);
    setShipCursorPinned(false);
    setShipCursorDragState(null);
    if (typeof window !== "undefined") {
      localStorage.setItem(UI_CALIBRATION_STORAGE_KEY, JSON.stringify(normalized));
    }
  }

  function resetUiCalibrationMode(): void {
    setUiCalibrationDraft(cloneUiCalibration(DEFAULT_UI_CALIBRATION));
    setShipCursorPinned(false);
    setShipCursorDragState(null);
  }

  function toggleShipCursorPin(): void {
    if (!isUiCalibrationMode || !isPlacementInteractionActive) return;
    if (shipCursorPinned) {
      setShipCursorPinned(false);
      return;
    }
    if (!placementCursorPos) {
      const rect = boardFrameRef.current?.getBoundingClientRect();
      if (rect) {
        setPlacementCursorPos({ x: rect.width * 0.5, y: rect.height * 0.55 });
      }
    }
    setShipCursorPinned(true);
  }

  function updateCalibrationRect(
    key:
      | "onlineButton"
      | "offlineButton"
      | "babyButton"
      | "manButton"
      | "nightmareButton"
      | "soundButton"
      | "statButton"
      | "leaderButton"
      | "loginButton",
    patch: Partial<CalibrationRect>
  ): void {
    setUiCalibrationDraft((prev) =>
      normalizeUiCalibration({
        ...prev,
        [key]: {
          ...prev[key],
          ...patch,
        },
      })
    );
  }

  function updateShipCursorCalibration(
    orientation: "horizontal" | "vertical",
    patch: Partial<ShipCursorCalibration>
  ): void {
    const targetKey =
      orientation === "horizontal" ? "shipCursorHorizontal" : "shipCursorVertical";
    setUiCalibrationDraft((prev) =>
      normalizeUiCalibration({
        ...prev,
        [targetKey]: {
          ...prev[targetKey],
          ...patch,
        },
      })
    );
  }

  function beginShipCursorDrag(handle: ShipCursorHandle, event: ReactPointerEvent): void {
    if (!isUiCalibrationMode) return;
    if (!isPlacementInteractionActive) return;
    if (selectedPlacementLength === null) return;
    event.preventDefault();
    event.stopPropagation();
    setShipCursorPinned(true);
    setShipCursorDragState({
      handle,
      orientation: selectedPlacementHorizontal ? "horizontal" : "vertical",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startConfig: { ...activeShipCursorCalibration },
      startWidth: placementCursorWidth,
      startHeight: placementCursorHeight,
      length: selectedPlacementLength,
    });
  }

  useEffect(() => {
    if (!shipCursorDragState || !isUiCalibrationMode) return;
    const drag = shipCursorDragState;
    const orientation = drag.orientation;

    const onPointerMove = (event: PointerEvent): void => {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      const patch: Partial<ShipCursorCalibration> = {};

      if (drag.handle === "move") {
        patch.offsetXPx = drag.startConfig.offsetXPx + dx;
        patch.offsetYPx = drag.startConfig.offsetYPx + dy;
      }

      if (drag.handle === "rotate") {
        patch.rotationDeg = drag.startConfig.rotationDeg + dx * 0.45;
      }

      if (drag.handle === "resize-width" || drag.handle === "resize-both") {
        const nextWidth = Math.max(16, drag.startWidth + dx);
        if (orientation === "horizontal") {
          patch.deckSizePx = nextWidth / Math.max(1, drag.length);
        } else {
          patch.thicknessPx = nextWidth;
        }
      }

      if (drag.handle === "resize-height" || drag.handle === "resize-both") {
        const nextHeight = Math.max(16, drag.startHeight + dy);
        if (orientation === "horizontal") {
          patch.thicknessPx = nextHeight;
        } else {
          patch.deckSizePx = nextHeight / Math.max(1, drag.length);
        }
      }

      updateShipCursorCalibration(orientation, patch);
    };

    const onPointerUp = (): void => {
      setShipCursorDragState(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isUiCalibrationMode, shipCursorDragState]);

  const shipCalibrationTarget =
    shipCalibrationOrientation === "horizontal"
      ? uiCalibrationDraft.shipCursorHorizontal
      : uiCalibrationDraft.shipCursorVertical;

  return (
    <main className="h-[100dvh] w-screen overflow-hidden bg-black">
      <div className="relative h-full w-full">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            ref={boardFrameRef}
            className="relative overflow-hidden"
            style={{ width: "min(95vw, calc(90dvh * 1.3333), 1860px)" }}
            onMouseMove={(event) => {
              if (!isPlacementInteractionActive) return;
              if (selectedPlacementLength === null) return;
              if (shipCursorPinned) return;
              const rect = event.currentTarget.getBoundingClientRect();
              setPlacementCursorPos({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              });
            }}
            onMouseLeave={() => {
              if (shipCursorPinned) return;
              setPlacementCursorPos(null);
              if (isPlacementInteractionActive) {
                setPlacementHoverCell(null);
              }
            }}
            onContextMenu={(event) => {
              if (!isPlacementInteractionActive) return;
              event.preventDefault();
              togglePlacementOrientation();
            }}
            onWheel={(event) => {
              if (!isUiCalibrationMode || !isPlacementInteractionActive) return;
              if (!event.shiftKey) return;
              event.preventDefault();
              updateShipCursorCalibration(
                selectedPlacementHorizontal ? "horizontal" : "vertical",
                {
                  rotationDeg: activeShipCursorCalibration.rotationDeg + event.deltaY * 0.15,
                }
              );
            }}
          >
            <CarpetBoard
              attackRadar={gameMode === "online" ? onlinePlayerRadar : soloAttackRadar}
              defenseRadar={gameMode === "online" ? onlineDefenseRadar : soloDefenseRadar}
              shipGrid={gameMode === "online" ? onlineShipGrid : soloShipGrid}
              playerShipHits={gameMode === "online" ? onlineShipHits : game.playerShipHits}
              enemyShipGrid={
                gameMode === "online" ? hiddenEnemyShipGrid : game.enemyShipGrid
              }
              enemyShipHits={
                gameMode === "online" ? hiddenEnemyShipHits : game.enemyShipHits
              }
              hitEffects={hitEffects}
              showDefenseLayer={
                gameMode === "online" ? onlineShowDefenseLayer : soloShowDefenseLayer
              }
              canShoot={
                gameMode === "online"
                  ? Boolean(onlineCanShoot)
                  : soloCanShoot
              }
              onCellClick={handleCellClick}
              waterValue={WATER}
              showSetupUi={false}
              containerClassName="mx-auto w-full max-w-none"
              enableHandStrike={false}
              calibrationStorageKey="sea-war.carpet-board-boundary.v3"
              placementMode={Boolean(isPlacementInteractionActive)}
              placementHighlights={placementHighlights}
              onPlacementCellHover={handlePlacementHover}
              onPlacementLeave={handlePlacementLeave}
              onPlacementRotate={togglePlacementOrientation}
            />

            <Image
              src={UI_LOGO_URL}
              alt="Logo"
              width={564}
              height={314}
              className="pointer-events-none absolute left-[1.5%] top-[1.8%] w-[22%] max-w-[320px] select-none"
            />

            {isPlacementInteractionActive && (
              <div
                className="absolute z-40 flex w-[12.4%] min-w-[120px] max-w-[200px] flex-col gap-1.5"
                style={{
                  left: "1.6%",
                  top: "calc(1.8% + min(22vw, 320px) * 0.56 + 20px)",
                }}
              >
                {placementDraft.map((ship) => {
                  const selected = selectedPlacementLength === ship.length;
                  return (
                    <button
                      key={`placement-ship-${ship.length}`}
                      type="button"
                      disabled={!isPlacementInteractionActive}
                      onClick={() => setSelectedPlacementLength(ship.length)}
                      className={`relative aspect-[4/1.2] w-full transition ${
                        selected ? "scale-[1.04]" : "scale-100"
                      } ${ship.placed ? "opacity-100" : "opacity-85"} ${
                        !isPlacementInteractionActive
                          ? "cursor-default"
                          : "cursor-pointer hover:scale-[1.06]"
                      }`}
                      title={`Ship ${ship.length} cells`}
                    >
                      <Image
                        src={SHIP_ICON_BY_LENGTH[ship.length]}
                        alt={`Ship ${ship.length}`}
                        fill
                        sizes="170px"
                        className="object-contain"
                      />
                      {ship.placed && (
                        <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-[#0c2312]">
                          OK
                        </span>
                      )}
                    </button>
                  );
                })}
                <div className="mt-1 rounded-md border border-[#5f4a2d] bg-black/45 px-2 py-1 text-[11px] text-[#eddcb8]">
                  {soloPlacementActive ? (
                    <div>
                      Place all ships, then press Start Battle. Double-click on board to rotate
                      selected ship.
                    </div>
                  ) : (
                    <div>
                      You: {activePlacementYouReady ? "ready" : "placing"} | Opponent:{" "}
                      {activePlacementOpponentReady ? "ready" : "placing"}
                    </div>
                  )}
                </div>
                {soloPlacementActive && (
                  <button
                    type="button"
                    onClick={finalizeSoloPlacement}
                    disabled={!soloPlacementReady}
                    className="mt-1 rounded-md border border-emerald-500/70 bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Start Battle
                  </button>
                )}
              </div>
            )}

            {isPlacementInteractionActive &&
              selectedPlacementLength !== null &&
              placementCursorPos && (
                <div
                  className="pointer-events-none absolute z-[46]"
                  style={{
                    width: `${placementCursorWidth}px`,
                    height: `${placementCursorHeight}px`,
                    left: `${placementCursorPos.x + activeShipCursorCalibration.offsetXPx}px`,
                    top: `${placementCursorPos.y + activeShipCursorCalibration.offsetYPx}px`,
                    transform: `translate(-${activeShipCursorCalibration.anchorXPct}%, -${activeShipCursorCalibration.anchorYPct}%) rotate(${activeShipCursorCalibration.rotationDeg}deg)`,
                    transformOrigin: "center center",
                  }}
                >
                  <img
                    src={SHIP_ICON_BY_LENGTH[selectedPlacementLength]}
                    alt=""
                    className="pointer-events-none h-full w-full opacity-75"
                  />
                  {isUiCalibrationMode && (
                    <>
                      <div
                        className="pointer-events-auto absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full border border-cyan-100 bg-cyan-500/90"
                        onPointerDown={(event) => beginShipCursorDrag("resize-both", event)}
                      />
                      <div
                        className="pointer-events-auto absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-cyan-100 bg-cyan-500/90"
                        onPointerDown={(event) => beginShipCursorDrag("resize-width", event)}
                      />
                      <div
                        className="pointer-events-auto absolute left-1/2 -bottom-2 h-4 w-4 -translate-x-1/2 cursor-ns-resize rounded-full border border-cyan-100 bg-cyan-500/90"
                        onPointerDown={(event) => beginShipCursorDrag("resize-height", event)}
                      />
                      <div
                        className="pointer-events-auto absolute left-1/2 -top-8 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border border-amber-200 bg-amber-500/90 active:cursor-grabbing"
                        onPointerDown={(event) => beginShipCursorDrag("rotate", event)}
                      />
                      <div
                        className="pointer-events-auto absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-emerald-200 bg-emerald-500/90"
                        onPointerDown={(event) => beginShipCursorDrag("move", event)}
                      />
                    </>
                  )}
                </div>
              )}

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
                  onClick={() => {
                    if (isUiCalibrationMode) return;
                    handleCloseStartPanel();
                  }}
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
                          onClick={() => {
                            if (isUiCalibrationMode) return;
                            handleOnlineModeClick();
                          }}
                          className={`absolute rounded-xl ${MODAL_BUTTON_MOTION_CLASS} ${
                            isUiCalibrationMode
                              ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                              : ""
                          }`}
                          style={rectStyle(activeUiCalibration.onlineButton)}
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
                          onClick={() => {
                            if (isUiCalibrationMode) return;
                            handleOfflineModeClick();
                          }}
                          className={`absolute rounded-xl ${MODAL_BUTTON_MOTION_CLASS} ${
                            isUiCalibrationMode
                              ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                              : ""
                          }`}
                          style={rectStyle(activeUiCalibration.offlineButton)}
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
                          onClick={() => {
                            if (isUiCalibrationMode) return;
                            handleLevelChoice("easy");
                          }}
                          className={`absolute rounded-xl ${MODAL_BUTTON_MOTION_CLASS} ${
                            isUiCalibrationMode
                              ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                              : ""
                          }`}
                          style={rectStyle(activeUiCalibration.babyButton)}
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
                          onClick={() => {
                            if (isUiCalibrationMode) return;
                            handleLevelChoice("medium");
                          }}
                          className={`absolute rounded-xl ${MODAL_BUTTON_MOTION_CLASS} ${
                            isUiCalibrationMode
                              ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                              : ""
                          }`}
                          style={rectStyle(activeUiCalibration.manButton)}
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
                          onClick={() => {
                            if (isUiCalibrationMode) return;
                            handleLevelChoice("hard");
                          }}
                          className={`absolute rounded-xl ${MODAL_BUTTON_MOTION_CLASS} ${
                            isUiCalibrationMode
                              ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                              : ""
                          }`}
                          style={rectStyle(activeUiCalibration.nightmareButton)}
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
                  onClick={() => {
                    if (isUiCalibrationMode) return;
                    setIsMenuOpen(false);
                  }}
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
                      onClick={() => {
                        if (isUiCalibrationMode) return;
                        handleToggleSound();
                      }}
                      className={`absolute ${MODAL_BUTTON_MOTION_CLASS} ${
                        isUiCalibrationMode
                          ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                          : ""
                      }`}
                      style={rectStyle(activeUiCalibration.soundButton)}
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
                      onClick={() => {
                        if (isUiCalibrationMode) return;
                        handleOpenStatistics();
                      }}
                      className={`absolute ${MODAL_BUTTON_MOTION_CLASS} ${
                        isUiCalibrationMode
                          ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                          : ""
                      }`}
                      style={rectStyle(activeUiCalibration.statButton)}
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
                        if (isUiCalibrationMode) return;
                        playButtonClickSound();
                        setIsMenuOpen(false);
                        setIsStatsOpen(true);
                      }}
                      className={`absolute ${MODAL_BUTTON_MOTION_CLASS} ${
                        isUiCalibrationMode
                          ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                          : ""
                      }`}
                      style={rectStyle(activeUiCalibration.leaderButton)}
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
                        if (isUiCalibrationMode) return;
                        playButtonClickSound();
                        setIsMenuOpen(false);
                        setIsOnlineLobbyOpen(true);
                      }}
                      className={`absolute ${MODAL_BUTTON_MOTION_CLASS} ${
                        isUiCalibrationMode
                          ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                          : ""
                      }`}
                      style={rectStyle(activeUiCalibration.loginButton)}
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

        <div className="absolute left-3 top-3 z-[90] w-[min(92vw,360px)]">
          {!isUiCalibrationMode ? (
            <button
              type="button"
              onClick={enterUiCalibrationMode}
              className="rounded-md border border-cyan-500/70 bg-black/70 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-black/85"
            >
              Enable Calibration
            </button>
          ) : (
            <div className="max-h-[92vh] overflow-auto rounded-lg border border-cyan-500/60 bg-black/85 p-3 text-[11px] text-cyan-50 shadow-[0_0_28px_rgba(14,116,144,0.35)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold tracking-wide">Calibration Mode</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={saveUiCalibrationMode}
                    className="rounded border border-emerald-500/70 bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelUiCalibrationMode}
                    className="rounded border border-slate-400/70 bg-slate-500/20 px-2 py-1 text-[10px] text-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={resetUiCalibrationMode}
                    className="rounded border border-amber-500/70 bg-amber-500/20 px-2 py-1 text-[10px] text-amber-100"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mb-2 rounded border border-cyan-900/60 bg-black/45 p-2 text-[10px] text-cyan-100/90">
                While this mode is active, Online/Offline/Stat/Leader/Login buttons are only
                moved/resized and won’t trigger actions.
              </div>

              <div className="space-y-2">
                {([
                  ["onlineButton", "Online button"],
                  ["offlineButton", "Offline button"],
                  ["babyButton", "Baby button"],
                  ["manButton", "Man button"],
                  ["nightmareButton", "Nightmare button"],
                  ["soundButton", "Sound button"],
                  ["statButton", "Stat button"],
                  ["leaderButton", "Leader button"],
                  ["loginButton", "Login button"],
                ] as const).map(([key, label]) => {
                  const current = uiCalibrationDraft[key];
                  return (
                    <div key={key} className="rounded border border-cyan-900/50 bg-black/40 p-2">
                      <div className="mb-1 text-[10px] font-semibold text-cyan-100">{label}</div>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        <label>
                          X%
                          <input
                            type="range"
                            min={-20}
                            max={120}
                            step={0.1}
                            value={current.leftPct}
                            onChange={(event) =>
                              updateCalibrationRect(key, {
                                leftPct: Number(event.target.value),
                              })
                            }
                            className="w-full"
                          />
                        </label>
                        <label>
                          Y%
                          <input
                            type="range"
                            min={-20}
                            max={120}
                            step={0.1}
                            value={current.topPct}
                            onChange={(event) =>
                              updateCalibrationRect(key, {
                                topPct: Number(event.target.value),
                              })
                            }
                            className="w-full"
                          />
                        </label>
                        <label>
                          W%
                          <input
                            type="range"
                            min={5}
                            max={95}
                            step={0.1}
                            value={current.widthPct}
                            onChange={(event) =>
                              updateCalibrationRect(key, {
                                widthPct: Number(event.target.value),
                              })
                            }
                            className="w-full"
                          />
                        </label>
                        <label>
                          H%
                          <input
                            type="range"
                            min={5}
                            max={60}
                            step={0.1}
                            value={current.heightPct}
                            onChange={(event) =>
                              updateCalibrationRect(key, {
                                heightPct: Number(event.target.value),
                              })
                            }
                            className="w-full"
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 rounded border border-cyan-900/50 bg-black/40 p-2">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-cyan-100">Ship Cursor</div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleShipCursorPin}
                      className={`rounded border px-2 py-1 text-[10px] ${
                        shipCursorPinned
                          ? "border-amber-500/80 bg-amber-500/25 text-amber-100"
                          : "border-cyan-500/70 bg-cyan-500/20 text-cyan-100"
                      }`}
                    >
                      {shipCursorPinned ? "Unpin cursor" : "Pin cursor"}
                    </button>
                    <button
                      type="button"
                      onDoubleClick={() =>
                        setShipCalibrationOrientation((prev) =>
                          prev === "horizontal" ? "vertical" : "horizontal"
                        )
                      }
                      onClick={() =>
                        setShipCalibrationOrientation((prev) =>
                          prev === "horizontal" ? "vertical" : "horizontal"
                        )
                      }
                      className="rounded border border-cyan-500/70 bg-cyan-500/20 px-2 py-1 text-[10px] text-cyan-100"
                    >
                      {shipCalibrationOrientation.toUpperCase()}
                    </button>
                  </div>
                </div>
                <div className="mb-2 text-[10px] text-cyan-100/80">
                  Tip: press Pin cursor, then drag handle points around the ship. Double-click on
                  board rotates ship orientation.
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <label>
                    Deck size
                    <input
                      type="range"
                      min={24}
                      max={130}
                      step={1}
                      value={shipCalibrationTarget.deckSizePx}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          deckSizePx: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label>
                    Thickness
                    <input
                      type="range"
                      min={16}
                      max={120}
                      step={1}
                      value={shipCalibrationTarget.thicknessPx}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          thicknessPx: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label>
                    Min length
                    <input
                      type="range"
                      min={30}
                      max={220}
                      step={1}
                      value={shipCalibrationTarget.minLengthPx}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          minLengthPx: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label>
                    Angle
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={shipCalibrationTarget.rotationDeg}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          rotationDeg: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label>
                    Anchor X%
                    <input
                      type="range"
                      min={-40}
                      max={140}
                      step={1}
                      value={shipCalibrationTarget.anchorXPct}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          anchorXPct: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label>
                    Anchor Y%
                    <input
                      type="range"
                      min={-40}
                      max={140}
                      step={1}
                      value={shipCalibrationTarget.anchorYPct}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          anchorYPct: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label>
                    Offset X px
                    <input
                      type="range"
                      min={-240}
                      max={240}
                      step={1}
                      value={shipCalibrationTarget.offsetXPx}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          offsetXPx: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label>
                    Offset Y px
                    <input
                      type="range"
                      min={-240}
                      max={240}
                      step={1}
                      value={shipCalibrationTarget.offsetYPx}
                      onChange={(event) =>
                        updateShipCursorCalibration(shipCalibrationOrientation, {
                          offsetYPx: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {isStatsOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/72 p-4">
            <div className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-2xl border border-[#6c5130] bg-[#131313] p-5 text-[#f3e8d0] shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xl font-bold">Statistics</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshLeaderboard}
                    className="rounded-md border border-[#8d6a42] px-3 py-1 text-sm hover:bg-[#272727]"
                  >
                    Refresh leaderboard
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseStatistics}
                    className="rounded-md border border-[#8d6a42] px-3 py-1 text-sm hover:bg-[#272727]"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div>Total games: {totalGames}</div>
                <div>Wins: {totalWins}</div>
                <div>Losses: {totalLosses}</div>
                <div>Win rate: {winRate}%</div>
                <div>Avg accuracy: {avgPlayerAccuracy}%</div>
                <div>Rounds (now): {game.round}</div>
              </div>
              <div className="mt-4 rounded-lg border border-[#6b532f]/70 bg-[#1a1a1a] p-3 text-sm text-[#dcc8a3]">
                <h3 className="mb-2 text-base font-semibold text-[#f3e8d0]">AI Coach</h3>
                {!activeCoachReport ? (
                  <p className="text-sm text-[#d1c1a5]">
                    Finish a solo or online match to unlock tactical analysis.
                  </p>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs text-cyan-100">
                        {activeCoachReport.headline}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${
                          activeCoachReport.verdict === "excellent"
                            ? "bg-emerald-500/20 text-emerald-100"
                            : activeCoachReport.verdict === "solid"
                            ? "bg-cyan-500/20 text-cyan-100"
                            : "bg-amber-500/20 text-amber-100"
                        }`}
                      >
                        Verdict: {activeCoachReport.verdict}
                      </span>
                      {coachSourceLabel && (
                        <span className="rounded-full border border-[#8d6a42] px-3 py-1 text-xs text-[#e6d1ad]">
                          {coachSourceLabel}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-1 text-sm">
                      {activeCoachReport.notes.map((note, index) => (
                        <li key={`${note}-${index}`}>- {note}</li>
                      ))}
                    </ul>
                  </>
                )}
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
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-[#f3e8d0]">Leaderboard</h3>
                  <span className="text-xs text-[#b89f76]">
                    {leaderboard
                      ? `Updated: ${new Date(leaderboard.updatedAtMs).toLocaleTimeString()}`
                      : "Waiting for server data..."}
                  </span>
                </div>
                {!leaderboard ? (
                  <p className="text-sm text-[#d1c1a5]">Leaderboard is loading...</p>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-1 text-sm font-semibold text-[#e8d6b9]">
                        Global Top
                      </h4>
                      {leaderboard.global.length === 0 ? (
                        <p className="text-xs text-[#d1c1a5]">No ranked matches yet.</p>
                      ) : (
                        <ul className="max-h-56 space-y-1 overflow-auto rounded-lg border border-[#3f3f3f] bg-black/25 p-2 text-xs">
                          {leaderboard.global.slice(0, 10).map((entry, index) => (
                            <li key={entry.playerKey}>
                              #{index + 1} {entry.name} ({entry.city}) | W:{entry.wins} D:
                              {entry.draws} L:{entry.losses} | Acc:{entry.accuracy}% |
                              Score:{entry.score}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <h4 className="mb-1 text-sm font-semibold text-[#e8d6b9]">Top Cities</h4>
                      {leaderboard.byCity.length === 0 ? (
                        <p className="text-xs text-[#d1c1a5]">City leaderboard is empty.</p>
                      ) : (
                        <ul className="max-h-56 space-y-2 overflow-auto rounded-lg border border-[#3f3f3f] bg-black/25 p-2 text-xs">
                          {leaderboard.byCity.slice(0, 6).map((cityBoard) => (
                            <li
                              key={cityBoard.city}
                              className="rounded-md border border-[#5a4a31] bg-[#101010] p-2"
                            >
                              <div className="font-medium">
                                {cityBoard.city} | games: {cityBoard.totalGames}
                              </div>
                              <div className="mt-1 space-y-1">
                                {cityBoard.players.slice(0, 3).map((entry, idx) => (
                                  <div key={`${cityBoard.city}-${entry.playerKey}`}>
                                    {idx + 1}. {entry.name} | W:{entry.wins} D:{entry.draws}
                                    L:{entry.losses} | Score:{entry.score}
                                  </div>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
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
                <button
                  type="button"
                  onClick={lockPlacementNow}
                  disabled={!canLockPlacement}
                  className="rounded-lg border border-amber-500/70 bg-amber-500/20 px-3 py-2 text-sm text-amber-100 transition hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Lock fleet
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
                <button
                  type="button"
                  onClick={() => setIsOnlineLobbyOpen(false)}
                  className="rounded-lg border border-cyan-500/70 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/30"
                >
                  Go to board
                </button>
              </div>

              {roomView?.phase === "placement" && (
                <div className="mb-4 rounded-lg border border-[#6c5130] bg-black/30 p-3 text-sm text-[#dcc8a3]">
                  Placement time left: {roomView.placementSecondsLeft}s | You:{" "}
                  {roomView.yourPlacementReady ? "ready" : "placing"} | Opponent:{" "}
                  {roomView.opponentPlacementReady ? "ready" : "placing"}
                  <div className="mt-1 text-xs text-[#bca57e]">
                    Click ship icon, move on board, right click to rotate, left click to place.
                  </div>
                </div>
              )}

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


