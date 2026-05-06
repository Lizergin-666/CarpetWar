"use client";

import Link from "next/link";
import { io, Socket } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPvpCoach, CoachReport } from "../../lib/coach";

const BOARD_SIZE = 10;
const WATER = -1;

type TurnMark = "unknown" | "miss" | "hit";
type RoomPhase = "lobby" | "playing" | "finished";
type Role = "host" | "guest";

interface RoomViewPayload {
  roomCode: string;
  phase: RoomPhase;
  youRole: Role;
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

interface RoomClosedPayload {
  reason?: string;
}

interface SystemPayload {
  type: string;
  event?: string;
}

function createGrid<T>(value: T): T[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => value)
  );
}

function cellBaseClass(hasOwnShip: boolean, defenseMark: TurnMark): string {
  if (defenseMark === "hit") return "bg-red-500/90";
  if (hasOwnShip) return "bg-cyan-600/85";
  if (defenseMark === "miss") return "bg-slate-300";
  return "bg-slate-900";
}

function countRadarMarks(radar: TurnMark[][]): { shots: number; hits: number } {
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

export default function PvpPage() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketId, setSocketId] = useState("-");
  const [joinCode, setJoinCode] = useState("");
  const [showDefenseLayer, setShowDefenseLayer] = useState(false);
  const [roomView, setRoomView] = useState<RoomViewPayload | null>(null);
  const [notice, setNotice] = useState("Create room or join by code.");
  const [systemLog, setSystemLog] = useState<string[]>([]);
  const socketRef = useRef<Socket | null>(null);

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

    socket.on("room:state", (payload: RoomViewPayload) => {
      setRoomView(payload);
      setJoinCode(payload.roomCode);
      setNotice(payload.status);
    });

    socket.on("room:closed", (payload: RoomClosedPayload) => {
      setRoomView(null);
      setNotice(payload.reason ?? "Room closed.");
    });

    socket.on("system", (payload: SystemPayload) => {
      const eventLabel = payload.event ? ` (${payload.event})` : "";
      const item = `${payload.type}${eventLabel}`;
      setSystemLog((prev) => [item, ...prev].slice(0, 8));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socketUrl]);

  const coachReport: CoachReport | null = useMemo(() => {
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

  const playerRadar = roomView?.playerRadar ?? createGrid<TurnMark>("unknown");
  const defenseRadar = roomView?.defenseRadar ?? createGrid<TurnMark>("unknown");
  const playerShipGrid = roomView?.playerShipGrid ?? createGrid<number>(WATER);
  const canShoot =
    roomView?.phase === "playing" &&
    roomView.yourTurn &&
    roomView.winner === null &&
    socketConnected;
  const canStart =
    roomView?.phase === "lobby" &&
    roomView.youRole === "host" &&
    roomView.opponentConnected;
  const turnTimerCritical =
    roomView?.phase === "playing" &&
    roomView.yourTurn &&
    (roomView.turnSecondsLeft ?? 0) <= 6;

  function setError(message: string): void {
    setNotice(message);
  }

  function createRoom(): void {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit("room:create", (response: RoomActionAck) => {
      if (!response.ok) {
        setError(response.error ?? "Failed to create room.");
        return;
      }
      setNotice(`Room created: ${response.roomCode}`);
    });
  }

  function joinRoom(): void {
    const socket = socketRef.current;
    if (!socket) return;

    const roomCode = joinCode.trim().toUpperCase();
    if (!roomCode) {
      setError("Enter room code.");
      return;
    }

    socket.emit(
      "room:join",
      { roomCode },
      (response: RoomActionAck): void => {
        if (!response.ok) {
          setError(response.error ?? "Failed to join room.");
          return;
        }
        setNotice(`Joined room: ${response.roomCode}`);
      }
    );
  }

  function startMatch(): void {
    const socket = socketRef.current;
    if (!socket) return;

    socket.emit("room:start", (response: RoomActionAck) => {
      if (!response.ok) {
        setError(response.error ?? "Failed to start match.");
      }
    });
  }

  function leaveRoom(): void {
    socketRef.current?.emit("room:leave");
    setRoomView(null);
    setNotice("Left room.");
  }

  function handleCellClick(row: number, col: number): void {
    if (!canShoot) return;
    if (playerRadar[row][col] !== "unknown") return;

    socketRef.current?.emit(
      "room:shoot",
      { row, col },
      (response: RoomActionAck): void => {
        if (!response.ok) {
          setError(response.error ?? "Shot failed.");
        }
      }
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-cyan-500/70 bg-slate-900/80 px-3 py-1 text-sm text-cyan-100 transition hover:bg-slate-800"
          >
            Solo Mode
          </Link>
          <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs text-cyan-100">
            PvP by Link
          </span>
          <button className="rounded-lg border border-amber-400/70 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-500/30">
            Upgrade to Pro
          </button>
        </div>
        <h1 className="text-2xl font-bold text-cyan-100">Sea War: Friend Room PvP</h1>
        <p className="mt-1 text-sm text-cyan-200/80">
          Create room, share code, start match, and play salvos of 3 shots per
          turn.
        </p>
      </header>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Lobby</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={createRoom}
            disabled={!socketConnected}
            className="rounded-lg bg-cyan-500 px-3 py-1 font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create room
          </button>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            className="rounded-lg border border-cyan-700/70 bg-slate-900/70 px-3 py-1 text-sm text-cyan-100 outline-none placeholder:text-cyan-300/50"
          />
          <button
            onClick={joinRoom}
            disabled={!socketConnected}
            className="rounded-lg border border-cyan-500/70 bg-slate-900/80 px-3 py-1 text-cyan-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join room
          </button>
          <button
            onClick={startMatch}
            disabled={!canStart}
            className="rounded-lg border border-emerald-500/70 bg-emerald-500/20 px-3 py-1 text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start match
          </button>
          <button
            onClick={leaveRoom}
            disabled={!roomView}
            className="rounded-lg border border-rose-500/70 bg-rose-500/20 px-3 py-1 text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Leave room
          </button>
        </div>
        <p className="text-sm text-cyan-200/80">{notice}</p>
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Match Status</h2>
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
            Room: {roomView?.roomCode ?? "-"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Role: {roomView?.youRole ?? "-"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Phase: {roomView?.phase ?? "-"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Round: {roomView?.round ?? "-"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Your turn: {roomView?.yourTurn ? "yes" : "no"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Shots left: {roomView?.yourTurn ? roomView.shotsLeft : 0}
          </span>
          <span
            className={`rounded-full border px-3 py-1 ${
              turnTimerCritical
                ? "border-amber-300/70 bg-amber-400/20 text-amber-100"
                : "border-cyan-900/60 bg-slate-900/80 text-cyan-100/90"
            }`}
          >
            Turn timer: {roomView?.yourTurn ? `${roomView.turnSecondsLeft}s` : "-"}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Your decks: {roomView?.yourDecksLeft ?? 0}
          </span>
          <span className="rounded-full border border-cyan-900/60 bg-slate-900/80 px-3 py-1 text-cyan-100/90">
            Enemy decks: {roomView?.enemyDecksLeft ?? 0}
          </span>
          {roomView?.winner && (
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-100">
              Winner: {roomView.winner}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Single Board</h2>
        <p className="mb-3 text-sm text-cyan-200/80">
          Same one-board concept: your attack marks plus optional defense layer.
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm text-cyan-100/90">
          <input
            type="checkbox"
            checked={showDefenseLayer}
            onChange={(event) => setShowDefenseLayer(event.target.checked)}
          />
          Show defense layer (my ships + incoming shots)
        </label>
        <div
          className="grid w-fit gap-1 rounded-xl border border-cyan-900/50 bg-slate-900/60 p-2"
          style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
        >
          {playerShipGrid.map((row, rowIndex) =>
            row.map((shipId, colIndex) => {
              const defenseMark = defenseRadar[rowIndex][colIndex];
              const attackMark = playerRadar[rowIndex][colIndex];
              const hasShip = showDefenseLayer && shipId !== WATER;

              return (
                <button
                  key={`pvp-cell-${rowIndex}-${colIndex}`}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  disabled={!canShoot || attackMark !== "unknown"}
                  className={`relative h-8 w-8 rounded-sm border border-cyan-900/60 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-80 ${cellBaseClass(
                    hasShip,
                    defenseMark
                  )}`}
                >
                  {attackMark === "hit" && (
                    <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-red-700 animate-pulse" />
                  )}
                  {attackMark === "miss" && (
                    <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-slate-300" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-900/70 bg-slate-950/70 p-4 shadow-[0_0_30px_rgba(8,145,178,0.12)] backdrop-blur-sm">
        <h2 className="mb-3 text-lg font-semibold text-cyan-100">Event Feed</h2>
        <ul className="space-y-1 text-sm text-cyan-100/90">
          {(roomView?.log ?? []).map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
        <h3 className="mt-4 text-sm font-semibold text-cyan-100">AI Coach</h3>
        {!coachReport ? (
          <p className="mt-1 text-xs text-cyan-200/80">
            Finish a PvP match to unlock tactical review.
          </p>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap gap-2">
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
            <ul className="mt-2 space-y-1 text-xs text-cyan-100/90">
              {coachReport.notes.map((note, index) => (
                <li key={`${note}-${index}`}>- {note}</li>
              ))}
            </ul>
          </>
        )}
        <h3 className="mt-4 text-sm font-semibold text-cyan-100">System</h3>
        <ul className="mt-1 space-y-1 text-xs text-cyan-200/80">
          {systemLog.length === 0 ? (
            <li>No system events yet.</li>
          ) : (
            systemLog.map((item, index) => (
              <li key={`${item}-${index}`}>- {item}</li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
