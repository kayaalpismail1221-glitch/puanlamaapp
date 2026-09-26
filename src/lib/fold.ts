/**
 * Aramada Türkçe harfleri katlar: "Kadıköy" ≈ "kadikoy" ≈ "KADIKÖY". Veritabanındaki `tr_fold` ile aynı eşleme;
 * her harf tek harfe dönüşür, böylece katlanmış metindeki konum asıl metindeki konuma denk gelir.
 */
const FOLD: Record<string, string> = {
  Ç: 'c', Ğ: 'g', İ: 'i', I: 'i', Ö: 'o', Ş: 's', Ü: 'u', Â: 'a', Î: 'i', Û: 'u',
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
};

const foldChar = (ch: string) => {
  const mapped = FOLD[ch];
  if (mapped) return mapped;
  const lower = ch.toLowerCase();
  return lower.length === ch.length ? lower : ch;
};

/** Harf dizisi olarak katlar (emoji gibi çok parçalı karakterler tek öğe kalır) */
const foldChars = (text: string) => Array.from(text, foldChar);

export const trFold = (text: string) => foldChars(text).join('');

/**
 * Metnin aranan ifadeyle eşleşen parçası: [önce, eşleşen, sonra]; eşleşme yoksa undefined.
 * Kelime başındaki eşleşme ("Moda" içinde "mo"), kelime ortasındakinden önce seçilir.
 */
export function splitMatch(text: string, query: string): [string, string, string] | undefined {
  const needle = foldChars(query.trim().replace(/^@/, ''));
  if (!needle.length) return undefined;
  const chars = Array.from(text);
  const folded = chars.map(foldChar);
  const matchesAt = (i: number) => needle.every((c, k) => folded[i + k] === c);
  let at = -1;
  for (let i = 0; i + needle.length <= folded.length; i++) {
    if (!matchesAt(i)) continue;
    const wordStart = i === 0 || /[\s\-'’.,/(]/.test(chars[i - 1]!);
    if (wordStart) {
      at = i;
      break;
    }
    if (at < 0) at = i;
  }
  if (at < 0) return undefined;
  return [chars.slice(0, at).join(''), chars.slice(at, at + needle.length).join(''), chars.slice(at + needle.length).join('')];
}
