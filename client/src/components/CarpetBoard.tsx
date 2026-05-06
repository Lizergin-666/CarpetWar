"use client";

import Image from "next/image";
import { type ReactNode } from "react";

const IMAGE_WIDTH = 1448;
const IMAGE_HEIGHT = 1086;
const GRID_SIZE = 10;

const BOARD_QUAD = {
  topLeft: { x: 411, y: 285 },
  topRight: { x: 986, y: 264 },
  bottomRight: { x: 1126, y: 780 },
  bottomLeft: { x: 444, y: 823 },
} as const;

export type BoardMark = "unknown" | "miss" | "hit";

interface CarpetBoardProps {
  attackRadar: BoardMark[][];
  defenseRadar: BoardMark[][];
  shipGrid: number[][];
  showDefenseLayer: boolean;
  canShoot: boolean;
  onCellClick: (row: number, col: number) => void;
  waterValue?: number;
}

interface Point {
  x: number;
  y: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bilinearPoint(u: number, v: number): Point {
  const topX = lerp(BOARD_QUAD.topLeft.x, BOARD_QUAD.topRight.x, u);
  const topY = lerp(BOARD_QUAD.topLeft.y, BOARD_QUAD.topRight.y, u);
  const bottomX = lerp(BOARD_QUAD.bottomLeft.x, BOARD_QUAD.bottomRight.x, u);
  const bottomY = lerp(BOARD_QUAD.bottomLeft.y, BOARD_QUAD.bottomRight.y, u);

  return {
    x: lerp(topX, bottomX, v),
    y: lerp(topY, bottomY, v),
  };
}

function cellCorners(row: number, col: number): [Point, Point, Point, Point] {
  const u0 = col / GRID_SIZE;
  const u1 = (col + 1) / GRID_SIZE;
  const v0 = row / GRID_SIZE;
  const v1 = (row + 1) / GRID_SIZE;
  return [
    bilinearPoint(u0, v0),
    bilinearPoint(u1, v0),
    bilinearPoint(u1, v1),
    bilinearPoint(u0, v1),
  ];
}

function polygonToString(points: Point[]): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function centerPoint(row: number, col: number): Point {
  return bilinearPoint((col + 0.5) / GRID_SIZE, (row + 0.5) / GRID_SIZE);
}

export function CarpetBoard({
  attackRadar,
  defenseRadar,
  shipGrid,
  showDefenseLayer,
  canShoot,
  onCellClick,
  waterValue = -1,
}: CarpetBoardProps) {
  const cells: ReactNode[] = Array.from({ length: GRID_SIZE }, (_, row) =>
    Array.from({ length: GRID_SIZE }, (_, col) => {
      const corners = cellCorners(row, col);
      const pointsString = polygonToString(corners);
      const center = centerPoint(row, col);

      const attackMark = attackRadar[row]?.[col] ?? "unknown";
      const defenseMark = defenseRadar[row]?.[col] ?? "unknown";
      const hasShip = shipGrid[row]?.[col] !== waterValue;
      const canClick = canShoot && attackMark === "unknown";

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
            stroke="rgba(0,0,0,0)"
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

  return (
    <div className="relative mx-auto w-full max-w-[920px]">
      <Image
        src="/carpet-board.png"
        alt="Carpet battlefield board"
        width={IMAGE_WIDTH}
        height={IMAGE_HEIGHT}
        priority
        className="h-auto w-full rounded-xl border border-cyan-900/50 select-none"
      />
      <svg
        viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {cells}
      </svg>
    </div>
  );
}
