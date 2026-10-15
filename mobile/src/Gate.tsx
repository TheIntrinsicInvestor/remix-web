import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { checkKey, storeKey } from './api';
import { colors } from './theme';

// Mirrors web/app/Gate.tsx: the key is verified against /auth-check BEFORE it
// is stored, so a wrong password fails here instead of as a fake-broken console.
export default function Gate({ onEnter }: { onEnter: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function enter() {
    const candidate = value.trim();
    if (!candidate || busy) return;
    setBusy(true); setError('');
    try {
      if (!(await checkKey(candidate))) { setError('That password is not right.'); setBusy(false); return; }
    } catch { setError('Could not reach the server. It may be down.'); setBusy(false); return; }
    await storeKey(candidate);
    onEnter();
  }

  return (
    <View style={s.wrap}>
      <Text style={s.heading}>Remix Studio</Text>
      <Text style={s.body}>Enter the studio password.</Text>
      <TextInput
        style={s.input} secureTextEntry autoCapitalize="none" autoCorrect={false}
        value={value} onChangeText={t => { setValue(t); setError(''); }}
        onSubmitEditing={enter} placeholder="Password" placeholderTextColor={colors.dim}
      />
      <Pressable style={({ pressed }) => [s.btn, pressed && s.btnPressed, (!value || busy) && s.btnOff]}
                 onPress={enter} disabled={!value || busy}>
        {busy ? <ActivityIndicator color={colors.base} /> : <Text style={s.btnText}>Enter</Text>}
      </Pressable>
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.base, justifyContent: 'center', padding: 28 },
  heading: { color: colors.ink, fontSize: 28, fontWeight: '600', marginBottom: 8 },
  body: { color: colors.dim, fontSize: 15, marginBottom: 24 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, color: colors.ink,
           paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12 },
  btn: { backgroundColor: colors.accent, borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  btnPressed: { opacity: 0.7 },
  btnOff: { opacity: 0.4 },
  btnText: { color: colors.base, fontSize: 16, fontWeight: '600' },
  error: { color: colors.danger, marginTop: 12, fontSize: 14 },
});
