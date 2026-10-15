"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./StemPlayer.module.css";

// Four stems that sum back to the original mix (htdemucs 4-stem, verified).
// Luminance ranks them: no colour coding anywhere on this page.
const STEMS = [
  { id: "vocals", label: "Vocals" },
  { id: "drums", label: "Drums" },
  { id: "bass", label: "Bass" },
  { id: "other", label: "Other" },
] as const;

type StemId = (typeof STEMS)[number]["id"];
type Status = "idle" | "loading" | "ready" | "error";

export default function StemPlayer() {
  const [status, setStatus] = useState<Status>("idle");
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState<Set<StemId>>(new Set());
  const [progress, setProgress] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<StemId, AudioBuffer>>(new Map());
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainsRef = useRef<Map<StemId, GainNode>>(new Map());
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const durationRef = useRef(0);

  const stopAll = useCallback(() => {
    sourcesRef.current.forEach((s) => {
      try { s.stop(); } catch { /* already stopped */ }
      s.disconnect();
    });
    sourcesRef.current = [];
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setPlaying(false);
    setProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      stopAll();
      ctxRef.current?.close();
    };
  }, [stopAll]);

  // iOS only unlocks audio inside a user gesture, and the gesture context is lost
  // across an await. So the context is created and resumed synchronously in the tap
  // handler, before anything is fetched.
  function unlockAudio(): AudioContext | null {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = ctxRef.current ?? new Ctor();
    ctxRef.current = ctx;
    void ctx.resume();
    return ctx;
  }

  async function ensureLoaded(ctx: AudioContext) {
    if (status === "ready") return true;
    setStatus("loading");
    try {
      await Promise.all(
        STEMS.map(async ({ id }) => {
          if (buffersRef.current.has(id)) return;
          const res = await fetch(`/stems/${id}.m4a`);
          if (!res.ok) throw new Error(`failed to load ${id}`);
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          buffersRef.current.set(id, buf);
          durationRef.current = Math.max(durationRef.current, buf.duration);
        })
      );
      setStatus("ready");
      return true;
    } catch {
      setStatus("error");
      return false;
    }
  }

  async function play() {
    const ctx = unlockAudio();      // must happen before any await, for iOS
    if (!ctx) { setStatus("error"); return; }
    const ok = await ensureLoaded(ctx);
    if (!ok) return;
    await ctx.resume();             // again, in case the first was pre-empted
    stopAll();

    // One shared start time is what keeps the four stems phase-locked.
    const startAt = ctx.currentTime + 0.06;
    STEMS.forEach(({ id }) => {
      const buffer = buffersRef.current.get(id)!;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = muted.has(id) ? 0 : 1;
      source.connect(gain).connect(ctx.destination);
      source.start(startAt);
      sourcesRef.current.push(source);
      gainsRef.current.set(id, gain);
    });
    startedAtRef.current = startAt;
    setPlaying(true);

    const tick = () => {
      const d = durationRef.current || 1;
      const elapsed = (ctx.currentTime - startedAtRef.current) % d;
      setProgress(Math.max(0, elapsed / d));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function toggleMute(id: StemId) {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const gain = gainsRef.current.get(id);
      const ctx = ctxRef.current;
      if (gain && ctx) {
        // short ramp, not a hard cut: a stepped gain change clicks
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(next.has(id) ? 0 : 1, ctx.currentTime, 0.015);
      }
      return next;
    });
  }

  function soloOnly(id: StemId) {
    const others = STEMS.filter((s) => s.id !== id).map((s) => s.id);
    const isSoloed = muted.size === others.length && others.every((o) => muted.has(o));
    const next = new Set<StemId>(isSoloed ? [] : others);
    setMuted(next);
    const ctx = ctxRef.current;
    if (ctx) {
      STEMS.forEach((s) => {
        const gain = gainsRef.current.get(s.id);
        if (!gain) return;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setTargetAtTime(next.has(s.id) ? 0 : 1, ctx.currentTime, 0.015);
      });
    }
  }

  return (
    <div className={styles.player}>
      <div className={styles.transport}>
        <button
          type="button"
          className={styles.playBtn}
          onClick={() => (playing ? stopAll() : play())}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Loading" : playing ? "Stop" : "Play"}
        </button>
        <div className={styles.track} aria-hidden>
          <div className={styles.fill} style={{ transform: `scaleX(${progress})` }} />
        </div>
        <span className={styles.source}>Michael Jackson, Human Nature</span>
      </div>

      {status === "error" && (
        <p className={styles.error}>The stems could not be loaded. Reload the page to try again.</p>
      )}

      <ul className={styles.stems}>
        {STEMS.map(({ id, label }, i) => {
          const isMuted = muted.has(id);
          return (
            <li key={id} className={styles.stemRow}>
              <button
                type="button"
                className={`${styles.stemBtn} ${isMuted ? styles.stemMuted : ""}`}
                aria-pressed={!isMuted}
                onClick={() => toggleMute(id)}
              >
                <span className={styles.stemLabel}>{label}</span>
                {/* luminance ranks the stems: rank 0 brightest, rank 3 dimmest */}
                <span className={styles.stemBar} data-rank={i} aria-hidden />
                <span className={styles.stemState}>{isMuted ? "muted" : "on"}</span>
              </button>
              <button type="button" className={styles.soloBtn} onClick={() => soloOnly(id)}>
                solo
              </button>
            </li>
          );
        })}
      </ul>

      <p className={styles.note}>
        A 15 second excerpt, separated into four stems by the same tool. The four sum back to the original
        recording.
      </p>
    </div>
  );
}
