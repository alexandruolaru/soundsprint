import { useState, useEffect, useRef, useCallback } from "react";
import { STATIONS } from "./data/stations";
import { StationList } from "./components/StationList";
import { PlayerBar } from "./components/PlayerBar";
import { usePlayer } from "./hooks/usePlayer";
import { storage } from "./utils/storage";
import { useDominantColor } from "./hooks/useDominantColor";
import { warmOfflineStationCache } from "./utils/offlineCache";
import { MarqueeText } from "./components/MarqueeText";
import {
  Star,
  Play,
  Pause,
  X,
  Share2,
  Minimize2,
  LayoutGrid,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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

export default function App() {
  const [selectedId, setSelectedId] = useState(() =>
    storage.get<string>("lastStationId", STATIONS[0].id),
  );

  const [favorites, setFavorites] = useState<string[]>(
    storage.get<string[]>("favorites", []),
  );

  const [favOpen, setFavOpen] = useState(false);
  const navRef = useRef<{ prev: () => void; next: () => void }>({
    prev: () => {},
    next: () => {},
  });

  const player = usePlayer({
    onPrev: () => navRef.current.prev(),
    onNext: () => navRef.current.next(),
  });

  const [resumePending, setResumePending] = useState(false);

  useEffect(() => {
    storage.set("favorites", favorites);
  }, [favorites]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  }, []);

  const [recent, setRecent] = useState<string[]>(
    storage.get<string[]>("recentStations", []),
  );

  useEffect(() => {
    storage.set("recentStations", recent);
  }, [recent]);

  const pushRecent = (id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 8); // max 8
      return next;
    });
  };

  const [compact, setCompact] = useState<boolean>(
    storage.get<boolean>("compactMode", false),
  );

  useEffect(() => {
    storage.set("compactMode", compact);
  }, [compact]);

  const handleSelectStation = useCallback(
    (id: string) => {
      const s = STATIONS.find((x) => x.id === id);
      if (!s) return;

      setSelectedId(id);
      storage.set("lastStationId", id);

      setRecent((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, 8));
      setFavOpen(false);
      player.play(s.streamUrl);
    },
    [player],
  );

  useEffect(() => {
    const run = () => {
      warmOfflineStationCache({
        stations: STATIONS.map((s) => ({
          id: s.id,
          name: s.name,
          country: s.country,
          tags: s.tags,
          coverUrl: s.coverUrl,
        })),
        selectedId,
        recentIds: recent,
        favoriteIds: favorites,
        extraCoverUrls: ["/web-app-manifest-512x512.png"],
      }).catch(() => {});
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void) => number)
      | undefined;

    if (ric) {
      const id = ric(run);
      return () => {
        const cancel = (window as any).cancelIdleCallback;
        cancel?.(id);
      };
    } else {
      const t = window.setTimeout(run, 600);
      return () => window.clearTimeout(t);
    }
  }, [selectedId, recent, favorites]);

  const goPrevStation = useCallback(() => {
    const idx = STATIONS.findIndex((s) => s.id === selectedId);
    if (idx < 0) return;
    const prevIdx = (idx - 1 + STATIONS.length) % STATIONS.length;
    handleSelectStation(STATIONS[prevIdx].id);
  }, [selectedId, handleSelectStation]);

  const goNextStation = useCallback(() => {
    const idx = STATIONS.findIndex((s) => s.id === selectedId);
    if (idx < 0) return;
    const nextIdx = (idx + 1) % STATIONS.length;
    handleSelectStation(STATIONS[nextIdx].id);
  }, [selectedId, handleSelectStation]);

  useEffect(() => {
    navRef.current.prev = goPrevStation;
    navRef.current.next = goNextStation;
  }, [goPrevStation, goNextStation]);

  const station = STATIONS.find((s) => s.id === selectedId)!;
  const [bgUrl, setBgUrl] = useState(station.coverUrl || "");
  const [bgPrevUrl, setBgPrevUrl] = useState<string | null>(null);
  const [bgAnimating, setBgAnimating] = useState(false);
  const bgTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName?.toLowerCase();
      const editable = (t as any).isContentEditable;
      return (
        editable || tag === "input" || tag === "textarea" || tag === "select"
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key;

      if (key === " " || key === "Spacebar") {
        e.preventDefault();
        if (player.status === "playing") player.pause();
        else player.play(station.streamUrl);
        return;
      }

      if (key === "m" || key === "M") {
        e.preventDefault();
        player.toggleMute();
        return;
      }

      if (key === "f" || key === "F") {
        e.preventDefault();
        toggleFavorite(station.id);
        return;
      }

      if (key === "ArrowUp") {
        e.preventDefault();
        player.setVolume((v) =>
          Math.min(1, (typeof v === "number" ? v : player.volume) + 0.05),
        );
        return;
      }

      if (key === "ArrowDown") {
        e.preventDefault();
        player.setVolume((v) =>
          Math.max(0, (typeof v === "number" ? v : player.volume) - 0.05),
        );
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [player, station.id, station.streamUrl, toggleFavorite]);

  const favoriteStations = STATIONS.filter((s) => favorites.includes(s.id));

  const recentStations = recent
    .map((id) => STATIONS.find((s) => s.id === id))
    .filter(Boolean) as typeof STATIONS;

  const tint = useDominantColor(station.coverUrl);

  useEffect(() => {
    if (!favOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [favOpen]);

  useEffect(() => {
    if (!favOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [favOpen]);
  useEffect(() => {
    const prefix =
      player.status === "playing"
        ? "▶️ "
        : player.status === "loading"
          ? "⏳ "
          : "";
    document.title = `${prefix}SoundSprint — ${station.name}`;
  }, [station.name, player.status]);
  const buildShareUrl = (id: string) => {
    const u = new URL(window.location.href);
    u.searchParams.set("station", id);
    return u.toString();
  };
  useEffect(() => {
    const u = new URL(window.location.href);
    const id = u.searchParams.get("station");
    if (id && STATIONS.some((s) => s.id === id)) {
      setSelectedId(id);
    }
  }, []);
  const shareStation = async () => {
    const url = buildShareUrl(station.id);
    const text = `Listen to ${station.name} on SoundSprint.`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `SoundSprint — ${station.name}`,
          text,
          url,
        });
        return;
      }
    } catch {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      // pushToast({ type: "success", message: "Link copied." }, 1400);
    } catch {
      // last fallback
      window.prompt("Copy this link:", url);
    }
  };
  useEffect(() => {
    const next = station.coverUrl || "";
    if (!next || next === bgUrl) return;

    setBgPrevUrl(bgUrl || null);
    setBgUrl(next);
    setBgAnimating(true);

    if (bgTimerRef.current) window.clearTimeout(bgTimerRef.current);
    bgTimerRef.current = window.setTimeout(() => {
      setBgPrevUrl(null);
      setBgAnimating(false);
    }, 520);
  }, [station.coverUrl]);

  useEffect(() => {
    return () => {
      if (bgTimerRef.current) window.clearTimeout(bgTimerRef.current);
    };
  }, []);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const toAbs = (u?: string) =>
      u ? new URL(u, window.location.origin).toString() : undefined;

    const cover =
      toAbs(station.coverUrl) || toAbs("/web-app-manifest-512x512.png");

    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: "SoundSprint",
      album: station.country ?? "Radio",
      artwork: cover
        ? [
            { src: cover, sizes: "96x96", type: "image/png" },
            { src: cover, sizes: "128x128", type: "image/png" },
            { src: cover, sizes: "192x192", type: "image/png" },
            { src: cover, sizes: "256x256", type: "image/png" },
            { src: cover, sizes: "384x384", type: "image/png" },
            { src: cover, sizes: "512x512", type: "image/png" },
          ]
        : [],
    });
    navigator.mediaSession.playbackState =
      player.status === "playing" ? "playing" : "paused";
  }, [
    station.id,
    station.name,
    station.coverUrl,
    station.country,
    player.status,
  ]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
      player.play(station.streamUrl);
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      player.pause();
    });

    navigator.mediaSession.setActionHandler("stop", () => {
      player.pause();
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      goPrevStation();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      goNextStation();
    });

    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("stop", null);

        navigator.mediaSession.setActionHandler("previoustrack", null);
        navigator.mediaSession.setActionHandler("nexttrack", null);
      } catch {}
    };
  }, [player, station.streamUrl, goPrevStation, goNextStation]);

  useEffect(() => {
    storage.set("lastVolume", player.volume);
  }, [player.volume]);

  useEffect(() => {
    storage.set("lastMuted", player.isMuted);
  }, [player.isMuted]);

  useEffect(() => {
    storage.set("lastWasPlaying", player.status === "playing");
  }, [player.status]);
  useEffect(() => {
    const v = storage.get<number>("lastVolume", 0.9);
    const m = storage.get<boolean>("lastMuted", false);
    const wasPlaying = storage.get<boolean>("lastWasPlaying", false);

    if (typeof v === "number") player.setVolume(Math.max(0, Math.min(1, v)));

    if (m && !player.isMuted) player.toggleMute();
    if (!m && player.isMuted) player.toggleMute();

    if (wasPlaying) setResumePending(true);
  }, []);

  useEffect(() => {
    if (!resumePending) return;

    const tryResume = () => {
      player.play(station.streamUrl);
      setResumePending(false);
      window.removeEventListener("pointerdown", tryResume);
      window.removeEventListener("keydown", tryResume);
    };

    window.addEventListener("pointerdown", tryResume, { once: true });
    window.addEventListener("keydown", tryResume, { once: true });

    return () => {
      window.removeEventListener("pointerdown", tryResume);
      window.removeEventListener("keydown", tryResume);
    };
  }, [resumePending, player, station.streamUrl]);

  const recentScrollRef = useRef<HTMLDivElement | null>(null);

  const [recentCanScroll, setRecentCanScroll] = useState(false);
  const [recentCanScrollLeft, setRecentCanScrollLeft] = useState(false);
  const [recentCanScrollRight, setRecentCanScrollRight] = useState(false);

  const scrollRecent = (dir: "left" | "right") => {
    const el = recentScrollRef.current;
    if (!el) return;

    const amount = Math.min(320, el.clientWidth * 0.7);
    el.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const updateRecentScrollState = useCallback(() => {
    const el = recentScrollRef.current;
    if (!el) return;

    const canScroll = el.scrollWidth > el.clientWidth + 4;
    const canLeft = el.scrollLeft > 4;
    const canRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;

    setRecentCanScroll(canScroll);
    setRecentCanScrollLeft(canLeft);
    setRecentCanScrollRight(canRight);
  }, []);

  useEffect(() => {
    updateRecentScrollState();

    const el = recentScrollRef.current;
    if (!el) return;

    const onScroll = () => updateRecentScrollState();
    const onResize = () => updateRecentScrollState();

    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    const t = window.setTimeout(updateRecentScrollState, 100);

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
  }, [recentStations.length, updateRecentScrollState]);

  return (
    <div className="relative min-h-screen text-slate-100 pb-28 overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        {/* Previous background (fade out) */}
        {bgPrevUrl && (
          <div
            className={[
              "absolute inset-0 bg-center bg-no-repeat bg-cover",
              "scale-150 blur-3xl",
              "transition-all duration-500 ease-out",
              bgAnimating
                ? "opacity-35 scale-[1.52] blur-[56px]"
                : "opacity-0 scale-[1.58] blur-[72px]",
            ].join(" ")}
            style={{ backgroundImage: `url(${bgPrevUrl})` }}
          />
        )}

        {/* Current background (fade in / steady) */}
        {bgUrl && (
          <div
            className={[
              "absolute inset-0 bg-center bg-no-repeat bg-cover",
              "scale-150 blur-3xl",
              "transition-all duration-500 ease-out",
              bgAnimating
                ? "opacity-40 scale-[1.50] blur-[56px]"
                : "opacity-40 scale-[1.50] blur-[56px]",
            ].join(" ")}
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
        )}

        {/* Tint overlay */}
        <div
          className="absolute inset-0 opacity-25"
          style={{ background: tint }}
        />

        {/* Overlays */}
        <div
          className={[
            "absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/70 to-slate-950/90",
            "transition-opacity duration-500",
            bgAnimating ? "opacity-90" : "opacity-100",
          ].join(" ")}
        />

        <div
          className={[
            "absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_55%)]",
            "transition-all duration-500",
            bgAnimating ? "opacity-90 scale-[1.02]" : "opacity-100 scale-100",
          ].join(" ")}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/35 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-10 py-2">
          <div className="flex items-center justify-between gap-3">
            {/* Brand */}
            <div className="flex items-center min-w-0">
              <img
                src={`${import.meta.env.BASE_URL}soundsprint.png`}
                alt="SoundSprint"
                className="h-10 sm:h-11 w-auto object-contain"
                draggable={false}
              />
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Favorites button */}
              <button
                onClick={() => setFavOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
                title="Favorites"
              >
                <Star size={16} className="text-amber-300" />
                <span className="hidden sm:inline text-sm text-white/90">
                  Favorites ({favoriteStations.length})
                </span>
                <span className="sm:hidden text-sm text-white/90">
                  ({favoriteStations.length})
                </span>
              </button>

              {/* Compact toggle */}
              <button
                onClick={() => setCompact((v) => !v)}
                className={[
                  "inline-flex items-center justify-center gap-2 rounded-xl border transition",
                  "h-10 px-3 sm:px-3",
                  compact
                    ? "bg-white/15 border-white/20 text-white"
                    : "bg-white/5 border-white/10 text-white/80 hover:bg-white/10",
                ].join(" ")}
                title={compact ? "Exit compact mode" : "Compact player"}
                aria-pressed={compact}
              >
                {compact ? <Minimize2 size={16} /> : <LayoutGrid size={16} />}
                <span className="hidden sm:inline text-sm">
                  {compact ? "Compact" : "Compact"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>
      {resumePending && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40">
          <div className="px-4 py-2 rounded-2xl border border-white/10 bg-slate-950/60 backdrop-blur-xl text-xs text-white/85">
            Tap anywhere to resume playback
          </div>
        </div>
      )}
      {player.toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[min(520px,92vw)]">
          <div
            className={[
              "px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
              player.toast.type === "error"
                ? "bg-red-500/15 border-red-500/25 text-red-100"
                : player.toast.type === "success"
                  ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-100"
                  : "bg-white/10 border-white/15 text-white",
            ].join(" ")}
          >
            <div className="text-sm font-medium">{player.toast.message}</div>
          </div>
        </div>
      )}

      {compact && (
        <div
          className={[
            "fixed z-[9999] pointer-events-auto",
            "bottom-[calc(7.5rem+env(safe-area-inset-bottom))] sm:bottom-28 right-3 sm:right-6",
            "left-3 sm:left-auto",
          ].join(" ")}
        >
          <div className="w-full sm:w-[360px]">
            <div
              className={[
                "rounded-2xl border border-white/10",
                "bg-slate-950/45 backdrop-blur-2xl",
                "shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
                "p-3 sm:p-3.5",
              ].join(" ")}
            >
              {/* Top row */}
              <div className="flex items-center gap-3">
                {/* Cover */}
                <div className="relative w-12 h-12 rounded-2xl overflow-hidden border border-white/10 bg-white/10 flex items-center justify-center shrink-0">
                  {/* ring live */}
                  {player.status === "playing" && (
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-emerald-400/40" />
                  )}

                  {/* ping loading */}
                  {player.status === "loading" && (
                    <div className="absolute inset-0 rounded-2xl ring-2 ring-amber-400/40 animate-pulse" />
                  )}

                  {station.coverUrl ? (
                    <img
                      src={station.coverUrl}
                      alt={`${station.name} logo`}
                      className={[
                        "w-full h-full object-contain transition-transform duration-300",
                        player.status === "playing"
                          ? "scale-[1.03]"
                          : "scale-100",
                      ].join(" ")}
                      loading="lazy"
                    />
                  ) : (
                    <div className="text-xs text-white/60">—</div>
                  )}

                  {/* tiny dot indicator */}
                  <div
                    className={[
                      "absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border border-slate-950/40",
                      player.status === "playing"
                        ? "bg-emerald-400 animate-pulse"
                        : player.status === "loading"
                          ? "bg-amber-400 animate-pulse"
                          : "bg-slate-400/70",
                    ].join(" ")}
                    title={player.status}
                  />
                </div>

                {/* Title + status */}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate text-white">
                    {station.name}
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-[11px] text-white/60">
                    <span className="truncate">{station.country}</span>

                    <LiveBadge status={player.status} />
                  </div>
                </div>

                {/* Exit compact */}
                <button
                  onClick={() => setCompact(false)}
                  className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition inline-flex items-center justify-center text-white/80"
                  title="Exit compact"
                  aria-label="Exit compact"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Controls row */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={goPrevStation}
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 transition inline-flex items-center justify-center"
                    title="Previous station"
                    aria-label="Previous station"
                    type="button"
                  >
                    <SkipBack size={16} />
                  </button>

                  <button
                    onClick={() =>
                      player.status === "playing"
                        ? player.pause()
                        : player.play(station.streamUrl)
                    }
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 transition inline-flex items-center justify-center"
                    title={player.status === "playing" ? "Pause" : "Play"}
                    aria-label={player.status === "playing" ? "Pause" : "Play"}
                    type="button"
                  >
                    {player.status === "playing" ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} className="ml-0.5" />
                    )}
                  </button>

                  <button
                    onClick={goNextStation}
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 transition inline-flex items-center justify-center"
                    title="Next station"
                    aria-label="Next station"
                    type="button"
                  >
                    <SkipForward size={16} />
                  </button>

                  <button
                    onClick={player.toggleMute}
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition inline-flex items-center justify-center text-white/80"
                    title={player.isMuted ? "Unmute" : "Mute"}
                    aria-label={player.isMuted ? "Unmute" : "Mute"}
                    type="button"
                  >
                    {player.isMuted ? (
                      <VolumeX size={16} />
                    ) : (
                      <Volume2 size={16} />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={player.volume}
                    onChange={(e) => player.setVolume(Number(e.target.value))}
                    className="w-full accent-white"
                  />

                  <span className="hidden sm:block w-10 text-right text-[11px] text-white/60 tabular-nums">
                    {Math.round(player.volume * 100)}%
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => toggleFavorite(station.id)}
                    className={[
                      "h-9 w-9 rounded-xl border transition inline-flex items-center justify-center",
                      "border-white/10 bg-white/5 hover:bg-white/10",
                      favorites.includes(station.id)
                        ? "text-amber-300"
                        : "text-white/70 hover:text-white",
                    ].join(" ")}
                    title={
                      favorites.includes(station.id) ? "Unfavorite" : "Favorite"
                    }
                    aria-label="Favorite"
                  >
                    <Star
                      size={16}
                      fill={
                        favorites.includes(station.id) ? "currentColor" : "none"
                      }
                    />
                  </button>

                  <button
                    onClick={shareStation}
                    className="h-9 w-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition inline-flex items-center justify-center text-white/80 hover:text-white"
                    title="Share"
                    aria-label="Share"
                  >
                    <Share2 size={16} />
                  </button>
                </div>
              </div>

              {/* Hint row */}
              <div className="mt-2 flex items-center justify-between text-[10px] text-white/45">
                {/* Desktop / laptop */}
                <span className="hidden sm:block truncate">
                  Space: Play/Pause • M: Mute • ↑↓: Volume • ←/→: Prev/Next • F:
                  Fav • S: Share • Esc: Close
                </span>

                {/* Mobile */}
                <span className="sm:hidden truncate">
                  Tap: Play/Pause • Swipe/Buttons: Prev/Next • ★ Fav • Share
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {!compact && (
        <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
          {recentStations.length > 0 && (
            <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm sm:text-base font-semibold text-white/90">
                  Recent
                </h3>

                <div className="flex items-center gap-2">
                  {recentCanScroll && (
                    <>
                      <button
                        type="button"
                        onClick={() => scrollRecent("left")}
                        disabled={!recentCanScrollLeft}
                        className={[
                          "h-9 w-9 rounded-xl border transition inline-flex items-center justify-center",
                          recentCanScrollLeft
                            ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                            : "border-white/5 bg-white/5 text-white/25 cursor-not-allowed",
                        ].join(" ")}
                        title="Scroll left"
                        aria-label="Scroll left"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => scrollRecent("right")}
                        disabled={!recentCanScrollRight}
                        className={[
                          "h-9 w-9 rounded-xl border transition inline-flex items-center justify-center",
                          recentCanScrollRight
                            ? "border-white/10 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white"
                            : "border-white/5 bg-white/5 text-white/25 cursor-not-allowed",
                        ].join(" ")}
                        title="Scroll right"
                        aria-label="Scroll right"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setRecent([])}
                    className="text-xs px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 transition"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div
                ref={recentScrollRef}
                className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {recentStations.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectStation(s.id)}
                    className={[
                      "inline-flex items-center gap-2 px-3 py-2 rounded-full border transition",
                      "bg-white/5 hover:bg-white/10 border-white/10 text-white/90",
                      "shrink-0 max-w-[240px]",
                      s.id === selectedId ? "bg-white/10 border-white/20" : "",
                    ].join(" ")}
                    title={s.name}
                  >
                    <span className="truncate text-sm">{s.name}</span>
                    <span className="text-[11px] text-white/50 shrink-0">
                      {s.country}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
            <StationList
              stations={STATIONS}
              selectedId={selectedId}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onSelect={handleSelectStation}
            />
          </div>

          {/* Now Selected */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)] p-4 sm:p-6">
            <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-5">
              Now Selected
            </h2>

            {/* Top */}
            <div className="flex items-center gap-4">
              <div className="relative w-24 h-24 sm:w-36 sm:h-36 rounded-3xl overflow-hidden border border-white/10 bg-white/10 flex items-center justify-center shrink-0">
                {station.coverUrl ? (
                  <img
                    src={station.coverUrl}
                    alt={`${station.name} logo`}
                    className="w-full h-full object-contain"
                    loading="eager"
                  />
                ) : (
                  <div className="text-sm text-white/60">No logo</div>
                )}
                <div
                  className={[
                    "absolute bottom-2 right-2 h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full border border-slate-950/40",
                    player.status === "playing"
                      ? "bg-emerald-400 animate-pulse"
                      : player.status === "loading"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-slate-400/70",
                  ].join(" ")}
                  title={player.status}
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-lg sm:text-2xl font-semibold truncate">
                  {station.name}
                </p>
                {player.nowPlaying?.raw ? (
                  <div className="mt-2">
                    <div className="text-xs uppercase tracking-wide text-white/50">
                      What’s playing
                    </div>

                    <MarqueeText
                      text={player.nowPlaying.raw}
                      className={`mt-1 text-sm font-medium ${
                        player.nowPlaying.stale
                          ? "text-white/65"
                          : "text-white/90"
                      }`}
                      speedSeconds={14}
                    />

                    <div className="text-[11px] text-white/40 mt-1">
                      {player.nowPlaying.stale
                        ? "last metadata"
                        : "live metadata"}{" "}
                      • {new Date(player.nowPlaying.at).toLocaleTimeString()}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-[11px] text-white/40">
                    What’s playing: unavailable for this station
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-slate-300">Status:</span>
                  <LiveBadge status={player.status} />
                </div>
                <div className="mt-1 text-xs text-slate-300 truncate">
                  {player.streamInfo.formatLabel}
                  {player.streamInfo.mime ? ` • ${player.streamInfo.mime}` : ""}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/10 text-slate-200">
                  {station.country}
                </span>

                {(station.tags ?? []).slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-full text-xs bg-white/5 border border-white/10 text-slate-300"
                  >
                    {t}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2 justify-end">
                {/* Favorite */}
                <button
                  onClick={() => toggleFavorite(station.id)}
                  className={[
                    "p-2.5 sm:p-3 rounded-xl border transition",
                    "bg-white/10 hover:bg-white/15 border-white/10",
                    favorites.includes(station.id)
                      ? "text-amber-300"
                      : "text-white/70 hover:text-white",
                  ].join(" ")}
                  title={
                    favorites.includes(station.id)
                      ? "Remove from favorites"
                      : "Add to favorites"
                  }
                >
                  {favorites.includes(station.id) ? (
                    <Star size={18} fill="currentColor" />
                  ) : (
                    <Star size={18} />
                  )}
                </button>

                {/* Play / Pause */}
                <button
                  onClick={
                    player.status === "playing"
                      ? player.pause
                      : () => player.play(station.streamUrl)
                  }
                  className={[
                    "p-2.5 sm:p-3 rounded-xl border transition",
                    "bg-white/15 hover:bg-white/20 border-white/10 text-white",
                  ].join(" ")}
                  title={player.status === "playing" ? "Pause" : "Play"}
                >
                  {player.status === "playing" ? (
                    <Pause size={20} />
                  ) : (
                    <Play size={20} className="ml-[1px]" />
                  )}
                </button>
                <button
                  onClick={shareStation}
                  className={[
                    "p-2.5 sm:p-3 rounded-xl border transition",
                    "bg-white/10 hover:bg-white/15 border-white/10",
                    "text-white/80 hover:text-white",
                  ].join(" ")}
                  title="Share"
                >
                  <Share2 size={18} />
                </button>
              </div>
            </div>

            {/* Stream info */}
            <div className="mt-4 grid gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-xl p-4">
                <p className="text-xs uppercase tracking-wide text-white/50 mb-2">
                  Stream info
                </p>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-white/90">
                    {player.streamInfo.formatLabel}
                  </span>

                  {player.streamInfo.mime && (
                    <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70">
                      {player.streamInfo.mime}
                    </span>
                  )}

                  <LiveBadge status={player.status} />
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
      {/* Player */}
      <PlayerBar
        station={station}
        isPlaying={player.status === "playing"}
        status={player.status}
        onPlay={() => player.play(station.streamUrl)}
        onPause={player.pause}
        volume={player.volume}
        onVolume={player.setVolume}
        levels={player.levels}
        isMuted={player.isMuted}
        onToggleMute={player.toggleMute}
        sleepTimer={player.sleepTimer}
        sleepRemainingMs={player.sleepRemainingMs}
        onSetSleepMinutes={player.setSleepMinutes}
        onCancelSleep={player.cancelSleepTimer}
        onPrev={goPrevStation}
        onNext={goNextStation}
        eqPreset={player.eqPreset}
        onSetEqPreset={player.setEqPreset}
        bassBoostDb={player.bassBoostDb}
        onSetBassBoostDb={player.setBassBoostDb}
      />

      {/* Favorites Modal */}

      {favOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-slate-950/55"
            onClick={() => setFavOpen(false)}
          />

          <div className="absolute left-1/2 top-16 w-[min(760px,92vw)] -translate-x-1/2">
            <div
              className={[
                "rounded-2xl border border-white/10",
                "bg-white/5 backdrop-blur-xl",
                "shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
                "overflow-hidden",
              ].join(" ")}
            >
              {/* header modal */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
                <div className="inline-flex items-center gap-2">
                  <Star size={16} className="text-amber-300" />
                  <div className="font-semibold text-white">
                    Favorites{" "}
                    <span className="text-white/60 font-normal">
                      ({favoriteStations.length})
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setFavOpen(false)}
                  className="p-2 rounded-xl hover:bg-white/10 transition"
                  title="Close"
                >
                  <X size={18} className="text-white/70" />
                </button>
              </div>
              <div className="max-h-[70vh] overflow-hidden">
                {favoriteStations.length > 0 ? (
                  <StationList
                    stations={favoriteStations}
                    selectedId={selectedId}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    onSelect={handleSelectStation}
                    title=""
                  />
                ) : (
                  <div className="p-6 text-white/70">
                    No favorites yet. Tap ★ on a station.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
