/**
 * Kullanıcının yazdığı ya da Apple'ın önerdiği sokak adresini veri setindeki biçime getirir:
 * "moda caddesi 12" → "Moda Cd. No:12", "Güneşlibahçe Sokak no: 43/B" → "Güneşlibahçe Sk. No:43/B".
 * Mahalle, ilçe ve il ayrı alanlarda tutulduğu için adresten atılır. (Toplu veri: scripts/places/lib.mjs)
 */

const STREET_WORDS: Record<string, string> = {
  caddesi: 'Cd.',
  cadde: 'Cd.',
  'cad.': 'Cd.',
  cad: 'Cd.',
  'cd.': 'Cd.',
  cd: 'Cd.',
  sokak: 'Sk.',
  sokağı: 'Sk.',
  'sok.': 'Sk.',
  sok: 'Sk.',
  'sk.': 'Sk.',
  sk: 'Sk.',
  bulvarı: 'Blv.',
  bulvar: 'Blv.',
  'blv.': 'Blv.',
  blv: 'Blv.',
};
const STREET_END = /(?:Cd\.|Sk\.|Blv\.|Yolu|Meydanı|Çıkmazı|Yokuşu)$/u;
const LOWER_WORDS = new Set(['ve']);

const lower = (word: string) => word.toLocaleLowerCase('tr');
const capitalize = (word: string) =>
  word.replace(/^(\p{L})/u, (c) => c.toLocaleUpperCase('tr'));

export function formatStreetAddress(raw: string): string {
  let text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  // Mahalle / ilçe / il bölümleri: "Caferağa Mah., Moda Cd. 12, Kadıköy/İstanbul" → "Moda Cd. 12"
  const parts = text
    .split(',')
    .map((p) => p.trim())
    // Karşılaştırma Türkçe küçük harfle: JS düzenli ifadelerinde "İ" küçük "i" ile eşleşmez
    .filter((p) => {
      const l = lower(p);
      return p && !/(mah\.?|mahallesi|mh\.?)$/u.test(l) && !/(^|\/\s*)istanbul$/u.test(l) && !/^(türkiye|turkey)$/u.test(l);
    });
  text = parts.join(', ').replace(/^.*?\s(?:Mah\.?|Mahallesi|Mh\.?)\s+/iu, '');

  const allCaps = text === text.toLocaleUpperCase('tr') && /\p{L}/u.test(text);
  const words = text.split(' ').map((word, i) => {
    const key = lower(word);
    if (STREET_WORDS[key]) return STREET_WORDS[key];
    if (/^(no|numara|nr)[:.]?$/iu.test(word)) return 'No:';
    const joined = /^(no|numara)[:.]?(\d.*)$/iu.exec(word);
    if (joined) return `No:${joined[2]}`;
    if (i > 0 && LOWER_WORDS.has(key)) return key;
    return allCaps ? capitalize(lower(word)) : capitalize(word);
  });

  const out: string[] = [];
  for (const word of words) {
    const prev = out.at(-1);
    if (prev === 'No:') {
      out[out.length - 1] = `No:${word}`;
      continue;
    }
    // Sokak adından hemen sonra yalın numara: "Moda Cd. 12" → "Moda Cd. No:12"
    if (prev && STREET_END.test(prev) && /^\d+[\p{L}]?(?:[/-][\p{L}\d]+)?$/u.test(word)) {
      out.push(`No:${word}`);
      continue;
    }
    out.push(word);
  }
  return out.join(' ').replace(/\s*,\s*/g, ', ').slice(0, 120);
}

/** Adreste kapı numarası var mı (iğneyle karşılaştırma yalnızca o zaman anlamlı) */
export const hasHouseNumber = (address: string) => /No:\s*\d/.test(address);

/** Apple ters geokodlama sonucundan adres satırı */
export function addressFromGeocode(result: { street?: string | null; streetNumber?: string | null }): string {
  const street = result.street ?? '';
  if (!street) return '';
  return formatStreetAddress(result.streetNumber ? `${street} No:${result.streetNumber}` : street);
}
