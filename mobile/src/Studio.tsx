import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { clearKey, createJob, getJob, resolveSpotify, youtubeMetadata, Meta } from './api';
import { CHANNELS, STEPS, YT_RE, SP_RE, fmtDur, labelFor, groupOutputs } from './labels';
import { colors } from './theme';
import ResultRow from './ResultRow';
import Transport, { type Track } from './Transport';

export default function Studio({ sharedUrl, onSignOut }: { sharedUrl: string; onSignOut: () => void }) {
  const [url, setUrl] = useState('');
  const [meta, setMeta] = useState<Meta | null>(null);      // youtube metadata or spotify candidate
  const [isSpotify, setIsSpotify] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [outs, setOuts] = useState<string[]>(['instrumental']);
  const [transpose, setTranspose] = useState(false);
  const [semi, setSemi] = useState(0);

  const [jobId, setJobId] = useState('');
  const [stage, setStage] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [running, setRunning] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mixer state for the synced transport, keyed by filename.
  const [tracks, setTracks] = useState<Track[]>([]);
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [solo, setSolo] = useState('');
  // Only one output group plays at a time — a mix already contains the stems,
  // so sounding both doubles that audio instead of layering it.
  const [groupId, setGroupId] = useState('');

  const groups = groupOutputs(files);
  const active = groups.find(g => g.id === groupId) ?? groups[0];
  const activeNames = active?.names ?? [];

  // A stem is audible unless it is muted, or something else is soloed.
  useEffect(() => {
    for (const t of tracks) {
      t.player.muted = solo ? t.name !== solo : !!muted[t.name];
    }
  }, [tracks, muted, solo]);

  // Share-extension handoff: prefill the link; the metadata effect below fires.
  useEffect(() => { if (sharedUrl) setUrl(sharedUrl); }, [sharedUrl]);

  // Debounced metadata fetch, mirroring the web console.
  useEffect(() => {
    const u = url.trim();
    setMeta(null); setErr('');
    if (SP_RE.test(u)) {
      setIsSpotify(true); setResolving(true);
      let stale = false;
      const t = setTimeout(async () => {
        try { const r = await resolveSpotify(u); if (!stale) setMeta(r.candidate); }
        catch { if (!stale) setMeta(null); }
        finally { if (!stale) setResolving(false); }
      }, 700);
      return () => { stale = true; clearTimeout(t); setResolving(false); };
    }
    if (YT_RE.test(u)) {
      setIsSpotify(false);
      let stale = false;
      const t = setTimeout(async () => {
        try { const m = await youtubeMetadata(u); if (!stale) setMeta(m); }
        catch { if (!stale) setMeta(null); }
      }, 600);
      return () => { stale = true; clearTimeout(t); };
    }
  }, [url]);

  // 1 s elapsed clock while a job is in flight.
  useEffect(() => {
    if (!startedAt || files.length > 0 || err) return;
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, files.length, err]);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  async function refresh(id: string) {
    try {
      const s = await getJob(id);
      setStage(s.stage);
      if (s.status === 'done') {
        if (s.result_files.length) setFiles(s.result_files);
        else setErr('The job finished but produced no files. Try again.');
        if (poll.current) clearInterval(poll.current);
        setRunning(false);
      }
      if (s.status === 'error') {
        setErr(s.error || 'Something went wrong during processing.');
        if (poll.current) clearInterval(poll.current);
        setRunning(false);
      }
    } catch (e: any) {
      setErr(e.message); if (poll.current) clearInterval(poll.current); setRunning(false);
    }
  }

  // iOS suspends JS timers in background; on foreground, refresh immediately.
  useEffect(() => {
    if (!jobId || !running) return;
    const sub = AppState.addEventListener('change', st => { if (st === 'active') refresh(jobId); });
    return () => sub.remove();
  }, [jobId, running]);

  const kind = SP_RE.test(url.trim()) ? 'spotify' : YT_RE.test(url.trim()) ? 'youtube' : 'empty';
  const sourceReady = kind === 'youtube' ? true : kind === 'spotify' ? !!meta : false;
  const canRun = outs.length > 0 && sourceReady && !running;
  const curStep = STEPS.findIndex(s2 => s2.id === stage);
  const elapsedSec = startedAt ? Math.max(0, (tick - startedAt) / 1000) : 0;

  const toggle = (v: string) => setOuts(o => o.includes(v) ? o.filter(x => x !== v) : [...o, v]);

  async function submit() {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
    setErr(''); setFiles([]); setStage('queued'); setStartedAt(Date.now()); setTick(Date.now());
    setTracks([]); setMuted({}); setSolo(''); setGroupId('');
    setRunning(true);
    const doTranspose = transpose && semi !== 0;
    const fd = new FormData();
    fd.append('outputs', outs.join(','));
    fd.append('model', 'htdemucs');
    fd.append('transpose_semitones', String(doTranspose ? semi : 0));
    fd.append('transpose_targets', doTranspose ? outs.join(',') : '');
    if (kind === 'spotify' && meta) { fd.append('source_type', 'spotify_confirmed'); fd.append('source_ref', meta.webpage_url); }
    else { fd.append('source_type', 'youtube'); fd.append('source_ref', url.trim()); }
    try {
      const { job_id } = await createJob(fd);
      setJobId(job_id);
      poll.current = setInterval(() => refresh(job_id), 2000);
    } catch (e: any) { setErr(e.message); setRunning(false); }
  }

  async function signOut() { await clearKey(); onSignOut(); }

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={s.wordmark}>Remix</Text>
        <Pressable onPress={signOut}><Text style={s.eject}>sign out</Text></Pressable>
      </View>

      <Text style={s.sectionLabel}>Source</Text>
      <TextInput style={s.input} placeholder="A YouTube or Spotify link" placeholderTextColor={colors.dim}
                 autoCapitalize="none" autoCorrect={false} value={url} onChangeText={setUrl} />
      {resolving && <Text style={s.hint}>Finding a match on YouTube…</Text>}
      {meta && (
        <View style={s.metaCard}>
          {!!meta.thumbnail && <Image source={{ uri: meta.thumbnail }} style={s.thumb} />}
          <View style={s.metaText}>
            <Text style={s.metaTitle} numberOfLines={2}>{meta.title}</Text>
            <Text style={s.metaSub}>{meta.channel} · {fmtDur(meta.duration_sec)}</Text>
          </View>
          <Text style={s.badge}>{isSpotify ? 'matched' : 'found'}</Text>
        </View>
      )}

      <Text style={s.sectionLabel}>Channels</Text>
      {CHANNELS.map(ch => {
        const on = outs.includes(ch.id);
        return (
          <Pressable key={ch.id} onPress={() => toggle(ch.id)} style={[s.channel, on && s.channelOn]}>
            <Text style={[s.channelName, on && s.channelNameOn]}>{ch.name}</Text>
            <Text style={s.channelHint}>{ch.hint}</Text>
          </Pressable>
        );
      })}

      <Text style={s.sectionLabel}>Pitch</Text>
      <View style={s.pitchRow}>
        <Pressable onPress={() => setTranspose(t => !t)} style={[s.pill, transpose && s.pillOn]}>
          <Text style={[s.pillText, transpose && s.pillTextOn]}>Change key</Text>
        </Pressable>
        {transpose && (
          <View style={s.stepper}>
            <Pressable style={s.stepBtn} disabled={semi <= -12} onPress={() => setSemi(v => Math.max(-12, v - 1))}><Text style={s.stepBtnText}>−</Text></Pressable>
            <Text style={s.semi}>{semi > 0 ? `+${semi}` : semi} st</Text>
            <Pressable style={s.stepBtn} disabled={semi >= 12} onPress={() => setSemi(v => Math.min(12, v + 1))}><Text style={s.stepBtnText}>+</Text></Pressable>
          </View>
        )}
      </View>

      <Pressable style={[s.runBtn, !canRun && s.btnOff]} disabled={!canRun} onPress={submit}>
        <Text style={s.runText}>Separate</Text>
      </Pressable>

      {!!stage && files.length === 0 && !err && (
        <View style={s.status}>
          <View style={s.statusHead}>
            <ActivityIndicator color={colors.ink} />
            <Text style={s.statusStage}>{stage === 'queued' ? 'Queued' : 'Working'}</Text>
            <Text style={s.statusElapsed}>{fmtDur(elapsedSec)}</Text>
          </View>
          {STEPS.map((st, i) => {
            const state = curStep < 0 || i > curStep ? 'pending' : i < curStep ? 'done' : 'active';
            return (
              <Text key={st.id} style={[s.step, state === 'done' && s.stepDone, state === 'active' && s.stepActive]}>
                {state === 'done' ? '✓' : '•'}  {st.label}
              </Text>
            );
          })}
          <Text style={s.hint}>separation takes a few minutes</Text>
        </View>
      )}

      {!!err && <Text style={s.error}>{err}</Text>}

      {files.length > 0 && !!active && (
        <View>
          <Text style={s.sectionLabel}>Output</Text>
          {groups.length > 1 && (
            <View style={s.groupRow}>
              {groups.map(g => (
                <Pressable
                  key={g.id}
                  onPress={() => { setGroupId(g.id); setMuted({}); setSolo(''); }}
                  style={[s.pill, g.id === active.id && s.pillOn]}
                >
                  <Text style={[s.pillText, g.id === active.id && s.pillTextOn]}>{g.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Transport jobId={jobId} names={activeNames} onTracks={setTracks} />
          {activeNames.length > 1 && activeNames.map(f => (
            <ResultRow
              key={f}
              name={f}
              muted={!!muted[f]}
              soloed={solo === f}
              onMute={() => setMuted(m => ({ ...m, [f]: !m[f] }))}
              onSolo={() => setSolo(cur => (cur === f ? '' : f))}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.base },
  content: { padding: 20, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  wordmark: { color: colors.ink, fontSize: 22, fontWeight: '600' },
  eject: { color: colors.dim, fontSize: 14 },
  sectionLabel: { color: colors.dim, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 22, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, color: colors.ink, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  hint: { color: colors.dim, fontSize: 13, marginTop: 8 },
  metaCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, marginTop: 10, gap: 10 },
  thumb: { width: 56, height: 42, borderRadius: 4 },
  metaText: { flex: 1 },
  metaTitle: { color: colors.ink, fontSize: 14, fontWeight: '500' },
  metaSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
  badge: { color: colors.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  channel: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, marginBottom: 8 },
  channelOn: { borderColor: colors.ink },
  channelName: { color: colors.dim, fontSize: 15, fontWeight: '600' },
  channelNameOn: { color: colors.ink },
  channelHint: { color: colors.dim, fontSize: 12, marginTop: 2 },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pitchRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pill: { borderWidth: 1, borderColor: colors.line, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  pillOn: { borderColor: colors.ink },
  pillText: { color: colors.dim, fontSize: 14 },
  pillTextOn: { color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: colors.ink, fontSize: 18 },
  semi: { color: colors.ink, fontSize: 15, minWidth: 52, textAlign: 'center' },
  runBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 26 },
  btnOff: { opacity: 0.4 },
  runText: { color: colors.base, fontSize: 16, fontWeight: '600' },
  status: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, marginTop: 20 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statusStage: { color: colors.ink, fontSize: 15, fontWeight: '500', flex: 1 },
  statusElapsed: { color: colors.dim, fontSize: 14, fontVariant: ['tabular-nums'] },
  step: { color: colors.dim, fontSize: 14, marginVertical: 3 },
  stepDone: { color: colors.ink },
  stepActive: { color: colors.ink, fontWeight: '600' },
  error: { color: colors.danger, marginTop: 16, fontSize: 14 },
});
