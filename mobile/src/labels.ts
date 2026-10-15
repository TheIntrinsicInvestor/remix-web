// mobile/src/labels.ts — mirrors web/app/studio/page.tsx and the backend naming.
export const CHANNELS: { id: string; name: string; hint: string }[] = [
  { id: 'instrumental', name: 'Backing track', hint: 'sing over it, everything but the vocals' },
  { id: 'acapella', name: 'Vocals only', hint: 'isolated acapella' },
  { id: 'stems', name: 'Separate stems', hint: 'vocals, drums, bass, other, as 4 files' },
  { id: 'full_mix', name: 'Whole song', hint: 'the full mix, mainly for a new key' },
];

const OUTPUT_LABELS: [RegExp, string][] = [
  [/_instrumental(_shift[+-]\d+)?_mix\.wav$/, 'Instrumental'],
  [/_acapella(_shift[+-]\d+)?_vocals\.wav$/, 'Acapella'],
  [/_full(_shift[+-]\d+)?_mix\.wav$/, 'Full Mix'],
];
const STEM_RE = /_stems(_shift[+-]\d+)?_([a-z]+)\.wav$/;
const STEM_LABELS: Record<string, string> = { vocals: 'Vocals', drums: 'Drums', bass: 'Bass', other: 'Other' };

export const YT_RE = /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com\/(watch\?|shorts\/)|youtu\.be\/)/i;
export const SP_RE = /^(https?:\/\/)?(open\.)?spotify\.com\/(intl-[a-z]+\/)?track\/|^spotify:track:/i;

export function isStem(name: string): boolean {
  return STEM_RE.test(name);
}

export type Group = { id: string; label: string; names: string[] };

/**
 * Split the outputs into groups that can be played on their own.
 *
 * These are not parallel tracks of one multitrack: the instrumental is a
 * bounce of drums+bass+other, so playing it alongside those stems sounds each
 * of them twice, and bounce() peak-normalizes while raw stems don't. Two
 * copies at different gains comb-filter, which reads as a sync problem. The
 * stems are the only set that genuinely belongs together, so every mix output
 * becomes its own single-file group.
 */
export function groupOutputs(files: string[]): Group[] {
  const stems = files.filter(isStem);
  const groups: Group[] = files
    .filter(f => !isStem(f))
    .map(f => ({ id: f, label: labelFor(f), names: [f] }));
  if (stems.length) groups.push({ id: 'stems', label: 'Stems', names: stems });
  return groups;
}

export function labelFor(name: string): string {
  const stem = name.match(STEM_RE)?.[2];
  const stemMatch = stem ? (STEM_LABELS[stem] ?? stem) : undefined;
  let label = stemMatch ?? OUTPUT_LABELS.find(([re]) => re.test(name))?.[1] ?? name;
  const m = name.match(/shift([+-]\d+)/);
  if (m) label += ` (${m[1]} semitones)`;
  return label;
}

// Backend stage strings (remixweb/runner.py, pipeline.py). Uploads don't exist
// in the app, so "downloading" is always shown.
export const STEPS = [
  { id: 'downloading', label: 'Downloading audio' },
  { id: 'separating', label: 'Separating stems' },
  { id: 'rendering', label: 'Rendering outputs' },
] as const;

export function fmtDur(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
