import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, View, close, openHostApp, type InitialProps } from 'expo-share-extension';

// The share sheet's view. It hands the shared link to the host app via
// remixstudio://share?url=<encoded>.
//
// It does NOT open the host app on mount. openHostApp() calls close() natively
// straight after (ShareExtensionViewController.swift:201), so firing it from an
// effect tore this view down within a frame of being attached — the sheet just
// flashed grey and dismissed, with the link never arriving. The open is now
// tied to a tap, so the view stays up and its state is visible.
export default function ShareExtension({ url, text, preprocessingResults }: InitialProps) {
  const fromPre =
    preprocessingResults && typeof preprocessingResults === 'object'
      ? (preprocessingResults as Record<string, unknown>).url
      : undefined;
  const shared =
    url ??
    (typeof fromPre === 'string' ? fromPre : undefined) ??
    text?.match(/https?:\/\/\S+/)?.[0] ??
    '';

  const [note, setNote] = useState('');

  function open() {
    if (!shared) return;
    try {
      openHostApp(`share?url=${encodeURIComponent(shared)}`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open Remix Studio.');
    }
  }

  return (
    <View style={s.wrap}>
      <Text style={s.title} allowFontScaling={false}>Remix Studio</Text>
      {shared ? (
        <>
          <Text style={s.link} allowFontScaling={false} numberOfLines={3}>{shared}</Text>
          <Pressable style={s.btn} onPress={open}>
            <Text style={s.btnText} allowFontScaling={false}>Open in Remix Studio</Text>
          </Pressable>
        </>
      ) : (
        <Text style={s.link} allowFontScaling={false}>No link found in what was shared.</Text>
      )}
      {!!note && <Text style={s.note} allowFontScaling={false}>{note}</Text>}
      <Pressable style={s.cancel} onPress={() => close()}>
        <Text style={s.cancelText} allowFontScaling={false}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0b0f10', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#c9cfd6', fontSize: 20, fontWeight: '600', marginBottom: 16 },
  link: { color: '#8b9096', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: '#c9cfd6', borderRadius: 8, paddingVertical: 14, paddingHorizontal: 24 },
  btnText: { color: '#0b0f10', fontSize: 16, fontWeight: '600' },
  note: { color: '#d97070', fontSize: 13, textAlign: 'center', marginTop: 16 },
  cancel: { marginTop: 24, padding: 8 },
  cancelText: { color: '#8b9096', fontSize: 14 },
});
