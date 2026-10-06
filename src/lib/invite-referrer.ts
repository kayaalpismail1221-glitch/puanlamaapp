/**
 * Davet kodunun bağlantıdaki biçimi (saf yardımcılar; okuma/uygulama `lib/invite-code`). Kod davet edenin kullanıcı
 * adı: Google Play bağlantısında `referrer` içinde, uygulama içinde `davet/<kullanıcı adı>` yolunda taşınır.
 */

/** Uygulama içi yol: `davet/<kullanıcı adı>` (`https://expeat.app/davet/…` evrensel bağlantısı da aynı yol) */
export const INVITE_PATH = /^\/?davet\/([^/?#]+)/;

/** Google Play bağlantısına davet edeni ekler; Play `referrer`'ı yüklemeden sonra uygulamaya verir */
export function playInviteUrl(storeUrl: string, username: string) {
  const referrer = `utm_source=davet&utm_medium=invite&davet=${username}`;
  return `${storeUrl}${storeUrl.includes('?') ? '&' : '?'}referrer=${encodeURIComponent(referrer)}`;
}

/** Kullanıcı adı biçimi (veritabanındaki `username_format` kuralı); bozuk kod yok sayılır */
export function normalizeInviteCode(code: string | undefined): string | undefined {
  let value: string;
  try {
    value = decodeURIComponent(code ?? '');
  } catch {
    return undefined;
  }
  value = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9._]{3,24}$/.test(value) ? value : undefined;
}

/** `utm_source=davet&davet=ismail` → "ismail" (RN'nin URLSearchParams'ı `get` desteklemiyor) */
export function inviterFromReferrer(referrer: string): string | undefined {
  for (const part of referrer.split('&')) {
    const [key, value] = part.split('=');
    if (key === 'davet') return normalizeInviteCode(value);
  }
  return undefined;
}
