"use client";

import Image from "next/image";
import {
  useCallback,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const IMAGE_WIDTH = 1448;
const IMAGE_HEIGHT = 1086;
const GRID_SIZE = 10;
const EDGE_POINT_COUNT = GRID_SIZE + 1;
const HIT_NAIL_IMAGE_HREF = "/sprites/hit-nail.png";
const SPRITE_TRANSFORM_STORAGE_KEY = "sea-war.sprite-transform-map.v1";
const SHOT_LEFT_TRAVEL_MS = 2000;
const SHOT_RIGHT_DELAY_MS = 200;
const SHOT_RIGHT_TRAVEL_MS = 500;
const SHOT_RETURN_MS = 500;
const SHOT_IMPACT_PAUSE_MS = 40;
const HAND_LEFT_IMAGE_HREF = "/sprites/hand-left.png";
const HAND_RIGHT_IMAGE_HREF = "/sprites/hand-right.png";
const HAND_LEFT_WIDTH = 1106;
const HAND_LEFT_HEIGHT = 1022;
const HAND_LEFT_ANCHOR_X = 1105;
const HAND_LEFT_ANCHOR_Y = 141;
const HAND_LEFT_SCALE = 0.24;
const HAND_RIGHT_WIDTH = 971;
const HAND_RIGHT_HEIGHT = 1184;
const HAND_RIGHT_ANCHOR_X = 0;
const HAND_RIGHT_ANCHOR_Y = 72;
const HAND_RIGHT_SCALE = 0.22;
const HIT_SPLASH_FRAME_MS = 55;
const HIT_SPLASH_FRAMES = Array.from(
  { length: 23 },
  (_, index) => `/sprites/hit-splash-frames/frame-${String(index).padStart(2, "0")}.png`
);
const HIT_SPLASH_DURATION_MS = HIT_SPLASH_FRAME_MS * HIT_SPLASH_FRAMES.length;

type EdgeKey = "top" | "right" | "bottom" | "left";
type SpriteTemplateId =
  | "ship-5-sunk"
  | "ship-2-idle"
  | "ship-2-hit1"
  | "ship-2-hit2";

interface Point {
  x: number;
  y: number;
}

interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

interface BoundaryControl {
  top: Point[];
  right: Point[];
  bottom: Point[];
  left: Point[];
}

interface PerimeterHandle {
  edge: EdgeKey;
  index: number;
}

interface GridCell {
  row: number;
  col: number;
}

interface HorizontalShipSpan {
  shipId: number;
  row: number;
  startCol: number;
  endCol: number;
  length: number;
  cells: GridCell[];
}

interface SpriteTemplate {
  id: SpriteTemplateId;
  label: string;
  imageHref: string;
  shipLength: number;
}

interface SpriteTransform {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
}

type SpriteTransformMap = Record<SpriteTemplateId, SpriteTransform>;

interface ShipOverlay {
  key: string;
  templateId: SpriteTemplateId;
  imageHref: string;
  points: [Point, Point, Point, Point];
  coveredCellKeys: string[];
}

interface OverlayRenderSpec {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

interface ActiveSpriteDrag {
  pointerStart: Point;
  offsetXStart: number;
  offsetYStart: number;
}

interface HitEffect {
  id: string;
  row: number;
  col: number;
  startedAtMs: number;
}

interface ShotSequence {
  row: number;
  col: number;
  target: Point;
  leftAnchor: Point;
  rightAnchor: Point;
  showRightHand: boolean;
  leftDurationMs: number;
  rightDurationMs: number;
}

type CalibrationSource = "storage" | "default";

const DEFAULT_STORAGE_KEY = "sea-war.carpet-board-boundary.v2";
const LEGACY_BOUNDARY_KEYS = [
  "sea-war.carpet-board-boundary.v3",
  "sea-war.carpet-board-boundary.v2",
];

const DEFAULT_BOUNDARY: BoundaryControl = {
  top: [
    { x: 411, y: 285 },
    { x: 478.10257145784243, y: 276.68841777425655 },
    { x: 530.320172113513, y: 271.9413307470597 },
    { x: 585.3860055322201, y: 266.2448263144235 },
    { x: 642.3506607929515, y: 261.49773928722664 },
    { x: 701.2141378957074, y: 256.75065226002977 },
    { x: 761.0270259194755, y: 252.00356523283293 },
    { x: 817.9916811802069, y: 246.3070608001967 },
    { x: 875.9057473619506, y: 241.55997377299985 },
    { x: 928.1233480176212, y: 236.81288674580298 },
    { x: 982.239811927581, y: 233.96462719260123 },
  ],
  right: [
    { x: 982.239811927581, y: 233.96462719260123 },
    { x: 991.733879725438, y: 274.7895829633778 },
    { x: 1001.2279889355599, y: 321.311035829907 },
    { x: 1013.5703309087183, y: 367.83248869643614 },
    { x: 1024.9632619608647, y: 415.30335896840467 },
    { x: 1040.1538366970597, y: 461.8248118349338 },
    { x: 1053.4455895912304, y: 514.9921865395386 },
    { x: 1067.6867534064133, y: 567.210143838704 },
    { x: 1080.0290953795718, y: 627.0234403813843 },
    { x: 1096.169081036779, y: 682.0896498968677 },
    { x: 1112.3090666939863, y: 744.7511986558662 },
  ],
  bottom: [
    { x: 444, y: 823 },
    { x: 517.0284192193423, y: 814.0586692529403 },
    { x: 583.4871836901957, y: 803.6150777931072 },
    { x: 653.7435918450979, y: 798.8679907659103 },
    { x: 722.1011781579756, y: 790.323234116956 },
    { x: 790.4587644708535, y: 782.7278948734411 },
    { x: 859.7657617047433, y: 775.1325556299261 },
    { x: 922.426882491548, y: 765.6383815755324 },
    { x: 987.9362360413892, y: 758.0430423320174 },
    { x: 1051.546767749206, y: 752.3465378993812 },
    { x: 1112.3090666939863, y: 744.7511986558662 },
  ],
  left: [
    { x: 411, y: 285 },
    { x: 417.3402725130622, y: 328.90637507342194 },
    { x: 419.2390943550866, y: 376.37724534539046 },
    { x: 423.98614896014755, y: 425.7469504282377 },
    { x: 426.8343817231841, y: 477.01549032196374 },
    { x: 430.63202540723285, y: 525.4357779993717 },
    { x: 434.42966909128165, y: 584.2996571366126 },
    { x: 433.48025817026945, y: 639.3658666520961 },
    { x: 441.07554553836695, y: 698.2297457893371 },
    { x: 444.87318922241576, y: 760.8912945483355 },
    { x: 444, y: 823 },
  ],
};

const SPRITE_TEMPLATES: SpriteTemplate[] = [
  {
    id: "ship-5-sunk",
    label: "5-cell sunk (horizontal)",
    imageHref: "/sprites/ship-5-sunk.png",
    shipLength: 5,
  },
  {
    id: "ship-2-idle",
    label: "2-cell idle",
    imageHref: "/sprites/ship-2-idle.png",
    shipLength: 2,
  },
  {
    id: "ship-2-hit1",
    label: "2-cell hit x1",
    imageHref: "/sprites/ship-2-hit1.png",
    shipLength: 2,
  },
  {
    id: "ship-2-hit2",
    label: "2-cell hit x2",
    imageHref: "/sprites/ship-2-hit2.png",
    shipLength: 2,
  },
];

const SPRITE_TEMPLATE_BY_ID: Record<SpriteTemplateId, SpriteTemplate> = {
  "ship-5-sunk": SPRITE_TEMPLATES[0],
  "ship-2-idle": SPRITE_TEMPLATES[1],
  "ship-2-hit1": SPRITE_TEMPLATES[2],
  "ship-2-hit2": SPRITE_TEMPLATES[3],
};

const DEFAULT_SPRITE_TRANSFORMS: SpriteTransformMap = {
  "ship-5-sunk": { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
  "ship-2-idle": { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
  "ship-2-hit1": { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
  "ship-2-hit2": { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDeg: 0 },
};

export type BoardMark = "unknown" | "miss" | "hit";

interface CarpetBoardProps {
  attackRadar: BoardMark[][];
  defenseRadar: BoardMark[][];
  shipGrid: number[][];
  playerShipHits: number[];
  enemyShipGrid: number[][];
  enemyShipHits: number[];
  showDefenseLayer: boolean;
  canShoot: boolean;
  onCellClick: (row: number, col: number) => void;
  hitEffects?: HitEffect[];
  waterValue?: number;
  calibrationStorageKey?: string;
  showSetupUi?: boolean;
  containerClassName?: string;
  enableHandStrike?: boolean;
  showCalibrationControls?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
}

function clonePoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function cloneBoundary(boundary: BoundaryControl): BoundaryControl {
  return {
    top: boundary.top.map(clonePoint),
    right: boundary.right.map(clonePoint),
    bottom: boundary.bottom.map(clonePoint),
    left: boundary.left.map(clonePoint),
  };
}

function createDefaultBoundary(): BoundaryControl {
  return cloneBoundary(DEFAULT_BOUNDARY);
}

function parseStoredBoundary(raw: string | null): BoundaryControl | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BoundaryControl>;
    if (!parsed.top || !parsed.right || !parsed.bottom || !parsed.left) return null;
    if (
      parsed.top.length !== EDGE_POINT_COUNT ||
      parsed.right.length !== EDGE_POINT_COUNT ||
      parsed.bottom.length !== EDGE_POINT_COUNT ||
      parsed.left.length !== EDGE_POINT_COUNT
    ) {
      return null;
    }

    const toPoint = (value: unknown): Point | null => {
      if (!value || typeof value !== "object") return null;
      const point = value as Partial<Point>;
      if (typeof point.x !== "number" || typeof point.y !== "number") return null;
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      return { x: point.x, y: point.y };
    };

    const top = parsed.top.map(toPoint);
    const right = parsed.right.map(toPoint);
    const bottom = parsed.bottom.map(toPoint);
    const left = parsed.left.map(toPoint);
    if (
      top.some((point) => point === null) ||
      right.some((point) => point === null) ||
      bottom.some((point) => point === null) ||
      left.some((point) => point === null)
    ) {
      return null;
    }

    return {
      top: top as Point[],
      right: right as Point[],
      bottom: bottom as Point[],
      left: left as Point[],
    };
  } catch {
    return null;
  }
}

function loadInitialBoundary(storageKey: string): BoundaryControl {
  return resolveBoundarySource(storageKey).boundary;
}

function resolveBoundarySource(
  storageKey: string
): { boundary: BoundaryControl; source: CalibrationSource; keyUsed: string | null } {
  const fallback = createDefaultBoundary();
  if (typeof window === "undefined") {
    return { boundary: fallback, source: "default", keyUsed: null };
  }

  const keys = [storageKey, ...LEGACY_BOUNDARY_KEYS].filter(
    (key, index, list) => list.indexOf(key) === index
  );

  for (const key of keys) {
    const fromStorage = parseStoredBoundary(localStorage.getItem(key));
    if (fromStorage) {
      return { boundary: fromStorage, source: "storage", keyUsed: key };
    }
  }

  return { boundary: fallback, source: "default", keyUsed: null };
}

function normalizeSpriteTransform(transform: SpriteTransform): SpriteTransform {
  return {
    offsetX: clamp(transform.offsetX, -300, 300),
    offsetY: clamp(transform.offsetY, -300, 300),
    scaleX: clamp(transform.scaleX, 0.2, 3.5),
    scaleY: clamp(transform.scaleY, 0.2, 3.5),
    rotationDeg: clamp(transform.rotationDeg, -180, 180),
  };
}

function parseSpriteTransformValue(value: unknown, fallback: SpriteTransform): SpriteTransform {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<SpriteTransform>;
  if (
    typeof candidate.offsetX !== "number" ||
    typeof candidate.offsetY !== "number" ||
    typeof candidate.scaleX !== "number" ||
    typeof candidate.scaleY !== "number" ||
    typeof candidate.rotationDeg !== "number"
  ) {
    return fallback;
  }
  return normalizeSpriteTransform({
    offsetX: candidate.offsetX,
    offsetY: candidate.offsetY,
    scaleX: candidate.scaleX,
    scaleY: candidate.scaleY,
    rotationDeg: candidate.rotationDeg,
  });
}

function parseStoredSpriteTransformMap(raw: string | null): SpriteTransformMap | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<SpriteTemplateId, unknown>>;
    return {
      "ship-5-sunk": parseSpriteTransformValue(
        parsed["ship-5-sunk"],
        DEFAULT_SPRITE_TRANSFORMS["ship-5-sunk"]
      ),
      "ship-2-idle": parseSpriteTransformValue(
        parsed["ship-2-idle"],
        DEFAULT_SPRITE_TRANSFORMS["ship-2-idle"]
      ),
      "ship-2-hit1": parseSpriteTransformValue(
        parsed["ship-2-hit1"],
        DEFAULT_SPRITE_TRANSFORMS["ship-2-hit1"]
      ),
      "ship-2-hit2": parseSpriteTransformValue(
        parsed["ship-2-hit2"],
        DEFAULT_SPRITE_TRANSFORMS["ship-2-hit2"]
      ),
    };
  } catch {
    return null;
  }
}

function loadInitialSpriteTransformMap(): SpriteTransformMap {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SPRITE_TRANSFORMS };
  }
  const fromStorage = parseStoredSpriteTransformMap(
    localStorage.getItem(SPRITE_TRANSFORM_STORAGE_KEY)
  );
  return fromStorage ?? { ...DEFAULT_SPRITE_TRANSFORMS };
}

function sampleEdge(points: Point[], t: number): Point {
  const u = clamp(t, 0, 1) * GRID_SIZE;
  const index = Math.floor(u);
  const nextIndex = Math.min(GRID_SIZE, index + 1);
  const localT = u - index;
  return lerpPoint(points[index], points[nextIndex], localT);
}

function coonsPoint(boundary: BoundaryControl, u: number, v: number): Point {
  const top = sampleEdge(boundary.top, u);
  const bottom = sampleEdge(boundary.bottom, u);
  const left = sampleEdge(boundary.left, v);
  const right = sampleEdge(boundary.right, v);

  const topLeft = boundary.top[0];
  const topRight = boundary.top[GRID_SIZE];
  const bottomRight = boundary.bottom[GRID_SIZE];
  const bottomLeft = boundary.bottom[0];

  const bilinearX =
    (1 - u) * (1 - v) * topLeft.x +
    u * (1 - v) * topRight.x +
    u * v * bottomRight.x +
    (1 - u) * v * bottomLeft.x;
  const bilinearY =
    (1 - u) * (1 - v) * topLeft.y +
    u * (1 - v) * topRight.y +
    u * v * bottomRight.y +
    (1 - u) * v * bottomLeft.y;

  return {
    x: (1 - v) * top.x + v * bottom.x + (1 - u) * left.x + u * right.x - bilinearX,
    y: (1 - v) * top.y + v * bottom.y + (1 - u) * left.y + u * right.y - bilinearY,
  };
}

function cellCorners(
  boundary: BoundaryControl,
  row: number,
  col: number
): [Point, Point, Point, Point] {
  const u0 = col / GRID_SIZE;
  const u1 = (col + 1) / GRID_SIZE;
  const v0 = row / GRID_SIZE;
  const v1 = (row + 1) / GRID_SIZE;
  return [
    coonsPoint(boundary, u0, v0),
    coonsPoint(boundary, u1, v0),
    coonsPoint(boundary, u1, v1),
    coonsPoint(boundary, u0, v1),
  ];
}

function polygonToString(points: Point[]): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function centerPoint(boundary: BoundaryControl, row: number, col: number): Point {
  return coonsPoint(boundary, (col + 0.5) / GRID_SIZE, (row + 0.5) / GRID_SIZE);
}

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function missMarkSize(corners: [Point, Point, Point, Point]): number {
  const topWidth = distance(corners[0], corners[1]);
  const bottomWidth = distance(corners[3], corners[2]);
  const leftHeight = distance(corners[0], corners[3]);
  const rightHeight = distance(corners[1], corners[2]);
  const avgWidth = (topWidth + bottomWidth) / 2;
  const avgHeight = (leftHeight + rightHeight) / 2;
  return Math.max(16, Math.min(avgWidth, avgHeight) * 0.86);
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function collectShipCells(shipGrid: number[][], waterValue: number): Map<number, GridCell[]> {
  const map = new Map<number, GridCell[]>();
  for (let row = 0; row < shipGrid.length; row += 1) {
    for (let col = 0; col < shipGrid[row].length; col += 1) {
      const shipId = shipGrid[row][col];
      if (shipId === waterValue) continue;
      const existing = map.get(shipId);
      if (existing) {
        existing.push({ row, col });
      } else {
        map.set(shipId, [{ row, col }]);
      }
    }
  }
  return map;
}

function toHorizontalSpan(shipId: number, cells: GridCell[]): HorizontalShipSpan | null {
  if (cells.length === 0) return null;

  const row = cells[0].row;
  if (cells.some((cell) => cell.row !== row)) return null;

  const sorted = cells.slice().sort((a, b) => a.col - b.col);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].col !== sorted[i - 1].col + 1) {
      return null;
    }
  }

  return {
    shipId,
    row,
    startCol: sorted[0].col,
    endCol: sorted[sorted.length - 1].col,
    length: sorted.length,
    cells: sorted,
  };
}

function collectHorizontalSpans(shipGrid: number[][], waterValue: number): HorizontalShipSpan[] {
  const spans: HorizontalShipSpan[] = [];
  const ships = collectShipCells(shipGrid, waterValue);
  ships.forEach((cells, shipId) => {
    const span = toHorizontalSpan(shipId, cells);
    if (span) spans.push(span);
  });
  return spans;
}

function spanToPoints(
  boundary: BoundaryControl,
  span: HorizontalShipSpan
): [Point, Point, Point, Point] {
  const first = cellCorners(boundary, span.row, span.startCol);
  const last = cellCorners(boundary, span.row, span.endCol);
  return [first[0], last[1], last[2], first[3]];
}

function polygonBounds(points: Point[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function polygonCenter(points: Point[]): Point {
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );
  const count = points.length || 1;
  return { x: sum.x / count, y: sum.y / count };
}

function buildOverlayRenderSpec(
  points: [Point, Point, Point, Point],
  transform: SpriteTransform
): OverlayRenderSpec {
  const bounds = polygonBounds(points);
  const center = polygonCenter(points);

  const width = Math.max(1, bounds.width * transform.scaleX);
  const height = Math.max(1, bounds.height * transform.scaleY);
  const cx = center.x + transform.offsetX;
  const cy = center.y + transform.offsetY;

  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    cx,
    cy,
  };
}

function toPercent(value: number, full: number): number {
  return (value / full) * 100;
}

function handTopLeftFromAnchor(
  anchor: Point,
  width: number,
  height: number,
  anchorX: number,
  anchorY: number,
  scale: number
): { left: number; top: number; width: number; height: number } {
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  return {
    left: anchor.x - anchorX * scale,
    top: anchor.y - anchorY * scale,
    width: scaledWidth,
    height: scaledHeight,
  };
}

function allPerimeterHandles(): PerimeterHandle[] {
  const top = Array.from({ length: EDGE_POINT_COUNT }, (_, index) => ({
    edge: "top" as const,
    index,
  }));
  const right = Array.from({ length: GRID_SIZE }, (_, index) => ({
    edge: "right" as const,
    index: index + 1,
  }));
  const bottom = Array.from({ length: GRID_SIZE }, (_, index) => ({
    edge: "bottom" as const,
    index: GRID_SIZE - 1 - index,
  }));
  const left = Array.from({ length: GRID_SIZE - 1 }, (_, index) => ({
    edge: "left" as const,
    index: GRID_SIZE - 1 - index,
  }));
  return [...top, ...right, ...bottom, ...left];
}

const PERIMETER_HANDLES = allPerimeterHandles();

function setBoundaryPoint(
  boundary: BoundaryControl,
  edge: EdgeKey,
  index: number,
  point: Point
): BoundaryControl {
  const next = cloneBoundary(boundary);
  next[edge][index] = point;

  if (edge === "top" && index === 0) next.left[0] = clonePoint(point);
  if (edge === "left" && index === 0) next.top[0] = clonePoint(point);

  if (edge === "top" && index === GRID_SIZE) next.right[0] = clonePoint(point);
  if (edge === "right" && index === 0) next.top[GRID_SIZE] = clonePoint(point);

  if (edge === "right" && index === GRID_SIZE) next.bottom[GRID_SIZE] = clonePoint(point);
  if (edge === "bottom" && index === GRID_SIZE) next.right[GRID_SIZE] = clonePoint(point);

  if (edge === "bottom" && index === 0) next.left[GRID_SIZE] = clonePoint(point);
  if (edge === "left" && index === GRID_SIZE) next.bottom[0] = clonePoint(point);

  return next;
}

export function CarpetBoard({
  attackRadar,
  defenseRadar,
  shipGrid,
  playerShipHits,
  enemyShipGrid,
  enemyShipHits,
  showDefenseLayer,
  canShoot,
  onCellClick,
  hitEffects = [],
  waterValue = -1,
  calibrationStorageKey = DEFAULT_STORAGE_KEY,
  showSetupUi = true,
  containerClassName = "mx-auto w-full max-w-[1240px]",
  enableHandStrike = true,
  showCalibrationControls = false,
}: CarpetBoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shotTimerIdsRef = useRef<number[]>([]);
  const [savedBoundary, setSavedBoundary] = useState<BoundaryControl>(() =>
    loadInitialBoundary(calibrationStorageKey)
  );
  const [draftBoundary, setDraftBoundary] = useState<BoundaryControl>(() =>
    loadInitialBoundary(calibrationStorageKey)
  );
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [activeHandle, setActiveHandle] = useState<PerimeterHandle | null>(null);

  const [spriteTransformMap, setSpriteTransformMap] = useState<SpriteTransformMap>(() =>
    loadInitialSpriteTransformMap()
  );
  const [selectedSpriteId, setSelectedSpriteId] = useState<SpriteTemplateId | null>(null);
  const [draftSpriteTransform, setDraftSpriteTransform] = useState<SpriteTransform | null>(null);
  const [activeSpriteDrag, setActiveSpriteDrag] = useState<ActiveSpriteDrag | null>(null);
  const [shotSequence, setShotSequence] = useState<ShotSequence | null>(null);
  const [splashClockMs, setSplashClockMs] = useState<number>(() => Date.now());
  const [calibrationSource, setCalibrationSource] = useState<CalibrationSource>("default");
  const [calibrationSourceKey, setCalibrationSourceKey] = useState<string | null>(null);

  const boardBoundary = isCalibrating ? draftBoundary : savedBoundary;
  const canShowCalibration = showSetupUi || showCalibrationControls;
  const isSpriteEditing = selectedSpriteId !== null && draftSpriteTransform !== null;
  const isShotRunning = shotSequence !== null;

  useEffect(() => {
    return () => {
      for (const id of shotTimerIdsRef.current) {
        window.clearTimeout(id);
      }
      shotTimerIdsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { boundary, source, keyUsed } = resolveBoundarySource(calibrationStorageKey);
    const nextBoundary = boundary;
    setSavedBoundary(cloneBoundary(nextBoundary));
    setDraftBoundary(cloneBoundary(nextBoundary));
    setIsCalibrating(false);
    setActiveHandle(null);
    setCalibrationSource(source);
    setCalibrationSourceKey(keyUsed);
    if (source === "storage" && keyUsed && keyUsed !== calibrationStorageKey) {
      localStorage.setItem(calibrationStorageKey, JSON.stringify(nextBoundary));
    }
  }, [calibrationStorageKey]);

  useEffect(() => {
    if (hitEffects.length === 0) return;
    const timer = window.setInterval(() => {
      setSplashClockMs(Date.now());
    }, 50);
    return () => {
      window.clearInterval(timer);
    };
  }, [hitEffects.length]);

  const attackOverlays = useMemo(() => {
    const overlays: ShipOverlay[] = [];
    const coveredCellKeys = new Set<string>();
    const spans = collectHorizontalSpans(enemyShipGrid, waterValue);

    for (const span of spans) {
      if (span.length === 2) {
        const hits = enemyShipHits[span.shipId] ?? 0;
        if (hits < 2) continue;
        const templateId: SpriteTemplateId = "ship-2-hit2";
        const points = spanToPoints(boardBoundary, span);
        const keys = span.cells.map((cell) => cellKey(cell.row, cell.col));
        keys.forEach((key) => coveredCellKeys.add(key));
        overlays.push({
          key: `attack-${span.shipId}`,
          templateId,
          imageHref: SPRITE_TEMPLATE_BY_ID[templateId].imageHref,
          points,
          coveredCellKeys: keys,
        });
        continue;
      }

      if (span.length === 5) {
        const hits = enemyShipHits[span.shipId] ?? 0;
        if (hits < 5) continue;
        const templateId: SpriteTemplateId = "ship-5-sunk";
        const points = spanToPoints(boardBoundary, span);
        const keys = span.cells.map((cell) => cellKey(cell.row, cell.col));
        keys.forEach((key) => coveredCellKeys.add(key));
        overlays.push({
          key: `attack-${span.shipId}`,
          templateId,
          imageHref: SPRITE_TEMPLATE_BY_ID[templateId].imageHref,
          points,
          coveredCellKeys: keys,
        });
      }
    }

    return { overlays, coveredCellKeys };
  }, [boardBoundary, enemyShipGrid, enemyShipHits, waterValue]);

  const defenseOverlays = useMemo(() => {
    if (!showDefenseLayer) {
      return { overlays: [] as ShipOverlay[], coveredCellKeys: new Set<string>() };
    }

    const overlays: ShipOverlay[] = [];
    const coveredCellKeys = new Set<string>();
    const spans = collectHorizontalSpans(shipGrid, waterValue);

    for (const span of spans) {
      if (span.length !== 2) continue;

      const hits = playerShipHits[span.shipId] ?? 0;
      const templateId: SpriteTemplateId =
        hits <= 0 ? "ship-2-idle" : hits >= 2 ? "ship-2-hit2" : "ship-2-hit1";

      const points = spanToPoints(boardBoundary, span);
      const keys = span.cells.map((cell) => cellKey(cell.row, cell.col));
      keys.forEach((key) => coveredCellKeys.add(key));
      overlays.push({
        key: `defense-${span.shipId}`,
        templateId,
        imageHref: SPRITE_TEMPLATE_BY_ID[templateId].imageHref,
        points,
        coveredCellKeys: keys,
      });
    }

    return { overlays, coveredCellKeys };
  }, [boardBoundary, playerShipHits, shipGrid, showDefenseLayer, waterValue]);

  const shipOverlays = useMemo(
    () => [...attackOverlays.overlays, ...defenseOverlays.overlays],
    [attackOverlays.overlays, defenseOverlays.overlays]
  );

  const previewOverlay = useMemo(() => {
    if (!selectedSpriteId || !draftSpriteTransform) return null;

    const template = SPRITE_TEMPLATE_BY_ID[selectedSpriteId];
    const startCol = Math.max(0, Math.floor((GRID_SIZE - template.shipLength) / 2));
    const row = 4;
    const span: HorizontalShipSpan = {
      shipId: -1,
      row,
      startCol,
      endCol: startCol + template.shipLength - 1,
      length: template.shipLength,
      cells: Array.from({ length: template.shipLength }, (_, index) => ({
        row,
        col: startCol + index,
      })),
    };

    return {
      key: `preview-${template.id}`,
      templateId: template.id,
      imageHref: template.imageHref,
      points: spanToPoints(boardBoundary, span),
      coveredCellKeys: [] as string[],
    };
  }, [boardBoundary, draftSpriteTransform, selectedSpriteId]);

  function clearShotTimers(): void {
    for (const id of shotTimerIdsRef.current) {
      window.clearTimeout(id);
    }
    shotTimerIdsRef.current = [];
  }

  function scheduleShotStep(delayMs: number, action: () => void): void {
    const id = window.setTimeout(() => {
      action();
      shotTimerIdsRef.current = shotTimerIdsRef.current.filter((value) => value !== id);
    }, delayMs);
    shotTimerIdsRef.current.push(id);
  }

  const runShotSequence = useCallback((row: number, col: number, target: Point): void => {
    if (isShotRunning) return;
    const leftStart = { x: 0, y: IMAGE_HEIGHT };
    const rightStart = { x: IMAGE_WIDTH, y: 0 };

    clearShotTimers();
    setShotSequence({
      row,
      col,
      target,
      leftAnchor: leftStart,
      rightAnchor: rightStart,
      showRightHand: false,
      leftDurationMs: 0,
      rightDurationMs: 0,
    });

    scheduleShotStep(16, () => {
      setShotSequence((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          leftAnchor: target,
          leftDurationMs: SHOT_LEFT_TRAVEL_MS,
        };
      });
    });

    scheduleShotStep(SHOT_LEFT_TRAVEL_MS + SHOT_RIGHT_DELAY_MS, () => {
      setShotSequence((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          showRightHand: true,
          rightAnchor: target,
          rightDurationMs: SHOT_RIGHT_TRAVEL_MS,
        };
      });
    });

    scheduleShotStep(
      SHOT_LEFT_TRAVEL_MS + SHOT_RIGHT_DELAY_MS + SHOT_RIGHT_TRAVEL_MS,
      () => {
        onCellClick(row, col);
      }
    );

    scheduleShotStep(
      SHOT_LEFT_TRAVEL_MS +
        SHOT_RIGHT_DELAY_MS +
        SHOT_RIGHT_TRAVEL_MS +
        SHOT_IMPACT_PAUSE_MS,
      () => {
        setShotSequence((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            leftAnchor: leftStart,
            rightAnchor: rightStart,
            leftDurationMs: SHOT_RETURN_MS,
            rightDurationMs: SHOT_RETURN_MS,
          };
        });
      }
    );

    scheduleShotStep(
      SHOT_LEFT_TRAVEL_MS +
        SHOT_RIGHT_DELAY_MS +
        SHOT_RIGHT_TRAVEL_MS +
        SHOT_IMPACT_PAUSE_MS +
        SHOT_RETURN_MS +
        20,
      () => {
        setShotSequence(null);
      }
    );
  }, [isShotRunning, onCellClick]);

  const cells: ReactNode[] = useMemo(() => {
    return Array.from({ length: GRID_SIZE }, (_, row) =>
      Array.from({ length: GRID_SIZE }, (_, col) => {
        const corners = cellCorners(boardBoundary, row, col);
        const pointsString = polygonToString(corners);
        const center = centerPoint(boardBoundary, row, col);
        const holeSize = missMarkSize(corners);
        const nailWidth = holeSize * 0.62;
        const nailHeight = nailWidth * 1.8;

        const attackMark = attackRadar[row]?.[col] ?? "unknown";
        const defenseMark = defenseRadar[row]?.[col] ?? "unknown";
        const hasShip = shipGrid[row]?.[col] !== waterValue;
        const canClick =
          canShoot &&
          attackMark === "unknown" &&
          !isCalibrating &&
          !isSpriteEditing &&
          !isShotRunning;

        const key = cellKey(row, col);
        const hasAttackOverlay = attackOverlays.coveredCellKeys.has(key);
        const hasDefenseOverlay = defenseOverlays.coveredCellKeys.has(key);

        let layerFill = "rgba(15, 23, 42, 0)";
        if (defenseMark === "hit") {
          layerFill = "rgba(220, 38, 38, 0.65)";
        } else if (defenseMark === "miss") {
          layerFill = "rgba(226, 232, 240, 0.45)";
        } else if (showDefenseLayer && hasShip) {
          layerFill = hasDefenseOverlay ? "rgba(8, 145, 178, 0.08)" : "rgba(8, 145, 178, 0.45)";
        } else if (canClick) {
          layerFill = "rgba(8, 145, 178, 0.10)";
        }

        return (
          <g key={`cell-${row}-${col}`}>
            <polygon
              points={pointsString}
              fill={layerFill}
              stroke={isCalibrating ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0)"}
              strokeWidth={isCalibrating ? 1.2 : 0}
              className={
                canClick
                  ? "cursor-pointer transition hover:fill-cyan-500/25"
                  : "cursor-default transition"
              }
              onClick={() => {
                if (!canClick) return;
                if (enableHandStrike) {
                  runShotSequence(row, col, center);
                } else {
                  onCellClick(row, col);
                }
              }}
            />

            {attackMark === "hit" && !hasAttackOverlay && (
              <image
                href={HIT_NAIL_IMAGE_HREF}
                x={center.x - nailWidth / 2}
                y={center.y - nailHeight}
                width={nailWidth}
                height={nailHeight}
                preserveAspectRatio="xMidYMax meet"
                opacity={0.98}
                style={{ pointerEvents: "none" }}
              />
            )}
            {attackMark === "miss" && (
              <image
                href="/hole-mark.png"
                x={center.x - holeSize / 2}
                y={center.y - holeSize / 2}
                width={holeSize}
                height={holeSize}
                preserveAspectRatio="xMidYMid meet"
                opacity={0.96}
                style={{ pointerEvents: "none", mixBlendMode: "multiply" }}
              />
            )}
            {showDefenseLayer && defenseMark === "hit" && (
              <image
                href={HIT_NAIL_IMAGE_HREF}
                x={center.x - nailWidth / 2}
                y={center.y - nailHeight}
                width={nailWidth}
                height={nailHeight}
                preserveAspectRatio="xMidYMax meet"
                opacity={0.95}
                style={{ pointerEvents: "none" }}
              />
            )}
            {showDefenseLayer && defenseMark === "miss" && (
              <image
                href="/hole-mark.png"
                x={center.x - holeSize / 2}
                y={center.y - holeSize / 2}
                width={holeSize}
                height={holeSize}
                preserveAspectRatio="xMidYMid meet"
                opacity={0.96}
                style={{ pointerEvents: "none", mixBlendMode: "multiply" }}
              />
            )}
          </g>
        );
      })
    ).flat();
  }, [
    attackRadar,
    boardBoundary,
    canShoot,
    defenseRadar,
    defenseOverlays.coveredCellKeys,
    isCalibrating,
    isSpriteEditing,
    isShotRunning,
    attackOverlays.coveredCellKeys,
    enableHandStrike,
    onCellClick,
    runShotSequence,
    shipGrid,
    showDefenseLayer,
    waterValue,
  ]);

  const activeSplashEffects = useMemo(() => {
    return hitEffects
      .map((effect) => {
        const elapsed = splashClockMs - effect.startedAtMs;
        if (elapsed < 0 || elapsed >= HIT_SPLASH_DURATION_MS) return null;

        const frameIndex = Math.min(
          HIT_SPLASH_FRAMES.length - 1,
          Math.floor(elapsed / HIT_SPLASH_FRAME_MS)
        );
        const corners = cellCorners(boardBoundary, effect.row, effect.col);
        const center = centerPoint(boardBoundary, effect.row, effect.col);
        const size = missMarkSize(corners) * 3.4;
        return {
          id: effect.id,
          frameHref: HIT_SPLASH_FRAMES[frameIndex],
          leftPct: toPercent(center.x - size / 2, IMAGE_WIDTH),
          topPct: toPercent(center.y - size / 2, IMAGE_HEIGHT),
          widthPct: toPercent(size, IMAGE_WIDTH),
          heightPct: toPercent(size, IMAGE_HEIGHT),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [boardBoundary, hitEffects, splashClockMs]);

  const leftHandPlacement = useMemo(() => {
    if (!shotSequence) return null;
    const rect = handTopLeftFromAnchor(
      shotSequence.leftAnchor,
      HAND_LEFT_WIDTH,
      HAND_LEFT_HEIGHT,
      HAND_LEFT_ANCHOR_X,
      HAND_LEFT_ANCHOR_Y,
      HAND_LEFT_SCALE
    );
    return {
      leftPct: toPercent(rect.left, IMAGE_WIDTH),
      topPct: toPercent(rect.top, IMAGE_HEIGHT),
      widthPct: toPercent(rect.width, IMAGE_WIDTH),
      heightPct: toPercent(rect.height, IMAGE_HEIGHT),
      durationMs: shotSequence.leftDurationMs,
    };
  }, [shotSequence]);

  const rightHandPlacement = useMemo(() => {
    if (!shotSequence || !shotSequence.showRightHand) return null;
    const rect = handTopLeftFromAnchor(
      shotSequence.rightAnchor,
      HAND_RIGHT_WIDTH,
      HAND_RIGHT_HEIGHT,
      HAND_RIGHT_ANCHOR_X,
      HAND_RIGHT_ANCHOR_Y,
      HAND_RIGHT_SCALE
    );
    return {
      leftPct: toPercent(rect.left, IMAGE_WIDTH),
      topPct: toPercent(rect.top, IMAGE_HEIGHT),
      widthPct: toPercent(rect.width, IMAGE_WIDTH),
      heightPct: toPercent(rect.height, IMAGE_HEIGHT),
      durationMs: shotSequence.rightDurationMs,
    };
  }, [shotSequence]);

  function pointerToImagePoint(clientX: number, clientY: number): Point | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: clamp(((clientX - rect.left) * IMAGE_WIDTH) / rect.width, 0, IMAGE_WIDTH),
      y: clamp(((clientY - rect.top) * IMAGE_HEIGHT) / rect.height, 0, IMAGE_HEIGHT),
    };
  }

  function moveHandle(edge: EdgeKey, index: number, clientX: number, clientY: number): void {
    const point = pointerToImagePoint(clientX, clientY);
    if (!point) return;
    setDraftBoundary((prev) => setBoundaryPoint(prev, edge, index, point));
  }

  function startHandleDrag(handle: PerimeterHandle, event: ReactPointerEvent<SVGCircleElement>) {
    if (!isCalibrating) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveHandle(handle);
    moveHandle(handle.edge, handle.index, event.clientX, event.clientY);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore unsupported pointer capture.
    }
  }

  function stopAllDragging(): void {
    setActiveHandle(null);
    setActiveSpriteDrag(null);
  }

  function onSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (activeSpriteDrag && draftSpriteTransform) {
      const point = pointerToImagePoint(event.clientX, event.clientY);
      if (!point) return;
      const dx = point.x - activeSpriteDrag.pointerStart.x;
      const dy = point.y - activeSpriteDrag.pointerStart.y;
      setDraftSpriteTransform({
        ...draftSpriteTransform,
        offsetX: activeSpriteDrag.offsetXStart + dx,
        offsetY: activeSpriteDrag.offsetYStart + dy,
      });
      return;
    }

    if (!isCalibrating || !activeHandle) return;
    moveHandle(activeHandle.edge, activeHandle.index, event.clientX, event.clientY);
  }

  function beginCalibration(): void {
    setDraftBoundary(cloneBoundary(savedBoundary));
    setActiveHandle(null);
    setIsCalibrating(true);
  }

  function saveCalibration(): void {
    const next = cloneBoundary(draftBoundary);
    setSavedBoundary(next);
    setIsCalibrating(false);
    setActiveHandle(null);
    setCalibrationSource("storage");
    setCalibrationSourceKey(calibrationStorageKey);
    if (typeof window !== "undefined") {
      const serialized = JSON.stringify(next);
      localStorage.setItem(calibrationStorageKey, serialized);
      for (const key of LEGACY_BOUNDARY_KEYS) {
        localStorage.setItem(key, serialized);
      }
    }
  }

  function cancelCalibration(): void {
    setDraftBoundary(cloneBoundary(savedBoundary));
    setActiveHandle(null);
    setIsCalibrating(false);
  }

  function resetToDefault(): void {
    setDraftBoundary(createDefaultBoundary());
  }

  async function copyBoundaryJson(): Promise<void> {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(JSON.stringify(draftBoundary, null, 2));
  }

  function startSpriteEditing(templateId: SpriteTemplateId): void {
    setSelectedSpriteId(templateId);
    setDraftSpriteTransform({ ...spriteTransformMap[templateId] });
    setActiveSpriteDrag(null);
  }

  function cancelSpriteEditing(): void {
    setSelectedSpriteId(null);
    setDraftSpriteTransform(null);
    setActiveSpriteDrag(null);
  }

  function updateDraftTransform(patch: Partial<SpriteTransform>): void {
    if (!draftSpriteTransform) return;
    setDraftSpriteTransform(normalizeSpriteTransform({ ...draftSpriteTransform, ...patch }));
  }

  function resetDraftTransform(): void {
    if (!selectedSpriteId) return;
    setDraftSpriteTransform({ ...DEFAULT_SPRITE_TRANSFORMS[selectedSpriteId] });
  }

  function saveSpriteTransform(): void {
    if (!selectedSpriteId || !draftSpriteTransform) return;
    const normalized = normalizeSpriteTransform(draftSpriteTransform);
    const nextMap: SpriteTransformMap = {
      ...spriteTransformMap,
      [selectedSpriteId]: normalized,
    };
    setSpriteTransformMap(nextMap);
    if (typeof window !== "undefined") {
      localStorage.setItem(SPRITE_TRANSFORM_STORAGE_KEY, JSON.stringify(nextMap));
    }
    setSelectedSpriteId(null);
    setDraftSpriteTransform(null);
    setActiveSpriteDrag(null);
  }

  function startSpriteDrag(event: ReactPointerEvent<SVGRectElement>): void {
    if (!draftSpriteTransform) return;
    const point = pointerToImagePoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();

    setActiveSpriteDrag({
      pointerStart: point,
      offsetXStart: draftSpriteTransform.offsetX,
      offsetYStart: draftSpriteTransform.offsetY,
    });

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Ignore unsupported pointer capture.
    }
  }

  const handles = isCalibrating ? draftBoundary : savedBoundary;

  return (
    <div className={containerClassName}>
      <div className={showSetupUi ? "grid gap-4 xl:grid-cols-[1fr_320px]" : ""}>
        <div className={showSetupUi ? "" : "relative"}>
          <div className={`relative ${showSetupUi ? "" : "overflow-hidden"}`}>
            <Image
              src="/carpet-board.png"
              alt="Carpet battlefield board"
              width={IMAGE_WIDTH}
              height={IMAGE_HEIGHT}
              priority
              className={`h-auto w-full select-none ${
                showSetupUi ? "rounded-xl border border-cyan-900/50" : ""
              }`}
            />
            <svg
              ref={svgRef}
              viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
              className="absolute inset-0 h-full w-full touch-none"
              onPointerMove={onSvgPointerMove}
              onPointerUp={stopAllDragging}
              onPointerCancel={stopAllDragging}
              onPointerLeave={stopAllDragging}
              aria-hidden="true"
            >
              {shipOverlays.map((overlay) => {
                const transform = spriteTransformMap[overlay.templateId];
                const spec = buildOverlayRenderSpec(overlay.points, transform);
                return (
                  <image
                    key={overlay.key}
                    href={overlay.imageHref}
                    x={spec.x}
                    y={spec.y}
                    width={spec.width}
                    height={spec.height}
                    preserveAspectRatio="xMidYMid meet"
                    transform={`rotate(${transform.rotationDeg} ${spec.cx} ${spec.cy})`}
                    opacity={0.98}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}

              {showSetupUi && previewOverlay && draftSpriteTransform && (() => {
                const spec = buildOverlayRenderSpec(previewOverlay.points, draftSpriteTransform);
                return (
                  <g>
                    <image
                      href={previewOverlay.imageHref}
                      x={spec.x}
                      y={spec.y}
                      width={spec.width}
                      height={spec.height}
                      preserveAspectRatio="xMidYMid meet"
                      transform={`rotate(${draftSpriteTransform.rotationDeg} ${spec.cx} ${spec.cy})`}
                      opacity={0.92}
                    />
                    <rect
                      x={spec.x}
                      y={spec.y}
                      width={spec.width}
                      height={spec.height}
                      fill="transparent"
                      stroke="rgba(250, 204, 21, 0.95)"
                      strokeWidth={2}
                      strokeDasharray="10 6"
                      transform={`rotate(${draftSpriteTransform.rotationDeg} ${spec.cx} ${spec.cy})`}
                      className="cursor-move"
                      onPointerDown={startSpriteDrag}
                    />
                    <circle
                      cx={spec.cx}
                      cy={spec.cy}
                      r={7}
                      fill="rgba(250, 204, 21, 0.95)"
                      stroke="rgba(68, 64, 60, 0.95)"
                      strokeWidth={2}
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                );
              })()}

              {cells}

              {canShowCalibration &&
                isCalibrating &&
                PERIMETER_HANDLES.map((handle) => {
                  const point = handles[handle.edge][handle.index];
                  return (
                    <circle
                      key={`${handle.edge}-${handle.index}`}
                      cx={point.x}
                      cy={point.y}
                      r={8}
                      fill="rgba(34, 211, 238, 0.92)"
                      stroke="rgba(8, 47, 73, 0.95)"
                      strokeWidth={2.5}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(event) => startHandleDrag(handle, event)}
                    />
                  );
                })}
            </svg>

            {activeSplashEffects.map((effect) => (
              <img
                key={effect.id}
                src={effect.frameHref}
                alt=""
                className="pointer-events-none absolute z-20"
                style={{
                  left: `${effect.leftPct}%`,
                  top: `${effect.topPct}%`,
                  width: `${effect.widthPct}%`,
                  height: `${effect.heightPct}%`,
                  imageRendering: "auto",
                  mixBlendMode: "screen",
                }}
              />
            ))}

            {enableHandStrike && leftHandPlacement && (
              <img
                src={HAND_LEFT_IMAGE_HREF}
                alt=""
                className="pointer-events-none absolute select-none"
                style={{
                  left: `${leftHandPlacement.leftPct}%`,
                  top: `${leftHandPlacement.topPct}%`,
                  width: `${leftHandPlacement.widthPct}%`,
                  height: `${leftHandPlacement.heightPct}%`,
                  transition: `left ${leftHandPlacement.durationMs}ms linear, top ${leftHandPlacement.durationMs}ms linear`,
                  filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.4))",
                }}
              />
            )}

            {enableHandStrike && rightHandPlacement && (
              <img
                src={HAND_RIGHT_IMAGE_HREF}
                alt=""
                className="pointer-events-none absolute select-none"
                style={{
                  left: `${rightHandPlacement.leftPct}%`,
                  top: `${rightHandPlacement.topPct}%`,
                  width: `${rightHandPlacement.widthPct}%`,
                  height: `${rightHandPlacement.heightPct}%`,
                  transition: `left ${rightHandPlacement.durationMs}ms linear, top ${rightHandPlacement.durationMs}ms linear`,
                  filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.45))",
                }}
              />
            )}
          </div>

          {canShowCalibration && (
            <div
              className={
                showSetupUi
                  ? "mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm"
                  : "absolute bottom-3 left-3 right-3 z-40 flex flex-wrap items-center gap-2 rounded-md bg-black/45 px-2 py-1 text-[11px] text-cyan-100 sm:text-xs"
              }
            >
              {!isCalibrating ? (
                <button
                  onClick={beginCalibration}
                  className="rounded-md border border-cyan-500/70 bg-cyan-500/20 px-3 py-1 text-cyan-100 transition hover:bg-cyan-500/30"
                >
                  Calibrate perimeter points
                </button>
              ) : (
                <>
                  <button
                    onClick={saveCalibration}
                    className="rounded-md border border-emerald-500/70 bg-emerald-500/20 px-3 py-1 text-emerald-100 transition hover:bg-emerald-500/30"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelCalibration}
                    className="rounded-md border border-slate-400/70 bg-slate-500/20 px-3 py-1 text-slate-100 transition hover:bg-slate-500/30"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={resetToDefault}
                    className="rounded-md border border-amber-500/70 bg-amber-500/20 px-3 py-1 text-amber-100 transition hover:bg-amber-500/30"
                  >
                    Reset default
                  </button>
                  <button
                    onClick={() => {
                      void copyBoundaryJson();
                    }}
                    className="rounded-md border border-violet-500/70 bg-violet-500/20 px-3 py-1 text-violet-100 transition hover:bg-violet-500/30"
                  >
                    Copy boundary JSON
                  </button>
                  <span className="text-cyan-200/80">
                    Drag perimeter points and Save.
                  </span>
                </>
              )}
              <span className="text-cyan-200/80">
                Source: {calibrationSource === "storage" ? "localStorage" : "default"}{" "}
                {calibrationSourceKey ? `(key: ${calibrationSourceKey})` : ""}
              </span>
            </div>
          )}
        </div>

        {showSetupUi && (
          <aside className="rounded-xl border border-cyan-900/60 bg-slate-950/70 p-3 shadow-[0_0_24px_rgba(8,145,178,0.12)]">
          <h3 className="text-sm font-semibold text-cyan-100">Sprite Transformer</h3>
          <p className="mt-1 text-xs text-cyan-200/80">
            Pick a sprite, adjust it on board (drag + sliders), then press Save.
          </p>

          <div className="mt-3 grid gap-2">
            {SPRITE_TEMPLATES.map((template) => {
              const active = selectedSpriteId === template.id;
              return (
                <button
                  key={template.id}
                  onClick={() => startSpriteEditing(template.id)}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${
                    active
                      ? "border-amber-300/80 bg-amber-500/20"
                      : "border-cyan-900/60 bg-slate-900/70 hover:bg-slate-800"
                  }`}
                >
                  <img
                    src={template.imageHref}
                    alt={template.label}
                    className="h-10 w-16 rounded object-contain bg-slate-800/70"
                  />
                  <span className="text-xs text-cyan-100">{template.label}</span>
                </button>
              );
            })}
          </div>

          {selectedSpriteId && draftSpriteTransform && (
            <div className="mt-3 space-y-2 rounded-lg border border-amber-400/40 bg-amber-500/10 p-2">
              <div className="text-xs font-semibold text-amber-100">
                Editing: {SPRITE_TEMPLATE_BY_ID[selectedSpriteId].label}
              </div>

              <label className="block text-xs text-cyan-100/90">
                Offset X: {Math.round(draftSpriteTransform.offsetX)}
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={1}
                  value={draftSpriteTransform.offsetX}
                  onChange={(event) =>
                    updateDraftTransform({ offsetX: Number(event.target.value) })
                  }
                  className="mt-1 w-full"
                />
              </label>

              <label className="block text-xs text-cyan-100/90">
                Offset Y: {Math.round(draftSpriteTransform.offsetY)}
                <input
                  type="range"
                  min={-300}
                  max={300}
                  step={1}
                  value={draftSpriteTransform.offsetY}
                  onChange={(event) =>
                    updateDraftTransform({ offsetY: Number(event.target.value) })
                  }
                  className="mt-1 w-full"
                />
              </label>

              <label className="block text-xs text-cyan-100/90">
                Scale X: {draftSpriteTransform.scaleX.toFixed(2)}
                <input
                  type="range"
                  min={0.2}
                  max={3.5}
                  step={0.01}
                  value={draftSpriteTransform.scaleX}
                  onChange={(event) =>
                    updateDraftTransform({ scaleX: Number(event.target.value) })
                  }
                  className="mt-1 w-full"
                />
              </label>

              <label className="block text-xs text-cyan-100/90">
                Scale Y: {draftSpriteTransform.scaleY.toFixed(2)}
                <input
                  type="range"
                  min={0.2}
                  max={3.5}
                  step={0.01}
                  value={draftSpriteTransform.scaleY}
                  onChange={(event) =>
                    updateDraftTransform({ scaleY: Number(event.target.value) })
                  }
                  className="mt-1 w-full"
                />
              </label>

              <label className="block text-xs text-cyan-100/90">
                Rotation: {Math.round(draftSpriteTransform.rotationDeg)}°
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={draftSpriteTransform.rotationDeg}
                  onChange={(event) =>
                    updateDraftTransform({ rotationDeg: Number(event.target.value) })
                  }
                  className="mt-1 w-full"
                />
              </label>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={saveSpriteTransform}
                  className="rounded-md border border-emerald-400/80 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                >
                  Save
                </button>
                <button
                  onClick={resetDraftTransform}
                  className="rounded-md border border-cyan-400/70 bg-cyan-500/20 px-3 py-1 text-xs text-cyan-100 transition hover:bg-cyan-500/30"
                >
                  Reset
                </button>
                <button
                  onClick={cancelSpriteEditing}
                  className="rounded-md border border-slate-400/70 bg-slate-500/20 px-3 py-1 text-xs text-slate-100 transition hover:bg-slate-500/30"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          </aside>
        )}
      </div>
    </div>
  );
}

