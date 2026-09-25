import i18n from '@/i18n';

/** Kayıt formu doğrulamaları */

/** Yalnızca rakamları alır; baştaki 0 ve 90 ülke kodunu atar, en fazla 10 hane */
export function phoneDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('90') && d.length > 10) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

/** "5321234567" → "532 123 45 67" */
export function formatPhone(digits: string): string {
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)];
  return parts.filter(Boolean).join(' ');
}

/** Türkiye cep telefonu: 5 ile başlayan 10 hane */
export const isValidPhone = (digits: string) => /^5\d{9}$/.test(digits);

/**
 * Rehberdeki numarayı E.164'e çevirir ("0532 123 45 67", "+90 532…" → "+905321234567").
 * Türkiye cep numarası değilse undefined. Sunucudaki `normalize_tr_phone` ile aynı kural.
 */
export function normalizePhone(input: string): string | undefined {
  const d = input.replace(/\D/g, '').replace(/^(90|0)/, '');
  return /^5\d{9}$/.test(d) ? `+90${d}` : undefined;
}

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export type PasswordCheck = { label: string; ok: boolean };

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { label: i18n.t('password.minLength'), ok: pw.length >= 8 },
    { label: i18n.t('password.lettersDigits'), ok: /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw) && /\d/.test(pw) },
    { label: i18n.t('password.mixedCase'), ok: /[A-ZÇĞİÖŞÜ]/.test(pw) && /[a-zçğıöşü]/.test(pw) },
    { label: i18n.t('password.symbol'), ok: /[^A-Za-z0-9ÇĞİÖŞÜçğıöşü\s]/.test(pw) },
  ];
}

/** 0–4 arası güç ve etiketi */
export function passwordStrength(pw: string): { score: number; label: string } {
  const score = pw ? passwordChecks(pw).filter((c) => c.ok).length : 0;
  const labels = [
    '',
    i18n.t('password.strength.weak'),
    i18n.t('password.strength.medium'),
    i18n.t('password.strength.strong'),
    i18n.t('password.strength.veryStrong'),
  ];
  return { score, label: labels[score] ?? '' };
}

/** Kayıt için gereken asgari şart: 8+ karakter, harf ve rakam */
export const isAcceptablePassword = (pw: string) => {
  const [length, mix] = passwordChecks(pw);
  return !!length?.ok && !!mix?.ok;
};
