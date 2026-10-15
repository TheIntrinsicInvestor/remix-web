import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { fileUrl } from './api';
import { colors } from './theme';

export type Track = { name: string; player: AudioPlayer };

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * One clock for every stem. Each stem gets its own AudioPlayer (expo-audio has
 * no multi-track player), and they are started, paused and seeked together.
 *
 * The files are downloaded to the cache before any player is created: streaming
 * several remote files at once makes them buffer independently, which is what
 * drift comes from. Local files still are not sample-accurate — expect tens of
 * milliseconds of slop — but they hold together well enough to judge a mix.
 */
export default function Transport({
  jobId,
  names,
  onTracks,
}: {
  jobId: string;
  names: string[];
  onTracks: (t: Track[]) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  const tracksRef = useRef<Track[]>([]);
  const widthRef = useRef(1);
  const scrubRef = useRef(false);
  const durRef = useRef(0);

  // Load every stem, then build the players.
  useEffect(() => {
    let cancelled = false;
    const built: Track[] = [];
    (async () => {
      try {
        // Without this the iOS ring/silent switch silences playback, which
        // reads as a broken player rather than a muted phone.
        await setAudioModeAsync({ playsInSilentMode: true });
        for (const name of names) {
          const target = `${FileSystem.cacheDirectory}play_${jobId}_${name.replace(/[^\w.-]/g, '_')}.m4a`;
          const info = await FileSystem.getInfoAsync(target);
          if (!info.exists) {
            await FileSystem.downloadAsync(fileUrl(jobId, name, 'm4a'), target);
          }
          if (cancelled) return;
          built.push({ name, player: createAudioPlayer(target) });
        }
        if (cancelled) return;
        tracksRef.current = built;
        setTracks(built);
        onTracks(built);
        setLoading(false);
      } catch {
        if (!cancelled) { setErr('Could not load the audio.'); setLoading(false); }
      }
    })();
    return () => {
      cancelled = true;
      for (const t of built) t.player.remove();
    };
  }, [jobId, names.join('|')]);

  // Poll the first track for the playhead; it is the clock the others follow.
  useEffect(() => {
    if (!tracks.length) return;
    const lead = tracks[0].player;
    const id = setInterval(() => {
      if (scrubRef.current) return;
      setPos(lead.currentTime);
      if (lead.duration && lead.duration !== durRef.current) {
        durRef.current = lead.duration;
        setDur(lead.duration);
      }
      // Stop cleanly at the end rather than letting tracks free-run apart.
      if (lead.duration && lead.currentTime >= lead.duration - 0.15) {
        for (const t of tracksRef.current) { t.player.pause(); t.player.seekTo(0); }
        setPlaying(false);
        setPos(0);
      }
    }, 200);
    return () => clearInterval(id);
  }, [tracks]);

  function toggle() {
    const ts = tracksRef.current;
    if (!ts.length) return;
    if (playing) {
      for (const t of ts) t.player.pause();
      setPlaying(false);
    } else {
      // Re-align before starting; independent players drift while parked.
      const at = ts[0].player.currentTime;
      for (const t of ts) t.player.seekTo(at, 0, 0);
      for (const t of ts) t.player.play();
      setPlaying(true);
    }
  }

  function seekAll(sec: number) {
    const ts = tracksRef.current;
    const clamped = Math.max(0, Math.min(sec, durRef.current || 0));
    for (const t of ts) t.player.seekTo(clamped, 0, 0);
    setPos(clamped);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        scrubRef.current = true;
        setScrubbing(true);
        const frac = e.nativeEvent.locationX / widthRef.current;
        setPos(Math.max(0, Math.min(1, frac)) * (durRef.current || 0));
      },
      onPanResponderMove: e => {
        const frac = e.nativeEvent.locationX / widthRef.current;
        setPos(Math.max(0, Math.min(1, frac)) * (durRef.current || 0));
      },
      onPanResponderRelease: e => {
        const frac = e.nativeEvent.locationX / widthRef.current;
        seekAll(Math.max(0, Math.min(1, frac)) * (durRef.current || 0));
        scrubRef.current = false;
        setScrubbing(false);
      },
    }),
  ).current;

  if (loading) {
    return (
      <View style={s.wrap}>
        <View style={s.row}>
          <ActivityIndicator color={colors.ink} />
          <Text style={s.loadingText}>loading audio…</Text>
        </View>
      </View>
    );
  }
  if (err) return <View style={s.wrap}><Text style={s.err}>{err}</Text></View>;

  const frac = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;

  return (
    <View style={s.wrap}>
      <View style={s.row}>
        <Pressable onPress={toggle} style={s.play} hitSlop={8}>
          <Text style={s.playText}>{playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <View
          style={s.track}
          onLayout={e => { widthRef.current = e.nativeEvent.layout.width; }}
          {...pan.panHandlers}
        >
          <View style={s.trackLine} />
          <View style={[s.trackFill, { width: `${frac * 100}%` }]} />
          <View style={[s.knob, { left: `${frac * 100}%` }, scrubbing && s.knobBig]} />
        </View>
        <Text style={s.time}>{fmt(pos)} / {fmt(dur)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { width: 34, alignItems: 'center' },
  playText: { color: colors.ink, fontSize: 16 },
  loadingText: { color: colors.dim, fontSize: 14 },
  track: { flex: 1, height: 28, justifyContent: 'center' },
  trackLine: { height: 2, backgroundColor: colors.line, borderRadius: 1 },
  trackFill: { position: 'absolute', height: 2, backgroundColor: colors.ink, borderRadius: 1 },
  knob: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ink, marginLeft: -5 },
  knobBig: { width: 16, height: 16, borderRadius: 8, marginLeft: -8 },
  time: { color: colors.dim, fontSize: 13, fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' },
  err: { color: colors.danger, fontSize: 13 },
});
