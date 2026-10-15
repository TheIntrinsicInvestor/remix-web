import { labelFor, YT_RE, SP_RE, fmtDur, groupOutputs, isStem } from '../labels';

test('labels the documented output filenames', () => {
  expect(labelFor('job1_A_minor_0_stems_vocals.wav')).toBe('Vocals');
  expect(labelFor('job1_A_minor_0_instrumental_mix.wav')).toBe('Instrumental');
  expect(labelFor('job1_A_minor_0_acapella_vocals.wav')).toBe('Acapella');
  expect(labelFor('job1_A_minor_0_full_shift+2_mix.wav')).toBe('Full Mix (+2 semitones)');
  expect(labelFor('job1_A_minor_0_stems_shift-3_drums.wav')).toBe('Drums (-3 semitones)');
});

test('falls back to the raw name for unknown patterns', () => {
  expect(labelFor('weird.wav')).toBe('weird.wav');
});

test('URL detection matches the web console', () => {
  expect(YT_RE.test('https://www.youtube.com/watch?v=abc')).toBe(true);
  expect(YT_RE.test('https://youtu.be/abc')).toBe(true);
  expect(YT_RE.test('https://music.youtube.com/watch?v=abc')).toBe(true);
  expect(SP_RE.test('https://open.spotify.com/track/abc')).toBe(true);
  expect(SP_RE.test('https://open.spotify.com/intl-de/track/abc')).toBe(true);
  expect(SP_RE.test('spotify:track:abc')).toBe(true);
  expect(YT_RE.test('https://example.com')).toBe(false);
});

test('isStem separates stem files from mix outputs', () => {
  expect(isStem('job1_A_minor_0_stems_vocals.wav')).toBe(true);
  expect(isStem('job1_A_minor_0_stems_shift-3_drums.wav')).toBe(true);
  expect(isStem('job1_A_minor_0_instrumental_mix.wav')).toBe(false);
  expect(isStem('job1_A_minor_0_full_shift+2_mix.wav')).toBe(false);
});

test('groupOutputs keeps stems together and every mix on its own', () => {
  // The instrumental is a bounce of drums+bass+other, so it must never end up
  // in the same playable group as those stems.
  const groups = groupOutputs([
    'j_A_minor_0_instrumental_mix.wav',
    'j_A_minor_0_stems_vocals.wav',
    'j_A_minor_0_stems_drums.wav',
    'j_A_minor_0_stems_bass.wav',
    'j_A_minor_0_stems_other.wav',
  ]);
  expect(groups.map(g => g.label)).toEqual(['Instrumental', 'Stems']);
  expect(groups[0].names).toHaveLength(1);
  expect(groups[1].names).toHaveLength(4);
});

test('groupOutputs gives each mix its own group', () => {
  const groups = groupOutputs([
    'j_A_minor_0_instrumental_mix.wav',
    'j_A_minor_0_full_mix.wav',
    'j_A_minor_0_acapella_vocals.wav',
  ]);
  expect(groups.map(g => g.label)).toEqual(['Instrumental', 'Full Mix', 'Acapella']);
  expect(groups.every(g => g.names.length === 1)).toBe(true);
});

test('groupOutputs handles a stems-only job', () => {
  const groups = groupOutputs(['j_A_minor_0_stems_vocals.wav', 'j_A_minor_0_stems_drums.wav']);
  expect(groups).toHaveLength(1);
  expect(groups[0].id).toBe('stems');
});

test('fmtDur', () => {
  expect(fmtDur(0)).toBe('0:00');
  expect(fmtDur(161)).toBe('2:41');
});
