"use client";

import Image from "next/image";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

const IMAGE_WIDTH = 1448;
const IMAGE_HEIGHT = 1086;
const GRID_SIZE = 10;
const EDGE_POINT_COUNT = GRID_SIZE + 1;

type EdgeKey = "top" | "right" | "bottom" | "left";

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

const DEFAULT_STORAGE_KEY = "sea-war.carpet-board-boundary.v2";

const DEFAULT_QUAD: Quad = {
  topLeft: { x: 411, y: 285 },
  topRight: { x: 986, y: 264 },
  bottomRight: { x: 1126, y: 780 },
  bottomLeft: { x: 444, y: 823 },
};

export type BoardMark = "unknown" | "miss" | "hit";

interface CarpetBoardProps {
  attackRadar: BoardMark[][];
  defenseRadar: BoardMark[][];
  shipGrid: number[][];
  showDefenseLayer: boolean;
  canShoot: boolean;
  onCellClick: (row: number, col: number) => void;
  waterValue?: number;
  calibrationStorageKey?: string;
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

function makeEdgePoints(start: Point, end: Point): Point[] {
  return Array.from({ length: EDGE_POINT_COUNT }, (_, index) => {
    const t = index / GRID_SIZE;
    return lerpPoint(start, end, t);
  });
}

function createDefaultBoundary(): BoundaryControl {
  return {
    top: makeEdgePoints(DEFAULT_QUAD.topLeft, DEFAULT_QUAD.topRight),
    right: makeEdgePoints(DEFAULT_QUAD.topRight, DEFAULT_QUAD.bottomRight),
    bottom: makeEdgePoints(DEFAULT_QUAD.bottomLeft, DEFAULT_QUAD.bottomRight),
    left: makeEdgePoints(DEFAULT_QUAD.topLeft, DEFAULT_QUAD.bottomLeft),
  };
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
  const fallback = createDefaultBoundary();
  if (typeof window === "undefined") return fallback;
  const fromStorage = parseStoredBoundary(localStorage.getItem(storageKey));
  return fromStorage ?? fallback;
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
  showDefenseLayer,
  canShoot,
  onCellClick,
  waterValue = -1,
  calibrationStorageKey = DEFAULT_STORAGE_KEY,
}: CarpetBoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [savedBoundary, setSavedBoundary] = useState<BoundaryControl>(() =>
    loadInitialBoundary(calibrationStorageKey)
  );
  const [draftBoundary, setDraftBoundary] = useState<BoundaryControl>(() =>
    loadInitialBoundary(calibrationStorageKey)
  );
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [activeHandle, setActiveHandle] = useState<PerimeterHandle | null>(null);

  const boardBoundary = isCalibrating ? draftBoundary : savedBoundary;

  const cells: ReactNode[] = useMemo(() => {
    return Array.from({ length: GRID_SIZE }, (_, row) =>
      Array.from({ length: GRID_SIZE }, (_, col) => {
        const corners = cellCorners(boardBoundary, row, col);
        const pointsString = polygonToString(corners);
        const center = centerPoint(boardBoundary, row, col);
        const holeSize = missMarkSize(corners);

        const attackMark = attackRadar[row]?.[col] ?? "unknown";
        const defenseMark = defenseRadar[row]?.[col] ?? "unknown";
        const hasShip = shipGrid[row]?.[col] !== waterValue;
        const canClick = canShoot && attackMark === "unknown" && !isCalibrating;

        let layerFill = "rgba(15, 23, 42, 0)";
        if (defenseMark === "hit") {
          layerFill = "rgba(220, 38, 38, 0.65)";
        } else if (defenseMark === "miss") {
          layerFill = "rgba(226, 232, 240, 0.45)";
        } else if (showDefenseLayer && hasShip) {
          layerFill = "rgba(8, 145, 178, 0.45)";
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
                if (canClick) onCellClick(row, col);
              }}
            />

            {attackMark === "hit" && (
              <circle
                cx={center.x}
                cy={center.y}
                r={9}
                fill="rgba(185, 28, 28, 0.95)"
                className="animate-pulse"
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
          </g>
        );
      })
    ).flat();
  }, [
    attackRadar,
    boardBoundary,
    canShoot,
    defenseRadar,
    isCalibrating,
    onCellClick,
    shipGrid,
    showDefenseLayer,
    waterValue,
  ]);

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

  function stopHandleDrag(): void {
    setActiveHandle(null);
  }

  function onSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
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
    if (typeof window !== "undefined") {
      localStorage.setItem(calibrationStorageKey, JSON.stringify(next));
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

  const handles = isCalibrating ? draftBoundary : savedBoundary;

  return (
    <div className="mx-auto w-full max-w-[920px]">
      <div className="relative">
        <Image
          src="/carpet-board.png"
          alt="Carpet battlefield board"
          width={IMAGE_WIDTH}
          height={IMAGE_HEIGHT}
          priority
          className="h-auto w-full rounded-xl border border-cyan-900/50 select-none"
        />
        <svg
          ref={svgRef}
          viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerMove={onSvgPointerMove}
          onPointerUp={stopHandleDrag}
          onPointerCancel={stopHandleDrag}
          onPointerLeave={stopHandleDrag}
          aria-hidden="true"
        >
          {cells}
          {isCalibrating &&
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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
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
              Drag every perimeter point to align stripes on all 4 sides, then Save.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
