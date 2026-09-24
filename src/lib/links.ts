import type { SFSymbol } from 'expo-symbols';

import i18n from '@/i18n';

/** Kaydedilen bağlantının kaynağını (Instagram, TikTok…) tanır */
export function linkSource(url: string): { label: string; icon: SFSymbol } {
  let host = '';
  try {
    host = new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return { label: i18n.t('links.link'), icon: 'link' };
  }
  if (host.endsWith('instagram.com')) return { label: 'Instagram', icon: 'camera' };
  if (host.endsWith('tiktok.com')) return { label: 'TikTok', icon: 'music.note' };
  if (host.endsWith('youtube.com') || host === 'youtu.be') return { label: 'YouTube', icon: 'play.rectangle' };
  if (host === 'x.com' || host.endsWith('twitter.com')) return { label: 'X', icon: 'bubble.left' };
  if (host.includes('google.') || host === 'maps.app.goo.gl') return { label: i18n.t('links.googleMaps'), icon: 'map' };
  return { label: host || i18n.t('links.link'), icon: 'link' };
}

/** "instagram.com/p/…" gibi şemasız girişlere https ekler */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
