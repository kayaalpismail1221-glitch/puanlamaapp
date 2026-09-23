/** "2 sa önce" gibi kısa göreli zaman */
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'şimdi';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} g`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export const formatScore = (score: number) => score.toFixed(1).replace('.', ',');

export const priceLabel = (level: number) => '₺'.repeat(level);

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

/** "Eylül 2026" */
export const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
