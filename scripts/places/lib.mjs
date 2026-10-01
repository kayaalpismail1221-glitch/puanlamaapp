/**
 * Mekân verisini temizleyen saf fonksiyonlar (build.mjs kullanır, lib.test.mjs sınar):
 * isim, sokak adresi, telefon, web sitesi, kategori ve iki kaydın aynı mekân olup olmadığı.
 */
import { DISTRICTS } from './config.mjs';

/* ---------- Metin ---------- */

const FOLD_MAP = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', é: 'e', è: 'e', ë: 'e', á: 'a', à: 'a', ä: 'a' };

/** Küçük harf + Türkçe karakterleri sadeleştirir: "Çiğ Köfte" → "cig kofte" */
export function fold(text) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîûéèëáàä]/g, (c) => FOLD_MAP[c] ?? c)
    .replace(/̇/g, '');
}

const LETTER = /\p{L}/u;
const isUpper = (s) => s === s.toLocaleUpperCase('tr') && s !== s.toLocaleLowerCase('tr');
const isLower = (s) => s === s.toLocaleLowerCase('tr') && s !== s.toLocaleUpperCase('tr');
const SMALL_WORDS = new Set(['ve', 'ile', 'de', 'da', 'and', 'of', 'the', 'by', 'en', 'et', 'la', 'le', 'di']);

/** Türkçe başlık biçimi: "ASLI BÖREK" → "Aslı Börek"; ünsüzden oluşan kısaltmalar (KFC, BBQ) kalır */
export function titleCase(text, { keepAcronyms = false } = {}) {
  return text
    .split(' ')
    .map((word, i) => {
      if (!LETTER.test(word)) return word;
      const letters = word.replace(/[^\p{L}]/gu, '');
      if (keepAcronyms && letters.length <= 4 && !/[aeıioöuüAEIİOÖUÜ]/.test(letters)) return word;
      const lower = word.toLocaleLowerCase('tr');
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      // Tire ve bölü sonrası da büyük harf; kesme işaretinden sonra değil (Paci'nin)
      return lower.replace(/(^|[-/(])(\p{L})/gu, (_, sep, c) => sep + c.toLocaleUpperCase('tr'));
    })
    .join(' ');
}

/** Tamamı büyük ya da tamamı küçük yazılmış metni başlık biçimine çevirir, karışık yazıma dokunmaz */
function fixCase(text, options) {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return text;
  if (isUpper(letters) && letters.length > 4) return titleCase(text, { ...options, keepAcronyms: true });
  if (isLower(letters)) return titleCase(text, options);
  // Yarım kalmış yazım: "Balıkçı ersin" → "Balıkçı Ersin". İçinde büyük harf olan (iPhone, d'Orient)
  // ve alan adı gibi kelimelere dokunulmaz.
  return text
    .split(' ')
    .map((word, i) =>
      (i === 0 || !SMALL_WORDS.has(word)) && word.length >= 2 && isLower(word) && /^\p{L}/u.test(word) && !word.includes('.')
        ? word.charAt(0).toLocaleUpperCase('tr') + word.slice(1)
        : word,
    )
    .join(' ');
}

const tidy = (text) =>
  text
    .normalize('NFKC') // 𝐒𝐨𝐤𝐚𝐤 → Sokak, ｆｕｌｌ → full
    .replace(/[\p{Extended_Pictographic}\p{So}‍️]/gu, ' ')
    .replace(/[´`’]/g, "'")
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Görünen mekân adı. Latin harfi olmayan ad (ör. yalnızca Arapça) ortak adlarla denenir, yoksa null.
 * "Mekân | Semt Kahvaltı Salonu" gibi arama motoru eklerini atar.
 */
export function cleanName(...candidates) {
  for (const raw of candidates) {
    if (!raw) continue;
    let name = tidy(raw).split(/\s[|•·]\s/)[0].replace(/^["'\-–.,\s]+|["'\-–,\s]+$/g, '').trim();
    // Latin harf ya da rakam şart ("42.5", "12:30" gerçek mekân adları)
    if (!/[\p{Script=Latin}\p{N}]/u.test(name)) continue;
    // Latin yazılı bölüm varsa Arapça/Kiril eki at: "مطعم الوالي VALI Restaurant" → "VALI Restaurant"
    const latinPart = name.match(/[\p{Script=Latin}0-9][\p{Script=Latin}\p{Script=Common}\p{M}]*$/u)?.[0]?.trim();
    if (latinPart && latinPart.length >= 3 && /[^\p{Script=Latin}\p{Script=Common}\p{M}]/u.test(name)) name = latinPart;
    name = fixCase(name);
    if (name.replace(/[^\p{L}\p{N}]/gu, '').length >= 2) return name.slice(0, 120);
  }
  return null;
}

/* ---------- Türkçe karakter ---------- */

const TURKISH_LETTER = /[çğıöşüÇĞİÖŞÜ]/;

/**
 * Türkçe karakterleri sadeleşmiş kelimeler için sözlük ("dunyasi" → "dünyası"), verinin kendisinden:
 * Türkçe klavyeyle yazılmış (en az bir Türkçe harf içeren) metinlerde bir kelime neredeyse hep aynı
 * biçimde geçiyorsa o biçim alınır. Belirsiz kelimelere dokunulmaz ("iskembe": ışkembe/işkembe karışık,
 * "koy": koy/köy). Kısa kelimeler daha belirsiz olduğu için eşikleri daha yüksektir.
 */
export function buildDiacriticDictionary(texts) {
  const stats = new Map();
  for (const text of texts) {
    if (!text || !TURKISH_LETTER.test(text)) continue;
    for (const word of text.split(/[^\p{L}]+/u)) {
      if (word.length < 3) continue;
      const lower = word.toLocaleLowerCase('tr');
      const key = fold(lower);
      if (!stats.has(key)) stats.set(key, new Map());
      const spellings = stats.get(key);
      spellings.set(lower, (spellings.get(lower) ?? 0) + 1);
    }
  }
  const dictionary = new Map();
  for (const [key, spellings] of stats) {
    const total = [...spellings.values()].reduce((a, b) => a + b, 0);
    const [best, count] = [...spellings].sort((a, b) => b[1] - a[1])[0];
    if (best === key) continue; // en yaygın yazım zaten sade (cafe, kebap)
    const short = key.length <= 4;
    if (total >= (short ? 30 : 8) && count / total >= (short ? 0.98 : 0.9)) dictionary.set(key, best);
  }
  return dictionary;
}

/** Hiç Türkçe harf içermeyen metinde sözlükteki kelimeleri düzeltir, büyük/küçük harf biçimini korur */
export function restoreTurkish(text, dictionary) {
  if (!text || TURKISH_LETTER.test(text)) return text;
  return text.replace(/\p{L}+/gu, (word) => {
    const restored = dictionary.get(fold(word));
    if (!restored) return word;
    if (word.length > 1 && word === word.toUpperCase()) return restored.toLocaleUpperCase('tr');
    if (word[0] === word[0].toUpperCase()) return restored.charAt(0).toLocaleUpperCase('tr') + restored.slice(1);
    return restored;
  });
}

/* ---------- Adres ---------- */

// Türkiye'nin 81 ili (İstanbul hariç): adreste başka il geçiyorsa kayıt başka yere aittir
const OTHER_PROVINCES = [
  'adana', 'adiyaman', 'afyon', 'agri', 'aksaray', 'amasya', 'ankara', 'antalya', 'ardahan', 'artvin', 'aydin',
  'balikesir', 'bartin', 'batman', 'bayburt', 'bilecik', 'bingol', 'bitlis', 'bolu', 'burdur', 'bursa', 'canakkale',
  'cankiri', 'corum', 'denizli', 'diyarbakir', 'duzce', 'edirne', 'elazig', 'erzincan', 'erzurum', 'eskisehir',
  'gaziantep', 'giresun', 'gumushane', 'hakkari', 'hatay', 'igdir', 'isparta', 'izmir', 'kahramanmaras', 'karabuk',
  'karaman', 'kars', 'kastamonu', 'kayseri', 'kilis', 'kirikkale', 'kirklareli', 'kirsehir', 'kocaeli', 'izmit',
  'gebze', 'konya', 'kutahya', 'malatya', 'manisa', 'mardin', 'mersin', 'mugla', 'mus', 'nevsehir', 'nigde', 'ordu',
  'osmaniye', 'rize', 'sakarya', 'samsun', 'sanliurfa', 'siirt', 'sinop', 'sirnak', 'sivas', 'tekirdag', 'tokat',
  'trabzon', 'tunceli', 'usak', 'van', 'yalova', 'yozgat', 'zonguldak', 'corlu', 'cerkezkoy', 'kapakli',
];
const OTHER_PROVINCE = new RegExp(`(^|[\\s,/(-])(${OTHER_PROVINCES.join('|')})($|[\\s,/)-])`);
const DISTRICT_FOLDED = new Set([...DISTRICTS].map((d) => fold(d)));

const STREET = /(^|\s)(Cd\.|Sk\.|Blv\.|Yolu|Meydanı|Çıkmazı|Yokuşu|Yokuş|Sahil Yolu|Kavşağı|Çarşısı|Pasajı|Rıhtım)(\s|,|$)/u;
const BUILDING = /(^|\s)\p{L}*(?:port|park|plaza|center|centre|mall)(\s|,|$)|(^|\s)(AVM|Çarşı|İş Merkezi|İş Hanı|Han|Hanı|Plaza|Pasaj|Pasajı|Center|Centre|Mall|Residence|Rezidans|Sitesi|Park|Port|Marina|Otel|Hotel|Kampüs|Kampüsü|Terminal|İskele|İskelesi|Garı|Havalimanı)(\s|,|$)/u;

/** Kısaltmaları tek biçime getirir: Caddesi → Cd., Sokağı → Sk., No : 12 → No:12 */
function normalizeStreetWords(text) {
  const word = (pattern) => new RegExp(`(?<=^|[\\s,.])(?:${pattern})(?=$|[\\s,])`, 'giu');
  return text
    .replace(word('caddesi|cadde|cad\\.?|cd\\.?|cadd\\.?'), 'Cd.')
    .replace(word('sokağı|sokagi|sokak|sok\\.?|sk\\.?|sokaği'), 'Sk.')
    .replace(word('bulvarı|bulvari|bulvar|blv\\.?|bulv\\.?|blvd\\.?'), 'Blv.')
    .replace(word('meydani|meydan'), 'Meydanı')
    .replace(word('mahallesi|mahalle|mah\\.?|mh\\.?'), 'Mah.')
    .replace(/(?<=^|[\s,])(?:no|numara|nr)\s*[:.]?\s*(?=\d)/giu, 'No:')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Serbest adresi "Güneşlibahçe Sk. No:48/B" biçimine indirger.
 * Mahalle, ilçe, il, posta kodu, ülke, daire/kat bilgisi atılır (ayrı alanlarda ya da gereksiz).
 * Güvenilmez adres (başka il geçiyor, sokak yok) için '' döner; mekân yine gösterilir, yalnızca adressiz.
 */
export function formatAddress(raw, { district } = {}) {
  if (!raw) return '';
  // Tamamı büyük harf önce düzelir: JS düzenli ifadelerinde "İ" küçük "i" ile eşleşmiyor (CADDESİ)
  let text = fixCase(tidy(raw).replace(/\\n|\n/g, ', '));
  const folded = fold(text);
  if (OTHER_PROVINCE.test(folded)) return '';
  // Adreste başka bir İstanbul ilçesi ("…, Başakşehir/İstanbul") geçiyorsa konumla çelişir
  for (const part of folded.split(/[,/]/)) {
    const name = part.replace(/[\d.:-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (district && DISTRICT_FOLDED.has(name) && name !== fold(district)) return '';
  }

  text = normalizeStreetWords(text)
    .replace(/\b\d{5}\b/g, ' ') // posta kodu
    .replace(/(?<=^|[\s,/])(istanbul|İstanbul|ISTANBUL|İSTANBUL|türkiye|Türkiye|TÜRKİYE|turkey|Turkey|TR)(?=$|[\s,/.])/gu, ' ')
    .replace(/(?<=^|[\s,])(?:iç kapı no|İç Kapı No|ic kapi no|daire|Daire|DAİRE|d|D|kat|Kat|KAT|k|K)\s*[:.]\s*[\w/-]+/gu, ' ')
    .replace(/No:\s*(?=[,\s]|$)/g, ' ') // posta kodu silinince boş kalan "No:"
    .replace(/\s*\/\s*(?=,|$)/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ');

  const parts = text
    .split(',')
    .map((p) =>
      p
        .trim()
        // Bölümün başındaki mahalle adı: "Caferağa Mah. Güneşlibahçe Sk." → "Güneşlibahçe Sk."
        .replace(/^(?:[\p{L}\d.'-]+\s){1,4}?Mah\.\s*/u, '')
        .replace(/^Mah\.\s*/u, '')
        .replace(/^[\s/.-]+|[\s/,-]+$/g, ''),
    )
    .filter((p) => p && !/Mah\.$/u.test(p) && !DISTRICT_FOLDED.has(fold(p)) && fold(p) !== 'istanbul' && /\p{L}|\d/u.test(p));

  const streetIndex = parts.findIndex((p) => STREET.test(` ${p} `));
  if (streetIndex === -1) {
    const building = parts.find((p) => BUILDING.test(` ${p} `));
    return building ? finish(building) : '';
  }
  let street = parts[streetIndex];
  // Sokak adı olmadan yalnız "Cd. No:20" anlamsız
  if (/^(Cd\.|Sk\.|Blv\.)/u.test(street)) return '';
  // "Halk Sk. 24" → "Halk Sk. No:24"; ayrı bölümde duran kapı no: "49, Mustafa Kemal Atatürk Cd"
  street = street.replace(/(Cd\.|Sk\.|Blv\.|Yolu|Meydanı|Çıkmazı|Yokuşu)\s+(\d+[\p{L}]?(?:[/-]\d*[\p{L}\d]*)?)(?=$|\s)/u, '$1 No:$2');
  if (!/No:/.test(street)) {
    const bare = parts.find((p) => /^\d+[\p{L}]?(?:\/[\p{L}\d]+)?$/u.test(p));
    if (bare) street = `${street} No:${bare}`;
  }
  // Sokaktan sonra gelen metin (bina adı, tarif) atılır; sokaktan önceki bina adı korunur
  street = street.replace(/^(.*?(?:Cd\.|Sk\.|Blv\.|Yolu|Meydanı|Çıkmazı|Yokuşu)(?:\s+No:\S+)?).*$/u, '$1');
  const building = parts.slice(0, streetIndex).find((p) => BUILDING.test(` ${p} `) && p.length <= 40);
  return finish(building ? `${building}, ${street}` : street);
}

function finish(text) {
  const result = fixCase(text.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, ''), {})
    // başlık biçimi kısaltmaları bozmasın
    .replace(/\bCd\b\.?/g, 'Cd.')
    .replace(/\bSk\b\.?/g, 'Sk.')
    .replace(/\bBlv\b\.?/g, 'Blv.')
    .replace(/\bNo:\s*/gi, 'No:')
    .replace(/\bAvm\b/g, 'AVM');
  return result.length >= 4 ? result.slice(0, 120) : '';
}

/** OSM etiketlerinden adres: addr:street + addr:housenumber */
export function osmAddress(tags, context) {
  const street = tags['addr:street'];
  if (!street) return '';
  const number = tags['addr:housenumber'];
  return formatAddress(number ? `${street} No:${number}` : street, context);
}

/* ---------- İletişim ---------- */

/** Türkiye numaralarını E.164'e çevirir: "0216 123 45 67" → "+902161234567" */
export function normalizePhone(raw) {
  if (!raw) return null;
  const first = String(raw).split(/[;,/]| - /)[0];
  let digits = first.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `90${digits.slice(1)}`;
  else if (digits.length === 10) digits = `90${digits}`;
  if (digits.startsWith('90')) {
    // Türkiye: 90 + 10 hane; alan kodu 2/3/4/5/8 ile başlar (444 çağrı merkezleri dahil)
    return /^90[2-58]\d{9}$/.test(digits) ? `+${digits}` : null;
  }
  // Yabancı numara İstanbul'daki bir mekân için neredeyse her zaman hatalı veri
  return null;
}

/** Yalnızca mekânın kendi sitesi ya da Instagram'ı; Facebook ve kısaltılmış bağlantılar atılır */
export function normalizeWebsite(raw) {
  if (!raw) return null;
  let url = String(raw).trim().split(/[\s;]/)[0];
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (!host.includes('.') || /(^|\.)(facebook|fb|fbf|linktr|bit|goo|wa|whatsapp|google|yemeksepeti|getir|trendyol|tinyurl)\.(com|ly|gl|me|ee|bz)$/.test(host)) return null;
    for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|fbclid|igsh)/.test(key)) parsed.searchParams.delete(key);
    parsed.hash = '';
    const clean = parsed.toString().replace(/\/$/, '');
    return clean.length <= 300 ? clean : null;
  } catch {
    return null;
  }
}

/* ---------- Kategori ---------- */

// İsimdeki anahtar kelimeler (fold edilmiş), ilk eşleşen kazanır: özelden genele
const NAME_RULES = [
  [/kokorec/, 'Kokoreççi'],
  [/\bciger/, 'Ciğerci'],
  [/cig ?kofte/, 'Çiğ köfteci'],
  [/kofte/, 'Köfteci'],
  [/meyhane/, 'Meyhane'],
  [/kahvalti|serpme|menemen|breakfast|brunch/, 'Kahvaltıcı'],
  [/esnaf lokanta|ev yemek/, 'Esnaf lokantası'],
  [/balik|fish|midye|seafood/, 'Balıkçı'],
  [/doner/, 'Dönerci'],
  [/durum/, 'Dürümcü'],
  [/kebap|kebab|ocakbasi|tantuni|\bcag\b/, 'Kebapçı'],
  [/\bpide|lahmacun/, 'Pideci'],
  [/pizza|pizzeria/, 'Pizzacı'],
  [/burger/, 'Burgerci'],
  [/dondurma|gelato|ice ?cream/, 'Dondurmacı'],
  [/baklava|kunefe|tatli|muhallebi|lokum|kadayif|sekerleme|chocolat|cikolata|gulluoglu|hafiz mustafa|profiterol|waffle|sutlac|kazandibi/, 'Tatlıcı'],
  // Adında pastane geçen pastanedir; yalnızca börek/simit/poğaça geçen börekçidir (migration 20261016110000 ile aynı)
  [/pastane|patisser|patiser|pasta ?evi|kurabiye/, 'Pastane & fırın'],
  [/borek|simit|poaca|pogaca/, 'Börekçi'],
  [/firin|bakery/, 'Pastane & fırın'],
  [/sushi|ramen|noodle|\bwok\b|chinese|cin lokanta|japon|japanese|korean|kore |thai|asian|dim ?sum|uzak ?dogu/, 'Uzak Doğu'],
  [/lokanta/, 'Esnaf lokantası'],
  [/coffee|kahve|cafe|kafe|espresso|roaster/, 'Kafe'],
];

// OSM cuisine etiketi → kategori
const OSM_CUISINES = {
  kebab: 'Kebapçı', turkish_kebab: 'Kebapçı', adana_kebab: 'Kebapçı', tantuni: 'Kebapçı',
  doner: 'Dönerci', döner: 'Dönerci',
  meatball: 'Köfteci', kofte: 'Köfteci', köfte: 'Köfteci',
  cig_kofte: 'Çiğ köfteci', çiğ_köfte: 'Çiğ köfteci',
  pide: 'Pideci', lahmacun: 'Pideci', turkish_pizza: 'Pideci',
  pizza: 'Pizzacı',
  burger: 'Burgerci',
  fish: 'Balıkçı', seafood: 'Balıkçı',
  breakfast: 'Kahvaltıcı',
  meyhane: 'Meyhane',
  ice_cream: 'Dondurmacı', frozen_yogurt: 'Dondurmacı', gelato: 'Dondurmacı',
  dessert: 'Tatlıcı', baklava: 'Tatlıcı', cake: 'Tatlıcı', chocolate: 'Tatlıcı', waffle: 'Tatlıcı', crepe: 'Tatlıcı',
  pastry: 'Pastane & fırın', bakery: 'Pastane & fırın', simit: 'Börekçi', borek: 'Börekçi', börek: 'Börekçi',
  coffee_shop: 'Kafe', coffee: 'Kafe', tea: 'Kafe', bubble_tea: 'Kafe',
  sushi: 'Uzak Doğu', japanese: 'Uzak Doğu', chinese: 'Uzak Doğu', asian: 'Uzak Doğu', thai: 'Uzak Doğu',
  korean: 'Uzak Doğu', vietnamese: 'Uzak Doğu', noodle: 'Uzak Doğu', ramen: 'Uzak Doğu',
  italian: 'Dünya mutfağı', mexican: 'Dünya mutfağı', indian: 'Dünya mutfağı', french: 'Dünya mutfağı',
  greek: 'Dünya mutfağı', american: 'Dünya mutfağı', international: 'Dünya mutfağı', lebanese: 'Dünya mutfağı',
  georgian: 'Dünya mutfağı', arab: 'Dünya mutfağı', syrian: 'Dünya mutfağı', iranian: 'Dünya mutfağı',
  persian: 'Dünya mutfağı', russian: 'Dünya mutfağı', spanish: 'Dünya mutfağı', mediterranean: 'Dünya mutfağı',
  uzbek: 'Dünya mutfağı', azerbaijani: 'Dünya mutfağı', ukrainian: 'Dünya mutfağı', african: 'Dünya mutfağı',
  sandwich: 'Büfe & fast food', chicken: 'Büfe & fast food', fried_chicken: 'Büfe & fast food',
  toast: 'Büfe & fast food', hot_dog: 'Büfe & fast food', fast_food: 'Büfe & fast food', kumpir: 'Büfe & fast food',
  wrap: 'Büfe & fast food',
  turkish: 'Restoran', regional: 'Restoran', local: 'Restoran', steak_house: 'Restoran', grill: 'Restoran',
  homemade: 'Esnaf lokantası', home_cooking: 'Esnaf lokantası',
};

export const OSM_TYPES = {
  restaurant: 'Restoran',
  food_court: 'Restoran',
  cafe: 'Kafe',
  bar: 'Bar',
  pub: 'Bar',
  biergarten: 'Bar',
  ice_cream: 'Dondurmacı',
  fast_food: 'Büfe & fast food',
  pastry: 'Pastane & fırın',
  bakery: 'Pastane & fırın',
  confectionery: 'Tatlıcı',
};

/**
 * Overture taxonomy.primary → kategori. Meta'nın mutfak etiketleri güvenilmez ("Cızbız Sucuk Köfte" →
 * mediterranean), bu yüzden isim kuralları önce gelir; burada yalnızca güvenilir türler özgül kategori alır.
 * null = mekân sayılmaz (nargile, internet kafe, şarküteri…).
 */
export function overtureCategory(category) {
  if (!category) return undefined;
  const exact = {
    cafe: 'Kafe', coffee_shop: 'Kafe', coffee_roastery: 'Kafe', tea_room: 'Kafe', bubble_tea: 'Kafe', smoothie_juice_bar: 'Kafe',
    bakery: 'Pastane & fırın', bagel_shop: 'Pastane & fırın', patisserie_cake_shop: 'Pastane & fırın',
    dessert_shop: 'Tatlıcı', chocolatier: 'Tatlıcı', candy_store: 'Tatlıcı', donut_shop: 'Tatlıcı', cupcake_shop: 'Tatlıcı',
    pie_shop: 'Tatlıcı', waffle_restaurant: 'Tatlıcı', creperie: 'Tatlıcı',
    ice_cream_shop: 'Dondurmacı', frozen_yogurt_shop: 'Dondurmacı', shaved_ice_shop: 'Dondurmacı', gelato: 'Dondurmacı',
    pizza_restaurant: 'Pizzacı', burger_restaurant: 'Burgerci',
    seafood_restaurant: 'Balıkçı', fish_and_chips_restaurant: 'Balıkçı',
    breakfast_and_brunch_restaurant: 'Kahvaltıcı',
    doner_kebab_restaurant: 'Dönerci', kofta_restaurant: 'Köfteci',
    fast_food_restaurant: 'Büfe & fast food', chicken_restaurant: 'Büfe & fast food', chicken_wings_restaurant: 'Büfe & fast food',
    sandwich_shop: 'Büfe & fast food', hot_dog_restaurant: 'Büfe & fast food', food_truck_stand: 'Büfe & fast food',
    buffet_restaurant: 'Büfe & fast food', // Meta'da "büfe" çoğunlukla bu etiketle geliyor
    falafel_restaurant: 'Büfe & fast food',
    sushi_restaurant: 'Uzak Doğu', japanese_restaurant: 'Uzak Doğu', chinese_restaurant: 'Uzak Doğu', korean_restaurant: 'Uzak Doğu',
    thai_restaurant: 'Uzak Doğu', vietnamese_restaurant: 'Uzak Doğu', asian_restaurant: 'Uzak Doğu', asian_fusion_restaurant: 'Uzak Doğu',
    ramen_restaurant: 'Uzak Doğu', noodles_restaurant: 'Uzak Doğu', indonesian_restaurant: 'Uzak Doğu', cambodian_restaurant: 'Uzak Doğu',
    mongolian_restaurant: 'Uzak Doğu', sake_bar: 'Uzak Doğu',
    bar: 'Bar', pub: 'Bar', cocktail_bar: 'Bar', wine_bar: 'Bar', beer_bar: 'Bar', whiskey_bar: 'Bar', hotel_bar: 'Bar',
    gay_bar: 'Bar', dive_bar: 'Bar', speakeasy: 'Bar', sports_bar: 'Bar', irish_pub: 'Bar', tiki_bar: 'Bar', gastropub: 'Bar',
    tapas_bar: 'Bar', brewery: 'Bar', beer_garden: 'Bar', lounge: 'Bar',
  };
  if (category in exact) return exact[category];
  if (/^(hookah_bar|internet_cafe|delicatessen|food_court|cafeteria|food_consultant|food_delivery_service|catering)/.test(category)) return null;
  const world = /^(italian|mexican|texmex|indian|pakistani|french|greek|american|lebanese|georgian|arabian|syrian|persian|russian|spanish|german|belgian|czech|austrian|swiss|british|scottish|european|eastern_european|african|ethiopian|egyptian|moroccan|brazilian|argentine|cuban|caribbean|latin_american|peruvian|afghani|uzbek|azerbaijani|ukrainian|nepalese|polynesian|panamanian|southern_american|middle_eastern)_restaurant$/;
  if (world.test(category)) return 'Dünya mutfağı';
  if (category.endsWith('_restaurant') || ['restaurant', 'diner', 'bistro', 'steakhouse', 'mediterranean_restaurant'].includes(category)) return 'Restoran';
  return undefined;
}

/**
 * Kategori: önce isim, sonra OSM mutfak etiketi, sonra kaynak türü.
 * İsimde "cafe" geçse de bar bardır; "Kafe" isim kuralı yalnızca türü zaten kafe olanlara uygulanır.
 */
export function categorize(name, { osmCuisine = '', fallbacks = [] } = {}) {
  const folded = fold(name);
  const fallback = fallbacks.find(Boolean);
  for (const [pattern, cuisine] of NAME_RULES) {
    if (!pattern.test(folded)) continue;
    if (cuisine === 'Kafe' && fallback !== 'Kafe') continue;
    return cuisine;
  }
  for (const value of osmCuisine.split(';')) {
    const cuisine = OSM_CUISINES[fold(value.trim()).replace(/\s+/g, '_')];
    if (cuisine) return cuisine;
  }
  return fallback;
}

/* ---------- Ayıklama ---------- */

// Yeme-içme mekânı sayılmayan yerler (fold edilmiş isimde). Kaynak türü zaten restoran/kafe olduğundan
// "Kasap", "Bakkal", "Akademi" elenmez: Günaydın Kasap, Tost Akademisi, Şaşkınbakkal'daki mekânlar gerçek.
// Bilardo, iskele, kuaför ("Salon + ad" kalıbı; "Pide Salonu" gibi sonda geçen etkilenmez) Google karşılaştırmasında yakalandı.
const EXCLUDE =
  /kiraathane|kahvehane|kahve ocagi|cay ocagi|cayocagi|cay bahcesi|cayhane|internet|oyun salonu|playstation|nargile|hookah|shisha|\bokey\b|lokali\b|dernegi|kulubu|yemekhane|kantin|catering|\btekel\b|\bmarket\b|ambalaj|geri donusum| depo$|dugun salonu|toptan|gida san|san\.? ve tic|\bltd\b|a\.s\.|makine|\bkursu\b|bilardo|kuafor|berber|guzellik salonu|iskelesi$|terminali$|^salon [a-z]/;
// Ekmek fırınlarını at, pastane/börekçi/simitçi kalsın
const BAKERY_KEEP = /pastane|patisser|patiser|pasta|borek|simit|cafe|kafe|poaca|pogaca|tatli|kurabiye|cikolata|kahvalti|bakery|coffee/;

export function isVenueName(name, { bakery = false } = {}) {
  const folded = fold(name);
  if (EXCLUDE.test(folded)) return false;
  if (bakery && !BAKERY_KEEP.test(folded)) return false;
  return true;
}

/* ---------- Aynı mekân mı? ---------- */

// Eşleştirmede anlamsız kelimeler (tür, şube, semt adı eki)
const STOP = new Set([
  'cafe', 'kafe', 'coffee', 'kahve', 'kahvesi', 'restaurant', 'restoran', 'restorant', 'lokanta', 'lokantasi', 'bar', 'pub',
  'the', 've', 'and', 'by', 'co', 'istanbul', 'sube', 'subesi', 'salonu', 'evi', 'house', 'shop', 'store', 'bistro',
  'mutfak', 'mutfagi', 'kitchen', 'lounge', 'bakery', 'patisserie', 'pastanesi', 'pastane',
  ...[...DISTRICT_FOLDED].flatMap((d) => d.split(' ')),
]);

export function nameTokens(name) {
  return fold(name)
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** İki ad aynı mekânı gösteriyor mu: ayırt edici kelimelerin biri diğerini kapsıyor ya da çoğu ortak */
export function similarNames(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  const joinedA = fold(a).replace(/[^a-z0-9]/g, '');
  const joinedB = fold(b).replace(/[^a-z0-9]/g, '');
  if (joinedA === joinedB) return true;
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longSet = new Set(long);
  const shared = short.filter((t) => longSet.has(t)).length;
  if (shared === short.length && short.join('').length >= 4) return true;
  const union = new Set([...ta, ...tb]).size;
  if (shared / union >= 0.5 && shared >= 1) return true;
  // "Kasapdöner" ~ "Kasap Döner"
  const ja = ta.join('');
  const jb = tb.join('');
  return Math.min(ja.length, jb.length) >= 5 && (ja.includes(jb) || jb.includes(ja));
}

/** İki nokta arası metre (kısa mesafede eşdikdörtgen yaklaşımı yeterli) */
export function distanceMeters(a, b) {
  const k = Math.PI / 180;
  const x = (b.longitude - a.longitude) * k * Math.cos(((a.latitude + b.latitude) / 2) * k);
  const y = (b.latitude - a.latitude) * k;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}
