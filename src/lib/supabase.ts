import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from '@/types/database';

/**
 * Supabase istemcisi. Bağlantı bilgileri `.env.local` dosyasından gelir (bkz. `.env.example`).
 * Anahtar herkese açık (anon/publishable) anahtardır; güvenlik veritabanındaki RLS kurallarıyla sağlanır.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Bağlantı bilgileri girilmemişse uygulama kurulum ekranını gösterir */
export const isBackendConfigured = /^https:\/\/.+/.test(url) && key.length > 20;

export const supabase = createClient<Database>(isBackendConfigured ? url : 'https://example.supabase.co', key || 'anon', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/** Oturum yenileme yalnızca uygulama ön plandayken çalışsın */
if (Platform.OS !== 'web' && isBackendConfigured) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** Depolamadaki herkese açık dosyanın adresi */
export function publicUrl(bucket: 'post-photos' | 'avatars', path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
