import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Panoda bağlantı var mı? Ekran odaklanınca ve uygulama öne gelince
 * (ör. Instagram'dan link kopyalayıp dönünce) yeniden kontrol eder.
 * `hasUrlAsync` iOS'ta "yapıştırma izni" sormaz; içeriği okumaz.
 */
export function useClipboardHasUrl() {
  const [hasUrl, setHasUrl] = useState(false);

  const check = useCallback(() => {
    Clipboard.hasUrlAsync().then(setHasUrl).catch(() => setHasUrl(false));
  }, []);

  useFocusEffect(check);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);

  return [hasUrl, setHasUrl] as const;
}

/** Panodaki bağlantıyı (yoksa metni) okur. iOS burada yapıştırma izni sorabilir. */
export async function readClipboardLink(): Promise<string | undefined> {
  const url = await Clipboard.getUrlAsync().catch(() => null);
  const text = url ?? (await Clipboard.getStringAsync().catch(() => ''));
  return text?.trim() || undefined;
}
