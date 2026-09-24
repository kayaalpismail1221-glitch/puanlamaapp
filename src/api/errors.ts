import { Alert } from 'react-native';

/**
 * Supabase ve ağ hatalarını kullanıcıya gösterilecek Türkçe mesajlara çevirir.
 */

type ErrorLike = { message?: string; code?: string; status?: number; hint?: string; name?: string };

const AUTH_MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-posta ya da şifre hatalı.'],
  [/user already registered|already been registered/i, 'Bu e-postayla açılmış bir hesap var. Giriş yapmayı dene.'],
  [/email not confirmed/i, 'E-posta adresin henüz doğrulanmadı. Gelen kutunu kontrol et.'],
  [/token has expired|otp.*expired|invalid.*otp|token.*invalid/i, 'Kod hatalı ya da süresi dolmuş. Yeni kod iste.'],
  [/password should be at least|weak password|password.*characters/i, 'Şifre çok zayıf. En az 8 karakter; harf ve rakam kullan.'],
  [/new password should be different/i, 'Yeni şifre eskisinden farklı olmalı.'],
  [/rate limit|too many requests|security purposes/i, 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.'],
  [/signups not allowed|signup.*disabled/i, 'Şu anda yeni kayıt alınmıyor.'],
  [/unable to validate email|invalid email|email address.*invalid/i, 'Bu e-posta adresi geçerli görünmüyor.'],
  [/user not found/i, 'Bu e-postayla kayıtlı bir hesap bulunamadı.'],
];

export function isNetworkError(error: unknown): boolean {
  const e = error as ErrorLike;
  return (
    e?.name === 'AuthRetryableFetchError' ||
    /network request failed|failed to fetch|fetch failed|network error|timed out/i.test(e?.message ?? '')
  );
}

export function toUserMessage(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const message = e.message ?? '';

  if (isNetworkError(error)) return 'İnternet bağlantısı yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.';
  // Veritabanı fonksiyonlarının kendi Türkçe mesajları (ör. günlük sınır)
  if (e.code === 'P0001' || e.hint === 'rate_limit') return message;
  if (e.code === '23505') return /username/.test(message) ? 'Bu kullanıcı adı alınmış.' : 'Bu kayıt zaten var.';
  if (e.code === '42501' || e.status === 401 || e.status === 403) return 'Bu işlem için yetkin yok. Tekrar giriş yapmayı dene.';
  if (e.code === '23514' || e.code === '22023') return 'Girdiğin bilgilerden biri geçerli değil.';
  for (const [pattern, text] of AUTH_MESSAGES) if (pattern.test(message)) return text;
  return 'Bir şeyler ters gitti. Lütfen tekrar dene.';
}

/** Hatayı sistem uyarısıyla gösterir */
export function showError(error: unknown, title = 'Olmadı') {
  if (__DEV__) console.warn('[puanla]', error);
  Alert.alert(title, toUserMessage(error));
}

/** Supabase yanıtındaki hatayı fırlatır, veriyi döner */
export function unwrap<R extends { data: unknown; error: unknown }>(result: R): NonNullable<R['data']> {
  if (result.error) throw result.error;
  return result.data as NonNullable<R['data']>;
}
