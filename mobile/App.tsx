import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import Gate from './src/Gate';
import Studio from './src/Studio';
import { loadKey, resolveBase } from './src/api';
import { colors } from './src/theme';

export default function App() {
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [authed, setAuthed] = useState(false);
  // useURL() covers both cold start (initial URL) and warm handoff (url event)
  // from the share extension: remixstudio://share?url=<encoded>
  const link = Linking.useURL();
  const sharedUrl = link ? ((Linking.parse(link).queryParams?.url as string) ?? '') : '';

  const boot = useCallback(() => {
    setPhase('loading');
    // resolveBase() must succeed before anything else can work — the app has
    // no hardcoded backend host, only a discovery endpoint (see src/api.ts).
    Promise.all([resolveBase(), loadKey()])
      .then(([, key]) => { setAuthed(!!key); setPhase('ready'); })
      .catch(() => setPhase('error'));
  }, []);

  useEffect(() => { boot(); }, [boot]);

  if (phase === 'error') {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.errorText}>Could not reach Remix. Check your connection.</Text>
        <Pressable style={s.retryBtn} onPress={boot}><Text style={s.retryText}>Retry</Text></Pressable>
      </SafeAreaView>
    );
  }
  if (phase === 'loading') return <SafeAreaView style={s.root}><ActivityIndicator color={colors.ink} /></SafeAreaView>;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      {authed
        ? <Studio sharedUrl={sharedUrl} onSignOut={() => setAuthed(false)} />
        : <Gate onEnter={() => setAuthed(true)} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.base, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.ink, fontSize: 15, textAlign: 'center', marginHorizontal: 32, marginBottom: 16 },
  retryBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: colors.base, fontSize: 15, fontWeight: '600' },
});
