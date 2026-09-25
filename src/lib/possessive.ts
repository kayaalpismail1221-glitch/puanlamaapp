/**
 * İsmin iyelik (tamlayan) hâli: "İsmail'in", "Ayşe'nin", "Burak'ın", "Onur'un", "Gül'ün";
 * İngilizcede "Ismail's", "James'". Paylaşım kartı başlıkları için ("İsmail'in lezzet haritası").
 */

const BACK_UNROUNDED = 'aı';
const FRONT_UNROUNDED = 'ei';
const BACK_ROUNDED = 'ou';
const FRONT_ROUNDED = 'öü';
const VOWELS = BACK_UNROUNDED + FRONT_UNROUNDED + BACK_ROUNDED + FRONT_ROUNDED + 'âîû';

export function turkishPossessive(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLocaleLowerCase('tr');
  const lastVowel = [...lower].reverse().find((c) => VOWELS.includes(c)) ?? 'e';
  // Büyük ünlü uyumu: a/ı → ı, e/i → i, o/u → u, ö/ü → ü (şapkalılar ince sayılır)
  const vowel = BACK_UNROUNDED.includes(lastVowel)
    ? 'ı'
    : BACK_ROUNDED.includes(lastVowel)
      ? 'u'
      : FRONT_ROUNDED.includes(lastVowel)
        ? 'ü'
        : 'i';
  const endsWithVowel = VOWELS.includes(lower.at(-1) ?? '');
  return `${trimmed}'${endsWithVowel ? 'n' : ''}${vowel}n`;
}

export function englishPossessive(name: string): string {
  const trimmed = name.trim();
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

export const possessive = (name: string, language: 'tr' | 'en') =>
  language === 'tr' ? turkishPossessive(name) : englishPossessive(name);
