"use client";

interface VintageSoundToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

export function VintageSoundToggle({ enabled, onToggle }: VintageSoundToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      className="group relative rounded-xl border border-amber-600/70 bg-[linear-gradient(180deg,rgba(64,44,20,0.95),rgba(44,28,10,0.95))] px-3 py-2 text-left shadow-[inset_0_1px_0_rgba(255,226,170,0.25),0_6px_16px_rgba(0,0,0,0.35)] transition hover:brightness-110"
    >
      <div className="pointer-events-none absolute inset-1 rounded-lg border border-amber-300/15" />
      <div className="relative flex items-center gap-3">
        <span className="font-serif text-[10px] uppercase tracking-[0.2em] text-amber-100/85">
          Sound
        </span>
        <span
          className={`relative inline-flex h-6 w-20 items-center rounded-full border px-1 text-[10px] font-semibold tracking-wider transition ${
            enabled
              ? "border-emerald-300/70 bg-emerald-700/60 text-emerald-100"
              : "border-rose-300/70 bg-rose-900/60 text-rose-100"
          }`}
        >
          <span
            className={`absolute h-4 w-9 rounded-full border transition ${
              enabled
                ? "translate-x-[2.1rem] border-emerald-200/80 bg-emerald-300/70"
                : "translate-x-0 border-rose-200/80 bg-rose-300/70"
            }`}
          />
          <span className="relative z-10 w-full px-1">
            {enabled ? "ON" : "OFF"}
          </span>
        </span>
      </div>
    </button>
  );
}
