"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { setKey, getKey, resolveSpotify, createJob, getJob, downloadFile, previewFileUrl, youtubeMetadata } from "@/lib/api";

type Cand = { title: string; channel: string; duration_sec: number; thumbnail: string; webpage_url: string };
type YtMeta = { title: string; channel: string; duration_sec: number };

// Selector model: intent-framed channels. `id` is the backend output value.
const CHANNELS: { id: string; name: string; hint: string }[] = [
  { id: "instrumental", name: "Backing track", hint: "sing over it, everything but the vocals" },
  { id: "acapella", name: "Vocals only", hint: "isolated acapella" },
  { id: "stems", name: "Separate stems", hint: "vocals, drums, bass, other, as 4 files" },
  { id: "full_mix", name: "Whole song", hint: "the full mix, mainly for a new key" },
];

// Result-file labelling. Names are {song}_{key}_{bpm}_{tag}_{kind}.wav, where the
// tag names the output and the trailing kind is "mix" or a stem name.
const OUTPUT_LABELS: [RegExp, string][] = [
  [/_instrumental(_shift[+-]\d+)?_mix\.wav$/, "Instrumental"],
  [/_acapella(_shift[+-]\d+)?_vocals\.wav$/, "Acapella"],
  [/_full(_shift[+-]\d+)?_mix\.wav$/, "Full Mix"],
];
const STEM_RE = /_stems(_shift[+-]\d+)?_([a-z]+)\.wav$/;
const STEM_LABELS: Record<string, string> = { vocals: "Vocals", drums: "Drums", bass: "Bass", other: "Other" };

const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?|shorts\/)|youtu\.be\/)/i;
const SP_RE = /^(https?:\/\/)?(open\.)?spotify\.com\/(intl-[a-z]+\/)?track\/|^spotify:track:/i;

function labelFor(name: string): string {
  const stem = name.match(STEM_RE)?.[2];
  const stemMatch = stem ? (STEM_LABELS[stem] ?? stem) : undefined;
  let label = stemMatch ?? OUTPUT_LABELS.find(([re]) => re.test(name))?.[1] ?? name;
  const m = name.match(/shift([+-]\d+)/);
  if (m) label += ` (${m[1]} semitones)`;
  return label;
}

// Mirrors the stage strings the backend reports (remixweb/runner.py, pipeline.py).
const STEPS = [
  { id: "downloading", label: "Downloading audio" },
  { id: "separating", label: "Separating stems" },
  { id: "rendering", label: "Rendering outputs" },
] as const;

function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function StudioPage() {
  const router = useRouter();
  // Without this the route is merely unlisted, not protected.
  const [authed, setAuthed] = useState<boolean | null>(null);

  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cand, setCand] = useState<Cand | null>(null);
  const [ytMeta, setYtMeta] = useState<YtMeta | null>(null);
  const [resolving, setResolving] = useState(false);

  const [outs, setOuts] = useState<string[]>(["instrumental"]);
  const [transpose, setTranspose] = useState(false);
  const [semi, setSemi] = useState(0);

  const [jobId, setJobId] = useState("");
  const [stage, setStage] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (getKey()) setAuthed(true);
    else { setAuthed(false); router.replace("/"); }
  }, [router]);

  // A single smart source field: detect YouTube vs Spotify from the URL and
  // fetch the matching track (debounced). A chosen file overrides the URL.
  useEffect(() => {
    if (file) { setYtMeta(null); setCand(null); setResolving(false); return; }
    const u = url.trim();
    if (SP_RE.test(u)) {
      setYtMeta(null); setErr(""); let stale = false; setResolving(true);
      const t = setTimeout(async () => {
        try { const r = await resolveSpotify(url); if (!stale) setCand(r.candidate); }
        catch { if (!stale) setCand(null); }
        finally { if (!stale) setResolving(false); }
      }, 700);
      return () => { stale = true; clearTimeout(t); setResolving(false); };
    }
    if (YT_RE.test(u)) {
      setCand(null); setResolving(false); let stale = false;
      const t = setTimeout(async () => {
        try { const m = await youtubeMetadata(url); if (!stale) setYtMeta(m); }
        catch { if (!stale) setYtMeta(null); }
      }, 600);
      return () => { stale = true; clearTimeout(t); };
    }
    setYtMeta(null); setCand(null); setResolving(false);
  }, [url, file]);

  // Tick once a second while a job is in flight, to drive the elapsed clock.
  useEffect(() => {
    if (!startedAt || files.length > 0 || err) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, files.length, err]);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const kind: "upload" | "youtube" | "spotify" | "empty" =
    file ? "upload" : SP_RE.test(url.trim()) ? "spotify" : YT_RE.test(url.trim()) ? "youtube" : "empty";

  // Uploads skip the download stage entirely (remixweb/runner.py).
  const steps = kind === "upload" ? STEPS.filter(s => s.id !== "downloading") : STEPS;
  const curStep = steps.findIndex(s => s.id === stage);
  const elapsedSec = startedAt ? Math.max(0, (tick - startedAt) / 1000) : 0;

  const sourceReady = kind === "upload" ? !!file : kind === "youtube" ? true : kind === "spotify" ? !!cand : false;
  const canRun = outs.length > 0 && sourceReady && !running;

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  function pickFile(f: File | null) { setFile(f); if (f) setUrl(""); }

  async function submit() {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
    setErr(""); setFiles([]); setStage("queued"); setStartedAt(Date.now()); setTick(Date.now());
    setRunning(true);
    const doTranspose = transpose && semi !== 0;
    const fd = new FormData();
    fd.set("outputs", outs.join(","));
    fd.set("transpose_semitones", String(doTranspose ? semi : 0));
    fd.set("transpose_targets", doTranspose ? outs.join(",") : "");
    if (kind === "upload" && file) { fd.set("source_type", "upload"); fd.set("file", file); }
    else if (kind === "spotify" && cand) { fd.set("source_type", "spotify_confirmed"); fd.set("source_ref", cand.webpage_url); }
    else { fd.set("source_type", "youtube"); fd.set("source_ref", url); }
    try {
      const { job_id } = await createJob(fd);
      setJobId(job_id);
      poll.current = setInterval(async () => {
        try {
          const s = await getJob(job_id);
          setStage(s.stage);
          if (s.status === "done") {
            if (s.result_files.length) setFiles(s.result_files);
            else setErr("The job finished but produced no files. Try again.");
            clearInterval(poll.current!); setRunning(false);
          }
          if (s.status === "error") { setErr(s.error || "Something went wrong during processing."); clearInterval(poll.current!); setRunning(false); }
        } catch (e: any) { setErr(e.message); clearInterval(poll.current!); setRunning(false); }
      }, 2000);
    } catch (e: any) { setErr(e.message); setRunning(false); }
  }

  if (authed !== true) return <main className={styles.page} />;

  return (
    <main className={styles.page}>
      <div className={styles.unit}>
        <header className={styles.header}>
          <span className={styles.wordmark}>Remix</span>
          <button className={styles.eject} onClick={() => { setKey(""); router.push("/"); }}>sign out</button>
        </header>

        <div className={styles.body}>
          {/* SOURCE */}
          <section className={styles.section}>
            <div className={styles.sectionHead}><span className={styles.sectionLabel}>Source</span></div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="source-url">Link</label>
              <input id="source-url" className={styles.input} placeholder="A YouTube or Spotify link"
                     value={url} onChange={e => { setUrl(e.target.value); if (e.target.value) pickFile(null); }} />
            </div>

            <div className={styles.orRule}>or</div>

            <div
              className={`${styles.dropZone} ${dragging ? styles.dropActive : ""}`}
              role="button" tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click(); } }}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
            >
              {file ? <span>{file.name}</span> : <span>Drop an audio file, or click to browse</span>}
            </div>
            <input ref={fileInput} type="file" accept="audio/*" hidden
                   onChange={e => pickFile(e.target.files?.[0] || null)} />

            {resolving && <div className={styles.resolving}>Finding a match on YouTube</div>}
            {kind === "spotify" && cand && (
              <div className={styles.metaCard}>
                <img className={styles.metaThumb} src={cand.thumbnail} alt="" />
                <div className={styles.metaText}>
                  <div className={styles.metaTitle}>{cand.title}</div>
                  <div className={styles.metaSub}>{cand.channel} · {fmtDur(cand.duration_sec)}</div>
                </div>
                <span className={styles.metaBadge}>matched</span>
              </div>
            )}
            {kind === "youtube" && ytMeta && (
              <div className={styles.metaCard}>
                <div className={styles.metaText}>
                  <div className={styles.metaTitle}>{ytMeta.title}</div>
                  <div className={styles.metaSub}>{ytMeta.channel} · {fmtDur(ytMeta.duration_sec)}</div>
                </div>
                <span className={styles.metaBadge}>found</span>
              </div>
            )}
          </section>

          {/* CHANNELS */}
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Channels</span>
              <span className={styles.sectionHint}>pick what you want out</span>
            </div>
            <div className={styles.channels}>
              {CHANNELS.map((ch, i) => {
                const on = outs.includes(ch.id);
                return (
                  <button key={ch.id} type="button" aria-pressed={on}
                          className={`${styles.channel} ${on ? styles.channelOn : ""}`}
                          onClick={() => toggle(outs, ch.id, setOuts)}>
                    <span className={styles.channelText}>
                      <span className={styles.channelName}>{ch.name}</span>
                      <span className={styles.channelHint}>{ch.hint}</span>
                    </span>
                    <span className={styles.channelBar} data-rank={i} aria-hidden />
                  </button>
                );
              })}
            </div>
          </section>

          {/* PITCH */}
          <section className={styles.section}>
            <div className={styles.sectionHead}><span className={styles.sectionLabel}>Pitch</span></div>
            <div className={styles.pitchTop}>
              <span className={styles.switch} role="switch" aria-checked={transpose} tabIndex={0}
                    onClick={() => setTranspose(t => !t)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setTranspose(t => !t); } }}>
                <span className={`${styles.switchTrack} ${transpose ? styles.switchOn : ""}`}><span className={styles.switchKnob} /></span>
                <span className={styles.switchLabel}>Change key</span>
              </span>
              {transpose && (
                <div className={styles.stepper}>
                  <button className={styles.stepBtn} onClick={() => setSemi(s => Math.max(-12, s - 1))} disabled={semi <= -12} aria-label="down a semitone">-</button>
                  <span className={styles.semiReadout}>{semi > 0 ? `+${semi}` : semi} semitones</span>
                  <button className={styles.stepBtn} onClick={() => setSemi(s => Math.min(12, s + 1))} disabled={semi >= 12} aria-label="up a semitone">+</button>
                </div>
              )}
            </div>
          </section>

          {/* RUN */}
          <div className={styles.runWrap}>
            <button className={styles.runBtn} onClick={submit} disabled={!canRun}>Separate</button>
          </div>

          {stage && files.length === 0 && !err && (
            <div className={styles.status} role="status" aria-live="polite">
              <div className={styles.statusHead}>
                <span className={styles.spinner} aria-hidden="true" />
                <span className={styles.statusStage}>{stage === "queued" ? "Queued" : "Working"}</span>
                <span className={styles.statusElapsed}>{fmtDur(elapsedSec)}</span>
              </div>
              <ol className={styles.steps}>
                {steps.map((s, i) => {
                  const state = curStep < 0 || i > curStep ? "pending" : i < curStep ? "done" : "active";
                  return (
                    <li key={s.id} className={`${styles.step} ${styles[state]}`}>
                      <span className={styles.stepMark} aria-hidden="true">{state === "done" ? "✓" : "•"}</span>
                      <span>{s.label}</span>
                    </li>
                  );
                })}
              </ol>
              <div className={styles.statusNote}>separation takes a few minutes</div>
            </div>
          )}

          {err && <div className={styles.error}>{err}</div>}

          {files.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><span className={styles.sectionLabel}>Output</span></div>
              <div className={styles.results}>
                {files.map(f => (
                  <div key={f} className={styles.result}>
                    <div className={styles.resultHead}>
                      <span className={styles.resultName}>{labelFor(f)}</span>
                      <button className={styles.downloadBtn} onClick={() => downloadFile(jobId, f)}>download</button>
                    </div>
                    <audio controls preload="none" src={previewFileUrl(jobId, f)} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
