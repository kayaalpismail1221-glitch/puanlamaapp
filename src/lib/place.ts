import { cuisineLabel } from '@/constants/cuisines';
import { currentLocale } from '@/i18n';
import type { Place } from '@/types';

type Area = Pick<Place, 'neighborhood' | 'district' | 'city'>;

const same = (a: string, b: string) => a.localeCompare(b, currentLocale(), { sensitivity: 'base' }) === 0;

/**
 * Mekânın yeri, kısadan uzuna: "Caferağa, Kadıköy". Mahalle yoksa yalnızca ilçe, o da yoksa şehir.
 * Mahalle ilçeyle aynı adı taşıyorsa (Kadıköy Mahallesi) tekrar yazılmaz.
 */
export function placeArea(place: Area): string {
  const parts = [place.neighborhood, place.district].filter(Boolean);
  if (parts.length === 2 && same(parts[0]!, parts[1]!)) parts.pop();
  return parts.join(', ') || place.city;
}

/** Dar alanlar için tek kelime: mahalle, yoksa ilçe, yoksa şehir */
export function placeShortArea(place: Area): string {
  return place.neighborhood || place.district || place.city;
}

/** Liste satırı alt yazısı: "Kafe · Caferağa, Kadıköy" */
export function placeSubtitle(place: Area & Pick<Place, 'cuisine'>): string {
  return [cuisineLabel(place.cuisine), placeArea(place)].filter(Boolean).join(' · ');
}

/** Tam adres (kopyalama, paylaşma): "Güneşlibahçe Sk. No:48/B, Caferağa, Kadıköy/İstanbul" */
export function fullAddress(place: Area & Pick<Place, 'address'>): string {
  const region = [place.district, place.city].filter(Boolean).join('/');
  const neighborhood = place.neighborhood && !same(place.neighborhood, place.district) ? place.neighborhood : '';
  return [place.address, neighborhood, region].filter(Boolean).join(', ');
}

/** E.164 → okunur numara: "+902161234567" → "0216 123 45 67"; yabancı numara olduğu gibi */
export function formatPhone(e164: string): string {
  const tr = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return tr ? `0${tr[1]} ${tr[2]} ${tr[3]} ${tr[4]}` : e164;
}

/** Web sitesi etiketi: Instagram → "@kullanici", diğerleri alan adı */
export function websiteLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'instagram.com') {
      const handle = parsed.pathname.split('/').filter(Boolean)[0];
      if (handle) return `@${handle}`;
    }
    return host;
  } catch {
    return url;
  }
}

export const isInstagram = (url: string) => /^https?:\/\/(www\.)?instagram\.com\//.test(url);

/**
 * Kullanıcının yazdığı numarayı E.164'e çevirir; geçersizse null.
 * "0216 123 45 67", "532 123 45 67", "+90 (216) …" → "+902161234567" (sunucudaki denetimle aynı biçim)
 */
export function normalizePhoneInput(raw: string): string | null {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && !digits.startsWith('90')) return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
  if (digits.startsWith('90') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[2-58]\d{9}$/.test(digits) ? `+90${digits}` : null;
}

/** "ornek.com", "@kullanici", "instagram.com/x" → tam adres; geçersizse null */
export function normalizeWebsiteInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^@[\w.]{1,30}$/.test(trimmed)) return `https://instagram.com/${trimmed.slice(1)}`;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes('.') || /\s/.test(withScheme) || withScheme.length > 300) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
