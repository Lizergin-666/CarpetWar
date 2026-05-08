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
const BOT_TURN_DELAY_MS = 2000;
const TURN_SWAP_WAIT_MS = 1000;
const TURN_SWAP_FADE_HALF_MS = 750;
const PLAYER_TURN_SECONDS = 20;
const WATER = -1;
const MISS_SOUND_URL = "/sound/smash1.mp3";
const THEME_SOUND_URL = "/sound/Theme.mp3";
const HMM_SOUND_URL = "/sound/hmm.mp3";
const LAUGH_SOUND_URL = "/sound/lought.mp3";
const FALL_SOUND_URL = "/sound/fall.mp3";
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
const UI_DECOR_BLUE_URL = "/ui/character-blue1.png";
const UI_DECOR_RED_URL = "/ui/character-red1-v2.png";
const UI_HEALTH_BLUE_URL = "/ui/health-blue.png";
const UI_HEALTH_RED_URL = "/ui/health-red.png";
const UI_DOOR_LEFT_URL = "/ui/door-left.png";
const UI_DOOR_RIGHT_URL = "/ui/door-right.png";
const UI_BUTTON_STAT_URL = "/ui/btn-stat.png";
const UI_BUTTON_SOUND_URL = "/ui/btn-sound.png";
const UI_BUTTON_SOUND_OFF_URL = "/ui/btn-sound-off.png";
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
const SHIP_VISUAL_CALIBRATION_STORAGE_KEY = "sea-war.ship-visual-calibration.v1";
const PLACEMENT_UI_CALIBRATION_STORAGE_KEY = "sea-war.placement-ui-calibration.v1";
const HIT_MARKER_CALIBRATION_STORAGE_KEY = "sea-war.hit-marker-calibration.v1";
const FORK_VARIANT_CALIBRATION_STORAGE_KEY = "sea-war.fork-variant-calibration.v1";
const CARPET_BOARD_BOUNDARY_STORAGE_KEY = "sea-war.carpet-board-boundary.v3";
const CARPET_BOARD_BOUNDARY_LEGACY_KEYS = ["sea-war.carpet-board-boundary.v2"];
const SPRITE_TRANSFORM_STORAGE_KEY = "sea-war.sprite-transform-map.v1";
const MODAL_BUTTON_MOTION_CLASS =
  "transition-transform duration-150 ease-out hover:-translate-y-[2px] hover:scale-[1.03] active:translate-y-[1px] active:scale-[0.98]";
const MENU_BUTTON_RIGHT_PCT = 1.9;
const MENU_BUTTON_TOP_PCT = 2.3;
const MENU_BUTTON_WIDTH_PCT = 16;
const MENU_PANEL_WIDTH_PCT = 19.6;
const MENU_PANEL_CENTER_X_PCT =
  100 - MENU_BUTTON_RIGHT_PCT - MENU_BUTTON_WIDTH_PCT / 2;
const ONLINE_PLACEMENT_FLEET = FLEET;
const BOARD_ROTATION_DEG = 0;
const PLACEMENT_SHIP_TYPES = Array.from(new Set<number>(ONLINE_PLACEMENT_FLEET));
const CARPET_IMAGE_WIDTH = 1448;
const CARPET_IMAGE_HEIGHT = 1086;
const BOARD_FRAME_REFERENCE_WIDTH = 1860;
const FALLBACK_SUPABASE_URL = "https://reiafaehflhbosmzkajm.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_7EPT724iGnusPS9QCZV1qA_0UaXLWXJ";
const FALLBACK_SOCKET_URL_LOCAL = "http://localhost:4000";
const FALLBACK_SOCKET_URL_PROD = "https://carpetwar-production.up.railway.app";
const HIT_MARKER_IDS = ["hit-1", "hit-2", "hit-3", "hit-4", "hit-5", "hit-6"] as const;
const FORK_VARIANT_IDS = ["fork-1", "fork-2", "fork-3", "fork-4"] as const;
const SHIP_SLOT_LEFT_PCT = 35;
const SHIP_SLOT_TOP_PCT = 25;
const SHIP_SLOT_WIDTH_PCT = 30;
const SHIP_SLOT_HEIGHT_PCT = 50;
const SHIP_SLOT_CENTER_X_PCT = SHIP_SLOT_LEFT_PCT + SHIP_SLOT_WIDTH_PCT / 2;
const SHIP_SLOT_CENTER_Y_PCT = SHIP_SLOT_TOP_PCT + SHIP_SLOT_HEIGHT_PCT / 2;
const CALIBRATION_TOOLS_VISIBLE =
  process.env.NEXT_PUBLIC_ENABLE_CALIBRATION_TOOLS === "1";
const SHIP_ICON_BY_LENGTH_ORIENTATION: Record<
  number,
  { horizontal: string; vertical: string }
> = {
  1: { horizontal: "/ui/ships/ship-1.png", vertical: "/ui/ships/ship-1.png" },
  2: { horizontal: "/ui/ships/ship-2-h.png", vertical: "/ui/ships/ship-2-v.png" },
  3: { horizontal: "/ui/ships/ship-3-h.png", vertical: "/ui/ships/ship-3-v.png" },
  4: { horizontal: "/ui/ships/ship-4-h.png", vertical: "/ui/ships/ship-4-v.png" },
  5: { horizontal: "/ui/ships/ship-5-h.png", vertical: "/ui/ships/ship-5-v.png" },
};
const SHIP_SHADOW_DISTANCE_PX = 18;

function getShipIconByOrientation(length: number, horizontal: boolean): string {
  const pair = SHIP_ICON_BY_LENGTH_ORIENTATION[length];
  if (!pair) return "/ui/ships/ship-1.png";
  return horizontal ? pair.horizontal : pair.vertical;
}

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
  id: string;
  length: number;
  row: number;
  col: number;
  horizontal: boolean;
  placed: boolean;
  visual?: PlacementShipVisual;
  visualLocked?: boolean;
}

interface PlacementShipVisual {
  baseX: number;
  baseY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  spriteOffsetXPx: number;
  spriteOffsetYPx: number;
  anchorXPct: number;
  anchorYPct: number;
  rotationDeg: number;
  shadowAngleDeg: number;
  shadowOpacity: number;
  shadowBlurPx: number;
}

interface SoloBattleShipVisual {
  id: string;
  length: number;
  horizontal: boolean;
  visual: PlacementShipVisual;
}

interface HitMarkerDragState {
  target: "hit" | "fork";
  mode: "move" | "scale";
  startClientX: number;
  startClientY: number;
  startOffsetXPx: number;
  startOffsetYPx: number;
  startScale: number;
}

type MenuCalibrationKey =
  | "startButton"
  | "onlineButton"
  | "offlineButton"
  | "babyButton"
  | "manButton"
  | "nightmareButton"
  | "soundOnButton"
  | "soundButton"
  | "statButton"
  | "leaderButton"
  | "loginButton";

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
  botShotsLeft: number;
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

type HitMarkerId = (typeof HIT_MARKER_IDS)[number];
type ForkVariantId = (typeof FORK_VARIANT_IDS)[number];

interface PlacementUiCalibration {
  panelLeftPct: number;
  panelTopPct: number;
  panelWidthPct: number;
  panelGapPx: number;
  badgeOffsetXPx: number;
  badgeOffsetYPx: number;
  badgeScale: number;
  shipSlotScale: number;
}

interface HitMarkerCalibration {
  scale: number;
  offsetXPx: number;
  offsetYPx: number;
  opacity: number;
  centerXPct: number;
  centerYPct: number;
}

type HitMarkerCalibrationMap = Record<HitMarkerId, HitMarkerCalibration>;

interface ForkVariantCalibration {
  href: string;
  enabled: boolean;
  scale: number;
  offsetXPx: number;
  offsetYPx: number;
  opacity: number;
  rotationDeg: number;
  centerXPct: number;
  centerYPct: number;
}

type ForkVariantCalibrationMap = Record<ForkVariantId, ForkVariantCalibration>;

interface ShipCursorCalibration {
  deckSizePx: number;
  thicknessPx: number;
  minLengthPx: number;
  anchorXPct: number;
  anchorYPct: number;
  offsetXPx: number;
  offsetYPx: number;
  rotationDeg: number;
  shadowAngleDeg: number;
  shadowOpacity: number;
  shadowBlurPx: number;
}

interface UiCalibrationConfig {
  startButton: CalibrationRect;
  onlineButton: CalibrationRect;
  offlineButton: CalibrationRect;
  babyButton: CalibrationRect;
  manButton: CalibrationRect;
  nightmareButton: CalibrationRect;
  soundOnButton: CalibrationRect;
  soundButton: CalibrationRect;
  statButton: CalibrationRect;
  leaderButton: CalibrationRect;
  loginButton: CalibrationRect;
  shipCursorHorizontal: ShipCursorCalibration;
  shipCursorVertical: ShipCursorCalibration;
}

type ShipCursorHandle = "move" | "resize-width" | "resize-height" | "resize-both" | "rotate";

interface PlacedShipVisualDragState {
  shipId: string;
  handle: ShipCursorHandle;
  startClientX: number;
  startClientY: number;
  startVisual: PlacementShipVisual;
}

type ShipVisualCalibrationMap = Record<
  number,
  { horizontal: ShipCursorCalibration; vertical: ShipCursorCalibration }
>;

interface SharedCalibrationSnapshot {
  uiCalibration: UiCalibrationConfig;
  shipVisualCalibration: ShipVisualCalibrationMap;
  placementUiCalibration: PlacementUiCalibration;
  hitMarkerCalibrationMap: HitMarkerCalibrationMap;
  forkVariantCalibrationMap: ForkVariantCalibrationMap;
  carpetBoardBoundary: Record<string, unknown> | null;
  spriteTransformMap: Record<string, unknown> | null;
}

interface SharedCalibrationResponse {
  ok?: boolean;
  version?: number;
  updatedAtMs?: number;
  calibration?: unknown;
}

const DEFAULT_UI_CALIBRATION: UiCalibrationConfig = {
  startButton: { leftPct: 40.55, topPct: 88.5, widthPct: 18, heightPct: 11.4 },
  onlineButton: { leftPct: 10.66, topPct: 36.7, widthPct: 81.54, heightPct: 14.76 },
  offlineButton: { leftPct: 12.55, topPct: 51.33, widthPct: 76.29, heightPct: 19.31 },
  babyButton: { leftPct: 8, topPct: 37.12, widthPct: 85.46, heightPct: 14.55 },
  manButton: { leftPct: 7.6, topPct: 53.22, widthPct: 87.35, heightPct: 14.97 },
  nightmareButton: { leftPct: 8.35, topPct: 70.09, widthPct: 84.8, heightPct: 14.55 },
  soundOnButton: { leftPct: 8.35, topPct: 14.51, widthPct: 82.73, heightPct: 23.44 },
  soundButton: { leftPct: 2.26, topPct: 8, widthPct: 94.98, heightPct: 35.48 },
  statButton: { leftPct: 8.77, topPct: 32.15, widthPct: 83.36, heightPct: 20.99 },
  leaderButton: { leftPct: 3.03, topPct: 52.45, widthPct: 94.98, heightPct: 15.81 },
  loginButton: { leftPct: 8.77, topPct: 64.7, widthPct: 82.45, heightPct: 23.65 },
  shipCursorHorizontal: {
    deckSizePx: 44,
    thicknessPx: 42,
    minLengthPx: 70,
    anchorXPct: 18,
    anchorYPct: 42,
    offsetXPx: 0,
    offsetYPx: 0,
    rotationDeg: 0,
    shadowAngleDeg: 132,
    shadowOpacity: 0.34,
    shadowBlurPx: 12,
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
    shadowAngleDeg: 132,
    shadowOpacity: 0.34,
    shadowBlurPx: 12,
  },
};

const DEFAULT_PLACEMENT_UI_CALIBRATION: PlacementUiCalibration = {
  panelLeftPct: -6.4,
  panelTopPct: 26.3,
  panelWidthPct: 63.2,
  panelGapPx: -17.5,
  badgeOffsetXPx: -20,
  badgeOffsetYPx: 0,
  badgeScale: 1,
  shipSlotScale: 3.2,
};

const DEFAULT_HIT_MARKER_CALIBRATION: HitMarkerCalibration = {
  scale: 1,
  offsetXPx: 0,
  offsetYPx: 0,
  opacity: 0.8,
  centerXPct: 50,
  centerYPct: 50,
};

const DEFAULT_FORK_IMAGE_HREF = "/sprites/fork.png";
const LEGACY_MISSING_FORK_PATHS = new Set([
  "/sprites/fork-2.png",
  "/sprites/fork-3.png",
  "/sprites/fork-4.png",
]);

const DEFAULT_FORK_VARIANT_CALIBRATION: ForkVariantCalibration = {
  href: DEFAULT_FORK_IMAGE_HREF,
  enabled: true,
  scale: 0.81,
  offsetXPx: 8.331774577475803,
  offsetYPx: -1.388667547911596,
  opacity: 1,
  rotationDeg: -4,
  centerXPct: 48.74166029308653,
  centerYPct: 86.66708582407009,
};

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildShipShadowFilter(
  angleDeg: number,
  opacity: number,
  blurPx: number,
  distancePx = SHIP_SHADOW_DISTANCE_PX
): string {
  const radians = (angleDeg * Math.PI) / 180;
  const dx = Math.round(Math.cos(radians) * distancePx * 100) / 100;
  const dy = Math.round(Math.sin(radians) * distancePx * 100) / 100;
  return `drop-shadow(${dx}px ${dy}px ${blurPx}px rgba(0,0,0,${opacity}))`;
}

function normalizeCalibrationRect(rect: CalibrationRect): CalibrationRect {
  return {
    leftPct: clampNumber(rect.leftPct, -20, 120),
    topPct: clampNumber(rect.topPct, -20, 120),
    widthPct: clampNumber(rect.widthPct, 5, 95),
    heightPct: clampNumber(rect.heightPct, 5, 60),
  };
}

function resolveCalibrationRect(
  fallback: CalibrationRect,
  candidate: unknown
): CalibrationRect {
  if (!candidate || typeof candidate !== "object") {
    return { ...fallback };
  }
  return {
    ...fallback,
    ...(candidate as Partial<CalibrationRect>),
  };
}

function normalizeShipCursorCalibration(config: ShipCursorCalibration): ShipCursorCalibration {
  return {
    deckSizePx: clampNumber(config.deckSizePx, 12, 1200),
    thicknessPx: clampNumber(config.thicknessPx, 12, 1200),
    minLengthPx: clampNumber(config.minLengthPx, 30, 4200),
    anchorXPct: clampNumber(config.anchorXPct, -220, 320),
    anchorYPct: clampNumber(config.anchorYPct, -220, 320),
    offsetXPx: clampNumber(config.offsetXPx, -2200, 2200),
    offsetYPx: clampNumber(config.offsetYPx, -2200, 2200),
    rotationDeg: clampNumber(config.rotationDeg, -180, 180),
    shadowAngleDeg: clampNumber(config.shadowAngleDeg, -180, 180),
    shadowOpacity: clampNumber(config.shadowOpacity, 0, 1),
    shadowBlurPx: clampNumber(config.shadowBlurPx, 0, 60),
  };
}

function normalizePlacementUiCalibration(
  config: PlacementUiCalibration
): PlacementUiCalibration {
  return {
    panelLeftPct: clampNumber(config.panelLeftPct, -20, 90),
    panelTopPct: clampNumber(config.panelTopPct, -20, 90),
    panelWidthPct: clampNumber(config.panelWidthPct, 8, 70),
    panelGapPx: clampNumber(config.panelGapPx, -120, 40),
    badgeOffsetXPx: clampNumber(config.badgeOffsetXPx, -120, 120),
    badgeOffsetYPx: clampNumber(config.badgeOffsetYPx, -120, 120),
    badgeScale: clampNumber(config.badgeScale, 0.4, 3),
    shipSlotScale: clampNumber(config.shipSlotScale, 0.4, 6),
  };
}

function normalizeHitMarkerCalibration(config: HitMarkerCalibration): HitMarkerCalibration {
  return {
    scale: clampNumber(config.scale, 0.3, 8),
    offsetXPx: clampNumber(config.offsetXPx, -120, 120),
    offsetYPx: clampNumber(config.offsetYPx, -120, 120),
    opacity: clampNumber(config.opacity, 0, 1),
    centerXPct: clampNumber(config.centerXPct, 0, 100),
    centerYPct: clampNumber(config.centerYPct, 0, 100),
  };
}

function createDefaultHitMarkerCalibrationMap(): HitMarkerCalibrationMap {
  return {
    "hit-1": {
      scale: 0.8552475894852128,
      offsetXPx: -111.88614970524017,
      offsetYPx: 120,
      opacity: 0.8,
      centerXPct: 50.11711120605469,
      centerYPct: 46.27602895100911,
    },
    "hit-2": { scale: 0.69, offsetXPx: -102, offsetYPx: 102, opacity: 0.8, centerXPct: 50, centerYPct: 50 },
    "hit-3": { scale: 0.69, offsetXPx: 0, offsetYPx: 0, opacity: 0.8, centerXPct: 50, centerYPct: 50 },
    "hit-4": { scale: 0.84, offsetXPx: 0, offsetYPx: 0, opacity: 0.8, centerXPct: 50, centerYPct: 50 },
    "hit-5": { scale: 0.86, offsetXPx: 0, offsetYPx: 0, opacity: 0.8, centerXPct: 50, centerYPct: 50 },
    "hit-6": { scale: 0.71, offsetXPx: 0, offsetYPx: 0, opacity: 0.8, centerXPct: 50, centerYPct: 50 },
  };
}

function normalizeForkVariantCalibration(
  config: ForkVariantCalibration
): ForkVariantCalibration {
  return {
    href: resolveForkHref(String(config.href ?? "").trim()),
    enabled: Boolean(config.enabled),
    scale: clampNumber(config.scale, 0.3, 8),
    offsetXPx: clampNumber(config.offsetXPx, -120, 120),
    offsetYPx: clampNumber(config.offsetYPx, -120, 120),
    opacity: clampNumber(config.opacity, 0, 1),
    rotationDeg: clampNumber(config.rotationDeg, -180, 180),
    centerXPct: clampNumber(config.centerXPct, 0, 100),
    centerYPct: clampNumber(config.centerYPct, 0, 100),
  };
}

function createDefaultForkVariantCalibrationMap(): ForkVariantCalibrationMap {
  return {
    "fork-1": {
      ...DEFAULT_FORK_VARIANT_CALIBRATION,
      href: DEFAULT_FORK_IMAGE_HREF,
      enabled: true,
    },
    "fork-2": {
      ...DEFAULT_FORK_VARIANT_CALIBRATION,
      href: DEFAULT_FORK_IMAGE_HREF,
      scale: 1,
      offsetXPx: 0,
      offsetYPx: 0,
      rotationDeg: 9,
      centerXPct: 40.241447655684176,
      centerYPct: 85.96293776052714,
      enabled: false,
    },
    "fork-3": {
      ...DEFAULT_FORK_VARIANT_CALIBRATION,
      href: DEFAULT_FORK_IMAGE_HREF,
      scale: 1,
      offsetXPx: 0,
      offsetYPx: 0,
      rotationDeg: -15,
      centerXPct: 58.05881882847562,
      centerYPct: 87.83845051555781,
      enabled: false,
    },
    "fork-4": {
      ...DEFAULT_FORK_VARIANT_CALIBRATION,
      href: DEFAULT_FORK_IMAGE_HREF,
      scale: 1,
      offsetXPx: 5,
      offsetYPx: 1,
      rotationDeg: 4,
      centerXPct: 46.91122844354062,
      centerYPct: 87.2992577693186,
      enabled: false,
    },
  };
}

function resolveForkHref(href: string): string {
  const normalized = String(href ?? "").trim();
  if (!normalized) return DEFAULT_FORK_IMAGE_HREF;
  if (LEGACY_MISSING_FORK_PATHS.has(normalized)) return DEFAULT_FORK_IMAGE_HREF;
  return normalized;
}

function normalizeUiCalibration(config: UiCalibrationConfig): UiCalibrationConfig {
  return {
    startButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.startButton, config.startButton)
    ),
    onlineButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.onlineButton, config.onlineButton)
    ),
    offlineButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.offlineButton, config.offlineButton)
    ),
    babyButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.babyButton, config.babyButton)
    ),
    manButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.manButton, config.manButton)
    ),
    nightmareButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.nightmareButton, config.nightmareButton)
    ),
    soundOnButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.soundOnButton, config.soundOnButton)
    ),
    soundButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.soundButton, config.soundButton)
    ),
    statButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.statButton, config.statButton)
    ),
    leaderButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.leaderButton, config.leaderButton)
    ),
    loginButton: normalizeCalibrationRect(
      resolveCalibrationRect(DEFAULT_UI_CALIBRATION.loginButton, config.loginButton)
    ),
    shipCursorHorizontal: normalizeShipCursorCalibration(config.shipCursorHorizontal),
    shipCursorVertical: normalizeShipCursorCalibration(config.shipCursorVertical),
  };
}

function createDefaultShipVisualCalibrationMap(): ShipVisualCalibrationMap {
  return {
    2: {
      horizontal: normalizeShipCursorCalibration({ deckSizePx: 135.6666259765625, thicknessPx: 253.11114501953125, minLengthPx: 271.333251953125, anchorXPct: 50, anchorYPct: 50, offsetXPx: -37.80597497016347, offsetYPx: -15.8540601882453, rotationDeg: 2.000006103515625, shadowAngleDeg: 104, shadowOpacity: 0.43, shadowBlurPx: 5 }),
      vertical: normalizeShipCursorCalibration({ deckSizePx: 124.49008623347466, thicknessPx: 259.0794432512394, minLengthPx: 248.9801724669493, anchorXPct: 18, anchorYPct: 42, offsetXPx: -81.70980453399982, offsetYPx: -25.610533749709703, rotationDeg: -6.9999938964843755, shadowAngleDeg: 132, shadowOpacity: 0.36, shadowBlurPx: 3.2927771685292764 }),
    },
    3: {
      horizontal: normalizeShipCursorCalibration({ deckSizePx: 150.75858117855165, thicknessPx: 255.55554199218753, minLengthPx: 452.27574353565495, anchorXPct: 18, anchorYPct: 42, offsetXPx: -166.7258663059364, offsetYPx: -192.68843278345267, rotationDeg: -6.999993896484372, shadowAngleDeg: 111, shadowOpacity: 0.43, shadowBlurPx: 4 }),
      vertical: normalizeShipCursorCalibration({ deckSizePx: 124.49010856404898, thicknessPx: 202.98017246694928, minLengthPx: 373.47032569214696, anchorXPct: 18, anchorYPct: 42, offsetXPx: -76.83133328223714, offsetYPx: -110.97882326805505, rotationDeg: -8.50001220703125, shadowAngleDeg: 132, shadowOpacity: 0.34, shadowBlurPx: 11.999999999999998 }),
    },
    4: {
      horizontal: normalizeShipCursorCalibration({ deckSizePx: 106.51103626083048, thicknessPx: 296.3934064250502, minLengthPx: 426.0441450433219, anchorXPct: 18, anchorYPct: 42, offsetXPx: -190.08146245205998, offsetYPx: -185.69360145442243, rotationDeg: -6.999993896484378, shadowAngleDeg: 117, shadowOpacity: 0.76, shadowBlurPx: 5.999999999999999 }),
      vertical: normalizeShipCursorCalibration({ deckSizePx: 88.6141482214377, thicknessPx: 268.78473124649554, minLengthPx: 354.4565928857508, anchorXPct: 18, anchorYPct: 42, offsetXPx: -95.37543746315455, offsetYPx: -161.57879550727293, rotationDeg: -5.000015258789064, shadowAngleDeg: 125, shadowOpacity: 0.56, shadowBlurPx: 2.9999999999999996 }),
    },
    5: {
      horizontal: normalizeShipCursorCalibration({ deckSizePx: 101.19052563892892, thicknessPx: 364.59022684885605, minLengthPx: 505.9526281946446, anchorXPct: 18, anchorYPct: 42, offsetXPx: -279.05193622740285, offsetYPx: -332.0304470987609, rotationDeg: -5.299981689453139, shadowAngleDeg: 132, shadowOpacity: 0.87, shadowBlurPx: 8.199765309979824 }),
      vertical: normalizeShipCursorCalibration({ deckSizePx: 87.0305532157421, thicknessPx: 285.85850973526595, minLengthPx: 435.1527660787105, anchorXPct: 18, anchorYPct: 42, offsetXPx: -29.520162059460997, offsetYPx: -176.1627291679376, rotationDeg: -9, shadowAngleDeg: 118, shadowOpacity: 0.5, shadowBlurPx: 6.585554337058553 }),
    },
  } as ShipVisualCalibrationMap;
}

function normalizeShipVisualCalibrationMap(
  map: ShipVisualCalibrationMap
): ShipVisualCalibrationMap {
  return Object.fromEntries(
    ONLINE_PLACEMENT_FLEET.map((length) => {
      const current = map[length];
      return [
        length,
        {
          horizontal: normalizeShipCursorCalibration(current.horizontal),
          vertical: normalizeShipCursorCalibration(current.vertical),
        },
      ];
    })
  ) as ShipVisualCalibrationMap;
}

function cloneShipVisualCalibrationMap(map: ShipVisualCalibrationMap): ShipVisualCalibrationMap {
  return Object.fromEntries(
    ONLINE_PLACEMENT_FLEET.map((length) => [
      length,
      {
        horizontal: { ...map[length].horizontal },
        vertical: { ...map[length].vertical },
      },
    ])
  ) as ShipVisualCalibrationMap;
}

function cloneUiCalibration(config: UiCalibrationConfig): UiCalibrationConfig {
  return {
    startButton: { ...config.startButton },
    onlineButton: { ...config.onlineButton },
    offlineButton: { ...config.offlineButton },
    babyButton: { ...config.babyButton },
    manButton: { ...config.manButton },
    nightmareButton: { ...config.nightmareButton },
    soundOnButton: { ...config.soundOnButton },
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
      startButton: { ...DEFAULT_UI_CALIBRATION.startButton, ...parsed.startButton },
      onlineButton: { ...DEFAULT_UI_CALIBRATION.onlineButton, ...parsed.onlineButton },
      offlineButton: { ...DEFAULT_UI_CALIBRATION.offlineButton, ...parsed.offlineButton },
      babyButton: { ...DEFAULT_UI_CALIBRATION.babyButton, ...parsed.babyButton },
      manButton: { ...DEFAULT_UI_CALIBRATION.manButton, ...parsed.manButton },
      nightmareButton: { ...DEFAULT_UI_CALIBRATION.nightmareButton, ...parsed.nightmareButton },
      soundOnButton: { ...DEFAULT_UI_CALIBRATION.soundOnButton, ...parsed.soundOnButton },
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

function readStoredShipVisualCalibration(): ShipVisualCalibrationMap {
  if (typeof window === "undefined") return createDefaultShipVisualCalibrationMap();
  try {
    const raw = localStorage.getItem(SHIP_VISUAL_CALIBRATION_STORAGE_KEY);
    if (!raw) return createDefaultShipVisualCalibrationMap();
    const parsed = JSON.parse(raw) as Record<
      string,
      | { horizontal?: Partial<ShipCursorCalibration>; vertical?: Partial<ShipCursorCalibration> }
      | Partial<ShipCursorCalibration>
      | undefined
    >;
    const defaults = createDefaultShipVisualCalibrationMap();
    const merged = Object.fromEntries(
      ONLINE_PLACEMENT_FLEET.map((length) => {
        const item = parsed[String(length)];
        const hasNested =
          Boolean(item) &&
          typeof item === "object" &&
          ("horizontal" in item || "vertical" in item);
        const legacyFlat = hasNested ? undefined : (item as Partial<ShipCursorCalibration> | undefined);
        return [
          length,
          {
            horizontal: {
              ...defaults[length].horizontal,
              ...(hasNested
                ? (item as { horizontal?: Partial<ShipCursorCalibration> }).horizontal ?? {}
                : legacyFlat ?? {}),
            },
            vertical: {
              ...defaults[length].vertical,
              ...(hasNested
                ? (item as { vertical?: Partial<ShipCursorCalibration> }).vertical ?? {}
                : legacyFlat ?? {}),
            },
          },
        ];
      })
    ) as ShipVisualCalibrationMap;
    return normalizeShipVisualCalibrationMap(merged);
  } catch {
    return createDefaultShipVisualCalibrationMap();
  }
}

function writeStoredShipVisualCalibration(map: ShipVisualCalibrationMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    SHIP_VISUAL_CALIBRATION_STORAGE_KEY,
    JSON.stringify(normalizeShipVisualCalibrationMap(map))
  );
}

function readStoredPlacementUiCalibration(): PlacementUiCalibration {
  if (typeof window === "undefined") return { ...DEFAULT_PLACEMENT_UI_CALIBRATION };
  try {
    const raw = localStorage.getItem(PLACEMENT_UI_CALIBRATION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PLACEMENT_UI_CALIBRATION };
    const parsed = JSON.parse(raw) as Partial<PlacementUiCalibration>;
    return normalizePlacementUiCalibration({
      ...DEFAULT_PLACEMENT_UI_CALIBRATION,
      ...parsed,
    });
  } catch {
    return { ...DEFAULT_PLACEMENT_UI_CALIBRATION };
  }
}

function writeStoredPlacementUiCalibration(config: PlacementUiCalibration): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    PLACEMENT_UI_CALIBRATION_STORAGE_KEY,
    JSON.stringify(normalizePlacementUiCalibration(config))
  );
}

function readStoredHitMarkerCalibrationMap(): HitMarkerCalibrationMap {
  if (typeof window === "undefined") return createDefaultHitMarkerCalibrationMap();
  try {
    const raw = localStorage.getItem(HIT_MARKER_CALIBRATION_STORAGE_KEY);
    if (!raw) return createDefaultHitMarkerCalibrationMap();
    const parsed = JSON.parse(raw) as Record<string, Partial<HitMarkerCalibration> | undefined>;
    const defaults = createDefaultHitMarkerCalibrationMap();
    return Object.fromEntries(
      HIT_MARKER_IDS.map((id) => [
        id,
        normalizeHitMarkerCalibration({
          ...defaults[id],
          ...(parsed[id] ?? {}),
        }),
      ])
    ) as HitMarkerCalibrationMap;
  } catch {
    return createDefaultHitMarkerCalibrationMap();
  }
}

function writeStoredHitMarkerCalibrationMap(map: HitMarkerCalibrationMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIT_MARKER_CALIBRATION_STORAGE_KEY, JSON.stringify(map));
}

function readStoredForkVariantCalibrationMap(): ForkVariantCalibrationMap {
  if (typeof window === "undefined") return createDefaultForkVariantCalibrationMap();
  try {
    const raw = localStorage.getItem(FORK_VARIANT_CALIBRATION_STORAGE_KEY);
    if (!raw) return createDefaultForkVariantCalibrationMap();
    const parsed = JSON.parse(raw) as Record<
      string,
      Partial<ForkVariantCalibration> | undefined
    >;
    const defaults = createDefaultForkVariantCalibrationMap();
    const normalized = Object.fromEntries(
      FORK_VARIANT_IDS.map((id) => [
        id,
        normalizeForkVariantCalibration({
          ...defaults[id],
          ...(parsed[id] ?? {}),
          href: resolveForkHref(String((parsed[id]?.href ?? defaults[id].href) ?? "")),
        }),
      ])
    ) as ForkVariantCalibrationMap;
    return normalized;
  } catch {
    return createDefaultForkVariantCalibrationMap();
  }
}

function writeStoredForkVariantCalibrationMap(map: ForkVariantCalibrationMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FORK_VARIANT_CALIBRATION_STORAGE_KEY, JSON.stringify(map));
}

function parseStoredRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readStoredRecord(key: string): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  return parseStoredRecord(localStorage.getItem(key));
}

function readStoredCarpetBoardBoundaryRecord(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const fromPrimary = parseStoredRecord(
    localStorage.getItem(CARPET_BOARD_BOUNDARY_STORAGE_KEY)
  );
  if (fromPrimary) return fromPrimary;
  for (const legacyKey of CARPET_BOARD_BOUNDARY_LEGACY_KEYS) {
    const fromLegacy = parseStoredRecord(localStorage.getItem(legacyKey));
    if (fromLegacy) return fromLegacy;
  }
  return null;
}

function normalizeSharedRecordCandidate(
  candidate: unknown
): Record<string, unknown> | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  return candidate as Record<string, unknown>;
}

function normalizeUiCalibrationCandidate(candidate: unknown): UiCalibrationConfig {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return cloneUiCalibration(DEFAULT_UI_CALIBRATION);
  }
  const parsed = candidate as Partial<UiCalibrationConfig>;
  const merged: UiCalibrationConfig = {
    startButton: { ...DEFAULT_UI_CALIBRATION.startButton, ...parsed.startButton },
    onlineButton: { ...DEFAULT_UI_CALIBRATION.onlineButton, ...parsed.onlineButton },
    offlineButton: { ...DEFAULT_UI_CALIBRATION.offlineButton, ...parsed.offlineButton },
    babyButton: { ...DEFAULT_UI_CALIBRATION.babyButton, ...parsed.babyButton },
    manButton: { ...DEFAULT_UI_CALIBRATION.manButton, ...parsed.manButton },
    nightmareButton: { ...DEFAULT_UI_CALIBRATION.nightmareButton, ...parsed.nightmareButton },
    soundOnButton: { ...DEFAULT_UI_CALIBRATION.soundOnButton, ...parsed.soundOnButton },
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
}

function normalizeShipVisualCalibrationCandidate(candidate: unknown): ShipVisualCalibrationMap {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return createDefaultShipVisualCalibrationMap();
  }
  const parsed = candidate as Record<
    string,
    | { horizontal?: Partial<ShipCursorCalibration>; vertical?: Partial<ShipCursorCalibration> }
    | Partial<ShipCursorCalibration>
    | undefined
  >;
  const defaults = createDefaultShipVisualCalibrationMap();
  const merged = Object.fromEntries(
    ONLINE_PLACEMENT_FLEET.map((length) => {
      const item = parsed[String(length)];
      const hasNested =
        Boolean(item) &&
        typeof item === "object" &&
        ("horizontal" in item || "vertical" in item);
      const legacyFlat = hasNested ? undefined : (item as Partial<ShipCursorCalibration> | undefined);
      return [
        length,
        {
          horizontal: {
            ...defaults[length].horizontal,
            ...(hasNested
              ? (item as { horizontal?: Partial<ShipCursorCalibration> }).horizontal ?? {}
              : legacyFlat ?? {}),
          },
          vertical: {
            ...defaults[length].vertical,
            ...(hasNested
              ? (item as { vertical?: Partial<ShipCursorCalibration> }).vertical ?? {}
              : legacyFlat ?? {}),
          },
        },
      ];
    })
  ) as ShipVisualCalibrationMap;
  return normalizeShipVisualCalibrationMap(merged);
}

function normalizePlacementUiCalibrationCandidate(candidate: unknown): PlacementUiCalibration {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ...DEFAULT_PLACEMENT_UI_CALIBRATION };
  }
  return normalizePlacementUiCalibration({
    ...DEFAULT_PLACEMENT_UI_CALIBRATION,
    ...(candidate as Partial<PlacementUiCalibration>),
  });
}

function normalizeHitMarkerCalibrationMapCandidate(candidate: unknown): HitMarkerCalibrationMap {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return createDefaultHitMarkerCalibrationMap();
  }
  const parsed = candidate as Record<string, Partial<HitMarkerCalibration> | undefined>;
  const defaults = createDefaultHitMarkerCalibrationMap();
  return Object.fromEntries(
    HIT_MARKER_IDS.map((id) => [
      id,
      normalizeHitMarkerCalibration({
        ...defaults[id],
        ...(parsed[id] ?? {}),
      }),
    ])
  ) as HitMarkerCalibrationMap;
}

function normalizeForkVariantCalibrationMapCandidate(candidate: unknown): ForkVariantCalibrationMap {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return createDefaultForkVariantCalibrationMap();
  }
  const parsed = candidate as Record<string, Partial<ForkVariantCalibration> | undefined>;
  const defaults = createDefaultForkVariantCalibrationMap();
  return Object.fromEntries(
    FORK_VARIANT_IDS.map((id) => [
      id,
      normalizeForkVariantCalibration({
        ...defaults[id],
        ...(parsed[id] ?? {}),
        href: resolveForkHref(String((parsed[id]?.href ?? defaults[id].href) ?? "")),
      }),
    ])
  ) as ForkVariantCalibrationMap;
}

function normalizeSharedCalibrationSnapshot(candidate: unknown): SharedCalibrationSnapshot | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const parsed = candidate as Partial<Record<keyof SharedCalibrationSnapshot, unknown>>;
  return {
    uiCalibration: normalizeUiCalibrationCandidate(parsed.uiCalibration),
    shipVisualCalibration: normalizeShipVisualCalibrationCandidate(
      parsed.shipVisualCalibration
    ),
    placementUiCalibration: normalizePlacementUiCalibrationCandidate(
      parsed.placementUiCalibration
    ),
    hitMarkerCalibrationMap: normalizeHitMarkerCalibrationMapCandidate(
      parsed.hitMarkerCalibrationMap
    ),
    forkVariantCalibrationMap: normalizeForkVariantCalibrationMapCandidate(
      parsed.forkVariantCalibrationMap
    ),
    carpetBoardBoundary: normalizeSharedRecordCandidate(parsed.carpetBoardBoundary),
    spriteTransformMap: normalizeSharedRecordCandidate(parsed.spriteTransformMap),
  };
}

function buildSharedCalibrationSnapshot(
  values: SharedCalibrationSnapshot
): SharedCalibrationSnapshot {
  return {
    uiCalibration: normalizeUiCalibration(values.uiCalibration),
    shipVisualCalibration: normalizeShipVisualCalibrationMap(values.shipVisualCalibration),
    placementUiCalibration: normalizePlacementUiCalibration(values.placementUiCalibration),
    hitMarkerCalibrationMap: normalizeHitMarkerCalibrationMapCandidate(
      values.hitMarkerCalibrationMap
    ),
    forkVariantCalibrationMap: normalizeForkVariantCalibrationMapCandidate(
      values.forkVariantCalibrationMap
    ),
    carpetBoardBoundary: normalizeSharedRecordCandidate(values.carpetBoardBoundary),
    spriteTransformMap: normalizeSharedRecordCandidate(values.spriteTransformMap),
  };
}

function createDefaultSharedCalibrationSnapshot(): SharedCalibrationSnapshot {
  return {
    uiCalibration: normalizeUiCalibration(cloneUiCalibration(DEFAULT_UI_CALIBRATION)),
    shipVisualCalibration: createDefaultShipVisualCalibrationMap(),
    placementUiCalibration: { ...DEFAULT_PLACEMENT_UI_CALIBRATION },
    hitMarkerCalibrationMap: createDefaultHitMarkerCalibrationMap(),
    forkVariantCalibrationMap: createDefaultForkVariantCalibrationMap(),
    carpetBoardBoundary: null,
    spriteTransformMap: null,
  };
}

function serializeSharedCalibrationSnapshot(snapshot: SharedCalibrationSnapshot): string {
  return JSON.stringify(buildSharedCalibrationSnapshot(snapshot));
}

function areShipCursorCalibrationsEqual(
  a: ShipCursorCalibration,
  b: ShipCursorCalibration
): boolean {
  return (
    a.deckSizePx === b.deckSizePx &&
    a.thicknessPx === b.thicknessPx &&
    a.minLengthPx === b.minLengthPx &&
    a.anchorXPct === b.anchorXPct &&
    a.anchorYPct === b.anchorYPct &&
    a.offsetXPx === b.offsetXPx &&
    a.offsetYPx === b.offsetYPx &&
    a.rotationDeg === b.rotationDeg &&
    a.shadowAngleDeg === b.shadowAngleDeg &&
    a.shadowOpacity === b.shadowOpacity &&
    a.shadowBlurPx === b.shadowBlurPx
  );
}

function buildShipCursorCalibrationFromVisual(
  length: number,
  orientation: "horizontal" | "vertical",
  visual: PlacementShipVisual,
  boardScale = 1
): ShipCursorCalibration {
  const safeScale = Math.max(0.01, boardScale);
  const longSide = orientation === "horizontal" ? visual.width : visual.height;
  const shortSide = orientation === "horizontal" ? visual.height : visual.width;
  return normalizeShipCursorCalibration({
    deckSizePx: Math.max(24, longSide / Math.max(1, length) / safeScale),
    thicknessPx: Math.max(16, shortSide / safeScale),
    minLengthPx: Math.max(30, longSide / safeScale),
    anchorXPct: visual.anchorXPct,
    anchorYPct: visual.anchorYPct,
    offsetXPx: (visual.x - visual.baseX) / safeScale,
    offsetYPx: (visual.y - visual.baseY) / safeScale,
    rotationDeg: visual.rotationDeg,
    shadowAngleDeg: visual.shadowAngleDeg,
    shadowOpacity: visual.shadowOpacity,
    shadowBlurPx: visual.shadowBlurPx / safeScale,
  });
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
  return ONLINE_PLACEMENT_FLEET.map((length, index) => ({
    id: `ship-${index}-${length}`,
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
  ignoreShipId?: string
): number[][] {
  const grid = createGrid<number>(WATER);
  let shipId = 0;
  for (const ship of draftShips) {
    if (!ship.placed) continue;
    if (ignoreShipId !== undefined && ship.id === ignoreShipId) continue;
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

function getPlacementOriginFromCenter(
  centerRow: number,
  centerCol: number,
  length: number,
  horizontal: boolean
): { row: number; col: number } {
  const centerOffset = Math.floor(length / 2);
  if (horizontal) {
    const row = Math.round(clampNumber(centerRow, 0, BOARD_SIZE - 1));
    const col = Math.round(clampNumber(centerCol - centerOffset, 0, BOARD_SIZE - length));
    return { row, col };
  }
  const row = Math.round(clampNumber(centerRow - centerOffset, 0, BOARD_SIZE - length));
  const col = Math.round(clampNumber(centerCol, 0, BOARD_SIZE - 1));
  return { row, col };
}

function convertBoardCenterToFramePx(
  center: { x: number; y: number } | undefined,
  frame: HTMLDivElement | null
): { x: number; y: number } | null {
  if (!center || !frame) return null;
  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (center.x / CARPET_IMAGE_WIDTH) * rect.width,
    y: (center.y / CARPET_IMAGE_HEIGHT) * rect.height,
  };
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
      const occupied = buildPlacementGrid(next, ship.id);
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
            const occupied = buildPlacementGrid(next, ship.id);
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
      botShotsLeft: 0,
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
      botShotsLeft: 0,
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
    botShotsLeft: SHOTS_PER_TURN,
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
        botShotsLeft: SHOTS_PER_TURN,
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
    botShotsLeft: 0,
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

function resolveBotSingleShot(state: GameState, difficulty: BotDifficulty): GameState {
  if (state.turn !== "bot") return state;

  const nextState: GameState = {
    ...state,
    botRadar: cloneGrid(state.botRadar),
    botTried: cloneGrid(state.botTried),
    playerShipHits: [...state.playerShipHits],
    log: [...state.log],
  };

  const target = chooseBotShot(nextState, difficulty);
  if (!target) {
    return {
      ...nextState,
      turn: "player",
      shotsLeft: SHOTS_PER_TURN,
      botShotsLeft: 0,
      status: "Your turn: fire 3 shots.",
      log: nextState.log.slice(0, 12),
      round: state.round + 1,
    };
  }

  nextState.botTried[target.row][target.col] = true;
  nextState.botShotsFired += 1;
  const shipId = nextState.playerShipGrid[target.row][target.col];
  const coord = formatCoord(target.row, target.col);

  if (shipId !== WATER) {
    nextState.botRadar[target.row][target.col] = "hit";
    nextState.playerShipHits[shipId] += 1;
    nextState.botHits += 1;
    nextState.log.unshift(`Bot hit your ship at ${coord}.`);
  } else {
    nextState.botRadar[target.row][target.col] = "miss";
    nextState.log.unshift(`Bot missed at ${coord}.`);
  }

  if (isFleetDestroyed(nextState.playerShipHits, nextState.playerShipLengths)) {
    return {
      ...nextState,
      turn: "finished",
      winner: "bot",
      shotsLeft: 0,
      botShotsLeft: 0,
      status: "Bot wins this match.",
      log: nextState.log.slice(0, 12),
    };
  }

  const botShotsLeft = Math.max(1, state.botShotsLeft || SHOTS_PER_TURN) - 1;
  if (botShotsLeft > 0) {
    return {
      ...nextState,
      turn: "bot",
      shotsLeft: 0,
      botShotsLeft,
      status: `Bot turn: ${botShotsLeft} shot(s) left...`,
      log: nextState.log.slice(0, 12),
    };
  }

  return {
    ...nextState,
    turn: "player",
    shotsLeft: SHOTS_PER_TURN,
    botShotsLeft: 0,
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
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isDoorOverlayVisible, setIsDoorOverlayVisible] = useState<boolean>(true);
  const [isDoorOpened, setIsDoorOpened] = useState<boolean>(false);
  const [isSceneDimmed, setIsSceneDimmed] = useState<boolean>(true);
  const [uiCalibration, setUiCalibration] = useState<UiCalibrationConfig>(() =>
    readStoredUiCalibration()
  );
  const [uiCalibrationDraft, setUiCalibrationDraft] = useState<UiCalibrationConfig>(() =>
    readStoredUiCalibration()
  );
  const [placementUiCalibration, setPlacementUiCalibration] = useState<PlacementUiCalibration>(
    () => readStoredPlacementUiCalibration()
  );
  const [hitMarkerCalibrationMap, setHitMarkerCalibrationMap] =
    useState<HitMarkerCalibrationMap>(() => readStoredHitMarkerCalibrationMap());
  const [forkVariantCalibrationMap, setForkVariantCalibrationMap] =
    useState<ForkVariantCalibrationMap>(() => readStoredForkVariantCalibrationMap());
  const [displayPerspective, setDisplayPerspective] = useState<"player" | "opponent">(
    "player"
  );
  const [turnSwapPhase, setTurnSwapPhase] = useState<
    "stable" | "waiting" | "fade-out" | "fade-in"
  >("stable");
  const [isFocusedCalibrationOpen, setIsFocusedCalibrationOpen] = useState<boolean>(false);
  const [isImpactCalibrationOpen, setIsImpactCalibrationOpen] = useState<boolean>(false);
  const [impactCalibrationTarget, setImpactCalibrationTarget] = useState<"hit" | "fork">(
    "hit"
  );
  const [selectedHitMarkerId, setSelectedHitMarkerId] = useState<HitMarkerId>("hit-1");
  const [selectedForkVariantId, setSelectedForkVariantId] =
    useState<ForkVariantId>("fork-1");
  const [hitMarkerDragState, setHitMarkerDragState] = useState<HitMarkerDragState | null>(null);
  const [selectedMenuCalibrationKey, setSelectedMenuCalibrationKey] =
    useState<MenuCalibrationKey>("startButton");
  const [shipVisualCalibration, setShipVisualCalibration] = useState<ShipVisualCalibrationMap>(() =>
    readStoredShipVisualCalibration()
  );
  const [shipVisualCalibrationDraft, setShipVisualCalibrationDraft] = useState<ShipVisualCalibrationMap>(
    () => readStoredShipVisualCalibration()
  );
  const [calibrationDebugTick, setCalibrationDebugTick] = useState<number>(0);
  const shipVisualCalibrationDraftRef = useRef<ShipVisualCalibrationMap>(
    cloneShipVisualCalibrationMap(readStoredShipVisualCalibration())
  );
  const [isUiCalibrationMode, setIsUiCalibrationMode] = useState<boolean>(false);
  const [activePlacedVisualShipId, setActivePlacedVisualShipId] = useState<string | null>(null);
  const [placedShipVisualDragState, setPlacedShipVisualDragState] =
    useState<PlacedShipVisualDragState | null>(null);
  const isUiCalibrationModeRef = useRef<boolean>(false);

  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [roomView, setRoomView] = useState<RoomViewPayload | null>(null);
  const [joinCode, setJoinCode] = useState<string>("");
  const [roomMode, setRoomMode] = useState<RoomMode>("classic");
  const [soloPlacementActive, setSoloPlacementActive] = useState<boolean>(false);
  const [soloBattleStarted, setSoloBattleStarted] = useState<boolean>(false);
  const [soloPlacementDifficulty, setSoloPlacementDifficulty] = useState<BotDifficulty>(
    readStoredDifficulty()
  );
  const [placementDraft, setPlacementDraft] = useState<OnlinePlacementShipDraft[]>(
    () => createOnlinePlacementDraft()
  );
  const [soloBattleShipVisuals, setSoloBattleShipVisuals] = useState<SoloBattleShipVisual[]>(
    []
  );
  const [selectedPlacementShipId, setSelectedPlacementShipId] = useState<string | null>(null);
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
  const hitShipSoundRef = useRef<HTMLAudioElement | null>(null);
  const placeShipSoundRef = useRef<HTMLAudioElement | null>(null);
  const themeSoundRef = useRef<HTMLAudioElement | null>(null);
  const hmmSoundRef = useRef<HTMLAudioElement | null>(null);
  const laughSoundRef = useRef<HTMLAudioElement | null>(null);
  const buttonSoundRef = useRef<HTMLAudioElement | null>(null);
  const missEventCountRef = useRef<number>(0);
  const hitEventCountRef = useRef<number>(0);
  const radarSnapshotRef = useRef<Mark[][]>(createGrid<Mark>("unknown"));
  const defenseRadarSnapshotRef = useRef<Mark[][]>(createGrid<Mark>("unknown"));
  const onlineRadarSnapshotRef = useRef<Mark[][]>(createGrid<Mark>("unknown"));
  const onlineDefenseRadarSnapshotRef = useRef<Mark[][]>(createGrid<Mark>("unknown"));
  const enemyShipHitsSnapshotRef = useRef<number[]>(Array.from({ length: FLEET.length }, () => 0));
  const lastPlacementSignatureRef = useRef<string>("");
  const boardFrameRef = useRef<HTMLDivElement | null>(null);
  const turnSwapTimersRef = useRef<number[]>([]);
  const calibrationSyncAttemptedRef = useRef<boolean>(false);
  const [carpetBoardReloadToken, setCarpetBoardReloadToken] = useState<number>(0);
  const [markerSample, setMarkerSample] = useState<{
    centerX: number;
    centerY: number;
    holeSize: number;
  }>({
    centerX: CARPET_IMAGE_WIDTH * 0.5,
    centerY: CARPET_IMAGE_HEIGHT * 0.5,
    holeSize: 64,
  });
  const [boardFrameSize, setBoardFrameSize] = useState<{ width: number; height: number }>({
    width: BOARD_FRAME_REFERENCE_WIDTH,
    height: Math.round((BOARD_FRAME_REFERENCE_WIDTH * CARPET_IMAGE_HEIGHT) / CARPET_IMAGE_WIDTH),
  });
  const boardScaleRef = useRef<number>(1);
  const lastPointerPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPlacementTimerRef = useRef<number | null>(null);
  const boardFrameScale = useMemo(
    () => clampNumber(boardFrameSize.width / BOARD_FRAME_REFERENCE_WIDTH, 0.2, 3),
    [boardFrameSize.width]
  );
  const boardScaleX = useMemo(
    () => boardFrameSize.width / CARPET_IMAGE_WIDTH,
    [boardFrameSize.width]
  );
  const boardScaleY = useMemo(
    () => boardFrameSize.height / CARPET_IMAGE_HEIGHT,
    [boardFrameSize.height]
  );

  const socketUrl = useMemo(() => {
    const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
    if (fromEnv) return fromEnv;
    if (typeof window !== "undefined") {
      const host = window.location.hostname.toLowerCase();
      if (host.endsWith(".up.railway.app")) {
        return FALLBACK_SOCKET_URL_PROD;
      }
    }
    return FALLBACK_SOCKET_URL_LOCAL;
  }, []);
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || FALLBACK_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;
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

  function clearPendingPlacementTimer(): void {
    if (pendingPlacementTimerRef.current === null) return;
    window.clearTimeout(pendingPlacementTimerRef.current);
    pendingPlacementTimerRef.current = null;
  }

  function clearTurnSwapTimers(): void {
    if (turnSwapTimersRef.current.length === 0) return;
    for (const timerId of turnSwapTimersRef.current) {
      window.clearTimeout(timerId);
    }
    turnSwapTimersRef.current = [];
  }

  function schedulePlacementCellClick(
    row: number,
    col: number,
    center?: { x: number; y: number }
  ): void {
    clearPendingPlacementTimer();
    handlePlacementCellClick(row, col, center);
  }

  useEffect(() => {
    return () => {
      if (pendingPlacementTimerRef.current !== null) {
        window.clearTimeout(pendingPlacementTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (turnSwapTimersRef.current.length === 0) return;
      for (const timerId of turnSwapTimersRef.current) {
        window.clearTimeout(timerId);
      }
      turnSwapTimersRef.current = [];
    };
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
    isUiCalibrationModeRef.current = isUiCalibrationMode;
  }, [isUiCalibrationMode]);

  useEffect(() => {
    const node = boardFrameRef.current;
    if (!node) return;

    const updateSize = (): void => {
      const rect = node.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      setBoardFrameSize((prev) => {
        if (Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5) {
          return prev;
        }
        return { width, height };
      });
    };

    updateSize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateSize) : null;
    resizeObserver?.observe(node);
    window.addEventListener("resize", updateSize);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    const prevScale = boardScaleRef.current;
    if (!Number.isFinite(prevScale) || prevScale <= 0) {
      boardScaleRef.current = boardFrameScale;
      return;
    }
    if (Math.abs(boardFrameScale - prevScale) < 0.001) return;
    const ratio = boardFrameScale / prevScale;
    boardScaleRef.current = boardFrameScale;

    setPlacementDraft((prev) =>
      prev.map((ship) => {
        if (!ship.visual) return ship;
        return {
          ...ship,
          visual: {
            ...ship.visual,
            baseX: ship.visual.baseX * ratio,
            baseY: ship.visual.baseY * ratio,
            x: ship.visual.x * ratio,
            y: ship.visual.y * ratio,
            width: ship.visual.width * ratio,
            height: ship.visual.height * ratio,
            shadowBlurPx: ship.visual.shadowBlurPx * ratio,
          },
        };
      })
    );
    setPlacementCursorPos((prev) => (prev ? { x: prev.x * ratio, y: prev.y * ratio } : prev));
    if (lastPointerPosRef.current) {
      lastPointerPosRef.current = {
        x: lastPointerPosRef.current.x * ratio,
        y: lastPointerPosRef.current.y * ratio,
      };
    }
  }, [boardFrameScale]);

  useEffect(() => {
    if (calibrationSyncAttemptedRef.current) return;
    calibrationSyncAttemptedRef.current = true;

    let cancelled = false;
    const endpoint = `${socketUrl.replace(/\/+$/, "")}/calibration`;
    const localCarpetBoardBoundary = readStoredCarpetBoardBoundaryRecord();
    const localSpriteTransformMap = readStoredRecord(SPRITE_TRANSFORM_STORAGE_KEY);
    const localSnapshot = buildSharedCalibrationSnapshot({
      uiCalibration,
      shipVisualCalibration,
      placementUiCalibration,
      hitMarkerCalibrationMap,
      forkVariantCalibrationMap,
      carpetBoardBoundary: localCarpetBoardBoundary,
      spriteTransformMap: localSpriteTransformMap,
    });
    const localHasCustomCalibration =
      serializeSharedCalibrationSnapshot(localSnapshot) !==
      serializeSharedCalibrationSnapshot(createDefaultSharedCalibrationSnapshot());

    const applySnapshot = (snapshot: SharedCalibrationSnapshot): void => {
      if (cancelled) return;
      setUiCalibration(snapshot.uiCalibration);
      setUiCalibrationDraft(cloneUiCalibration(snapshot.uiCalibration));
      setShipVisualCalibration(snapshot.shipVisualCalibration);
      setShipVisualCalibrationDraftSync(cloneShipVisualCalibrationMap(snapshot.shipVisualCalibration));
      setPlacementUiCalibration(snapshot.placementUiCalibration);
      setHitMarkerCalibrationMap(snapshot.hitMarkerCalibrationMap);
      setForkVariantCalibrationMap(snapshot.forkVariantCalibrationMap);
      try {
        const shouldReloadBoard =
          Boolean(snapshot.carpetBoardBoundary) || Boolean(snapshot.spriteTransformMap);
        localStorage.setItem(UI_CALIBRATION_STORAGE_KEY, JSON.stringify(snapshot.uiCalibration));
        writeStoredShipVisualCalibration(snapshot.shipVisualCalibration);
        writeStoredPlacementUiCalibration(snapshot.placementUiCalibration);
        writeStoredHitMarkerCalibrationMap(snapshot.hitMarkerCalibrationMap);
        writeStoredForkVariantCalibrationMap(snapshot.forkVariantCalibrationMap);
        if (snapshot.carpetBoardBoundary) {
          const serializedBoundary = JSON.stringify(snapshot.carpetBoardBoundary);
          localStorage.setItem(CARPET_BOARD_BOUNDARY_STORAGE_KEY, serializedBoundary);
          for (const legacyKey of CARPET_BOARD_BOUNDARY_LEGACY_KEYS) {
            localStorage.setItem(legacyKey, serializedBoundary);
          }
        }
        if (snapshot.spriteTransformMap) {
          localStorage.setItem(
            SPRITE_TRANSFORM_STORAGE_KEY,
            JSON.stringify(snapshot.spriteTransformMap)
          );
        }
        if (shouldReloadBoard) {
          setCarpetBoardReloadToken((prev) => prev + 1);
        }
      } catch {
        // Ignore storage failures.
      }
    };

    const syncSharedCalibration = async (): Promise<boolean> => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as SharedCalibrationResponse;
          const sharedSnapshot = normalizeSharedCalibrationSnapshot(payload.calibration);
          if (sharedSnapshot) {
            applySnapshot(sharedSnapshot);
            const mergedSnapshot = buildSharedCalibrationSnapshot({
              ...sharedSnapshot,
              carpetBoardBoundary:
                sharedSnapshot.carpetBoardBoundary ?? localSnapshot.carpetBoardBoundary,
              spriteTransformMap:
                sharedSnapshot.spriteTransformMap ?? localSnapshot.spriteTransformMap,
            });
            if (
              serializeSharedCalibrationSnapshot(mergedSnapshot) !==
              serializeSharedCalibrationSnapshot(sharedSnapshot)
            ) {
              await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ calibration: mergedSnapshot }),
              });
            }
            return true;
          }
        }
      } catch {
        // Ignore GET failures and retry.
      }

      if (!localHasCustomCalibration) return false;

      try {
        const post = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ calibration: localSnapshot }),
        });
        return post.ok;
      } catch {
        return false;
      }
    };

    let retryTimer: number | null = null;
    let attempts = 0;
    const maxAttempts = 30;
    const attemptSync = (): void => {
      if (cancelled) return;
      attempts += 1;
      void syncSharedCalibration().then((done) => {
        if (cancelled || done) return;
        if (attempts >= maxAttempts) return;
        retryTimer = window.setTimeout(attemptSync, 2000);
      });
    };
    attemptSync();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    forkVariantCalibrationMap,
    hitMarkerCalibrationMap,
    placementUiCalibration,
    shipVisualCalibration,
    socketUrl,
    uiCalibration,
  ]);

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
              if (!isUiCalibrationModeRef.current) {
                setGameMode("online");
                setOnlineNotice(`Joined room from invite: ${response.roomCode}`);
                setIsOnlineLobbyOpen(true);
              }
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
      if (!isUiCalibrationModeRef.current) {
        setGameMode("online");
        if (payload.phase === "placement" || payload.phase === "playing") {
          setIsOnlineLobbyOpen(false);
        }
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

    const hitShipAudio = new Audio(FALL_SOUND_URL);
    hitShipAudio.preload = "auto";
    hitShipAudio.volume = 0.7;
    hitShipSoundRef.current = hitShipAudio;

    const placeShipAudio = new Audio(FALL_SOUND_URL);
    placeShipAudio.preload = "auto";
    placeShipAudio.volume = 0.35;
    placeShipSoundRef.current = placeShipAudio;

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
        hitShipSoundRef,
        placeShipSoundRef,
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
    writeStoredPlacementUiCalibration(placementUiCalibration);
  }, [placementUiCalibration]);

  useEffect(() => {
    writeStoredHitMarkerCalibrationMap(hitMarkerCalibrationMap);
  }, [hitMarkerCalibrationMap]);

  useEffect(() => {
    writeStoredForkVariantCalibrationMap(forkVariantCalibrationMap);
  }, [forkVariantCalibrationMap]);

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
    if (!authUser) return;
    if (isLoginModalOpen) setIsLoginModalOpen(false);
  }, [authUser, isLoginModalOpen]);

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

        if (after === "miss") {
          playSound(impactSoundRef);
          missEventCountRef.current += 1;
          if (missEventCountRef.current % 3 === 0) {
            playSound(hmmSoundRef);
          }
          continue;
        }

        if (after === "hit") {
          playSound(hitShipSoundRef);
          newHitEffects.push({
            id: `solo-attack-${Date.now()}-${row}-${col}-${Math.random()
              .toString(16)
              .slice(2, 6)}`,
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
      onlineDefenseRadarSnapshotRef.current = createGrid<Mark>("unknown");
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

        if (after === "hit") {
          playSound(hitShipSoundRef);
          newHitEffects.push({
            id: `online-attack-${Date.now()}-${row}-${col}-${Math.random()
              .toString(16)
              .slice(2, 6)}`,
            row,
            col,
            startedAtMs: Date.now(),
          });
        } else if (after === "miss") {
          playSound(impactSoundRef);
        }
      }
    }

    appendHitEffects(newHitEffects);
    onlineRadarSnapshotRef.current = nextRadar.map((row) => row.slice());
  }, [appendHitEffects, gameMode, playSound, roomView?.playerRadar]);

  useEffect(() => {
    if (gameMode !== "online") {
      onlineDefenseRadarSnapshotRef.current = createGrid<Mark>("unknown");
      return;
    }

    const nextRadar = roomView?.defenseRadar ?? createGrid<Mark>("unknown");
    const prevRadar = onlineDefenseRadarSnapshotRef.current;
    const newHitEffects: HitEffect[] = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const before = prevRadar[row]?.[col] ?? "unknown";
        const after = nextRadar[row]?.[col] ?? "unknown";
        if (before !== "unknown" || after === "unknown") continue;

        if (after === "hit") {
          playSound(hitShipSoundRef);
          newHitEffects.push({
            id: `online-defense-${Date.now()}-${row}-${col}-${Math.random()
              .toString(16)
              .slice(2, 6)}`,
            row,
            col,
            startedAtMs: Date.now(),
          });
        } else if (after === "miss") {
          playSound(impactSoundRef);
        }
      }
    }

    appendHitEffects(newHitEffects);
    onlineDefenseRadarSnapshotRef.current = nextRadar.map((row) => row.slice());
  }, [appendHitEffects, gameMode, playSound, roomView?.defenseRadar]);

  useEffect(() => {
    if (gameMode !== "solo") {
      defenseRadarSnapshotRef.current = createGrid<Mark>("unknown");
      return;
    }

    const nextRadar = game.botRadar;
    const prevRadar = defenseRadarSnapshotRef.current;
    const newHitEffects: HitEffect[] = [];

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const before = prevRadar[row]?.[col] ?? "unknown";
        const after = nextRadar[row]?.[col] ?? "unknown";
        if (before !== "unknown" || after === "unknown") continue;

        if (after === "hit") {
          playSound(hitShipSoundRef);
          newHitEffects.push({
            id: `solo-defense-${Date.now()}-${row}-${col}-${Math.random()
              .toString(16)
              .slice(2, 6)}`,
            row,
            col,
            startedAtMs: Date.now(),
          });
        } else if (after === "miss") {
          playSound(impactSoundRef);
        }
      }
    }

    appendHitEffects(newHitEffects);
    defenseRadarSnapshotRef.current = nextRadar.map((row) => row.slice());
  }, [appendHitEffects, game.botRadar, gameMode, playSound]);

  useEffect(() => {
    if (gameMode !== "solo") return;
    if (game.turn !== "bot") return;
    if (game.winner !== null) return;
    if (displayPerspective !== "opponent") return;
    if (turnSwapPhase !== "stable") return;
    const botShotDelayMs = game.botShotsLeft >= SHOTS_PER_TURN ? 0 : BOT_TURN_DELAY_MS;
    const timer = window.setTimeout(() => {
      setGame((prev) => resolveBotSingleShot(prev, botDifficulty));
    }, botShotDelayMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [
    botDifficulty,
    displayPerspective,
    game.botShotsLeft,
    game.turn,
    game.winner,
    gameMode,
    turnSwapPhase,
  ]);

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
  const onlinePlayerRadar = roomView?.playerRadar ?? createGrid<Mark>("unknown");
  const onlineDefenseRadar = roomView?.defenseRadar ?? createGrid<Mark>("unknown");
  const isOnlinePlacementPhase = gameMode === "online" && roomView?.phase === "placement";
  const isPlacementInteractionActive =
    isUiCalibrationMode ||
    soloPlacementActive ||
    (isOnlinePlacementPhase && !roomView?.yourPlacementReady);
  const placedDraftGrid = useMemo(() => buildPlacementGrid(placementDraft), [placementDraft]);
  const selectedPlacementShip =
    selectedPlacementShipId === null
      ? null
      : placementDraft.find((ship) => ship.id === selectedPlacementShipId) ?? null;
  const activeCalibrationShip =
    activePlacedVisualShipId === null
      ? null
      : placementDraft.find((ship) => ship.id === activePlacedVisualShipId) ?? null;
  const selectedPlacementLength = selectedPlacementShip?.length ?? null;
  const selectedPlacementHorizontal = selectedPlacementShip?.horizontal ?? true;
  const shipSlotRender = useMemo(() => {
    const scale = placementUiCalibration.shipSlotScale;
    const widthPct = SHIP_SLOT_WIDTH_PCT * scale;
    const heightPct = SHIP_SLOT_HEIGHT_PCT * scale;
    return {
      leftPct: SHIP_SLOT_CENTER_X_PCT - widthPct / 2,
      topPct: SHIP_SLOT_CENTER_Y_PCT - heightPct / 2,
      widthPct,
      heightPct,
    };
  }, [placementUiCalibration.shipSlotScale]);
  const activeUiCalibration = isUiCalibrationMode ? uiCalibrationDraft : uiCalibration;
  const activeShipVisualCalibration = isUiCalibrationMode
    ? shipVisualCalibrationDraft
    : shipVisualCalibration;
  const activeShipCursorCalibration =
    selectedPlacementLength !== null
      ? selectedPlacementHorizontal
        ? activeShipVisualCalibration[selectedPlacementLength].horizontal
        : activeShipVisualCalibration[selectedPlacementLength].vertical
      : selectedPlacementHorizontal
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
  const placementCursorVisual = useMemo(() => {
    if (isUiCalibrationMode) return null;
    if (selectedPlacementLength === null) return null;
    if (!placementCursorPos) return null;
    return buildPlacedShipVisual(
      selectedPlacementLength,
      selectedPlacementHorizontal ? "horizontal" : "vertical",
      placementCursorPos
    );
  }, [
    isUiCalibrationMode,
    placementCursorPos,
    selectedPlacementHorizontal,
    selectedPlacementLength,
    shipVisualCalibration,
  ]);
  const isShipPlacementComplete = allDraftShipsPlaced(placementDraft);
  const placementPreview = useMemo(() => {
    if (!isPlacementInteractionActive) return null;
    if (!selectedPlacementShip) return null;
    if (!placementHoverCell) return null;
    const origin = getPlacementOriginFromCenter(
      placementHoverCell.row,
      placementHoverCell.col,
      selectedPlacementShip.length,
      selectedPlacementShip.horizontal
    );
    const occupiedWithoutSelected = buildPlacementGrid(placementDraft, selectedPlacementShip.id);
    const valid = canPlaceDraftShip(
      occupiedWithoutSelected,
      origin.row,
      origin.col,
      selectedPlacementShip.length,
      selectedPlacementShip.horizontal
    );
    const cells = getShipCells(
      origin.row,
      origin.col,
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
  const placementDisplayShipGrid = useMemo(() => createGrid<number>(WATER), []);
  const onlineShipGrid =
    roomView?.phase === "placement"
      ? roomView.yourPlacementReady
        ? roomView.playerShipGrid
        : placementDisplayShipGrid
      : roomView?.playerShipGrid ?? createGrid<number>(WATER);
  const onlineShipHits = useMemo(
    () => deriveShipHits(onlineShipGrid, onlineDefenseRadar, WATER),
    [onlineDefenseRadar, onlineShipGrid]
  );
  const soloEmptyRadar = useMemo(() => createGrid<Mark>("unknown"), []);
  const hiddenOwnShipGrid = useMemo(() => createGrid<number>(WATER), []);
  const desiredPerspective: "player" | "opponent" = useMemo(() => {
    if (gameMode === "online") {
      if (roomView?.phase !== "playing" || roomView.winner !== null) return "player";
      return roomView.yourTurn ? "player" : "opponent";
    }
    if (soloPlacementActive || !soloBattleStarted || game.winner !== null || game.turn === "finished") {
      return "player";
    }
    return game.turn === "bot" ? "opponent" : "player";
  }, [
    game.turn,
    game.winner,
    gameMode,
    roomView?.phase,
    roomView?.winner,
    roomView?.yourTurn,
    soloBattleStarted,
    soloPlacementActive,
  ]);
  const canAnimatePerspectiveSwap =
    (gameMode === "solo" &&
      !soloPlacementActive &&
      soloBattleStarted &&
      game.winner === null &&
      (game.turn === "player" || game.turn === "bot")) ||
    (gameMode === "online" &&
      roomView?.phase === "playing" &&
      roomView?.winner === null &&
      typeof roomView?.yourTurn === "boolean");

  useEffect(() => {
    if (!canAnimatePerspectiveSwap) {
      clearTurnSwapTimers();
      setDisplayPerspective(desiredPerspective);
      setTurnSwapPhase("stable");
      return;
    }
    if (desiredPerspective === displayPerspective) return;

    clearTurnSwapTimers();
    setTurnSwapPhase("waiting");
    const fadeOutTimer = window.setTimeout(() => {
      setTurnSwapPhase("fade-out");
    }, TURN_SWAP_WAIT_MS);
    const fadeInTimer = window.setTimeout(() => {
      setDisplayPerspective(desiredPerspective);
      setTurnSwapPhase("fade-in");
    }, TURN_SWAP_WAIT_MS + TURN_SWAP_FADE_HALF_MS);
    const settleTimer = window.setTimeout(() => {
      setTurnSwapPhase("stable");
    }, TURN_SWAP_WAIT_MS + TURN_SWAP_FADE_HALF_MS * 2);
    turnSwapTimersRef.current = [fadeOutTimer, fadeInTimer, settleTimer];
  }, [canAnimatePerspectiveSwap, desiredPerspective, displayPerspective]);

  const isTurnSwapTransitionActive = canAnimatePerspectiveSwap && turnSwapPhase !== "stable";
  const isSoloPlayerTurn =
    gameMode === "solo" &&
    !soloPlacementActive &&
    game.winner === null &&
    displayPerspective === "player";
  const isSoloOpponentTurn =
    gameMode === "solo" &&
    !soloPlacementActive &&
    game.winner === null &&
    displayPerspective === "opponent";
  const isOnlinePlayerTurn =
    gameMode === "online" &&
    roomView?.phase === "playing" &&
    roomView?.winner === null &&
    displayPerspective === "player";
  const isOnlineOpponentTurn =
    gameMode === "online" &&
    roomView?.phase === "playing" &&
    roomView?.winner === null &&
    displayPerspective === "opponent";
  const soloAttackRadar = soloPlacementActive ? soloEmptyRadar : game.playerRadar;
  const soloDefenseRadar = soloPlacementActive ? soloEmptyRadar : game.botRadar;
  const soloShipGrid = soloPlacementActive ? placementDisplayShipGrid : game.playerShipGrid;
  const soloCanShoot =
    !soloPlacementActive &&
    game.turn === "player" &&
    game.winner === null &&
    displayPerspective === "player" &&
    !isTurnSwapTransitionActive;
  const hiddenEnemyShipGrid = useMemo(() => createGrid<number>(WATER), []);
  const hiddenEnemyShipHits = useMemo(() => [] as number[], []);
  const soloAttackRadarView = soloPlacementActive
    ? soloEmptyRadar
    : isSoloPlayerTurn
    ? game.playerRadar
    : soloEmptyRadar;
  const soloDefenseRadarView = soloPlacementActive
    ? soloEmptyRadar
    : isSoloOpponentTurn
    ? game.botRadar
    : soloEmptyRadar;
  const soloShipGridView = soloPlacementActive
    ? placementDisplayShipGrid
    : hiddenOwnShipGrid;
  const soloShowDefenseLayerView = soloPlacementActive ? true : isSoloOpponentTurn;
  const soloEnemyShipGridView = hiddenEnemyShipGrid;
  const soloEnemyShipHitsView = hiddenEnemyShipHits;
  const onlineAttackRadarView =
    roomView?.phase === "placement"
      ? soloEmptyRadar
      : isOnlinePlayerTurn
      ? onlinePlayerRadar
      : soloEmptyRadar;
  const onlineDefenseRadarView =
    roomView?.phase === "placement"
      ? soloEmptyRadar
      : isOnlineOpponentTurn
      ? onlineDefenseRadar
      : soloEmptyRadar;
  const onlineShipGridView =
    roomView?.phase === "placement"
      ? onlineShipGrid
      : isOnlineOpponentTurn
      ? roomView?.playerShipGrid ?? hiddenOwnShipGrid
      : hiddenOwnShipGrid;
  const onlineShowDefenseLayerView =
    roomView?.phase === "placement" ? true : isOnlineOpponentTurn;
  const onlineCanShoot =
    gameMode === "online" &&
    socketConnected &&
    roomView?.phase === "playing" &&
    roomView.yourTurn &&
    roomView.winner === null &&
    displayPerspective === "player" &&
    !isTurnSwapTransitionActive;
  const isOnlinePlaying = gameMode === "online" && roomView?.phase === "playing";
  const isSoloPlaying = gameMode === "solo" && !soloPlacementActive && game.winner === null;
  const isSoloBattleActive = isSoloPlaying && soloBattleStarted;
  const showSoloDefenseShipVisuals =
    gameMode === "solo" &&
    !soloPlacementActive &&
    displayPerspective === "opponent";
  const isUserBlueSide = gameMode === "online" ? roomView?.youRole !== "guest" : true;
  const leftHeroActive = isOnlinePlaying
    ? isUserBlueSide
      ? displayPerspective === "player"
      : displayPerspective === "opponent"
    : isSoloBattleActive && displayPerspective === "player";
  const rightHeroActive = isOnlinePlaying
    ? isUserBlueSide
      ? displayPerspective === "opponent"
      : displayPerspective === "player"
    : isSoloBattleActive && displayPerspective === "opponent";
  const boardBattleOpacity = turnSwapPhase === "fade-out" ? 0 : 1;
  const boardBattleTransitionMs =
    turnSwapPhase === "fade-out" || turnSwapPhase === "fade-in"
      ? TURN_SWAP_FADE_HALF_MS
      : 0;
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
  const selectedHitMarkerCalibration =
    hitMarkerCalibrationMap[selectedHitMarkerId] ?? DEFAULT_HIT_MARKER_CALIBRATION;
  const selectedForkVariantCalibration =
    forkVariantCalibrationMap[selectedForkVariantId] ?? DEFAULT_FORK_VARIANT_CALIBRATION;
  const activeImpactCalibration =
    impactCalibrationTarget === "hit"
      ? selectedHitMarkerCalibration
      : selectedForkVariantCalibration;
  const menuCalibrationLabels: Record<MenuCalibrationKey, string> = {
    startButton: "Start",
    onlineButton: "Online",
    offlineButton: "Offline",
    babyButton: "Baby",
    manButton: "Man",
    nightmareButton: "Nightmare",
    soundOnButton: "Sound On",
    soundButton: "Sound",
    statButton: "Statistics",
    leaderButton: "Leaderboard",
    loginButton: "Login",
  };
  const selectedMenuCalibrationRect = uiCalibration[selectedMenuCalibrationKey];
  const hitMarkerPreviewAnchor = useMemo(
    () => ({
      x: markerSample.centerX * boardScaleX,
      y: markerSample.centerY * boardScaleY,
    }),
    [boardScaleX, boardScaleY, markerSample.centerX, markerSample.centerY]
  );
  const baseMissMarkerSize = markerSample.holeSize * 2;
  const baseForkMarkerSize = markerSample.holeSize * 3.8;
  const hitMarkerPreviewSize =
    baseMissMarkerSize * selectedHitMarkerCalibration.scale * boardScaleX;
  const forkPreviewSize =
    baseForkMarkerSize * selectedForkVariantCalibration.scale * boardScaleX;
  const activePreviewSize =
    impactCalibrationTarget === "hit" ? hitMarkerPreviewSize : forkPreviewSize;
  const hitMarkerPreviewX = hitMarkerPreviewAnchor.x;
  const hitMarkerPreviewY = hitMarkerPreviewAnchor.y;
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
  const finalizeSoloPlacement = useCallback((): void => {
    const completedDraft = completeDraftWithAutoPlacement(placementDraft);
    const completedDraftWithVisuals = completedDraft.map((ship) => {
      if (!ship.placed || ship.visual) return ship;
      const centerCol = ship.col + (ship.horizontal ? ship.length / 2 : 0.5);
      const centerRow = ship.row + (ship.horizontal ? 0.5 : ship.length / 2);
      const imageCenter = {
        x: (centerCol / BOARD_SIZE) * CARPET_IMAGE_WIDTH,
        y: (centerRow / BOARD_SIZE) * CARPET_IMAGE_HEIGHT,
      };
      const frameCenter =
        convertBoardCenterToFramePx(imageCenter, boardFrameRef.current) ?? {
          x: (imageCenter.x / CARPET_IMAGE_WIDTH) * boardFrameSize.width,
          y: (imageCenter.y / CARPET_IMAGE_HEIGHT) * boardFrameSize.height,
        };
      return {
        ...ship,
        visual: buildPlacedShipVisual(
          ship.length,
          ship.horizontal ? "horizontal" : "vertical",
          frameCenter
        ),
        visualLocked: true,
      };
    });
    const placement = placementFromDraft(completedDraftWithVisuals);
    setPlacementDraft(completedDraftWithVisuals);
    setSoloBattleShipVisuals(
      completedDraftWithVisuals
        .filter((ship) => ship.placed && ship.visual)
        .map((ship) => ({
          id: ship.id,
          length: ship.length,
          horizontal: ship.horizontal,
          visual: ship.visual as PlacementShipVisual,
        }))
    );
    setSoloPlacementActive(false);
    setSelectedPlacementShipId(null);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
    lastPointerPosRef.current = null;
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
    setSoloBattleStarted(true);
    setGame(createGameState(soloPlacementDifficulty, placement));
  }, [boardFrameSize.height, boardFrameSize.width, placementDraft, soloPlacementDifficulty]);

  useEffect(() => {
    if (!soloPlacementActive) return;
    if (!allDraftShipsPlaced(placementDraft)) return;
    finalizeSoloPlacement();
  }, [finalizeSoloPlacement, placementDraft, soloPlacementActive]);

  useEffect(() => {
    if (gameMode !== "solo") return;
    radarSnapshotRef.current = game.playerRadar.map((row) => row.slice());
    defenseRadarSnapshotRef.current = game.botRadar.map((row) => row.slice());
    enemyShipHitsSnapshotRef.current = [...game.enemyShipHits];
    missEventCountRef.current = 0;
    hitEventCountRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetHitEffects();
  }, [game.id, resetHitEffects, gameMode]);

  useEffect(() => {
    shipVisualCalibrationDraftRef.current = cloneShipVisualCalibrationMap(
      shipVisualCalibrationDraft
    );
  }, [shipVisualCalibrationDraft]);

  useEffect(() => {
    const persistedUiCalibration = readStoredUiCalibration();
    const persistedShipVisualCalibration = readStoredShipVisualCalibration();
    setUiCalibration(persistedUiCalibration);
    setUiCalibrationDraft(cloneUiCalibration(persistedUiCalibration));
    setShipVisualCalibration(persistedShipVisualCalibration);
    setShipVisualCalibrationDraftSync(
      cloneShipVisualCalibrationMap(persistedShipVisualCalibration)
    );
  }, []);

  useEffect(() => {
    if (!isUiCalibrationMode) return;
    if (activePlacedVisualShipId === null) return;
    const activeShip = placementDraft.find((ship) => ship.id === activePlacedVisualShipId);
    if (!activeShip?.visual) return;
    const orientation = activeShip.horizontal ? "horizontal" : "vertical";
    const nextCalibration = buildShipCursorCalibrationFromVisual(
      activeShip.length,
      orientation,
      activeShip.visual
    );
    const current =
      shipVisualCalibrationDraftRef.current[activeShip.length][orientation];
    if (areShipCursorCalibrationsEqual(current, nextCalibration)) return;
    const nextMap = cloneShipVisualCalibrationMap(shipVisualCalibrationDraftRef.current);
    nextMap[activeShip.length][orientation] = nextCalibration;
    const normalized = normalizeShipVisualCalibrationMap(nextMap);
    setShipVisualCalibrationDraftSync(normalized);
    setShipVisualCalibration(cloneShipVisualCalibrationMap(normalized));
    writeStoredShipVisualCalibration(normalized);
  }, [activePlacedVisualShipId, isUiCalibrationMode, placementDraft]);

  useEffect(() => {
    if (isUiCalibrationMode) return;
    if (gameMode !== "online") return;
    if (roomView?.phase !== "placement") {
      clearPendingPlacementTimer();
      setPlacementHoverCell(null);
      setPlacementCursorPos(null);
      setActivePlacedVisualShipId(null);
      setPlacedShipVisualDragState(null);
      return;
    }
    if (!roomView.yourPlacementReady) {
      setPlacementDraft(createOnlinePlacementDraft());
      setSelectedPlacementShipId(null);
      setPlacementHoverCell(null);
      setPlacementCursorPos(null);
      lastPlacementSignatureRef.current = "";
    }
  }, [
    gameMode,
    isUiCalibrationMode,
    roomView?.phase,
    roomView?.roomCode,
    roomView?.yourPlacementReady,
  ]);

  useEffect(() => {
    if (isPlacementInteractionActive) return;
    clearPendingPlacementTimer();
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
  }, [isPlacementInteractionActive]);

  useEffect(() => {
    if (gameMode !== "solo") return;
    if (displayPerspective !== "opponent") return;
    if (soloPlacementActive) return;
    if (game.winner !== null) return;
    setPlacementDraft((prev) => {
      let changed = false;
      const next = prev.map((ship) => {
        if (!ship.placed || ship.visual) return ship;
        const centerCol = ship.col + (ship.horizontal ? ship.length / 2 : 0.5);
        const centerRow = ship.row + (ship.horizontal ? 0.5 : ship.length / 2);
        const imageCenter = {
          x: (centerCol / BOARD_SIZE) * CARPET_IMAGE_WIDTH,
          y: (centerRow / BOARD_SIZE) * CARPET_IMAGE_HEIGHT,
        };
        const frameCenter =
          convertBoardCenterToFramePx(imageCenter, boardFrameRef.current) ?? {
            x: (imageCenter.x / CARPET_IMAGE_WIDTH) * boardFrameSize.width,
            y: (imageCenter.y / CARPET_IMAGE_HEIGHT) * boardFrameSize.height,
          };
        changed = true;
        return {
          ...ship,
          visual: buildPlacedShipVisual(
            ship.length,
            ship.horizontal ? "horizontal" : "vertical",
            frameCenter
          ),
          visualLocked: true,
        };
      });
      return changed ? next : prev;
    });
  }, [
    boardFrameSize.height,
    boardFrameSize.width,
    displayPerspective,
    game.winner,
    gameMode,
    soloPlacementActive,
  ]);

  useEffect(() => {
    if (gameMode !== "solo") return;
    if (!soloBattleStarted) return;
    if (soloBattleShipVisuals.length > 0) return;
    const fromDraft = placementDraft
      .filter((ship) => ship.placed && ship.visual)
      .map((ship) => ({
        id: ship.id,
        length: ship.length,
        horizontal: ship.horizontal,
        visual: ship.visual as PlacementShipVisual,
      }));
    if (fromDraft.length > 0) {
      setSoloBattleShipVisuals(fromDraft);
    }
  }, [gameMode, placementDraft, soloBattleShipVisuals.length, soloBattleStarted]);

  function resetGame(nextDifficulty?: BotDifficulty): void {
    clearPendingPlacementTimer();
    clearTurnSwapTimers();
    setTurnSwapPhase("stable");
    setDisplayPerspective("player");
    const difficulty = nextDifficulty ?? botDifficulty;
    setGame(createGameState(difficulty));
    setCoachReport(null);
    setHitEffects([]);
    setGameMode("solo");
    setSoloPlacementActive(false);
    setSoloBattleStarted(false);
    setSoloBattleShipVisuals([]);
    lastPointerPosRef.current = null;
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
  }

  function beginSoloPlacement(nextDifficulty: BotDifficulty): void {
    clearPendingPlacementTimer();
    clearTurnSwapTimers();
    setTurnSwapPhase("stable");
    setDisplayPerspective("player");
    setBotDifficulty(nextDifficulty);
    setSoloPlacementDifficulty(nextDifficulty);
    setGameMode("solo");
    setSoloPlacementActive(true);
    setSoloBattleStarted(false);
    setSoloBattleShipVisuals([]);
    setPlacementDraft(createOnlinePlacementDraft());
    setSelectedPlacementShipId(null);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
    lastPointerPosRef.current = null;
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
    setCoachReport(null);
    setHitEffects([]);
  }

  function togglePlacementOrientation(): void {
    if (!isPlacementInteractionActive) return;
    if (selectedPlacementShipId === null) return;
    clearPendingPlacementTimer();
    if (isUiCalibrationMode && activePlacedVisualShipId !== null) {
      commitShipVisualCalibrationFromPlacement(activePlacedVisualShipId);
    }
    setPlacementDraft((prev) =>
      prev.map((ship) =>
        ship.id === selectedPlacementShipId
          ? { ...ship, horizontal: !ship.horizontal }
          : ship
      )
    );
  }

  function handlePlacementHover(
    row: number,
    col: number,
    center?: { x: number; y: number }
  ): void {
    if (!isPlacementInteractionActive) return;
    setPlacementHoverCell({ row, col });
    if (!isUiCalibrationMode && center) {
      const point = convertBoardCenterToFramePx(center, boardFrameRef.current);
      if (point) {
        setPlacementCursorPos(point);
      }
    }
  }

  function handlePlacementLeave(): void {
    clearPendingPlacementTimer();
    setPlacementHoverCell(null);
    if (!isUiCalibrationMode) {
      setPlacementCursorPos(null);
    }
  }

  function commitShipVisualCalibrationFromPlacement(shipId: string): void {
    if (!isUiCalibrationMode) return;
    const ship = placementDraft.find((item) => item.id === shipId);
    if (!ship?.visual) return;
    const orientation = ship.horizontal ? "horizontal" : "vertical";
    const nextForOrientation = buildShipCursorCalibrationFromVisual(
      ship.length,
      orientation,
      ship.visual
    );
    const next = cloneShipVisualCalibrationMap(shipVisualCalibrationDraftRef.current);
    next[ship.length][orientation] = nextForOrientation;
    setShipVisualCalibrationDraftSync(normalizeShipVisualCalibrationMap(next));
  }

  function selectShipForPlacement(
    shipId: string,
    orientationOverride?: "horizontal" | "vertical"
  ): void {
    if (!isPlacementInteractionActive) return;
    clearPendingPlacementTimer();
    const ship = placementDraft.find((item) => item.id === shipId);
    if (!ship) return;

    if (!isUiCalibrationMode) {
      setSelectedPlacementShipId(shipId);
      return;
    }

    if (activePlacedVisualShipId !== null) {
      commitShipVisualCalibrationFromPlacement(activePlacedVisualShipId);
    }

    const orientation = orientationOverride ?? (ship.horizontal ? "horizontal" : "vertical");
    const visual = buildPlacedShipVisual(ship.length, orientation);

    setPlacementDraft((prev) =>
      prev.map((item) =>
        item.id === shipId
          ? {
              ...item,
              placed: true,
              visual,
              visualLocked: false,
              horizontal: orientation === "horizontal",
            }
          : {
              ...item,
              placed: false,
              visual: undefined,
              visualLocked: false,
            }
      )
    );
    setSelectedPlacementShipId(shipId);
    setActivePlacedVisualShipId(shipId);
    setPlacedShipVisualDragState(null);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
  }

  function selectNextShipTypeForPlacement(
    length: number,
    orientationOverride?: "horizontal" | "vertical"
  ): void {
    if (!isPlacementInteractionActive) return;

    if (isUiCalibrationMode) {
      const activeSameType =
        activeCalibrationShip?.length === length ? activeCalibrationShip : null;
      const calibrationShip =
        activeSameType ?? placementDraft.find((item) => item.length === length);
      if (!calibrationShip) return;
      selectShipForPlacement(calibrationShip.id, orientationOverride);
      return;
    }

    const selectedSameType =
      selectedPlacementShip?.length === length && !selectedPlacementShip.placed
        ? selectedPlacementShip
        : null;
    const nextUnplaced =
      selectedSameType ??
      placementDraft.find((item) => item.length === length && !item.placed);
    if (!nextUnplaced) return;
    selectShipForPlacement(nextUnplaced.id);
  }

  function cancelSelectedPlacementShip(): void {
    clearPendingPlacementTimer();
    setSelectedPlacementShipId(null);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
  }

  function pickPlacedShipForMove(shipId: string): void {
    if (!isPlacementInteractionActive || isUiCalibrationMode) return;
    if (selectedPlacementShipId !== null) return;
    const ship = placementDraft.find((item) => item.id === shipId);
    if (!ship || !ship.placed) return;
    setSelectedPlacementShipId(shipId);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
  }

  function rotatePlacedShipForMove(shipId: string): void {
    if (!isPlacementInteractionActive || isUiCalibrationMode) return;
    if (selectedPlacementShipId !== null) return;
    const ship = placementDraft.find((item) => item.id === shipId);
    if (!ship || !ship.placed) return;
    clearPendingPlacementTimer();
    const previousVisual = ship.visual;
    setPlacementDraft((prev) =>
      prev.map((item) =>
        item.id === shipId
          ? {
              ...item,
              horizontal: !item.horizontal,
              placed: false,
              visual: undefined,
              visualLocked: false,
            }
          : item
      )
    );
    setSelectedPlacementShipId(shipId);
    setPlacementHoverCell(null);
    const nextCursorPos =
      previousVisual !== undefined
        ? { x: previousVisual.x, y: previousVisual.y }
        : null;
    setPlacementCursorPos(nextCursorPos);
    lastPointerPosRef.current = nextCursorPos;
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

  function handlePlacementCellClick(
    row: number,
    col: number,
    center?: { x: number; y: number }
  ): void {
    if (!isPlacementInteractionActive) return;
    if (isUiCalibrationMode) return;
    if (selectedPlacementShipId === null) return;
    const selected = placementDraft.find((ship) => ship.id === selectedPlacementShipId);
    if (!selected) return;

    const origin = getPlacementOriginFromCenter(
      row,
      col,
      selected.length,
      selected.horizontal
    );
    const targetRow = origin.row;
    const targetCol = origin.col;

    const occupiedWithoutSelected = buildPlacementGrid(placementDraft, selected.id);
    const valid = canPlaceDraftShip(
      occupiedWithoutSelected,
      targetRow,
      targetCol,
      selected.length,
      selected.horizontal
    );
    if (!valid) return;

    const boardCenterPoint = convertBoardCenterToFramePx(center, boardFrameRef.current);
    if (boardCenterPoint) {
      setPlacementCursorPos(boardCenterPoint);
    }
    if (center) {
      lastPointerPosRef.current = boardCenterPoint ?? lastPointerPosRef.current;
    }
    const placedVisual = buildPlacedShipVisual(
      selected.length,
      selected.horizontal ? "horizontal" : "vertical",
      boardCenterPoint ?? undefined
    );
    const next = placementDraft.map((ship) =>
      ship.id === selected.id
        ? {
            ...ship,
            row: targetRow,
            col: targetCol,
            placed: true,
            visual: placedVisual,
            visualLocked: !isUiCalibrationMode,
          }
        : ship
    );
    playSound(placeShipSoundRef);
    setPlacementDraft(next);
    setSelectedPlacementShipId(null);
    setPlacementHoverCell(null);
    if (isOnlinePlacementPhase) {
      submitPlacementIfReady(next);
    }
  }

  useEffect(() => {
    if (!isPlacementInteractionActive || isUiCalibrationMode) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (selectedPlacementShipId === null) return;
      event.preventDefault();
      cancelSelectedPlacementShip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPlacementInteractionActive, isUiCalibrationMode, selectedPlacementShipId]);

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

  function handleCellClick(
    row: number,
    col: number,
    center?: { x: number; y: number }
  ): void {
    if (isUiCalibrationMode) return;
    if (soloPlacementActive) {
      schedulePlacementCellClick(row, col, center);
      return;
    }
    if (gameMode === "online") {
      if (roomView?.phase === "placement") {
        schedulePlacementCellClick(row, col, center);
        return;
      }
      clearPendingPlacementTimer();
      handleOnlineShot(row, col);
      return;
    }
    clearPendingPlacementTimer();
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
    if (!authUser) {
      setOnlineNotice("Authorize with Google first.");
      void handleGoogleLogin();
      return;
    }
    setIsOnlineLobbyOpen(true);
    setGameMode("online");
  }

  function openLoginModal(): void {
    playButtonClickSound();
    setIsMenuOpen(false);
    void handleGoogleLogin();
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

  function handleQuickSoloStart(nextDifficulty: BotDifficulty): void {
    playButtonClickSound();
    clearPendingPlacementTimer();
    setBotDifficulty(nextDifficulty);
    setSoloPlacementDifficulty(nextDifficulty);
    setGameMode("solo");
    setSoloPlacementActive(false);
    setSoloBattleStarted(true);
    setPlacementDraft(createOnlinePlacementDraft());
    setSelectedPlacementShipId(null);
    setPlacementHoverCell(null);
    setPlacementCursorPos(null);
    lastPointerPosRef.current = null;
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
    setCoachReport(null);
    setHitEffects([]);
    setGame(createGameState(nextDifficulty));
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
    if (!authUser) {
      setOnlineNotice("Authorize with Google first.");
      void handleGoogleLogin();
      return;
    }
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
    if (!authUser) {
      setOnlineNotice("Authorize with Google first.");
      void handleGoogleLogin();
      return;
    }
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
    if (!authUser) {
      setOnlineNotice("Authorize with Google first.");
      void handleGoogleLogin();
      return;
    }
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
    clearPendingPlacementTimer();
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
    clearPendingPlacementTimer();
    if (!allDraftShipsPlaced(placementDraft)) {
      setOnlineNotice("Place all ships first.");
      return;
    }
    submitPlacementIfReady(placementDraft);
  }

  function leaveOnlineRoom(): void {
    clearPendingPlacementTimer();
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
    setShipVisualCalibrationDraftSync(cloneShipVisualCalibrationMap(shipVisualCalibration));
    setIsUiCalibrationMode(true);
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
    setStartPanel("online");
    setIsMenuOpen(true);
  }

  function cancelUiCalibrationMode(): void {
    setUiCalibrationDraft(cloneUiCalibration(uiCalibration));
    setShipVisualCalibrationDraftSync(cloneShipVisualCalibrationMap(shipVisualCalibration));
    setIsUiCalibrationMode(false);
    setSelectedPlacementShipId(null);
    setPlacementCursorPos(null);
    setPlacementHoverCell(null);
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
  }

  function saveUiCalibrationMode(): void {
    const normalized = normalizeUiCalibration(uiCalibrationDraft);
    const nextShipVisualDraft = cloneShipVisualCalibrationMap(
      shipVisualCalibrationDraftRef.current
    );
    for (const ship of placementDraft) {
      if (!ship.visual) continue;
      const orientation = ship.horizontal ? "horizontal" : "vertical";
      nextShipVisualDraft[ship.length][orientation] = buildShipCursorCalibrationFromVisual(
        ship.length,
        orientation,
        ship.visual,
        boardFrameScale
      );
    }
    const normalizedShipVisual = normalizeShipVisualCalibrationMap(nextShipVisualDraft);
    setUiCalibration(normalized);
    setUiCalibrationDraft(cloneUiCalibration(normalized));
    setShipVisualCalibration(normalizedShipVisual);
    setShipVisualCalibrationDraftSync(cloneShipVisualCalibrationMap(normalizedShipVisual));
    setIsUiCalibrationMode(false);
    setSelectedPlacementShipId(null);
    setPlacementCursorPos(null);
    setPlacementHoverCell(null);
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
    if (typeof window !== "undefined") {
      localStorage.setItem(UI_CALIBRATION_STORAGE_KEY, JSON.stringify(normalized));
      writeStoredShipVisualCalibration(normalizedShipVisual);
    }
  }

  function resetUiCalibrationMode(): void {
    setUiCalibrationDraft(cloneUiCalibration(DEFAULT_UI_CALIBRATION));
    const defaults = createDefaultShipVisualCalibrationMap();
    setShipVisualCalibrationDraftSync(defaults);
    setShipVisualCalibration(defaults);
    writeStoredShipVisualCalibration(defaults);
    setSelectedPlacementShipId(null);
    setPlacementCursorPos(null);
    setPlacementHoverCell(null);
    setActivePlacedVisualShipId(null);
    setPlacedShipVisualDragState(null);
  }

  function updatePlacementUiCalibration(patch: Partial<PlacementUiCalibration>): void {
    setPlacementUiCalibration((prev) =>
      normalizePlacementUiCalibration({
        ...prev,
        ...patch,
      })
    );
  }

  function updateMenuCalibrationRect(
    key: MenuCalibrationKey,
    patch: Partial<CalibrationRect>
  ): void {
    setUiCalibration((prev) => {
      const next = normalizeUiCalibration({
        ...prev,
        [key]: {
          ...prev[key],
          ...patch,
        },
      });
      if (typeof window !== "undefined") {
        localStorage.setItem(UI_CALIBRATION_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
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

  const updateHitMarkerCalibration = useCallback(
    (id: HitMarkerId, patch: Partial<HitMarkerCalibration>): void => {
      setHitMarkerCalibrationMap((prev) => ({
        ...prev,
        [id]: normalizeHitMarkerCalibration({
          ...(prev[id] ?? DEFAULT_HIT_MARKER_CALIBRATION),
          ...patch,
        }),
      }));
    },
    []
  );

  const updateForkVariantCalibration = useCallback(
    (id: ForkVariantId, patch: Partial<ForkVariantCalibration>): void => {
      setForkVariantCalibrationMap((prev) => ({
        ...prev,
        [id]: normalizeForkVariantCalibration({
          ...(prev[id] ?? DEFAULT_FORK_VARIANT_CALIBRATION),
          ...patch,
        }),
      }));
    },
    []
  );

  function beginHitMarkerDrag(
    mode: "move" | "scale",
    event: ReactPointerEvent<HTMLDivElement | HTMLButtonElement>
  ): void {
    if (!isImpactCalibrationOpen) return;
    event.preventDefault();
    event.stopPropagation();
    const current =
      impactCalibrationTarget === "hit"
        ? selectedHitMarkerCalibration
        : selectedForkVariantCalibration;
    setHitMarkerDragState({
      target: impactCalibrationTarget,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetXPx: current.offsetXPx,
      startOffsetYPx: current.offsetYPx,
      startScale: current.scale,
    });
  }

  useEffect(() => {
    if (!hitMarkerDragState) return;
    if (!isImpactCalibrationOpen) {
      setHitMarkerDragState(null);
      return;
    }
    const onMove = (event: PointerEvent): void => {
      const dx = event.clientX - hitMarkerDragState.startClientX;
      const dy = event.clientY - hitMarkerDragState.startClientY;
      if (hitMarkerDragState.mode === "move") return;
      const avgScale = Math.max(0.01, (boardScaleX + boardScaleY) / 2);
      const nextScale = hitMarkerDragState.startScale + (dx + dy) / (220 * avgScale);
      if (hitMarkerDragState.target === "hit") {
        updateHitMarkerCalibration(selectedHitMarkerId, { scale: nextScale });
      } else {
        updateForkVariantCalibration(selectedForkVariantId, { scale: nextScale });
      }
    };
    const onUp = (): void => {
      setHitMarkerDragState(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    boardScaleX,
    boardScaleY,
    hitMarkerDragState,
    isImpactCalibrationOpen,
    impactCalibrationTarget,
    selectedForkVariantId,
    selectedHitMarkerId,
    selectedForkVariantCalibration,
    updateForkVariantCalibration,
    updateHitMarkerCalibration,
    selectedHitMarkerCalibration,
  ]);

  function resetFocusedCalibration(): void {
    setPlacementUiCalibration({ ...DEFAULT_PLACEMENT_UI_CALIBRATION });
  }

  function resetImpactCalibration(): void {
    setHitMarkerCalibrationMap(createDefaultHitMarkerCalibrationMap());
    setForkVariantCalibrationMap(createDefaultForkVariantCalibrationMap());
  }

  function handleImpactPreviewCenterPick(
    event: ReactPointerEvent<HTMLDivElement>
  ): void {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const centerXPct = ((event.clientX - rect.left) / rect.width) * 100;
    const centerYPct = ((event.clientY - rect.top) / rect.height) * 100;
    if (impactCalibrationTarget === "hit") {
      updateHitMarkerCalibration(selectedHitMarkerId, { centerXPct, centerYPct });
      return;
    }
    updateForkVariantCalibration(selectedForkVariantId, { centerXPct, centerYPct });
  }

  function updateCalibrationRect(
    key:
      | "startButton"
      | "onlineButton"
      | "offlineButton"
      | "babyButton"
      | "manButton"
      | "nightmareButton"
      | "soundOnButton"
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

  function setShipVisualCalibrationDraftSync(next: ShipVisualCalibrationMap): void {
    const cloned = cloneShipVisualCalibrationMap(next);
    shipVisualCalibrationDraftRef.current = cloned;
    setShipVisualCalibrationDraft(cloned);
  }

  function updateShipCursorCalibration(
    orientation: "horizontal" | "vertical",
    patch: Partial<ShipCursorCalibration>
  ): void {
    if (selectedPlacementLength !== null) {
      const next = cloneShipVisualCalibrationMap(shipVisualCalibrationDraftRef.current);
      next[selectedPlacementLength][orientation] = normalizeShipCursorCalibration({
        ...next[selectedPlacementLength][orientation],
        ...patch,
      });
      setShipVisualCalibrationDraftSync(normalizeShipVisualCalibrationMap(next));
      return;
    }
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

  function buildPlacedShipVisual(
    length: number,
    orientationOverride?: "horizontal" | "vertical",
    basePointOverride?: { x: number; y: number }
  ): PlacementShipVisual {
    const orientation =
      orientationOverride ?? (selectedPlacementHorizontal ? "horizontal" : "vertical");
    const calibrationMap = isUiCalibrationMode
      ? shipVisualCalibrationDraftRef.current
      : shipVisualCalibration;
    const calibration =
      orientation === "horizontal"
        ? calibrationMap[length].horizontal
        : calibrationMap[length].vertical;
    const gameplayCalibration = isUiCalibrationMode
      ? calibration
      : {
          ...calibration,
          anchorXPct: 50,
          anchorYPct: 50,
          offsetXPx: 0,
          offsetYPx: 0,
        };
    const scale = boardFrameScale;
    const longSide = Math.max(24 * scale, length * gameplayCalibration.deckSizePx * scale);
    const thickness = Math.max(12 * scale, gameplayCalibration.thicknessPx * scale);
    const width = orientation === "horizontal" ? longSide : thickness;
    const height = orientation === "horizontal" ? thickness : longSide;
    const horizontalHalfDeckShift =
      !isUiCalibrationMode && orientation === "horizontal" && (length === 2 || length === 4)
        ? -0.5 * gameplayCalibration.deckSizePx * scale
        : 0;
    let base: { x: number; y: number };
    if (isUiCalibrationMode) {
      if (boardFrameRef.current) {
        const rect = boardFrameRef.current.getBoundingClientRect();
        base = { x: rect.width * 0.5, y: rect.height * 0.55 };
      } else {
        base = { x: 0, y: 0 };
      }
    } else {
      let fallback = lastPointerPosRef.current;
      if (!fallback && boardFrameRef.current) {
        const rect = boardFrameRef.current.getBoundingClientRect();
        fallback = { x: rect.width * 0.5, y: rect.height * 0.55 };
      }
      base = basePointOverride ?? placementCursorPos ?? fallback ?? { x: 0, y: 0 };
    }
    return {
      baseX: base.x,
      baseY: base.y,
      x: base.x + gameplayCalibration.offsetXPx * scale + horizontalHalfDeckShift,
      y: base.y + gameplayCalibration.offsetYPx * scale,
      width,
      height,
      spriteOffsetXPx: 0,
      spriteOffsetYPx: 0,
      anchorXPct: gameplayCalibration.anchorXPct,
      anchorYPct: gameplayCalibration.anchorYPct,
      rotationDeg: gameplayCalibration.rotationDeg,
      shadowAngleDeg: gameplayCalibration.shadowAngleDeg,
      shadowOpacity: gameplayCalibration.shadowOpacity,
      shadowBlurPx: gameplayCalibration.shadowBlurPx * scale,
    };
  }

  function updatePlacedShipVisual(
    shipId: string,
    updater: (visual: PlacementShipVisual) => PlacementShipVisual
  ): void {
    setPlacementDraft((prev) => {
      const next = prev.map((ship) => {
        if (ship.id !== shipId || !ship.visual) return ship;
        const visual = updater(ship.visual);
        return { ...ship, visual };
      });
      return next;
    });
  }

  function updateActiveShipShadow(patch: Partial<PlacementShipVisual>): void {
    if (!isUiCalibrationMode) return;
    if (activePlacedVisualShipId === null) return;
    updatePlacedShipVisual(activePlacedVisualShipId, (visual) => ({
      ...visual,
      shadowAngleDeg:
        patch.shadowAngleDeg !== undefined ? patch.shadowAngleDeg : visual.shadowAngleDeg,
      shadowOpacity:
        patch.shadowOpacity !== undefined ? patch.shadowOpacity : visual.shadowOpacity,
      shadowBlurPx: patch.shadowBlurPx !== undefined ? patch.shadowBlurPx : visual.shadowBlurPx,
    }));
  }

  function beginPlacedShipVisualDrag(
    shipId: string,
    handle: ShipCursorHandle,
    event: ReactPointerEvent
  ): void {
    if (!isUiCalibrationMode) return;
    const ship = placementDraft.find((item) => item.id === shipId);
    if (!ship?.visual) return;
    event.preventDefault();
    event.stopPropagation();
    setPlacedShipVisualDragState({
      shipId,
      handle,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startVisual: { ...ship.visual },
    });
  }

  useEffect(() => {
    if (!placedShipVisualDragState || !isUiCalibrationMode) return;
    const drag = placedShipVisualDragState;

    const onPointerMove = (event: PointerEvent): void => {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;

      updatePlacedShipVisual(drag.shipId, (visual) => {
        const next = { ...visual };
        if (drag.handle === "move") {
          next.x = drag.startVisual.x + dx;
          next.y = drag.startVisual.y + dy;
        }
        if (drag.handle === "rotate") {
          next.rotationDeg = drag.startVisual.rotationDeg + dx * 0.45;
        }
        if (drag.handle === "resize-width" || drag.handle === "resize-both") {
          next.width = Math.max(16, drag.startVisual.width + dx);
        }
        if (drag.handle === "resize-height" || drag.handle === "resize-both") {
          next.height = Math.max(16, drag.startVisual.height + dy);
        }
        return next;
      });
    };

    const onPointerUp = (): void => {
      setPlacedShipVisualDragState(null);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [isUiCalibrationMode, placedShipVisualDragState]);

  return (
    <main className="h-[100dvh] w-screen overflow-hidden bg-black">
      <div className="relative h-full w-full">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            ref={boardFrameRef}
            className="relative overflow-hidden"
            style={{
              width: "min(95vw, calc(90dvh * 1.3333), 1860px)",
              transform: `rotate(${BOARD_ROTATION_DEG}deg)`,
              transformOrigin: "50% 50%",
            }}
            onPointerDownCapture={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              lastPointerPosRef.current = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              };
            }}
            onMouseMove={(event) => {
              if (!isPlacementInteractionActive) return;
              if (selectedPlacementShipId === null) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const point = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
              };
              lastPointerPosRef.current = point;
              if (isUiCalibrationMode) {
                setPlacementCursorPos(point);
              }
            }}
            onMouseLeave={() => {
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
            <div
              style={{
                opacity: boardBattleOpacity,
                pointerEvents: isTurnSwapTransitionActive ? "none" : "auto",
                transition: `opacity ${boardBattleTransitionMs}ms ease`,
              }}
            >
              <CarpetBoard
                key={`carpet-board-${carpetBoardReloadToken}`}
                attackRadar={gameMode === "online" ? onlineAttackRadarView : soloAttackRadarView}
                defenseRadar={gameMode === "online" ? onlineDefenseRadarView : soloDefenseRadarView}
                shipGrid={gameMode === "online" ? onlineShipGridView : soloShipGridView}
                playerShipHits={gameMode === "online" ? onlineShipHits : game.playerShipHits}
                enemyShipGrid={
                  gameMode === "online" ? hiddenEnemyShipGrid : soloEnemyShipGridView
                }
                enemyShipHits={
                  gameMode === "online" ? hiddenEnemyShipHits : soloEnemyShipHitsView
                }
                hitEffects={hitEffects}
                showDefenseLayer={
                  gameMode === "online" ? onlineShowDefenseLayerView : soloShowDefenseLayerView
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
                hitMarkerCalibrationMap={hitMarkerCalibrationMap}
                forkVariantCalibrationMap={forkVariantCalibrationMap}
                showMarkerDebugBoxes={false}
                onMarkerSampleChange={setMarkerSample}
              />
            </div>

            <Image
              src={UI_LOGO_URL}
              alt="Logo"
              width={564}
              height={314}
              className="pointer-events-none absolute left-[1.5%] top-[1.8%] w-[22%] max-w-[320px] select-none"
            />

            {CALIBRATION_TOOLS_VISIBLE && isImpactCalibrationOpen && (
              <>
                <div className="absolute left-1/2 top-[5.4%] z-[52] flex -translate-x-1/2 items-center gap-1 rounded-md border border-cyan-400/50 bg-black/65 px-2 py-1">
                  {impactCalibrationTarget === "hit"
                    ? HIT_MARKER_IDS.map((id) => (
                        <button
                          key={`hit-palette-${id}`}
                          type="button"
                          onClick={() => setSelectedHitMarkerId(id)}
                          className={`relative h-10 w-10 rounded border ${
                            selectedHitMarkerId === id
                              ? "border-emerald-300 bg-emerald-500/20"
                              : "border-cyan-900/70 bg-black/45"
                          }`}
                          title={`Hit ${id}`}
                        >
                          <img
                            src={`/sprites/hit-variants/${id}.png`}
                            alt=""
                            className="pointer-events-none h-full w-full object-contain"
                          />
                        </button>
                      ))
                    : FORK_VARIANT_IDS.map((id) => (
                        <button
                          key={`fork-palette-${id}`}
                          type="button"
                          onClick={() => setSelectedForkVariantId(id)}
                          className={`relative h-10 w-10 rounded border ${
                            selectedForkVariantId === id
                              ? "border-emerald-300 bg-emerald-500/20"
                              : "border-cyan-900/70 bg-black/45"
                          }`}
                          title={`Fork ${id}`}
                        >
                          <img
                            src={resolveForkHref(forkVariantCalibrationMap[id].href)}
                            alt=""
                            className="pointer-events-none h-full w-full object-contain"
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_FORK_IMAGE_HREF;
                            }}
                          />
                        </button>
                      ))}
                </div>
                <div
                  className="group absolute z-[53] cursor-move"
                  onClick={handleImpactPreviewCenterPick}
                  style={{
                    left: `${hitMarkerPreviewX}px`,
                    top: `${hitMarkerPreviewY}px`,
                    width: `${activePreviewSize}px`,
                    height: `${activePreviewSize}px`,
                    transform: "translate(-50%, -50%)",
                    filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.45))",
                  }}
                >
                  <img
                    src={
                      impactCalibrationTarget === "hit"
                        ? `/sprites/hit-variants/${selectedHitMarkerId}.png`
                        : resolveForkHref(selectedForkVariantCalibration.href)
                    }
                    alt=""
                    className="pointer-events-none h-full w-full object-contain"
                    onError={(event) => {
                      event.currentTarget.src = DEFAULT_FORK_IMAGE_HREF;
                    }}
                    style={{
                      opacity: activeImpactCalibration.opacity,
                      transform:
                        impactCalibrationTarget === "fork"
                          ? `rotate(${selectedForkVariantCalibration.rotationDeg}deg)`
                          : undefined,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-400/90"
                    style={{
                      left: `${activeImpactCalibration.centerXPct}%`,
                      top: `${activeImpactCalibration.centerYPct}%`,
                    }}
                  />
                  <button
                    type="button"
                    className="absolute -bottom-2 -right-2 h-4 w-4 rounded-full border border-cyan-100 bg-cyan-500/90 opacity-0 transition group-hover:opacity-100"
                    title="Resize"
                    onPointerDown={(event) => beginHitMarkerDrag("scale", event)}
                  />
                </div>
              </>
            )}

            {isPlacementInteractionActive && (
              <div
                className="pointer-events-none absolute z-40 flex min-w-[280px] max-w-[680px] flex-col"
                style={{
                  left: `${placementUiCalibration.panelLeftPct}%`,
                  top: `${placementUiCalibration.panelTopPct}%`,
                  width: `${placementUiCalibration.panelWidthPct}%`,
                  gap: `${Math.max(0, placementUiCalibration.panelGapPx)}px`,
                }}
              >
                {PLACEMENT_SHIP_TYPES.map((length, index) => {
                  const shipsOfType = placementDraft.filter((ship) => ship.length === length);
                  const representativeShip = shipsOfType[0];
                  if (!representativeShip) return null;
                  const placedCount = shipsOfType.filter((ship) => ship.placed).length;
                  const totalCount = shipsOfType.length;
                  const negativeRowGap = Math.min(0, placementUiCalibration.panelGapPx);

                  if (isUiCalibrationMode) {
                    const blocked =
                      activePlacedVisualShipId !== null &&
                      activeCalibrationShip?.length !== length;
                    return (
                      <div
                        key={`placement-ship-type-${length}`}
                        className="space-y-0"
                        style={index > 0 && negativeRowGap < 0 ? { marginTop: `${negativeRowGap}px` } : undefined}
                      >
                        <div className="pointer-events-auto grid w-[56%] grid-cols-2 gap-0.5 rounded border border-amber-200/55">
                          {[true, false].map((horizontal) => {
                            const selected =
                              selectedPlacementLength === length &&
                              selectedPlacementHorizontal === horizontal;
                            return (
                              <button
                                key={`ship-type-${length}-${horizontal ? "h" : "v"}`}
                                type="button"
                                disabled={!isPlacementInteractionActive || blocked}
                                onClick={() => {
                                  if (blocked) return;
                                  selectNextShipTypeForPlacement(
                                    length,
                                    horizontal ? "horizontal" : "vertical"
                                  );
                                }}
                                className={`relative aspect-[4/0.92] w-full rounded transition ${
                                  selected ? "scale-[1.03]" : ""
                                } ${
                                  blocked
                                    ? "cursor-not-allowed opacity-60"
                                    : "cursor-pointer hover:scale-[1.04]"
                                }`}
                                title={`${horizontal ? "Horizontal" : "Vertical"} ship ${length}`}
                              >
                                  <div
                                   className="absolute rounded transition"
                                   style={{
                                     left: `${shipSlotRender.leftPct}%`,
                                     top: `${shipSlotRender.topPct}%`,
                                     width: `${shipSlotRender.widthPct}%`,
                                     height: `${shipSlotRender.heightPct}%`,
                                  }}
                                >
                                  <Image
                                    src={getShipIconByOrientation(length, horizontal)}
                                    alt={`Ship ${length} ${horizontal ? "horizontal" : "vertical"}`}
                                    fill
                                    sizes="220px"
                                    className="object-contain"
                                    style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.45))" }}
                                  />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  const selected = selectedPlacementLength === length;
                  const allPlaced = placedCount >= totalCount;
                  const displayHorizontal = selected ? selectedPlacementHorizontal : true;
                  return (
                    <div
                      key={`placement-ship-type-${length}`}
                      className="space-y-0"
                      style={index > 0 && negativeRowGap < 0 ? { marginTop: `${negativeRowGap}px` } : undefined}
                    >
                      <button
                        type="button"
                        disabled={!isPlacementInteractionActive || allPlaced}
                        onClick={() => {
                          selectNextShipTypeForPlacement(length);
                        }}
                        className={`pointer-events-auto relative aspect-[4/0.92] w-[62%] transition ${
                          selected ? "scale-[1.04]" : "scale-100"
                        } ${placedCount > 0 ? "opacity-100" : "opacity-85"} ${
                          !isPlacementInteractionActive || allPlaced
                            ? "cursor-default"
                            : "cursor-pointer hover:scale-[1.06]"
                        }`}
                        title={`Ship ${length} cells (${placedCount}/${totalCount})`}
                      >
                        <div
                          className="absolute rounded"
                          style={{
                            left: `${shipSlotRender.leftPct}%`,
                            top: `${shipSlotRender.topPct}%`,
                            width: `${shipSlotRender.widthPct}%`,
                            height: `${shipSlotRender.heightPct}%`,
                          }}
                        >
                          <Image
                            src={getShipIconByOrientation(length, displayHorizontal)}
                            alt={`Ship ${length}`}
                            fill
                            sizes="220px"
                            className="object-contain"
                            style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.45))" }}
                          />
                        </div>
                        <span
                          className="pointer-events-none absolute rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold text-[#0c2312]"
                          style={{
                            left: `calc(83% + ${placementUiCalibration.badgeOffsetXPx}px)`,
                            top: `calc(50% + ${placementUiCalibration.badgeOffsetYPx}px)`,
                            transform: `translate(-50%, -50%) scale(${placementUiCalibration.badgeScale})`,
                            transformOrigin: "center",
                          }}
                        >
                          {placedCount}/{totalCount}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {isPlacementInteractionActive &&
              placementDraft
                .filter(
                  (ship) =>
                    ship.placed &&
                    ship.visual &&
                    (isUiCalibrationMode || ship.id !== selectedPlacementShipId)
                )
                .map((ship) => {
                  const visual = ship.visual as PlacementShipVisual;
                  const editing = isUiCalibrationMode && activePlacedVisualShipId === ship.id;
                  const canPickForMove =
                    !isUiCalibrationMode &&
                    selectedPlacementShipId === null &&
                    isPlacementInteractionActive;
                  const showRotateControl = canPickForMove;
                  const rotateButtonSizePx = clampNumber(
                    Math.min(visual.width, visual.height) * 0.48,
                    12,
                    24
                  );
                  return (
                    <div
                      key={`placed-visual-${ship.id}`}
                      className={`group absolute ${editing ? "z-[47]" : "z-[45]"} ${
                        canPickForMove ? "cursor-pointer" : "pointer-events-none"
                      }`}
                      onClick={() => {
                        if (!canPickForMove) return;
                        pickPlacedShipForMove(ship.id);
                      }}
                      style={{
                        width: `${visual.width}px`,
                        height: `${visual.height}px`,
                        left: `${visual.x}px`,
                        top: `${visual.y}px`,
                        transform: `translate(-${visual.anchorXPct}%, -${visual.anchorYPct}%) rotate(${visual.rotationDeg}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                      <img
                        src={getShipIconByOrientation(ship.length, ship.horizontal)}
                        alt=""
                        className="pointer-events-none h-full w-full opacity-90"
                        style={{
                          filter: buildShipShadowFilter(
                            visual.shadowAngleDeg,
                            visual.shadowOpacity,
                            visual.shadowBlurPx,
                            SHIP_SHADOW_DISTANCE_PX * boardFrameScale
                          ),
                        }}
                      />
                      {showRotateControl && (
                        <button
                          type="button"
                          className="pointer-events-auto absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200/90 bg-amber-500/20 text-[9px] font-semibold uppercase tracking-wide text-amber-100 opacity-0 transition group-hover:opacity-100 hover:scale-105 hover:bg-amber-500/45"
                          style={{
                            width: `${rotateButtonSizePx}px`,
                            height: `${rotateButtonSizePx}px`,
                            lineHeight: 1,
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            rotatePlacedShipForMove(ship.id);
                          }}
                          title="Rotate"
                        >
                          ↻
                        </button>
                      )}
                      {editing && (
                        <>
                          <div className="pointer-events-none absolute inset-0 border border-dashed border-cyan-300/90" />
                          <div
                            className="pointer-events-auto absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-full border border-cyan-100 bg-cyan-500/90"
                            onPointerDown={(event) =>
                              beginPlacedShipVisualDrag(ship.id, "resize-both", event)
                            }
                          />
                          <div
                            className="pointer-events-auto absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border border-cyan-100 bg-cyan-500/90"
                            onPointerDown={(event) =>
                              beginPlacedShipVisualDrag(ship.id, "resize-width", event)
                            }
                          />
                          <div
                            className="pointer-events-auto absolute left-1/2 -bottom-2 h-4 w-4 -translate-x-1/2 cursor-ns-resize rounded-full border border-cyan-100 bg-cyan-500/90"
                            onPointerDown={(event) =>
                              beginPlacedShipVisualDrag(ship.id, "resize-height", event)
                            }
                          />
                          <div
                            className="pointer-events-auto absolute left-1/2 -top-8 h-4 w-4 -translate-x-1/2 cursor-grab rounded-full border border-amber-200 bg-amber-500/90 active:cursor-grabbing"
                            onPointerDown={(event) =>
                              beginPlacedShipVisualDrag(ship.id, "rotate", event)
                            }
                          />
                          <div
                            className="pointer-events-auto absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border border-emerald-200 bg-emerald-500/90"
                            onPointerDown={(event) =>
                              beginPlacedShipVisualDrag(ship.id, "move", event)
                            }
                          />
                        </>
                      )}
                    </div>
                  );
                })}

            {!isPlacementInteractionActive &&
              showSoloDefenseShipVisuals &&
              soloBattleShipVisuals.map((ship) => {
                  const visual = ship.visual;
                  return (
                    <div
                      key={`solo-defense-visual-${ship.id}`}
                      className="pointer-events-none absolute z-[44]"
                      style={{
                        width: `${visual.width}px`,
                        height: `${visual.height}px`,
                        left: `${visual.x}px`,
                        top: `${visual.y}px`,
                        opacity: 1,
                        transform: `translate(-${visual.anchorXPct}%, -${visual.anchorYPct}%) rotate(${visual.rotationDeg}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                      <img
                        src={getShipIconByOrientation(ship.length, ship.horizontal)}
                        alt=""
                        className="pointer-events-none h-full w-full opacity-90"
                        style={{
                          filter: buildShipShadowFilter(
                            visual.shadowAngleDeg,
                            visual.shadowOpacity,
                            visual.shadowBlurPx,
                            SHIP_SHADOW_DISTANCE_PX * boardFrameScale
                          ),
                        }}
                      />
                    </div>
                  );
                })}

            {isPlacementInteractionActive &&
              !isUiCalibrationMode &&
              selectedPlacementShipId !== null &&
              placementCursorVisual && (
                <div
                  className="pointer-events-none absolute z-[46]"
                  style={{
                    width: `${placementCursorVisual.width}px`,
                    height: `${placementCursorVisual.height}px`,
                    left: `${placementCursorVisual.x}px`,
                    top: `${placementCursorVisual.y}px`,
                    transform: `translate(-${placementCursorVisual.anchorXPct}%, -${placementCursorVisual.anchorYPct}%) rotate(${placementCursorVisual.rotationDeg}deg)`,
                    transformOrigin: "center center",
                  }}
                >
                  <img
                    src={getShipIconByOrientation(
                      selectedPlacementLength ?? 1,
                      selectedPlacementHorizontal
                    )}
                    alt=""
                    className="pointer-events-none h-full w-full opacity-75"
                    style={{
                      filter: buildShipShadowFilter(
                        placementCursorVisual.shadowAngleDeg,
                        placementCursorVisual.shadowOpacity,
                        placementCursorVisual.shadowBlurPx,
                        SHIP_SHADOW_DISTANCE_PX * boardFrameScale
                      ),
                    }}
                  />
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
              className={`absolute z-30 cursor-pointer transition duration-150 hover:scale-[1.03] active:scale-[0.97] ${
                isUiCalibrationMode
                  ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                  : ""
              }`}
              style={rectStyle(activeUiCalibration.startButton)}
            >
              <Image src={UI_START_BUTTON_URL} alt="Start" fill sizes="(max-width: 768px) 60vw, 320px" className="object-contain" />
            </button>

            <img
              src={UI_DECOR_BLUE_URL}
              alt=""
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-[-8.6%] left-[0.5%] w-[22.8%] min-w-[190px] max-w-[430px] -translate-y-[44px] select-none transition-all duration-300 ${
                leftHeroActive
                  ? "z-20 scale-[1.03] drop-shadow-[0_0_18px_rgba(251,191,36,0.85)] animate-[heroTurnPulse_1.2s_ease-in-out_infinite]"
                  : "z-10 scale-100 opacity-95"
              }`}
            />
            <img
              src={UI_DECOR_RED_URL}
              alt=""
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-[-8.6%] right-[0.5%] w-[22.8%] min-w-[190px] max-w-[430px] -translate-y-[44px] select-none transition-all duration-300 ${
                rightHeroActive
                  ? "z-20 scale-[1.03] drop-shadow-[0_0_18px_rgba(251,191,36,0.85)] animate-[heroTurnPulse_1.2s_ease-in-out_infinite]"
                  : "z-10 scale-100 opacity-95"
              }`}
            />

            <Image
              src={UI_HEALTH_BLUE_URL}
              alt=""
              width={2244}
              height={412}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[0.55%] left-[1.25%] z-[35] w-[30.5%] -translate-y-[14px] select-none"
            />
            <Image
              src={UI_HEALTH_RED_URL}
              alt=""
              width={2214}
              height={422}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-[0.45%] right-[1.1%] z-[35] w-[30.2%] -translate-y-[14px] select-none"
            />

            {startPanel !== null && (
              <>
                <button
                  type="button"
                  aria-label="Close start panel"
                  onClick={handleCloseStartPanel}
                  className="absolute inset-0 z-[220]"
                />
                <div className="absolute bottom-[12.5%] left-1/2 z-[230] w-[25.8%] min-w-[250px] max-w-[390px] -translate-x-1/2">
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
                          onClick={handleOfflineModeClick}
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
                          onClick={() => handleLevelChoice("easy")}
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
                          onClick={() => handleLevelChoice("medium")}
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
                          onClick={() => handleLevelChoice("hard")}
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
                  className="absolute inset-0 z-[210]"
                />
                <div
                  className="absolute z-[220] w-[19.6%] min-w-[210px] max-w-[330px]"
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
                      className={`absolute ${
                        isUiCalibrationMode
                          ? "ring-2 ring-emerald-300/70 ring-offset-1 ring-offset-black/30"
                          : ""
                      }`}
                      style={rectStyle(
                        isSoundEnabled
                          ? activeUiCalibration.soundOnButton
                          : activeUiCalibration.soundButton
                      )}
                      aria-label="Toggle music"
                    >
                      <Image
                        src={isSoundEnabled ? UI_BUTTON_SOUND_URL : UI_BUTTON_SOUND_OFF_URL}
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
                        openLoginModal();
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

        {CALIBRATION_TOOLS_VISIBLE && (
          <div className="absolute left-3 top-3 z-[90] w-[min(92vw,360px)]">
          <div className="mb-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsFocusedCalibrationOpen((prev) => !prev)}
              className="rounded-md border border-cyan-500/70 bg-black/70 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-black/85"
            >
              UI/Placement Calibration
            </button>
            <button
              type="button"
              onClick={() => setIsImpactCalibrationOpen((prev) => !prev)}
              className="rounded-md border border-amber-500/70 bg-black/70 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-black/85"
            >
              Hit/Fork Calibration
            </button>
          </div>

          {isFocusedCalibrationOpen && (
            <div className="max-h-[92vh] overflow-auto rounded-lg border border-cyan-500/60 bg-black/85 p-3 text-[11px] text-cyan-50 shadow-[0_0_28px_rgba(14,116,144,0.35)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold tracking-wide">Focused Calibration</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsFocusedCalibrationOpen(false)}
                    className="rounded border border-emerald-500/70 bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={resetFocusedCalibration}
                    className="rounded border border-amber-500/70 bg-amber-500/20 px-2 py-1 text-[10px] text-amber-100"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded border border-cyan-900/50 bg-black/40 p-2">
                  <div className="mb-2 text-[10px] font-semibold text-cyan-100">Placement panel</div>
                  <label className="block">
                    Left ({placementUiCalibration.panelLeftPct.toFixed(1)}%)
                    <input type="range" min={-20} max={60} step={0.1} value={placementUiCalibration.panelLeftPct} onChange={(event) => updatePlacementUiCalibration({ panelLeftPct: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Top ({placementUiCalibration.panelTopPct.toFixed(1)}%)
                    <input type="range" min={-20} max={80} step={0.1} value={placementUiCalibration.panelTopPct} onChange={(event) => updatePlacementUiCalibration({ panelTopPct: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Width ({placementUiCalibration.panelWidthPct.toFixed(1)}%)
                    <input type="range" min={8} max={70} step={0.1} value={placementUiCalibration.panelWidthPct} onChange={(event) => updatePlacementUiCalibration({ panelWidthPct: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Row gap ({placementUiCalibration.panelGapPx.toFixed(1)}px)
                    <input type="range" min={-120} max={40} step={0.5} value={placementUiCalibration.panelGapPx} onChange={(event) => updatePlacementUiCalibration({ panelGapPx: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Counter X ({Math.round(placementUiCalibration.badgeOffsetXPx)}px)
                    <input type="range" min={-120} max={120} step={1} value={placementUiCalibration.badgeOffsetXPx} onChange={(event) => updatePlacementUiCalibration({ badgeOffsetXPx: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Counter Y ({Math.round(placementUiCalibration.badgeOffsetYPx)}px)
                    <input type="range" min={-120} max={120} step={1} value={placementUiCalibration.badgeOffsetYPx} onChange={(event) => updatePlacementUiCalibration({ badgeOffsetYPx: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Counter scale ({placementUiCalibration.badgeScale.toFixed(2)})
                    <input type="range" min={0.4} max={3} step={0.01} value={placementUiCalibration.badgeScale} onChange={(event) => updatePlacementUiCalibration({ badgeScale: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Ship slot scale ({placementUiCalibration.shipSlotScale.toFixed(2)})
                    <input type="range" min={0.4} max={6} step={0.01} value={placementUiCalibration.shipSlotScale} onChange={(event) => updatePlacementUiCalibration({ shipSlotScale: Number(event.target.value) })} className="w-full" />
                  </label>
                </div>

                <div className="rounded border border-cyan-900/50 bg-black/40 p-2">
                  <div className="mb-2 text-[10px] font-semibold text-cyan-100">Menu buttons (fine)</div>
                  <div className="mb-2 grid grid-cols-3 gap-1">
                    {(Object.keys(menuCalibrationLabels) as MenuCalibrationKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedMenuCalibrationKey(key)}
                        className={`rounded border px-2 py-1 text-[10px] ${
                          selectedMenuCalibrationKey === key
                            ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                            : "border-cyan-900/60 bg-black/40 text-cyan-100/90"
                        }`}
                      >
                        {menuCalibrationLabels[key]}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    Left ({selectedMenuCalibrationRect.leftPct.toFixed(2)}%)
                    <input type="range" min={-20} max={95} step={0.07} value={selectedMenuCalibrationRect.leftPct} onChange={(event) => updateMenuCalibrationRect(selectedMenuCalibrationKey, { leftPct: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Top ({selectedMenuCalibrationRect.topPct.toFixed(2)}%)
                    <input type="range" min={-20} max={95} step={0.07} value={selectedMenuCalibrationRect.topPct} onChange={(event) => updateMenuCalibrationRect(selectedMenuCalibrationKey, { topPct: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Width ({selectedMenuCalibrationRect.widthPct.toFixed(2)}%)
                    <input type="range" min={3} max={95} step={0.07} value={selectedMenuCalibrationRect.widthPct} onChange={(event) => updateMenuCalibrationRect(selectedMenuCalibrationKey, { widthPct: Number(event.target.value) })} className="w-full" />
                  </label>
                  <label className="block">
                    Height ({selectedMenuCalibrationRect.heightPct.toFixed(2)}%)
                    <input type="range" min={3} max={65} step={0.07} value={selectedMenuCalibrationRect.heightPct} onChange={(event) => updateMenuCalibrationRect(selectedMenuCalibrationKey, { heightPct: Number(event.target.value) })} className="w-full" />
                  </label>
                </div>

              </div>
            </div>
          )}

          {isImpactCalibrationOpen && (
            <div className="mt-2 max-h-[92vh] overflow-auto rounded-lg border border-amber-500/60 bg-black/85 p-3 text-[11px] text-amber-50 shadow-[0_0_28px_rgba(180,83,9,0.35)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-semibold tracking-wide">Hit/Fork Calibration</div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsImpactCalibrationOpen(false)}
                    className="rounded border border-emerald-500/70 bg-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={resetImpactCalibration}
                    className="rounded border border-amber-500/70 bg-amber-500/20 px-2 py-1 text-[10px] text-amber-100"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mb-2 text-[10px] text-amber-100/85">
                Click preview marker on board to set PNG center. The selected PNG center is snapped to cell center. Drag small corner dot to scale.
              </div>

              <div className="mb-2 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setImpactCalibrationTarget("hit")}
                  className={`rounded border px-2 py-1 text-[10px] ${
                    impactCalibrationTarget === "hit"
                      ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                      : "border-amber-900/60 bg-black/40 text-amber-100/90"
                  }`}
                >
                  Hit markers
                </button>
                <button
                  type="button"
                  onClick={() => setImpactCalibrationTarget("fork")}
                  className={`rounded border px-2 py-1 text-[10px] ${
                    impactCalibrationTarget === "fork"
                      ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                      : "border-amber-900/60 bg-black/40 text-amber-100/90"
                  }`}
                >
                  Fork variants
                </button>
              </div>

              {impactCalibrationTarget === "hit" ? (
                <div className="space-y-2 rounded border border-amber-900/50 bg-black/40 p-2">
                  <div className="grid grid-cols-3 gap-1">
                    {HIT_MARKER_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedHitMarkerId(id)}
                        className={`rounded border px-2 py-1 text-[10px] ${
                          selectedHitMarkerId === id
                            ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                            : "border-amber-900/60 bg-black/40 text-amber-100/90"
                        }`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    Scale ({selectedHitMarkerCalibration.scale.toFixed(2)})
                    <input
                      type="range"
                      min={0.3}
                      max={8}
                      step={0.01}
                      value={selectedHitMarkerCalibration.scale}
                      onChange={(event) =>
                        updateHitMarkerCalibration(selectedHitMarkerId, {
                          scale: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label className="block">
                    Opacity ({selectedHitMarkerCalibration.opacity.toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={selectedHitMarkerCalibration.opacity}
                      onChange={(event) =>
                        updateHitMarkerCalibration(selectedHitMarkerId, {
                          opacity: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <div className="text-[10px] text-amber-100/85">
                    Center: X {selectedHitMarkerCalibration.centerXPct.toFixed(1)}% / Y{" "}
                    {selectedHitMarkerCalibration.centerYPct.toFixed(1)}%
                  </div>
                </div>
              ) : (
                <div className="space-y-2 rounded border border-amber-900/50 bg-black/40 p-2">
                  <div className="grid grid-cols-2 gap-1">
                    {FORK_VARIANT_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setSelectedForkVariantId(id)}
                        className={`rounded border px-2 py-1 text-[10px] ${
                          selectedForkVariantId === id
                            ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                            : "border-amber-900/60 bg-black/40 text-amber-100/90"
                        }`}
                      >
                        {id}
                      </button>
                    ))}
                  </div>
                  <label className="block">
                    Image path
                    <input
                      type="text"
                      value={selectedForkVariantCalibration.href}
                      onChange={(event) =>
                        updateForkVariantCalibration(selectedForkVariantId, {
                          href: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded border border-amber-700/70 bg-black/40 px-2 py-1 text-[10px] text-amber-50"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[10px]">
                    <input
                      type="checkbox"
                      checked={selectedForkVariantCalibration.enabled}
                      onChange={(event) =>
                        updateForkVariantCalibration(selectedForkVariantId, {
                          enabled: event.target.checked,
                        })
                      }
                    />
                    Enabled for randomization
                  </label>
                  <label className="block">
                    Scale ({selectedForkVariantCalibration.scale.toFixed(2)})
                    <input
                      type="range"
                      min={0.3}
                      max={8}
                      step={0.01}
                      value={selectedForkVariantCalibration.scale}
                      onChange={(event) =>
                        updateForkVariantCalibration(selectedForkVariantId, {
                          scale: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label className="block">
                    Opacity ({selectedForkVariantCalibration.opacity.toFixed(2)})
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={selectedForkVariantCalibration.opacity}
                      onChange={(event) =>
                        updateForkVariantCalibration(selectedForkVariantId, {
                          opacity: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <label className="block">
                    Rotation ({Math.round(selectedForkVariantCalibration.rotationDeg)}°)
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={selectedForkVariantCalibration.rotationDeg}
                      onChange={(event) =>
                        updateForkVariantCalibration(selectedForkVariantId, {
                          rotationDeg: Number(event.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </label>
                  <div className="text-[10px] text-amber-100/85">
                    Center: X {selectedForkVariantCalibration.centerXPct.toFixed(1)}% / Y{" "}
                    {selectedForkVariantCalibration.centerYPct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-amber-200/75">
                    Random forks pick only enabled variants with valid image path.
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        )}
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

        {isLoginModalOpen && (
          <div className="absolute inset-0 z-[56] flex items-center justify-center bg-black/72 p-4">
            <div className="w-full max-w-md rounded-2xl border border-[#6c5130] bg-[#131313] p-5 text-[#f3e8d0] shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Google Login</h2>
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(false)}
                  className="rounded-md border border-[#8d6a42] px-3 py-1 text-sm hover:bg-[#272727]"
                >
                  Close
                </button>
              </div>
              <div className="mb-4 text-sm text-[#d1c1a5]">
                Login is required before creating or joining online rooms.
              </div>
              <div className="mb-4 rounded-lg border border-[#6b532f]/70 bg-[#1a1a1a] p-3 text-sm">
                Status: {authUser ? authUser.email ?? "Logged in" : "Not logged in"}
              </div>
              {authUser ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginModalOpen(false);
                      setIsOnlineLobbyOpen(true);
                      setGameMode("online");
                    }}
                    className="rounded-lg border border-cyan-500/70 bg-cyan-500/20 px-3 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/30"
                  >
                    Continue to lobby
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleGoogleLogout();
                    }}
                    className="rounded-lg border border-[#8d6a42] px-3 py-2 text-sm hover:bg-[#272727]"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void handleGoogleLogin();
                  }}
                  className={`relative h-12 w-44 ${MODAL_BUTTON_MOTION_CLASS}`}
                >
                  <Image
                    src={UI_BUTTON_GOOGLE_URL}
                    alt="Login with Google"
                    fill
                    sizes="176px"
                    className="object-contain"
                  />
                </button>
              )}
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
                        setIsOnlineLobbyOpen(false);
                        void handleGoogleLogin();
                      }}
                      className="rounded-md border border-cyan-500/70 bg-cyan-500/20 px-3 py-1 text-sm text-cyan-100 hover:bg-cyan-500/30"
                    >
                      Open Login
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





