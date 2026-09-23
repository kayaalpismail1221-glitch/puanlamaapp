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

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export type PasswordCheck = { label: string; ok: boolean };

export function passwordChecks(pw: string): PasswordCheck[] {
  return [
    { label: 'En az 8 karakter', ok: pw.length >= 8 },
    { label: 'Harf ve rakam', ok: /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(pw) && /\d/.test(pw) },
    { label: 'Büyük ve küçük harf', ok: /[A-ZÇĞİÖŞÜ]/.test(pw) && /[a-zçğıöşü]/.test(pw) },
    { label: 'Sembol (!?#…)', ok: /[^A-Za-z0-9ÇĞİÖŞÜçğıöşü\s]/.test(pw) },
  ];
}

/** 0–4 arası güç ve etiketi */
export function passwordStrength(pw: string): { score: number; label: string } {
  const score = pw ? passwordChecks(pw).filter((c) => c.ok).length : 0;
  const labels = ['', 'Zayıf', 'Orta', 'Güçlü', 'Çok güçlü'];
  return { score, label: labels[score] ?? '' };
}

/** Kayıt için gereken asgari şart: 8+ karakter, harf ve rakam */
export const isAcceptablePassword = (pw: string) => {
  const [length, mix] = passwordChecks(pw);
  return !!length?.ok && !!mix?.ok;
};
