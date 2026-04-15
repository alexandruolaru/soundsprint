import { useEffect, useRef, useState } from "react";
import type { PlayerStatus } from "../types";
import { storage } from "../utils/storage";
import { readIcyNowPlayingOnce } from "../utils/icyNowPlaying";
type Toast = { type: "info" | "error" | "success"; message: string } | null;
type EqPreset = "normal" | "bass" | "voice" | "night";

const EQ_PRESETS: Record<EqPreset, { low: number; mid: number; high: number }> =
  {
    normal: { low: 0, mid: 0, high: 0 },
    bass: { low: 0, mid: -1, high: 2 }, // Bass Boost
    voice: { low: -2, mid: 5, high: 2 }, // Voice
    night: { low: -3, mid: -1, high: -4 }, // Night
  };

const clampDb = (v: number) => Math.max(0, Math.min(12, Math.round(v)));

export function usePlayer(handlers?: {
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const freqDataRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);

  const eqLowRef = useRef<BiquadFilterNode | null>(null);
  const eqMidRef = useRef<BiquadFilterNode | null>(null);
  const eqHighRef = useRef<BiquadFilterNode | null>(null);

  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [toast, setToast] = useState<Toast>(null);

  const [volume, setVolume] = useState(() =>
    storage.get<number>("playerVolume", 0.8),
  );
  const [lastVolume, setLastVolume] = useState(() =>
    storage.get<number>("playerLastVolume", 0.8),
  );

  const [eqPreset, setEqPresetState] = useState<EqPreset>(() =>
    storage.get<EqPreset>("playerEqPreset", "normal"),
  );

  const [bassBoostDb, setBassBoostDbState] = useState<number>(() =>
    storage.get<number>("playerBassBoostDb", 8),
  );

  const [nowPlaying, setNowPlaying] = useState<{
    raw: string;
    artist?: string;
    title?: string;
    at: number;
    stale?: boolean;
  } | null>(null);

  const npAbortRef = useRef<AbortController | null>(null);
  const npTimerRef = useRef<number | null>(null);
  const npBootTimerRef = useRef<number | null>(null);
  const npMissCountRef = useRef(0);
  const npLastRawRef = useRef<string | null>(null);
  const npLastSuccessAtRef = useRef<number | null>(null);
  const npBusyRef = useRef(false);
  const npBackoffUntilRef = useRef(0);

  useEffect(() => {
    storage.set("playerBassBoostDb", bassBoostDb);
  }, [bassBoostDb]);

  useEffect(() => {
    storage.set("playerEqPreset", eqPreset);
  }, [eqPreset]);

  const [levels, setLevels] = useState<[number, number, number]>([0, 0, 0]);

  const smoothRef = useRef<[number, number, number]>([0, 0, 0]);
  const agcRef = useRef<[number, number, number]>([0.15, 0.15, 0.15]);

  const lastUrlRef = useRef<string | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryCountRef = useRef<number>(0);
  const isRetryingRef = useRef<boolean>(false);
  const pauseTimerRef = useRef<number | null>(null);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const FADE_IN_MS = 900;
  const FADE_OUT_MS = 900;
  const FADE_MUTE_MS = 700;
  const FADE_UNMUTE_MS = 700;
  const SLEEP_FADE_OUT_MS = 30_000;

  type StreamInfo = {
    formatLabel: string;
    mime?: string;
    bitrateKbps?: number | null;
  };

  const [streamInfo, setStreamInfo] = useState<StreamInfo>({
    formatLabel: "Stream",
    bitrateKbps: null,
  });
  type SleepTimerState = {
    enabled: boolean;
    endsAt: number | null; // epoch ms
  };

  const [sleepTimer, setSleepTimer] = useState<SleepTimerState>(() =>
    storage.get<SleepTimerState>("sleepTimer", {
      enabled: false,
      endsAt: null,
    }),
  );

  const sleepTickRef = useRef<number | null>(null);

  const clearRetry = () => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryCountRef.current = 0;
    isRetryingRef.current = false;
  };
  const scheduleRetry = (reason: "stalled" | "error" | "waiting") => {
    if (!lastUrlRef.current) return;

    if (audioRef.current?.paused) return;

    if (!navigator.onLine) {
      pushToast({ type: "error", message: "No internet connection." }, 3000);
      return;
    }

    const n = retryCountRef.current;
    const delay = Math.min(12000, 3000 + n * 1500);

    if (retryTimerRef.current) return;

    retryCountRef.current = n + 1;
    isRetryingRef.current = true;

    pushToast(
      {
        type: "info",
        message:
          reason === "waiting"
            ? "Buffering… reconnecting."
            : "Stream interrupted. Reconnecting…",
      },
      2200,
    );

    retryTimerRef.current = window.setTimeout(async () => {
      retryTimerRef.current = null;
      const url = lastUrlRef.current;
      if (!url || !audioRef.current) return;

      if (!navigator.onLine) return;

      try {
        setStatus("loading");

        audioRef.current.src = url;

        if (gainRef.current && audioCtxRef.current) {
          gainRef.current.gain.value = 0;
        }

        if (audioCtxRef.current?.state === "suspended") {
          await audioCtxRef.current.resume();
        }

        await audioRef.current.play();
        setStatus("playing");
        startNowPlaying(url);
        const v = clamp01(volume);
        if (v > 0.001) fadeTo(v, 250);

        clearRetry();
        pushToast({ type: "success", message: "Reconnected." }, 1200);
      } catch {
        setStatus("error");
        if (navigator.onLine) scheduleRetry("error");
      }
    }, delay);
  };

  const pushToast = (t: Toast, autoHideMs = 2500) => {
    setToast(t);
    if (!t) return;
    window.setTimeout(() => setToast(null), autoHideMs);
  };

  const fadeTo = (target: number, ms = 600) => {
    const gain = gainRef.current;
    const ctx = audioCtxRef.current;
    if (!gain || !ctx) return;

    const t0 = ctx.currentTime;
    const v = clamp01(target);

    try {
      gain.gain.cancelScheduledValues(t0);

      const cur = gain.gain.value;
      gain.gain.setValueAtTime(cur, t0);

      const timeConstant = Math.max(0.01, ms / 1000 / 3);
      gain.gain.setTargetAtTime(v, t0, timeConstant);

      gain.gain.setValueAtTime(v, t0 + ms / 1000);
    } catch {
      gain.gain.value = v;
    }
  };

  useEffect(() => {
    if (audioRef.current) return;

    const a = new Audio();
    a.crossOrigin = "anonymous";
    a.volume = 1;
    audioRef.current = a;

    const onError = () => {
      if (!navigator.onLine) {
        pushToast({ type: "error", message: "No internet connection." }, 3000);
        setStatus("error");
        clearRetry();
        return;
      }
      pushToast({ type: "error", message: "Stream unavailable." }, 3000);
      setStatus("error");
      scheduleRetry("error");
    };

    const onStalled = () => {
      setStatus((s) => (s === "playing" ? "loading" : s));
      scheduleRetry("stalled");
    };

    const onWaiting = () => {
      setStatus((s) => (s === "playing" ? "loading" : s));
      scheduleRetry("waiting");
    };

    const onPlaying = () => {
      setStatus("playing");
      if (isRetryingRef.current) clearRetry();
      setToast(null);
    };

    a.addEventListener("error", onError);
    a.addEventListener("stalled", onStalled);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("playing", onPlaying);

    return () => {
      a.removeEventListener("error", onError);
      a.removeEventListener("stalled", onStalled);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("playing", onPlaying);
    };
  }, []);
  useEffect(() => {
    storage.set("sleepTimer", sleepTimer);
  }, [sleepTimer]);

  useEffect(() => {
    const onOnline = () => {
      pushToast({ type: "success", message: "Back online." }, 1400);

      if (lastUrlRef.current && status !== "playing") {
        window.setTimeout(() => {
          if (!audioRef.current?.paused) {
            try {
              audioRef.current!.src = lastUrlRef.current!;
              audioRef.current!.play().catch(() => {});
            } catch {}
          }
        }, 400);
      }
    };

    const onOffline = () => {
      clearRetry();
      pushToast({ type: "error", message: "No internet connection." }, 3500);
      try {
        audioRef.current?.pause();
      } catch {}
      setStatus("paused");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [status]);

  useEffect(() => {
    const v = clamp01(volume);
    storage.set("playerVolume", v);

    if (v > 0.001) {
      setLastVolume(v);
      storage.set("playerLastVolume", v);
    }

    if (gainRef.current && audioCtxRef.current) {
      if (!audioRef.current?.paused) fadeTo(v, 350);
      else gainRef.current.gain.value = v;
    }
  }, [volume]);

  const applyEqPreset = (p: EqPreset) => {
    const low = eqLowRef.current;
    const mid = eqMidRef.current;
    const high = eqHighRef.current;
    if (!low || !mid || !high) return;

    const v = EQ_PRESETS[p];

    const lowDb = p === "bass" ? clampDb(bassBoostDb) : v.low;

    low.type = "lowshelf";
    low.frequency.value = 120;
    low.gain.value = lowDb;

    mid.type = "peaking";
    mid.frequency.value = 1100;
    mid.Q.value = 0.9;
    mid.gain.value = v.mid;

    high.type = "highshelf";
    high.frequency.value = 6500;
    high.gain.value = v.high;
  };

  const setEqPreset = (p: EqPreset) => {
    setEqPresetState(p);
    applyEqPreset(p);
  };

  const setupAudioGraph = () => {
    if (!audioRef.current) return;

    if (
      audioCtxRef.current &&
      analyserRef.current &&
      gainRef.current &&
      sourceRef.current &&
      freqDataRef.current &&
      eqLowRef.current &&
      eqMidRef.current &&
      eqHighRef.current
    ) {
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AudioCtx();
    const source = ctx.createMediaElementSource(audioRef.current);

    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();

    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();

    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;

    source.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    eqLowRef.current = low;
    eqMidRef.current = mid;
    eqHighRef.current = high;

    const v = clamp01(volume);
    gain.gain.value = v;
    applyEqPreset(eqPreset);

    const freqData = new Uint8Array(analyser.frequencyBinCount);

    audioCtxRef.current = ctx;
    sourceRef.current = source;
    analyserRef.current = analyser;
    gainRef.current = gain;
    freqDataRef.current = freqData;

    startAnimation();
  };

  const startAnimation = () => {
    if (rafRef.current) return;

    const tick = () => {
      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;

      if (!analyser || !freqData) {
        rafRef.current = null;
        return;
      }

      if (audioRef.current?.paused) {
        const prev = smoothRef.current;
        const next: [number, number, number] = [
          prev[0] * 0.85,
          prev[1] * 0.85,
          prev[2] * 0.85,
        ];
        smoothRef.current = next;
        setLevels(next);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      analyser.getByteFrequencyData(freqData);

      const bass = bandAvg(freqData, 0, 30);
      const mid = bandAvg(freqData, 30, 120);
      const high = bandAvg(freqData, 120, 260);

      const raw: [number, number, number] = [bass / 255, mid / 255, high / 255];

      const agc = agcRef.current;
      const AGC_UP = 0.05;
      const AGC_DOWN = 0.012;

      for (let i = 0 as 0 | 1 | 2; i < 3; i = (i + 1) as 0 | 1 | 2) {
        const cur = raw[i];
        const prev = agc[i];
        const k = cur > prev ? AGC_UP : AGC_DOWN;
        agc[i] = prev + (cur - prev) * k;
      }

      const ref0 = Math.max(0.08, agc[0]);
      const ref1 = Math.max(0.08, agc[1]);
      const ref2 = Math.max(0.08, agc[2]);

      let target: [number, number, number] = [
        clamp01(raw[0] / ref0),
        clamp01(raw[1] / ref1),
        clamp01(raw[2] / ref2),
      ];

      const GATE_LOW = 0.06;
      const GATE_MID = 0.045;
      const GATE_HIGH = 0.03;

      target = [
        target[0] < GATE_LOW ? 0 : target[0],
        target[1] < GATE_MID ? 0 : target[1],
        target[2] < GATE_HIGH ? 0 : target[2],
      ];

      const prev = smoothRef.current;
      const ATTACK = 0.9;
      const RELEASE = 0.6;

      const next: [number, number, number] = [
        smoothOne(prev[0], target[0], ATTACK, RELEASE),
        smoothOne(prev[1], target[1], ATTACK, RELEASE),
        smoothOne(prev[2], target[2], ATTACK, RELEASE),
      ];

      smoothRef.current = next;
      setLevels(next);

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const stopAnimation = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    smoothRef.current = [0, 0, 0];
    agcRef.current = [0.15, 0.15, 0.15];
    setLevels([0, 0, 0]);
  };

  const stopNowPlaying = () => {
    if (npBootTimerRef.current) {
      window.clearTimeout(npBootTimerRef.current);
      npBootTimerRef.current = null;
    }

    if (npTimerRef.current) {
      window.clearInterval(npTimerRef.current);
      npTimerRef.current = null;
    }

    if (npAbortRef.current) {
      npAbortRef.current.abort();
      npAbortRef.current = null;
    }

    npMissCountRef.current = 0;
    npLastRawRef.current = null;
    npLastSuccessAtRef.current = null;
    npBusyRef.current = false;
    npBackoffUntilRef.current = 0;
  };

  const startNowPlaying = (url: string) => {
    stopNowPlaying();
    setNowPlaying(null);

    const STALE_AFTER_MS = 180_000; // 3 minutes

    const poll = async () => {
      if (!navigator.onLine) return;
      if (audioRef.current?.paused) return;
      if (Date.now() < npBackoffUntilRef.current) return;
      if (npBusyRef.current) return;

      npBusyRef.current = true;

      const ctrl = new AbortController();
      npAbortRef.current = ctrl;

      try {
        const np = await readIcyNowPlayingOnce(url, ctrl.signal);
        console.log("NOW PLAYING POLL:", url, np);

        if (ctrl.signal.aborted) return;

        if (!np?.raw?.trim()) {
          npMissCountRef.current += 1;

          const lastSuccess = npLastSuccessAtRef.current;
          const tooOld =
            !lastSuccess || Date.now() - lastSuccess > STALE_AFTER_MS;

          if (npMissCountRef.current >= 2) {
            npBackoffUntilRef.current = Date.now() + 60_000;
          }

          if (tooOld) {
            setNowPlaying((prev) =>
              prev
                ? {
                    ...prev,
                    stale: true,
                  }
                : prev,
            );
          }

          return;
        }

        const raw = np.raw.trim();

        npMissCountRef.current = 0;
        npBackoffUntilRef.current = 0;
        npLastSuccessAtRef.current = Date.now();

        if (npLastRawRef.current === raw) {
          setNowPlaying((prev) =>
            prev
              ? {
                  ...prev,
                  at: Date.now(),
                  stale: false,
                }
              : {
                  ...np,
                  raw,
                  at: Date.now(),
                  stale: false,
                },
          );
          return;
        }

        npLastRawRef.current = raw;

        setNowPlaying({
          ...np,
          raw,
          at: Date.now(),
          stale: false,
        });
      } catch {
        npMissCountRef.current += 1;

        if (npMissCountRef.current >= 2) {
          npBackoffUntilRef.current = Date.now() + 60_000;
        }

        const lastSuccess = npLastSuccessAtRef.current;
        const tooOld =
          !lastSuccess || Date.now() - lastSuccess > STALE_AFTER_MS;

        if (tooOld) {
          setNowPlaying((prev) =>
            prev
              ? {
                  ...prev,
                  stale: true,
                }
              : prev,
          );
        }
      } finally {
        npBusyRef.current = false;
      }
    };

    poll().catch(() => {});

    npBootTimerRef.current = window.setTimeout(() => {
      poll().catch(() => {});
    }, 12000);

    npTimerRef.current = window.setInterval(() => {
      poll().catch(() => {});
    }, 25000);
  };

  const play = async (url: string) => {
    if (!audioRef.current) return;

    setStreamInfo({
      formatLabel: guessFormatFromUrl(url),
      bitrateKbps: null,
      mime: undefined,
    });

    tryHeadContentType(url).then((mime) => {
      const lbl = labelFromMime(mime);
      setStreamInfo((prev) => ({
        ...prev,
        mime: lbl ? mime : undefined,
        formatLabel: lbl ?? prev.formatLabel,
      }));
    });

    if (!navigator.onLine) {
      clearRetry();
      pushToast({ type: "error", message: "No internet connection." }, 3000);
      setStatus("error");
      return;
    }

    try {
      clearRetry();
      lastUrlRef.current = url;

      setStatus("loading");
      pushToast({ type: "info", message: "Connecting…" }, 1200);

      audioRef.current.volume = 1;
      audioRef.current.src = url;

      setupAudioGraph();

      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume();
      }

      const v = clamp01(volume);
      if (gainRef.current && audioCtxRef.current) {
        gainRef.current.gain.value = 0;
      }

      await audioRef.current.play();
      setStatus("playing");
      startNowPlaying(url);

      if (v > 0.001) fadeTo(v, FADE_IN_MS);

      setToast(null);
    } catch {
      setStatus("error");
      pushToast({ type: "error", message: "Playback failed. Retrying…" }, 2600);

      if (navigator.onLine) scheduleRetry("error");
    }
  };

  const pause = () => {
    if (pauseTimerRef.current) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    clearRetry();

    if (
      audioRef.current &&
      !audioRef.current.paused &&
      gainRef.current &&
      audioCtxRef.current
    ) {
      fadeTo(0, FADE_OUT_MS);

      pauseTimerRef.current = window.setTimeout(() => {
        audioRef.current?.pause();
        setStatus("paused");
      }, FADE_OUT_MS + 40);

      return;
    }

    audioRef.current?.pause();
    setStatus("paused");
    stopNowPlaying();
  };
  useEffect(() => {
    if (sleepTickRef.current) {
      window.clearInterval(sleepTickRef.current);
      sleepTickRef.current = null;
    }

    if (!sleepTimer.enabled || !sleepTimer.endsAt) return;

    sleepTickRef.current = window.setInterval(() => {
      const left = sleepTimer.endsAt! - Date.now();

      if (left <= 0) {
        setSleepTimer({ enabled: false, endsAt: null });

        try {
          if (
            !audioRef.current?.paused &&
            gainRef.current &&
            audioCtxRef.current
          ) {
            fadeTo(0, SLEEP_FADE_OUT_MS);

            window.setTimeout(() => {
              try {
                audioRef.current?.pause();
              } catch {}
              setStatus("paused");
              pushToast({ type: "info", message: "Good night 🌙" }, 2600);
            }, SLEEP_FADE_OUT_MS + 120);

            return;
          }
          try {
            audioRef.current?.pause();
          } catch {}
          setStatus("paused");
          pushToast({ type: "info", message: "Good night 🌙" }, 2600);
        } catch {
          pushToast({ type: "info", message: "Good night 🌙" }, 2600);
        }
      }
    }, 500);

    return () => {
      if (sleepTickRef.current) {
        window.clearInterval(sleepTickRef.current);
        sleepTickRef.current = null;
      }
    };
  }, [sleepTimer.enabled, sleepTimer.endsAt]);

  const isMuted = volume <= 0.001;

  const toggleMute = () => {
    if (isMuted) {
      const v = lastVolume > 0.001 ? lastVolume : 0.8;
      setVolume(v);

      if (!audioRef.current?.paused) fadeTo(v, FADE_UNMUTE_MS);
    } else {
      setLastVolume(volume);
      storage.set("playerLastVolume", volume);

      if (!audioRef.current?.paused) fadeTo(0, FADE_MUTE_MS);

      window.setTimeout(() => setVolume(0), FADE_MUTE_MS + 40);
    }
  };

  useEffect(() => {
    return () => {
      clearRetry();
      stopNowPlaying();
      stopAnimation();
      try {
        audioRef.current?.pause();
      } catch {}
      try {
        audioCtxRef.current?.close();
      } catch {}
    };
  }, []);

  const setSleepMinutes = (minutes: number) => {
    const m = Math.max(1, Math.floor(minutes));
    setSleepTimer({ enabled: true, endsAt: Date.now() + m * 60_000 });
    pushToast({ type: "success", message: `Sleep timer: ${m} min` }, 1400);
  };

  const cancelSleepTimer = () => {
    setSleepTimer({ enabled: false, endsAt: null });
    pushToast({ type: "info", message: "Sleep timer canceled." }, 1400);
  };

  const sleepRemainingMs =
    sleepTimer.enabled && sleepTimer.endsAt
      ? Math.max(0, sleepTimer.endsAt - Date.now())
      : 0;
  const setVolumeSafe = (next: number | ((v: number) => number)) => {
    setVolume((prev) => {
      const v = typeof next === "function" ? next(prev) : next;
      return clamp01(v);
    });
  };
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

      switch (e.key) {
        case " ":
        case "Spacebar":
          e.preventDefault();
          status === "playing"
            ? pause()
            : lastUrlRef.current && play(lastUrlRef.current);
          break;

        case "ArrowLeft":
          e.preventDefault();
          handlers?.onPrev?.();
          break;

        case "ArrowRight":
          e.preventDefault();
          handlers?.onNext?.();
          break;

        case "m":
        case "M":
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status, handlers]);
  useEffect(() => {
    if (eqPreset !== "bass") return;
    const low = eqLowRef.current;
    if (!low) return;
    low.gain.value = clampDb(bassBoostDb);
  }, [bassBoostDb, eqPreset]);

  return {
    play,
    pause,
    status,
    volume,
    setVolume: setVolumeSafe,
    levels,
    isMuted,
    toggleMute,
    toast,
    clearToast: () => setToast(null),
    streamInfo,
    sleepTimer,
    sleepRemainingMs,
    setSleepMinutes,
    cancelSleepTimer,
    eqPreset,
    setEqPreset,
    bassBoostDb,
    setBassBoostDb: (v: number) => setBassBoostDbState(clampDb(v)),
    nowPlaying,
  };
}

function smoothOne(
  prev: number,
  target: number,
  attack: number,
  release: number,
) {
  const k = target > prev ? attack : release;
  return prev + (target - prev) * k;
}

function bandAvg(arr: Uint8Array, start: number, end: number) {
  const s = Math.max(0, start);
  const e = Math.min(arr.length, end);
  if (e <= s) return 0;

  let sum = 0;
  for (let i = s; i < e; i++) sum += arr[i];
  return sum / (e - s);
}

function guessFormatFromUrl(u: string) {
  const x = u.toLowerCase();
  if (x.includes(".m3u8")) return "HLS";
  if (x.includes(".mp3")) return "MP3";
  if (x.includes(".aac") || x.includes(".aacp")) return "AAC";
  if (x.includes(".m4a") || x.includes(".mp4")) return "M4A/MP4";
  if (x.includes(".ogg") || x.includes(".opus")) return "OGG/OPUS";
  return "Stream";
}

function normalizeMime(ct?: string) {
  if (!ct) return undefined;
  return ct.split(";")[0].trim().toLowerCase(); // "audio/aac"
}

function labelFromMime(mime?: string) {
  if (!mime) return undefined;

  if (mime.includes("application/vnd.apple.mpegurl")) return "HLS";
  if (mime.includes("audio/mpeg")) return "MP3";
  if (mime.includes("audio/aac")) return "AAC";
  if (mime.includes("audio/mp4") || mime.includes("audio/m4a"))
    return "M4A/MP4";
  if (mime.includes("audio/ogg") || mime.includes("application/ogg"))
    return "OGG/OPUS";
  if (mime.startsWith("audio/")) return mime; // fallback ok
  return undefined; // ignore text/html etc.
}

async function tryHeadContentType(u: string): Promise<string | undefined> {
  try {
    const res = await fetch(u, { method: "HEAD", redirect: "follow" });
    return normalizeMime(res.headers.get("content-type") || undefined);
  } catch {
    return undefined;
  }
}
