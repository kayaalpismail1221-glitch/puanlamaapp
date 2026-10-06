import { supabase } from '@/lib/supabase';

/**
 * Platformun en düşük desteklenen sürümü (migration 20261019110000_app_min_versions). Oturum gerekmez.
 * Tablo yoksa ya da ağ hatasında null: kontrol hiçbir zaman uygulamayı kendi hatasıyla kilitlemez.
 */
export async function fetchMinVersion(platform: 'ios' | 'android'): Promise<string | null> {
  const { data, error } = await supabase
    .from('app_min_versions')
    .select('min_version')
    .eq('platform', platform)
    .maybeSingle();
  if (error) return null;
  return data?.min_version ?? null;
}
