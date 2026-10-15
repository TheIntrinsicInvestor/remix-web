import { Pressable, StyleSheet, Text, View } from 'react-native';
import { labelFor } from './labels';
import { colors } from './theme';

// One stem in the active group. Playback is driven by the shared transport, so
// this row only carries the mixer controls.
export default function ResultRow({
  name,
  muted,
  soloed,
  onMute,
  onSolo,
}: {
  name: string;
  muted: boolean;
  soloed: boolean;
  onMute: () => void;
  onSolo: () => void;
}) {
  return (
    <View style={s.row}>
      <Text style={[s.name, muted && s.nameOff]} numberOfLines={1}>{labelFor(name)}</Text>
      <Pressable onPress={onMute} style={[s.tag, muted && s.tagOn]} hitSlop={8}>
        <Text style={[s.tagText, muted && s.tagTextOn]}>M</Text>
      </Pressable>
      <Pressable onPress={onSolo} style={[s.tag, soloed && s.tagOn]} hitSlop={8}>
        <Text style={[s.tagText, soloed && s.tagTextOn]}>S</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  name: { color: colors.ink, fontSize: 15, fontWeight: '500', flex: 1 },
  nameOff: { color: colors.dim },
  tag: { borderWidth: 1, borderColor: colors.line, borderRadius: 4, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  tagOn: { borderColor: colors.ink },
  tagText: { color: colors.dim, fontSize: 12, fontWeight: '600' },
  tagTextOn: { color: colors.ink },
});
