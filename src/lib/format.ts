import i18n, { currentLanguage, currentLocale } from '@/i18n';

/** "2 sa" / "2h" gibi kısa göreli zaman (etkin dilde) */
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return i18n.t('time.now');
  if (diff < 3600) return i18n.t('time.minutes', { count: Math.floor(diff / 60) });
  if (diff < 86400) return i18n.t('time.hours', { count: Math.floor(diff / 3600) });
  if (diff < 604800) return i18n.t('time.days', { count: Math.floor(diff / 86400) });
  return new Date(iso).toLocaleDateString(currentLocale(), { day: 'numeric', month: 'short' });
}

/** Puan: Türkçede "8,7", İngilizcede "8.7" */
export const formatScore = (score: number) => {
  const text = score.toFixed(1);
  return currentLanguage() === 'tr' ? text.replace('.', ',') : text;
};

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr'))
    .join('');
}

/** Türkçe karakterleri sadeleştirip geçerli bir kullanıcı adına çevirir */
export function toUsername(text: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return text
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 24);
}

/** "Eylül 2026" / "September 2026" */
export const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString(currentLocale(), { month: 'long', year: 'numeric' });
