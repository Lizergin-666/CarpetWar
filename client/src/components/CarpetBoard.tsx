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

type CornerKey = "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

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

const CORNER_KEYS: CornerKey[] = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
const CORNER_LABELS: Record<CornerKey, string> = {
  topLeft: "TL",
  topRight: "TR",
  bottomRight: "BR",
  bottomLeft: "BL",
};

const DEFAULT_BOARD_QUAD: Quad = {
  topLeft: { x: 411, y: 285 },
  topRight: { x: 986, y: 264 },
  bottomRight: { x: 1126, y: 780 },
  bottomLeft: { x: 444, y: 823 },
};

const DEFAULT_STORAGE_KEY = "sea-war.carpet-board-quad.v1";

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

function cloneQuad(quad: Quad): Quad {
  return {
    topLeft: { ...quad.topLeft },
    topRight: { ...quad.topRight },
    bottomRight: { ...quad.bottomRight },
    bottomLeft: { ...quad.bottomLeft },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bilinearPoint(quad: Quad, u: number, v: number): Point {
  const topX = lerp(quad.topLeft.x, quad.topRight.x, u);
  const topY = lerp(quad.topLeft.y, quad.topRight.y, u);
  const bottomX = lerp(quad.bottomLeft.x, quad.bottomRight.x, u);
  const bottomY = lerp(quad.bottomLeft.y, quad.bottomRight.y, u);

  return {
    x: lerp(topX, bottomX, v),
    y: lerp(topY, bottomY, v),
  };
}

function cellCorners(quad: Quad, row: number, col: number): [Point, Point, Point, Point] {
  const u0 = col / GRID_SIZE;
  const u1 = (col + 1) / GRID_SIZE;
  const v0 = row / GRID_SIZE;
  const v1 = (row + 1) / GRID_SIZE;
  return [
    bilinearPoint(quad, u0, v0),
    bilinearPoint(quad, u1, v0),
    bilinearPoint(quad, u1, v1),
    bilinearPoint(quad, u0, v1),
  ];
}

function polygonToString(points: Point[]): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function centerPoint(quad: Quad, row: number, col: number): Point {
  return bilinearPoint(quad, (col + 0.5) / GRID_SIZE, (row + 0.5) / GRID_SIZE);
}

function parseStoredQuad(raw: string | null): Quad | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<CornerKey, Partial<Point>>>;
    const topLeft = parsed.topLeft;
    const topRight = parsed.topRight;
    const bottomRight = parsed.bottomRight;
    const bottomLeft = parsed.bottomLeft;

    if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null;
    if (
      typeof topLeft.x !== "number" ||
      typeof topLeft.y !== "number" ||
      typeof topRight.x !== "number" ||
      typeof topRight.y !== "number" ||
      typeof bottomRight.x !== "number" ||
      typeof bottomRight.y !== "number" ||
      typeof bottomLeft.x !== "number" ||
      typeof bottomLeft.y !== "number"
    ) {
      return null;
    }
    if (
      !Number.isFinite(topLeft.x) ||
      !Number.isFinite(topLeft.y) ||
      !Number.isFinite(topRight.x) ||
      !Number.isFinite(topRight.y) ||
      !Number.isFinite(bottomRight.x) ||
      !Number.isFinite(bottomRight.y) ||
      !Number.isFinite(bottomLeft.x) ||
      !Number.isFinite(bottomLeft.y)
    ) {
      return null;
    }

    return {
      topLeft: { x: topLeft.x, y: topLeft.y },
      topRight: { x: topRight.x, y: topRight.y },
      bottomRight: { x: bottomRight.x, y: bottomRight.y },
      bottomLeft: { x: bottomLeft.x, y: bottomLeft.y },
    };
  } catch {
    return null;
  }
}

function loadInitialQuad(storageKey: string): Quad {
  if (typeof window === "undefined") return cloneQuad(DEFAULT_BOARD_QUAD);
  const fromStorage = parseStoredQuad(localStorage.getItem(storageKey));
  return fromStorage ? fromStorage : cloneQuad(DEFAULT_BOARD_QUAD);
}

function quadToString(quad: Quad): string {
  return JSON.stringify(
    {
      topLeft: { x: Math.round(quad.topLeft.x), y: Math.round(quad.topLeft.y) },
      topRight: { x: Math.round(quad.topRight.x), y: Math.round(quad.topRight.y) },
      bottomRight: {
        x: Math.round(quad.bottomRight.x),
        y: Math.round(quad.bottomRight.y),
      },
      bottomLeft: { x: Math.round(quad.bottomLeft.x), y: Math.round(quad.bottomLeft.y) },
    },
    null,
    2
  );
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
  const [savedQuad, setSavedQuad] = useState<Quad>(() =>
    loadInitialQuad(calibrationStorageKey)
  );
  const [draftQuad, setDraftQuad] = useState<Quad>(() =>
    loadInitialQuad(calibrationStorageKey)
  );
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [activeCorner, setActiveCorner] = useState<CornerKey | null>(null);

  const boardQuad = isCalibrating ? draftQuad : savedQuad;

  const cells: ReactNode[] = useMemo(() => {
    return Array.from({ length: GRID_SIZE }, (_, row) =>
      Array.from({ length: GRID_SIZE }, (_, col) => {
        const corners = cellCorners(boardQuad, row, col);
        const pointsString = polygonToString(corners);
        const center = centerPoint(boardQuad, row, col);

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
              stroke={isCalibrating ? "rgba(255, 255, 255, 0.25)" : "rgba(0,0,0,0)"}
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
              <circle cx={center.x} cy={center.y} r={7} fill="rgba(241, 245, 249, 0.95)" />
            )}
          </g>
        );
      })
    ).flat();
  }, [
    attackRadar,
    boardQuad,
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

    const x = clamp(((clientX - rect.left) * IMAGE_WIDTH) / rect.width, 0, IMAGE_WIDTH);
    const y = clamp(((clientY - rect.top) * IMAGE_HEIGHT) / rect.height, 0, IMAGE_HEIGHT);
    return { x, y };
  }

  function moveCornerToPointer(corner: CornerKey, clientX: number, clientY: number): void {
    const nextPoint = pointerToImagePoint(clientX, clientY);
    if (!nextPoint) return;
    setDraftQuad((prev) => ({
      ...prev,
      [corner]: nextPoint,
    }));
  }

  function beginCornerDrag(
    corner: CornerKey,
    event: ReactPointerEvent<SVGCircleElement>
  ): void {
    if (!isCalibrating) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveCorner(corner);
    moveCornerToPointer(corner, event.clientX, event.clientY);
  }

  function handleSvgPointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!isCalibrating || !activeCorner) return;
    moveCornerToPointer(activeCorner, event.clientX, event.clientY);
  }

  function stopCornerDrag(): void {
    setActiveCorner(null);
  }

  function startCalibration(): void {
    setDraftQuad(cloneQuad(savedQuad));
    setActiveCorner(null);
    setIsCalibrating(true);
  }

  function cancelCalibration(): void {
    setDraftQuad(cloneQuad(savedQuad));
    setActiveCorner(null);
    setIsCalibrating(false);
  }

  function saveCalibration(): void {
    const nextSaved = cloneQuad(draftQuad);
    setSavedQuad(nextSaved);
    setIsCalibrating(false);
    setActiveCorner(null);
    if (typeof window === "undefined") return;
    localStorage.setItem(calibrationStorageKey, JSON.stringify(nextSaved));
  }

  function resetCalibrationToDefault(): void {
    setDraftQuad(cloneQuad(DEFAULT_BOARD_QUAD));
  }

  async function copyCalibrationJson(): Promise<void> {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(quadToString(draftQuad));
  }

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
          onPointerMove={handleSvgPointerMove}
          onPointerUp={stopCornerDrag}
          onPointerCancel={stopCornerDrag}
          onPointerLeave={stopCornerDrag}
          aria-hidden="true"
        >
          {cells}
          {isCalibrating &&
            CORNER_KEYS.map((corner) => {
              const point = draftQuad[corner];
              return (
                <g key={`corner-${corner}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={14}
                    fill="rgba(34, 211, 238, 0.9)"
                    stroke="rgba(8, 47, 73, 0.95)"
                    strokeWidth={3}
                    className="cursor-grab active:cursor-grabbing"
                    onPointerDown={(event) => beginCornerDrag(corner, event)}
                  />
                  <text
                    x={point.x + 16}
                    y={point.y - 12}
                    fontSize={18}
                    fontWeight={700}
                    fill="rgba(34, 211, 238, 0.95)"
                  >
                    {CORNER_LABELS[corner]}
                  </text>
                </g>
              );
            })}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        {!isCalibrating ? (
          <button
            onClick={startCalibration}
            className="rounded-md border border-cyan-500/70 bg-cyan-500/20 px-3 py-1 text-cyan-100 transition hover:bg-cyan-500/30"
          >
            Calibrate 4 corners
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
              onClick={resetCalibrationToDefault}
              className="rounded-md border border-amber-500/70 bg-amber-500/20 px-3 py-1 text-amber-100 transition hover:bg-amber-500/30"
            >
              Reset default
            </button>
            <button
              onClick={() => {
                void copyCalibrationJson();
              }}
              className="rounded-md border border-violet-500/70 bg-violet-500/20 px-3 py-1 text-violet-100 transition hover:bg-violet-500/30"
            >
              Copy quad JSON
            </button>
            <span className="text-cyan-200/80">
              Drag TL, TR, BR, BL handles to match grid corners, then Save.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
