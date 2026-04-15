import type { PlayerStatus, Station } from "../types";
import { Visualizer } from "./Visualizer";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  Moon,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState, useEffect } from "react";

type Props = {
  station: Station;
  isPlaying: boolean;
  status: PlayerStatus;
  onPlay: () => void;
  onPause: () => void;

  onPrev: () => void;
  onNext: () => void;

  volume: number;
  onVolume: (v: number) => void;
  levels: [number, number, number];
  isMuted: boolean;
  onToggleMute: () => void;

  sleepTimer: { enabled: boolean; endsAt: number | null };
  sleepRemainingMs: number;
  onSetSleepMinutes: (m: number) => void;
  onCancelSleep: () => void;
  eqPreset: "normal" | "bass" | "voice" | "night";
  onSetEqPreset: (p: "normal" | "bass" | "voice" | "night") => void;
  bassBoostDb: number; // 0..12
  onSetBassBoostDb: (v: number) => void;
};

function LiveBadge({
  status,
}: {
  status: "playing" | "loading" | "paused" | string;
}) {
  const isLive = status === "playing";
  const isLoading = status === "loading";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        "px-2 py-0.5 rounded-full border text-[10px] leading-none",
        isLive
          ? "bg-emerald-400/10 border-emerald-400/25 text-emerald-300"
          : isLoading
            ? "bg-amber-400/10 border-amber-400/25 text-amber-300"
            : "bg-slate-400/10 border-slate-400/25 text-slate-300",
      ].join(" ")}
      title={isLive ? "Live" : isLoading ? "Buffering" : "Paused"}
    >
      <span
        className={[
          "inline-block h-1.5 w-1.5 rounded-full",
          isLive
            ? "bg-emerald-300 animate-pulse"
            : isLoading
              ? "bg-amber-300 animate-pulse"
              : "bg-slate-300/60",
        ].join(" ")}
      />
      {isLive ? "LIVE" : isLoading ? "BUFFER" : "PAUSED"}
    </span>
  );
}

export function PlayerBar({
  station,
  isPlaying,
  status,
  onPlay,
  onPause,
  onPrev,
  onNext,
  volume,
  onVolume,
  levels,
  isMuted,
  onToggleMute,
  sleepTimer,
  sleepRemainingMs,
  onSetSleepMinutes,
  onCancelSleep,
  eqPreset,
  onSetEqPreset,
  bassBoostDb,
  onSetBassBoostDb,
}: Props) {
  const percent = Math.round(volume * 100);
  const [sleepOpen, setSleepOpen] = useState(false);

  const sleepLabel = useMemo(() => {
    if (!sleepTimer?.enabled || !sleepRemainingMs || sleepRemainingMs <= 0)
      return null;
    const totalSec = Math.floor(sleepRemainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [sleepTimer?.enabled, sleepRemainingMs]);

  const presets = [5, 10, 15, 30, 60];

  const [eqOpen, setEqOpen] = useState(false);

  const EQ_LABEL: Record<Props["eqPreset"], string> = {
    normal: "Normal",
    bass: "Bass Boost",
    voice: "Voice",
    night: "Night",
  };

  const eqLabel = EQ_LABEL[eqPreset];

  useEffect(() => {
    if (!sleepOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-sleep-root='1']")) setSleepOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [sleepOpen]);
  useEffect(() => {
    if (!eqOpen) return;

    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.("[data-eq-root='1']")) setEqOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEqOpen(false);
    };

    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [eqOpen]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20">
      <div className="border-t border-white/10 bg-slate-950/45 backdrop-blur-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.35)]">
        <div className="max-w-[1600px] mx-auto w-full px-3 sm:px-6 lg:px-10 py-2 sm:py-2.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            {/* Left side */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              {/* Cover */}
              <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center overflow-hidden shrink-0">
                {status === "playing" && (
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400/40" />
                )}
                {status === "loading" && (
                  <div className="absolute inset-0 rounded-2xl ring-2 ring-amber-400/40 animate-pulse" />
                )}

                {station.coverUrl ? (
                  <img
                    src={station.coverUrl}
                    alt={`${station.name} logo`}
                    className={[
                      "w-full h-full object-contain transition-transform duration-300",
                      status === "playing" ? "scale-[1.03]" : "scale-100",
                    ].join(" ")}
                    loading="lazy"
                  />
                ) : (
                  <div className="text-xs text-white/60">—</div>
                )}

                <div
                  className={[
                    "absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border border-slate-950/40",
                    status === "playing"
                      ? "bg-emerald-400 animate-pulse"
                      : status === "loading"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-slate-400/70",
                  ].join(" ")}
                  title={String(status)}
                />
              </div>

              {/* Titles */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="text-sm font-semibold truncate text-slate-100">
                    {station.name}
                  </div>
                  <div className="hidden xs:block">
                    <LiveBadge status={status} />
                  </div>
                </div>

                <div className="text-[11px] sm:text-xs text-slate-300 truncate">
                  {station.country}
                  {station.tags?.length ? ` • ${station.tags.join(", ")}` : ""}
                </div>
              </div>

              {/* Play/Pause */}
              <button
                onClick={isPlaying ? onPause : onPlay}
                className="shrink-0 rounded-xl inline-flex items-center justify-center border border-white/10 bg-white/10 text-white hover:bg-white/15 active:scale-95 transition w-10 h-10 sm:w-12 sm:h-12"
                aria-label={isPlaying ? "Pause" : "Play"}
                title={isPlaying ? "Pause" : "Play"}
                type="button"
              >
                {isPlaying ? (
                  <Pause size={18} className="sm:hidden" />
                ) : (
                  <Play size={18} className="ml-0.5 sm:hidden" />
                )}
                <span className="hidden sm:inline">
                  {isPlaying ? (
                    <Pause size={20} />
                  ) : (
                    <Play size={20} className="ml-0.5" />
                  )}
                </span>
              </button>
            </div>

            {/* Right side controls */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 lg:justify-end">
              {/* Prev */}
              <button
                onClick={onPrev}
                className="shrink-0 rounded-xl inline-flex items-center justify-center border border-white/10 bg-white/10 text-white hover:bg-white/15 active:scale-95 transition w-10 h-10 sm:w-12 sm:h-12"
                aria-label="Previous station"
                title="Previous"
                type="button"
              >
                <SkipBack size={18} className="sm:hidden" />
                <span className="hidden sm:inline">
                  <SkipBack size={20} />
                </span>
              </button>

              {/* Next */}
              <button
                onClick={onNext}
                className="shrink-0 rounded-xl inline-flex items-center justify-center border border-white/10 bg-white/10 text-white hover:bg-white/15 active:scale-95 transition w-10 h-10 sm:w-12 sm:h-12"
                aria-label="Next station"
                title="Next"
                type="button"
              >
                <SkipForward size={18} className="sm:hidden" />
                <span className="hidden sm:inline">
                  <SkipForward size={20} />
                </span>
              </button>

              {/* Visualizer */}
              <div className="hidden xl:block px-1">
                <Visualizer levels={levels} />
              </div>

              {/* EQ */}
              <div className="relative shrink-0" data-eq-root="1">
                <button
                  type="button"
                  onClick={() => setEqOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 h-10 px-3 transition"
                  title="Equalizer presets"
                  aria-label="Equalizer presets"
                >
                  <SlidersHorizontal size={16} className="text-white/80" />
                  <span className="hidden md:inline text-xs">EQ</span>
                  <span className="hidden xl:inline ml-1 px-2 py-0.5 rounded-full text-[11px] bg-white/10 border border-white/10 text-white/90">
                    {eqLabel}
                  </span>
                </button>

                {eqOpen && (
                  <div
                    className={[
                      "absolute z-50",
                      "bottom-[72px] sm:bottom-12",
                      "left-1/2 -translate-x-1/2 w-[min(92vw,360px)]",
                      "lg:left-auto lg:translate-x-0 lg:right-0 lg:w-[260px]",
                      "rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-xl",
                      "shadow-[0_12px_40px_rgba(0,0,0,0.55)] overflow-hidden",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/5">
                      <div className="text-xs text-white/85 font-semibold">
                        EQ Presets
                      </div>
                      <button
                        type="button"
                        onClick={() => setEqOpen(false)}
                        className="p-1 rounded-lg hover:bg-white/10"
                        aria-label="Close EQ menu"
                        title="Close"
                      >
                        <X size={14} className="text-white/70" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 px-3 py-3">
                      {(
                        [
                          ["normal", "Normal", "Balanced"],
                          ["bass", "Bass", "More low-end"],
                          ["voice", "Voice", "Clear mids"],
                          ["night", "Night", "Soft highs"],
                        ] as const
                      ).map(([key, title, hint]) => {
                        const active = eqPreset === key;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => onSetEqPreset(key)}
                            className={[
                              "rounded-xl border text-left transition px-3 py-2",
                              active
                                ? "border-white/25 bg-white/15 text-white"
                                : "border-white/10 bg-white/5 hover:bg-white/10 text-white/90",
                            ].join(" ")}
                            title={title}
                          >
                            <div className="text-xs font-semibold">{title}</div>
                            <div className="text-[11px] text-white/55">
                              {hint}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {eqPreset === "bass" && (
                      <div className="px-3 pb-3">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-white/70">
                            Bass intensity
                          </div>
                          <div className="text-[11px] text-white/85 tabular-nums">
                            +{bassBoostDb} dB
                          </div>
                        </div>

                        <input
                          type="range"
                          min={0}
                          max={12}
                          step={1}
                          value={bassBoostDb}
                          onChange={(e) =>
                            onSetBassBoostDb(Number(e.target.value))
                          }
                          className="mt-2 w-full accent-white"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sleep */}
              <div className="relative shrink-0" data-sleep-root="1">
                <button
                  type="button"
                  onClick={() => setSleepOpen((v) => !v)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/90 h-10 px-3 transition"
                  title="Sleep timer"
                  aria-label="Sleep timer"
                >
                  <Moon size={16} className="text-white/80" />
                  <span className="hidden md:inline text-xs">Sleep</span>

                  {sleepLabel && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-white/10 border border-white/10 text-white/90 tabular-nums">
                      {sleepLabel}
                    </span>
                  )}
                </button>

                {sleepOpen && (
                  <div className="absolute bottom-12 right-0 w-[220px] rounded-2xl border border-white/10 bg-slate-950/75 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)] p-2">
                    <div className="flex items-center justify-between px-2 py-1">
                      <div className="text-xs text-white/80 font-medium">
                        Sleep timer
                      </div>
                      <button
                        type="button"
                        onClick={() => setSleepOpen(false)}
                        className="p-1 rounded-lg hover:bg-white/10"
                        aria-label="Close sleep menu"
                        title="Close"
                      >
                        <X size={14} className="text-white/70" />
                      </button>
                    </div>

                    <div className="px-2 pb-2 text-[11px] text-white/55">
                      Stops playback after the selected time.
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-2">
                      {presets.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            onSetSleepMinutes(m);
                            setSleepOpen(false);
                          }}
                          className="px-2 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs text-white/90 transition"
                          title={`${m} minutes`}
                        >
                          {m}m
                        </button>
                      ))}
                    </div>

                    <div className="p-2 pt-0">
                      <button
                        type="button"
                        disabled={!sleepTimer?.enabled}
                        onClick={() => {
                          onCancelSleep();
                          setSleepOpen(false);
                        }}
                        className={[
                          "w-full px-3 py-2 rounded-xl border text-xs transition",
                          sleepTimer?.enabled
                            ? "border-white/10 bg-white/10 hover:bg-white/15 text-white"
                            : "border-white/5 bg-white/5 text-white/35 cursor-not-allowed",
                        ].join(" ")}
                        title="Cancel timer"
                      >
                        Cancel timer
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2 shrink-0 min-w-[150px] sm:min-w-[180px] flex-1 sm:flex-none">
                <button
                  onClick={onToggleMute}
                  className="p-2 rounded-xl hover:bg-white/10 transition text-white/90 shrink-0"
                  title={isMuted ? "Unmute" : "Mute"}
                  aria-label={isMuted ? "Unmute" : "Mute"}
                  type="button"
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(1, Number(e.target.value)));
                    onVolume(v);
                  }}
                  className="w-full accent-white"
                />

                <span className="hidden sm:block text-xs text-slate-300 w-10 text-right tabular-nums shrink-0">
                  {percent}%
                </span>
              </div>

              {/* Desktop status */}
              <div className="hidden 2xl:block text-sm text-slate-300 w-40 shrink-0">
                Status: <strong className="text-slate-100">{status}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
