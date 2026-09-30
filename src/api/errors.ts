

import i18n from '@/i18n';
import { showAlert } from '@/lib/dialog';

/**
 * Supabase ve ağ hatalarını kullanıcıya gösterilecek, etkin dildeki mesajlara çevirir.
 */

type ErrorLike = { message?: string; code?: string; status?: number; hint?: string; name?: string };

const AUTH_MESSAGES: [RegExp, () => string][] = [
  [/invalid login credentials/i, () => i18n.t('errors.auth.invalidCredentials')],
  [/user already registered|already been registered/i, () => i18n.t('errors.auth.alreadyRegistered')],
  [/email not confirmed/i, () => i18n.t('errors.auth.emailNotConfirmed')],
  [/token has expired|otp.*expired|invalid.*otp|token.*invalid/i, () => i18n.t('errors.auth.badCode')],
  [/password should be at least|weak password|password.*characters/i, () => i18n.t('errors.auth.weakPassword')],
  [/new password should be different/i, () => i18n.t('errors.auth.samePassword')],
  [/rate limit|too many requests|security purposes/i, () => i18n.t('errors.auth.rateLimited')],
  [/signups not allowed|signup.*disabled/i, () => i18n.t('errors.auth.signupsDisabled')],
  [/unable to validate email|invalid email|email address.*invalid/i, () => i18n.t('errors.auth.invalidEmail')],
  [/user not found/i, () => i18n.t('errors.auth.userNotFound')],
];

// Veritabanının günlük sınır mesajındaki Türkçe etiket → i18n anahtarı
const LIMIT_THINGS: Record<string, 'post' | 'comment' | 'place' | 'report' | 'list' | 'correction'> = {
  gönderi: 'post',
  liste: 'list',
  yorum: 'comment',
  mekân: 'place',
  şikâyet: 'report',
  düzeltme: 'correction',
};

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

  if (isNetworkError(error)) return i18n.t('errors.network');
  // Veritabanı kuralları: günlük sınır ve topluluk kuralları filtresi
  if (e.hint === 'rate_limit') {
    const label = /Günlük (.+) sınırına/.exec(message)?.[1] ?? '';
    return i18n.t('errors.dailyLimit', { thing: i18n.t(`errors.limitThing.${LIMIT_THINGS[label] ?? 'other'}`) });
  }
  if (e.hint === 'objectionable') return i18n.t('errors.objectionable');
  if (e.hint === 'place_outside_city') return i18n.t('errors.placeOutsideCity');
  if (e.hint === 'correction_too_far') return i18n.t('errors.correctionTooFar');
  if (e.code === '23505') return /username/.test(message) ? i18n.t('errors.usernameTaken') : i18n.t('errors.duplicate');
  if (e.code === '42501' || e.status === 401 || e.status === 403) return i18n.t('errors.forbidden');
  if (e.code === '23514' || e.code === '22023') return i18n.t('errors.invalid');
  for (const [pattern, text] of AUTH_MESSAGES) if (pattern.test(message)) return text();
  return i18n.t('errors.generic');
}

/** Hatayı sistem uyarısıyla gösterir */
export function showError(error: unknown, title = i18n.t('errors.title')) {
  if (__DEV__) console.warn('[puanla]', error);
  showAlert(title, toUserMessage(error));
}

/** Supabase yanıtındaki hatayı fırlatır, veriyi döner */
export function unwrap<R extends { data: unknown; error: unknown }>(result: R): NonNullable<R['data']> {
  if (result.error) throw result.error;
  return result.data as NonNullable<R['data']>;
}
