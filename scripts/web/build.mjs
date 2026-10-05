/**
 * Expeat web sitesi (tanıtım + mağazaların istediği sayfalar) → web/ (statik; Vercel kök dizini `web`).
 * Yasal metinler uygulamadakiyle aynı kaynaktan (src/constants/legal.ts) üretilir; metin değişince yeniden çalıştır.
 * Görseller: `bash scripts/web/shots.sh` (telefonlar, yemek fotoğrafları, paylaşım görseli), `python scripts/web/icons.py`.
 *
 * Çalıştırma: npm run web:build
 * Sayfalar: / · /en · /gizlilik · /kosullar · /destek · /hesap-silme (+ /en/privacy, /en/terms, /en/support,
 * /en/delete-account) · /davet/<kullanıcı adı> · /indir · 404
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPPORT_EMAIL } from '../../src/constants/contact.ts';
import { legalText } from '../../src/constants/legal.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = join(root, 'web');

/** Sitenin adresi (paylaşım önizlemeleri ve site haritası mutlak adres ister); src/constants/contact.ts → WEB_URL ile aynı */
const SITE = 'https://expeat.app';
/** Mağaza sayfaları yayınlanınca: `src/constants/app.ts` APP_STORE_URL / PLAY_STORE_URL ile aynı tutulur */
const STORES = { ios: '', android: '' };
/**
 * Evrensel bağlantılar (yalnızca davet: /davet/<kullanıcı adı>). Uygulamada app.json → `ios.associatedDomains` ve
 * `android.intentFilters` bu alan adını gösterir. Apple: Developer → Membership → Team ID; Android: imza
 * sertifikalarının SHA-256 parmak izleri (EAS yükleme anahtarı + Play App Signing). Boşken dosya yazılmaz.
 */
const APPLE_TEAM_ID = '';
const ANDROID_SHA256 = [];
const BUNDLE_ID = 'app.puanla';
const APP_SCHEME = 'expeat';
const YEAR = new Date().getFullYear();

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/** Başlıklarda `*vurgu*` → <em> */
const em = (s) => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');
const plain = (s) => s.replaceAll('*', '');
const mail = (s) => s.replaceAll(SUPPORT_EMAIL, `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`);

/* ---------- Puan renkleri (src/constants/theme.ts ile aynı) ---------- */
const BANDS = [
  { min: 6.7, max: 10, from: '#65B32E', to: '#1E7B3C' },
  { min: 3.4, max: 6.6, from: '#F2A516', to: '#F5C518' },
  { min: 0, max: 3.3, from: '#B42318', to: '#EF4B3C' },
];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => hex(rgb(a).map((c, i) => c + (rgb(b)[i] - c) * t));
function scoreColor(s) {
  const b = BANDS.find((x) => s >= x.min) ?? BANDS[2];
  return mix(b.from, b.to, Math.min(1, Math.max(0, (s - b.min) / (b.max - b.min))));
}
const num = (s, lang) => (lang === 'en' ? s.toFixed(1) : s.toFixed(1).replace('.', ','));
const disc = (s, lang, size = 44) => `<span class="disc" style="--c:${scoreColor(s)};--s:${size}px">${num(s, lang)}</span>`;

/* ---------- İkonlar (satır içi SVG) ---------- */
const ICON = {
  apple:
    '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>',
  play:
    '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#00D7FE" d="M48 59.5v393c0 6 2.4 11 6.4 14.6L271 256 54.4 44.9c-4 3.6-6.4 8.6-6.4 14.6z"/><path fill="#FFCE00" d="M354.6 339.4 271 256l83.6-83.4 94.3 53.6c22.4 12.7 22.4 33 0 45.7z"/><path fill="#FF3A44" d="M354.6 339.4 271 256 54.4 467.1c8 7.2 21.1 7.8 35.3-.3z"/><path fill="#00F076" d="M354.6 172.6 89.7 20.2c-14.2-8.1-27.3-7.5-35.3-.3L271 256z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="m5 12.5 4.2 4.2L19 7"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="M3.5 6.5h17v11h-17z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="m4 7 8 6.2L20 7"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z" transform="translate(0 3)"/></svg>',
};

/** İsimden avatar rengi (baş harf + degrade) */
const AV = ['#E8618C,#B83280', '#3B82F6,#1E3A8A', '#F59E0B,#C2410C', '#10B981,#047857', '#8B5CF6,#5B21B6', '#EF4444,#991B1B'];
const avatar = (name, size = 36) => {
  const g = AV[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
  return `<span class="av" style="--s:${size}px;background:linear-gradient(140deg,${g})">${esc(name[0])}</span>`;
};

/* ---------- Yemek akışı (fotoğraflar App Store görselleriyle aynı; gerçek mekân adları yalnızca yüksek puanla) ---------- */
const POSTS = [
  { photo: 'kebap', place: 'Zübeyir Ocakbaşı', area: 'Beyoğlu', cat: ['Kebapçı', 'Grill house'], who: 'Kaan', score: 9.2 },
  { photo: 'meze', place: 'Asmalı Cavit', area: 'Beyoğlu', cat: ['Meyhane', 'Meyhane'], who: 'Selin', score: 9.5 },
  { photo: 'kahvalti', place: 'Van Kahvaltı Evi', area: 'Beyoğlu', cat: ['Kahvaltıcı', 'Breakfast'], who: 'Ece', score: 9.3 },
  { photo: 'esnaf', place: 'Çiya Sofrası', area: 'Kadıköy', cat: ['Esnaf lokantası', 'Home cooking'], who: 'Melis', score: 9.8 },
  { photo: 'balik', place: 'Arnavutköy Balıkçısı', area: 'Beşiktaş', cat: ['Balıkçı', 'Seafood'], who: 'Burak', score: 9.0 },
  { photo: 'doner', place: 'Şehzade Cağ Kebap', area: 'Fatih', cat: ['Kebapçı', 'Kebab'], who: 'Defne', score: 9.4 },
  { photo: 'tatli', place: 'Baylan Pastanesi', area: 'Kadıköy', cat: ['Tatlıcı', 'Desserts'], who: 'Onur', score: 8.9 },
  { photo: 'pilav', place: 'Karaköy Lokantası', area: 'Beyoğlu', cat: ['Esnaf lokantası', 'Home cooking'], who: 'Arda', score: 8.8 },
  { photo: 'restoran', place: 'Pandeli', area: 'Fatih', cat: ['Restoran', 'Restaurant'], who: 'Zeynep', score: 9.0 },
];

/* ---------- Metinler ---------- */
const T = {
  tr: {
    lang: 'tr',
    locale: 'tr_TR',
    home: '/',
    other: { label: 'English', href: '/en' },
    paths: { privacy: '/gizlilik', terms: '/kosullar', support: '/destek', deletion: '/hesap-silme' },
    nav: { how: 'Nasıl çalışır', features: 'Özellikler', faq: 'SSS', support: 'Destek', download: 'İndir', menu: 'Ana menü' },
    meta: {
      title: 'Expeat · Gittiğin yerleri puanla, arkadaşlarınla keşfet',
      description:
        'Expeat ile gittiğin restoran ve kafeleri kıyaslayarak puanla, arkadaşlarının nerede ne yediğini gerçek puanlarıyla gör. Yıldız yok, kıyas var.',
    },
    hero: {
      title: 'Gittiğin yerleri puanla, *arkadaşlarınla* keşfet',
      text: 'Expeat’te mekânlara yıldız vermezsin; gittiğin yerleri birbiriyle kıyaslarsın, puanın kendiliğinden çıkar. Arkadaşlarının nerede ne yediğini de gerçek puanlarıyla görürsün.',
      slogan: 'Eat the experience.',
    },
    stores: { ios: 'İndir', android: 'Şimdi al', soon: 'Yakında', iosSmall: 'iPhone için', androidSmall: 'Android için' },
    stats: [
      [70000, '+', 'mekân'],
      [8, '', 'şehir'],
      [10, '', 'üzerinden kıyas puanı'],
    ],
    feed: { label: 'Arkadaşların bu hafta nereleri puanladı', rated: 'puanladı' },
    trust: {
      kicker: 'Neden Expeat',
      title: 'Gitmeden önce *kime güveniyorsun?*',
      text: 'Tanımadığın birinin beş yıldızı mı, damak zevkini bildiğin arkadaşının puanı mı?',
      strangers: 'Yabancılar',
      friends: 'Arkadaşların',
      cards: [
        ['Anonim', '1 yorum', 5, '“Harika! Kesinlikle gidin!!!”'],
        ['Kullanıcı 4821', '3 yorum', 1, '“Berbat, bir daha asla.”'],
        ['Misafir', 'Yerel rehber', 3, '“İdare eder, fiyatlar biraz…”'],
      ],
      people: [
        ['Selin', 9.6, 'Çiya Sofrası’nı 2. sıraya koydu'],
        ['Kaan', 9.3, 'Ocakbaşı listesinde ilk 3’te'],
        ['Ece', 9.4, '“Beğendim” listesinde 24 mekân arasında'],
      ],
    },
    how: {
      kicker: 'Nasıl çalışır',
      title: 'Puan yazmazsın, *kıyaslarsın*',
      text: 'Yıldızlar herkes için başka anlama gelir. Kıyaslamak ise kolay: hangisi daha iyiydi?',
      steps: [
        ['Nasıldı?', 'Gittiğin mekânı bul; beğendin mi, idare eder miydi, beğenmedin mi?'],
        ['Hangisi daha iyiydi?', 'Aynı türden gittiğin yerlerle ikişer ikişer karşılaştır. Birkaç dokunuş yeter.'],
        ['Puanın hazır', 'Sıralaman 10 üzerinden puana döner. Favorin hep 10; listen büyüdükçe puanların netleşir.'],
      ],
      sentiments: ['Beğendim', 'İdare eder', 'Beğenmedim'],
      vs: 'veya',
      result: '“Beğendim” listende 2. sırada',
    },
    showcase: {
      kicker: 'Özellikler',
      title: 'Arkadaşlarının sevdiği yerler, *tek uygulamada*',
      items: [
        {
          img: 1,
          label: 'Feed',
          title: 'Mekân yorumları *artık feed’de*',
          text: 'Arkadaşlarının ve çevrendekilerin nerede ne yediğini, kiminle gittiğini ve kaç puan verdiğini akışında gör.',
          points: ['Kiminle gittiği', 'Arkadaşının puanı', '“Ben de gittim” ile sıralamana ekle'],
        },
        {
          img: 2,
          label: 'Puanlama',
          title: 'Kıyasla, puanın *kendiliğinden* çıksın',
          text: 'Yıldız düşünmek yok. Yeni mekânı daha önce gittiklerinle karşılaştırırsın; Expeat sıralamanı 10 üzerinden puana çevirir.',
          points: ['Yalnızca aynı türdeki mekânlarla', 'Seçemiyorsan “İkisi aynı”', 'Favorin hep 10'],
        },
        {
          img: 5,
          label: 'Mekân',
          title: 'Hangi arkadaşın *kaç puan* verdi?',
          text: 'Her mekânın sayfasında önce arkadaşlarının puanları görünür, sonra topluluğun. Kime güvendiğini sen seçersin.',
          points: ['Arkadaşlarının puanları', 'Expeat kullanıcılarına göre puan', 'Senin sıralamandaki yeri'],
        },
        {
          img: 3,
          label: 'Listem',
          title: 'Gitmek istediğin yeri *artık unutma*',
          text: 'Sosyal medyada gördüğün mekânı paylaş menüsünden tek dokunuşla Listem’e kaydet. Gittiğinde puanla, listen kendiliğinden güncellensin.',
          points: ['Paylaş menüsünden tek dokunuş', 'Kopyaladığın bağlantıyı yakalar', 'Türüne göre ayrılır'],
        },
      ],
    },
    more: {
      title: 'Dahası da var',
      text: 'Harita, listeler, lig ve gittiğin her yerin haritası.',
      items: [
        { img: 4, title: 'Şehrin en iyileri, *haritada*', text: 'Yakınındaki en iyi mekânlar, puan renkleriyle. Yeşil gördüğün yere gönül rahatlığıyla git.', wide: true },
        { img: 7, title: 'Zevkin kiminle *uyuşuyor?*', text: 'Ortak mekânlardaki puanlarınızdan uyum yüzdesi.' },
        { img: 6, title: 'Favori listeni oluştur, *arkadaşların görsün*', text: 'Listelerin profilinde; istersen hikâyende de paylaş.' },
        { img: 8, title: 'Puanla, XP kazan, *zirveye* çık', text: 'Arkadaşlarınla yarış; her davete +100 XP.' },
        { img: 9, title: 'Lezzet haritan, *şehir şehir*', text: 'Gittiğin şehirler ve mekânlar, tek haritada.' },
      ],
    },
    cities: {
      title: '8 şehirde *70.000’den fazla* mekân',
      text: 'İstanbul’dan Trabzon’a hazır; listede olmayan yeri birkaç dokunuşla sen ekle.',
      names: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Kocaeli', 'Eskişehir', 'Trabzon', 'Adana'],
    },
    faqTitle: 'Sık sorulanlar',
    faqText: 'Aradığını bulamadın mı? Bize yaz; genellikle 1 iş günü içinde yanıt veriyoruz.',
    faqLink: 'Destek',
    faq: [
      ['Expeat ücretli mi?', 'Hayır. Expeat’i indirmek ve kullanmak ücretsiz.'],
      ['Hangi şehirlerde var?', 'İstanbul, Ankara, İzmir, Bursa, Kocaeli, Eskişehir, Trabzon ve Adana’da 70.000’den fazla mekân hazır. Listede olmayan bir yeri birkaç dokunuşla sen ekleyebilirsin.'],
      ['Puanlar nasıl hesaplanıyor?', 'Puan yazmazsın: mekânı beğenip beğenmediğini söyler, aynı türden gittiğin yerlerle kıyaslarsın. En sevdiğin yer 10 olur, diğerleri sıralamana göre dizilir. Mekânın Expeat puanı ise kullanıcıların kıyaslamalarından çıkar.'],
      ['Puanlarımı kimler görüyor?', 'Puanların ve gönderilerin profilinde görünür; seni takip edenler akışlarında görür. Konumun sunucularımızda saklanmaz, telefon numaran kimseye gösterilmez.'],
      ['Hesabımı nasıl silerim?', 'Profilim > Ayarlar > Hesabı sil adımıyla hesabını ve tüm verilerini kalıcı olarak silebilirsin. Ayrıntılar <a href="/hesap-silme">hesap silme</a> sayfasında.'],
    ],
    cta: { title: 'Eat the *experience.*', text: 'Gittiğin yerleri puanla, arkadaşlarının sevdiği yerleri keşfet.' },
    footer: {
      tagline: 'Gittiğin yerleri puanla, arkadaşlarınla keşfet.',
      app: 'Uygulama',
      legal: 'Yasal',
      contact: 'İletişim',
      privacy: 'Gizlilik Politikası',
      terms: 'Kullanım Koşulları',
      support: 'Destek',
      deletion: 'Hesap silme',
      osm: 'Mekân verisi © OpenStreetMap katkıcıları',
    },
    docKicker: { legal: 'Yasal', support: 'Destek', account: 'Hesap' },
    toc: 'Bu sayfada',
    deletion: {
      title: 'Hesabını silme',
      intro: 'Expeat hesabını ve tüm verilerini istediğin zaman kalıcı olarak silebilirsin.',
      appTitle: 'Uygulamadan',
      appSteps: ['Expeat’i aç ve Profilim sekmesine geç.', 'Sağ üstteki ayarlar (dişli) simgesine dokun.', '“Hesabı sil”e dokun ve onayla.'],
      appNote: 'Hesabın hemen silinir; bu işlem geri alınamaz.',
      mailTitle: 'Uygulamaya erişemiyorsan',
      mailText: `Kayıtlı e-posta adresinden ${SUPPORT_EMAIL} adresine “Hesap silme” konulu bir e-posta gönder ve kullanıcı adını yaz. Hesabın sana ait olduğunu doğruladıktan sonra en geç 30 gün içinde silinir ve sana haber verilir.`,
      mailButton: 'Silme talebi gönder',
      mailSubject: 'Hesap silme',
      deletedTitle: 'Neler silinir',
      deleted: 'Profilin, puanların ve sıralamaların, gönderilerin, fotoğrafların, yorumların, listelerin, takip bağlantıların, davetlerin ve hesabınla ilişkili diğer tüm veriler kalıcı olarak silinir.',
      keptTitle: 'Neler saklanabilir',
      kept: 'Yasal yükümlülükler gereği tutulması gereken kayıtlar yalnızca mevzuattaki süre boyunca saklanır. Ayrıntılar için Gizlilik Politikası’nın “Saklama ve silme” bölümüne bak.',
    },
    supportExtra: { title: 'Bize yaz', text: 'Soru, öneri ya da sorun: genellikle 1 iş günü içinde yanıt veririz.', button: 'E-posta gönder' },
    invite: {
      title: 'Seni Expeat’e davet ediyor',
      fallbackTitle: 'Expeat’e davet edildin',
      text: 'Gittiğin yerleri puanla, arkadaşlarının nerede ne yediğini gerçek puanlarıyla gör.',
      open: 'Uygulamada aç',
      have: 'Expeat yüklü mü? Davetle birlikte açmak için dokun.',
    },
    notFound: { title: 'Bu sayfa bulunamadı', text: 'Aradığın sayfa taşınmış ya da hiç olmamış olabilir.', back: 'Ana sayfaya dön' },
  },
  en: {
    lang: 'en',
    locale: 'en_US',
    home: '/en',
    other: { label: 'Türkçe', href: '/' },
    paths: { privacy: '/en/privacy', terms: '/en/terms', support: '/en/support', deletion: '/en/delete-account' },
    nav: { how: 'How it works', features: 'Features', faq: 'FAQ', support: 'Support', download: 'Download', menu: 'Main menu' },
    meta: {
      title: 'Expeat · Rate the places you go, discover with friends',
      description:
        'Rate restaurants and cafés by comparing them, and see where your friends eat with their real scores. No stars, just comparisons.',
    },
    hero: {
      title: 'Rate the places you go, *discover with friends*',
      text: 'On Expeat you don’t hand out stars. You compare the places you’ve been, and your score writes itself. See where your friends eat, with their real scores.',
      slogan: 'Eat the experience.',
    },
    stores: { ios: 'Download on the', android: 'Get it on', soon: 'Coming soon', iosSmall: 'For iPhone', androidSmall: 'For Android' },
    stats: [
      [70000, '+', 'places'],
      [8, '', 'cities'],
      [10, '', 'point comparison score'],
    ],
    feed: { label: 'What your friends rated this week', rated: 'rated' },
    trust: {
      kicker: 'Why Expeat',
      title: 'Before you go, *who do you trust?*',
      text: 'Five stars from a stranger, or a score from a friend whose taste you know?',
      strangers: 'Strangers',
      friends: 'Your friends',
      cards: [
        ['Anonymous', '1 review', 5, '“Amazing! Must go!!!”'],
        ['User 4821', '3 reviews', 1, '“Awful, never again.”'],
        ['Guest', 'Local guide', 3, '“It’s okay, prices are a bit…”'],
      ],
      people: [
        ['Selin', 9.6, 'Ranked Çiya Sofrası 2nd'],
        ['Kaan', 9.3, 'Top 3 among grill houses'],
        ['Ece', 9.4, 'Among 24 places she liked'],
      ],
    },
    how: {
      kicker: 'How it works',
      title: 'Don’t score it, *compare it*',
      text: 'Stars mean something different to everyone. Comparing is easy: which one was better?',
      steps: [
        ['How was it?', 'Find the place you went to. Did you like it, was it fine, or didn’t you like it?'],
        ['Which was better?', 'Compare it with places of the same kind, two at a time. A few taps is all it takes.'],
        ['Your score is ready', 'Your ranking turns into a score out of 10. Your favorite is always a 10; scores sharpen as your list grows.'],
      ],
      sentiments: ['I liked it', 'It was fine', 'I didn’t like it'],
      vs: 'or',
      result: '2nd on your “liked” list',
    },
    showcase: {
      kicker: 'Features',
      title: 'Places your friends love, *in one app*',
      items: [
        {
          img: 1,
          label: 'Feed',
          title: 'Restaurant reviews, *now in your feed*',
          text: 'See where friends and people nearby eat, who they went with and what score they gave.',
          points: ['Who they went with', 'Your friend’s score', 'Add it to your ranking with “I’ve been”'],
        },
        {
          img: 2,
          label: 'Rating',
          title: 'Compare, and your score *writes itself*',
          text: 'No more agonizing over stars. Compare a new place with ones you’ve been to, and Expeat turns your ranking into a score out of 10.',
          points: ['Only against places of the same kind', 'Can’t choose? “About the same”', 'Your favorite is always a 10'],
        },
        {
          img: 5,
          label: 'Place',
          title: 'Which friend gave it *what score?*',
          text: 'Every place page shows your friends’ scores first, then the community’s. You choose whose taste to trust.',
          points: ['Your friends’ scores', 'Score from Expeat users', 'Where it sits in your ranking'],
        },
        {
          img: 3,
          label: 'My List',
          title: 'Never forget a place *you want to try*',
          text: 'Save spots you see on social media to your list with one tap from the share menu. Rate it once you go and your list updates itself.',
          points: ['One tap from the share menu', 'Catches links you copy', 'Sorted by kind of place'],
        },
      ],
    },
    more: {
      title: 'And there’s more',
      text: 'A map, lists, a league and a map of everywhere you’ve eaten.',
      items: [
        { img: 4, title: 'The city’s best, *on the map*', text: 'The best places near you, colored by score. If it’s green, go with confidence.', wide: true },
        { img: 7, title: 'Whose taste *matches yours?*', text: 'A match percentage from places you’ve both rated.' },
        { img: 6, title: 'Build your favorites, *let friends see*', text: 'Lists live on your profile; share them to your story too.' },
        { img: 8, title: 'Rate, earn XP, *climb to the top*', text: 'Compete with friends; +100 XP for every invite.' },
        { img: 9, title: 'Your food map, *city by city*', text: 'Every city and place you’ve been, on one map.' },
      ],
    },
    cities: {
      title: '*70,000+* places in 8 cities',
      text: 'Ready from Istanbul to Trabzon; add a missing place yourself in a few taps.',
      names: ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Kocaeli', 'Eskişehir', 'Trabzon', 'Adana'],
    },
    faqTitle: 'FAQ',
    faqText: 'Can’t find what you’re looking for? Write to us; we usually reply within 1 business day.',
    faqLink: 'Support',
    faq: [
      ['Is Expeat free?', 'Yes. Expeat is free to download and use.'],
      ['Where is it available?', 'More than 70,000 places are ready in Istanbul, Ankara, Izmir, Bursa, Kocaeli, Eskişehir, Trabzon and Adana. You can add a missing place yourself in a few taps.'],
      ['How are scores calculated?', 'You don’t type a score: you say whether you liked a place and compare it with places of the same kind. Your favorite becomes a 10 and the rest follow your ranking. A place’s Expeat score comes from everyone’s comparisons.'],
      ['Who can see my ratings?', 'Your ratings and posts appear on your profile, and your followers see them in their feed. Your location is not stored on our servers and your phone number is never shown to anyone.'],
      ['How do I delete my account?', 'Go to Profile > Settings > Delete account to permanently delete your account and all your data. See <a href="/en/delete-account">account deletion</a> for details.'],
    ],
    cta: { title: 'Eat the *experience.*', text: 'Rate the places you go, discover the places your friends love.' },
    footer: {
      tagline: 'Rate the places you go, discover with friends.',
      app: 'App',
      legal: 'Legal',
      contact: 'Contact',
      privacy: 'Privacy Policy',
      terms: 'Terms of Use',
      support: 'Support',
      deletion: 'Delete account',
      osm: 'Place data © OpenStreetMap contributors',
    },
    docKicker: { legal: 'Legal', support: 'Support', account: 'Account' },
    toc: 'On this page',
    deletion: {
      title: 'Deleting your account',
      intro: 'You can permanently delete your Expeat account and all of your data at any time.',
      appTitle: 'In the app',
      appSteps: ['Open Expeat and go to the Profile tab.', 'Tap the settings (gear) icon in the top right.', 'Tap “Delete account” and confirm.'],
      appNote: 'Your account is deleted immediately; this cannot be undone.',
      mailTitle: 'If you can’t access the app',
      mailText: `Email ${SUPPORT_EMAIL} from your registered email address with the subject “Account deletion” and include your username. Once we verify the account is yours, it is deleted within 30 days and we let you know.`,
      mailButton: 'Send a deletion request',
      mailSubject: 'Account deletion',
      deletedTitle: 'What gets deleted',
      deleted: 'Your profile, ratings and rankings, posts, photos, comments, lists, follow connections, invites and all other data tied to your account are permanently deleted.',
      keptTitle: 'What may be kept',
      kept: 'Records we are legally required to keep are retained only for the period the law requires. See “Retention and deletion” in the Privacy Policy for details.',
    },
    supportExtra: { title: 'Write to us', text: 'Questions, ideas or problems: we usually reply within 1 business day.', button: 'Send an email' },
    invite: {
      title: 'is inviting you to Expeat',
      fallbackTitle: 'You’re invited to Expeat',
      text: 'Rate the places you go and see where your friends eat, with their real scores.',
      open: 'Open in the app',
      have: 'Already have Expeat? Tap to open it with the invite.',
    },
    notFound: { title: 'Page not found', text: 'The page you’re looking for may have moved or never existed.', back: 'Back to home' },
  },
};

/* ---------- Ortak parçalar ---------- */
function head(t, { title, description, path, alt, noindex = false }) {
  const url = SITE + (path === '/' ? '' : path);
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
${alt ? `<link rel="alternate" hreflang="tr" href="${SITE}${alt.tr === '/' ? '' : alt.tr}">\n<link rel="alternate" hreflang="en" href="${SITE}${alt.en}">` : ''}
<meta name="theme-color" content="#081227">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Expeat">
<meta property="og:locale" content="${t.locale}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og-${t.lang}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="apple-itunes-app" content="app-id=6815859231">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
<script>document.documentElement.classList.add('js')</script>
</head>`;
}

function nav(t, alt) {
  const h = t.home === '/' ? '' : t.home;
  const otherLang = t.lang === 'tr' ? 'en' : 'tr';
  return `<header class="nav">
  <div class="wrap nav-in">
    <a class="wordmark" href="${t.home}" aria-label="Expeat">Expeat</a>
    <nav class="links" aria-label="${t.nav.menu}">
      <a href="${h}/#nasil">${t.nav.how}</a>
      <a href="${h}/#ozellikler">${t.nav.features}</a>
      <a href="${h}/#sss">${t.nav.faq}</a>
      <a href="${t.paths.support}">${t.nav.support}</a>
    </nav>
    <div class="nav-end">
      <a class="lang" href="${alt ? alt[otherLang] : t.other.href}" hreflang="${otherLang}">${otherLang.toUpperCase()}</a>
      <a class="btn light small" href="${h}/#indir">${t.nav.download}</a>
    </div>
  </div>
</header>`;
}

function stores(t) {
  const badge = (os) => {
    const url = STORES[os];
    const icon = os === 'ios' ? ICON.apple : ICON.play;
    const label = os === 'ios' ? 'App Store' : 'Google Play';
    const small = url ? t.stores[os] : `${t.stores.soon} · ${t.stores[os + 'Small']}`;
    const inner = `${icon}<span><small>${esc(small)}</small><b>${label}</b></span>`;
    return url
      ? `<a class="store" href="${url}" data-os="${os}">${inner}</a>`
      : `<span class="store soon" data-os="${os}" aria-disabled="true">${inner}</span>`;
  };
  return `<div class="stores">${badge('ios')}${badge('android')}</div>`;
}

function footer(t) {
  const h = t.home === '/' ? '' : t.home;
  return `<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-brand">
      <a class="wordmark" href="${t.home}">Expeat</a>
      <p>${esc(t.footer.tagline)}</p>
      <p class="slogan">Eat the experience.</p>
    </div>
    <div class="foot-col">
      <h3>${t.footer.app}</h3>
      <a href="${h}/#nasil">${t.nav.how}</a>
      <a href="${h}/#ozellikler">${t.nav.features}</a>
      <a href="${h}/#sss">${t.nav.faq}</a>
    </div>
    <div class="foot-col">
      <h3>${t.footer.legal}</h3>
      <a href="${t.paths.privacy}">${t.footer.privacy}</a>
      <a href="${t.paths.terms}">${t.footer.terms}</a>
      <a href="${t.paths.deletion}">${t.footer.deletion}</a>
    </div>
    <div class="foot-col">
      <h3>${t.footer.contact}</h3>
      <a href="${t.paths.support}">${t.footer.support}</a>
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
      <a href="${t.other.href}">${t.other.label}</a>
    </div>
  </div>
  <div class="wrap foot-base">
    <span>© ${YEAR} Expeat</span>
    <span>${t.footer.osm}</span>
  </div>
  <div class="foot-mark" aria-hidden="true">Expeat</div>
</footer>`;
}

/** Telefon görselleri ve boyutları (scripts/web/shots.sh üretir) */
const SHOTS = JSON.parse(readFileSync(join(out, 'img/ekran.json'), 'utf8'));
const shot = (n, alt = '', cls = '', eager = false) =>
  `<img class="shot ${cls}" src="/img/ekran-${n}.webp" alt="${esc(alt)}" width="${SHOTS[n][0]}" height="${SHOTS[n][1]}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;

/* ---------- Ana sayfa ---------- */
function home(t) {
  const L = t.lang;
  const h = t.home === '/' ? '' : t.home;
  const stars = (n) =>
    `<span class="stars" aria-label="${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`;
  const post = (p) => `<article class="post">
          <img src="/img/yemek-${p.photo}.webp" alt="" width="520" height="600" loading="lazy" decoding="async">
          <div class="post-top">${avatar(p.who, 30)}<span><b>${esc(p.who)}</b> ${t.feed.rated}</span></div>
          <div class="post-bottom"><div><b>${esc(p.place)}</b><small>${esc(p.cat[L === 'tr' ? 0 : 1])} · ${esc(p.area)}</small></div>${disc(p.score, L, 46)}</div>
        </article>`;
  const posts = POSTS.map(post).join('\n        ');
  const cities = t.cities.names.map((c, i) => `<span class="city${i % 2 ? ' outline' : ''}">${esc(c)}</span><i class="sep">${ICON.spark}</i>`).join('');
  const sc = t.showcase.items;
  return `${head(t, { title: t.meta.title, description: t.meta.description, path: t.home, alt: { tr: '/', en: '/en' } })}
<body class="home">
${nav(t, { tr: '/', en: '/en' })}
<main>
  <section class="hero">
    <div class="glow" aria-hidden="true"></div>
    <div class="wrap hero-in">
      <div class="hero-copy">
        <h1 class="display">${em(t.hero.title)}</h1>
        <p class="lead">${esc(t.hero.text)}</p>
        ${stores(t)}
        <p class="slogan">${esc(t.hero.slogan)}</p>
      </div>
      <div class="hero-art" aria-hidden="true">
        ${shot(2, '', 'side left')}
        ${shot(1, '', 'main', true)}
        ${shot(5, '', 'side right')}
      </div>
    </div>
    <div class="wrap">
      <dl class="stats">
        ${t.stats.map(([n, suf, l]) => `<div><dt${n ? ` data-count="${n}" data-suffix="${suf}"` : ''}>${n.toLocaleString(L === 'tr' ? 'tr-TR' : 'en-US')}${suf}</dt><dd>${esc(l)}</dd></div>`).join('\n        ')}
      </dl>
    </div>
  </section>

  <section class="feedband" aria-label="${esc(t.feed.label)}">
    <p class="band-label reveal"><span class="live"></span>${esc(t.feed.label)}</p>
    <div class="marquee">
      <div class="track">
        ${posts}
      </div>
      <div class="track" aria-hidden="true">
        ${posts}
      </div>
    </div>
  </section>

  <section class="trust">
    <div class="wrap">
      <div class="sec-head center reveal">
        <p class="kicker">${t.trust.kicker}</p>
        <h2 class="title">${em(t.trust.title)}</h2>
        <p class="sub">${esc(t.trust.text)}</p>
      </div>
      <div class="versus glass reveal">
        <div class="vcol strangers">
          <h3>${t.trust.strangers}</h3>
          ${t.trust.cards.map(([n, m, s, q], i) => `<div class="anon" style="--r:${[-2.5, 2, -1.2][i]}deg;--d:${i * 0.1}s"><div class="anon-top"><span class="q">?</span><div><b>${esc(n)}</b><small>${esc(m)}</small></div>${stars(s)}</div><p>${esc(q)}</p></div>`).join('\n          ')}
        </div>
        <div class="vdiv" aria-hidden="true"><span>vs</span></div>
        <div class="vcol friends">
          <h3>${t.trust.friends}</h3>
          ${t.trust.people.map(([n, s, d], i) => `<div class="friend" style="--d:${0.35 + i * 0.1}s">${avatar(n, 46)}<div><b>${esc(n)}</b><small>${esc(d)}</small></div>${disc(s, L, 48)}</div>`).join('\n          ')}
        </div>
      </div>
    </div>
  </section>

  <section class="how" id="nasil">
    <div class="wrap">
      <div class="sec-head reveal">
        <p class="kicker">${t.how.kicker}</p>
        <h2 class="title">${em(t.how.title)}</h2>
        <p class="sub">${esc(t.how.text)}</p>
      </div>
      <ol class="steps">
        <li class="step glass reveal" style="--i:0">
          <span class="step-num">01</span>
          <h3>${esc(t.how.steps[0][0])}</h3>
          <p>${esc(t.how.steps[0][1])}</p>
          <div class="demo chips"><span class="chip pick-me">${t.how.sentiments[0]}</span><span class="chip">${t.how.sentiments[1]}</span><span class="chip">${t.how.sentiments[2]}</span></div>
        </li>
        <li class="step glass reveal" style="--i:1">
          <span class="step-num">02</span>
          <h3>${esc(t.how.steps[1][0])}</h3>
          <p>${esc(t.how.steps[1][1])}</p>
          <div class="demo pair"><span class="pick pick-me"><img src="/img/yemek-doner.webp" alt="" loading="lazy" width="520" height="600">Şehzade Cağ Kebap</span><em>${t.how.vs}</em><span class="pick"><img src="/img/yemek-pilav.webp" alt="" loading="lazy" width="520" height="600">Karaköy Lokantası</span></div>
        </li>
        <li class="step glass reveal" style="--i:2">
          <span class="step-num">03</span>
          <h3>${esc(t.how.steps[2][0])}</h3>
          <p>${esc(t.how.steps[2][1])}</p>
          <div class="demo result">
            <div class="ring" style="--c:${scoreColor(9.4)};--p:94"><svg viewBox="0 0 64 64" aria-hidden="true"><circle class="ring-track" cx="32" cy="32" r="28"/><circle class="ring-bar" cx="32" cy="32" r="28" pathLength="100"/></svg><span data-count="9.4" data-dec="1">${num(9.4, L)}</span></div>
            <div><b>Şehzade Cağ Kebap</b><small>${esc(t.how.result)}</small></div>
          </div>
        </li>
      </ol>
    </div>
  </section>

  <section class="showcase" id="ozellikler">
    <div class="wrap">
      <div class="sec-head center reveal">
        <p class="kicker">${t.showcase.kicker}</p>
        <h2 class="title">${em(t.showcase.title)}</h2>
      </div>
      <div class="show">
        <div class="show-steps">
          ${sc
            .map(
              (f, i) => `<article class="show-step${i === 0 ? ' on' : ''}" data-i="${i}">
            <p class="step-label"><span>0${i + 1}</span>${esc(f.label)}</p>
            <h3 class="title">${em(f.title)}</h3>
            <p class="show-text">${esc(f.text)}</p>
            <ul class="points">${f.points.map((p) => `<li>${ICON.check}${esc(p)}</li>`).join('')}</ul>
          </article>`,
            )
            .join('\n          ')}
        </div>
        <div class="show-stage" aria-hidden="true">
          ${sc.map((f, i) => `<div class="stage-img${i === 0 ? ' on' : ''}" data-i="${i}">${shot(f.img)}</div>`).join('\n          ')}
          <div class="stage-dots">${sc.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="more">
    <div class="wrap">
      <div class="sec-head reveal">
        <h2 class="title">${esc(t.more.title)}</h2>
        <p class="sub">${esc(t.more.text)}</p>
      </div>
      <div class="bento">
        ${t.more.items
          .map(
            (f, i) => `<article class="tile glass reveal${f.wide ? ' wide' : ''}" style="--i:${i % 3}">
          <div class="tile-copy"><h3>${em(f.title)}</h3><p>${esc(f.text)}</p></div>
          <div class="tile-art">${shot(f.img, plain(f.title))}</div>
        </article>`,
          )
          .join('\n        ')}
      </div>
    </div>
  </section>

  <section class="cities">
    <div class="wrap sec-head center reveal">
      <h2 class="title">${em(t.cities.title)}</h2>
      <p class="sub">${esc(t.cities.text)}</p>
    </div>
    <div class="marquee slow" aria-hidden="true">
      <div class="track">${cities}</div>
      <div class="track">${cities}</div>
    </div>
  </section>

  <section class="faq" id="sss">
    <div class="wrap faq-in">
      <div class="faq-head reveal">
        <h2 class="title">${esc(t.faqTitle)}</h2>
        <p class="sub">${esc(t.faqText)}</p>
        <a class="btn ghost" href="${t.paths.support}">${t.faqLink}${ICON.arrow}</a>
      </div>
      <div class="faq-list">
        ${t.faq.map(([q, a], i) => `<details class="glass reveal" style="--i:${i}"><summary>${esc(q)}<span class="plus">${ICON.plus}</span></summary><p>${a}</p></details>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="cta" id="indir">
    <div class="glow" aria-hidden="true"></div>
    <div class="wrap cta-in reveal">
      <div class="halo"><img class="app-icon" src="/img/icon-192.png" alt="" width="104" height="104"></div>
      <h2 class="display">${em(t.cta.title)}</h2>
      <p class="lead">${esc(t.cta.text)}</p>
      ${stores(t)}
    </div>
    <div class="cta-phones reveal" aria-hidden="true">${shot(4, '', 'p1')}${shot(1, '', 'p2')}${shot(6, '', 'p3')}</div>
  </section>
</main>
${footer(t)}
<script src="/site.js" defer></script>
</body>
</html>
`;
}

/* ---------- Metin sayfaları (yasal, destek, hesap silme) ---------- */
const ALT = {
  privacy: { tr: '/gizlilik', en: '/en/privacy' },
  terms: { tr: '/kosullar', en: '/en/terms' },
  support: { tr: '/destek', en: '/en/support' },
  deletion: { tr: '/hesap-silme', en: '/en/delete-account' },
};

function docPage(t, { path, alt, kicker, title, description, updated, intro, body, toc }) {
  return `${head(t, { title: `${title} · Expeat`, description, path, alt })}
<body class="doc">
${nav(t, alt)}
<header class="doc-hero">
  <div class="glow" aria-hidden="true"></div>
  <div class="wrap doc-hero-in${toc ? '' : ' single'}">
    ${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ''}
    <h1 class="display">${esc(title)}</h1>
    ${intro ? `<p class="lead">${intro}</p>` : ''}
    ${updated ? `<p class="updated">${esc(updated)}</p>` : ''}
  </div>
</header>
<main class="doc-main">
  <div class="wrap doc-grid${toc ? '' : ' single'}">
    ${toc ? `<aside class="toc"><p>${t.toc}</p><nav>${toc.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join('')}</nav></aside>` : ''}
    <article class="doc-body">
  ${body}
    </article>
  </div>
</main>
${footer(t)}
<script src="/site.js" defer></script>
</body>
</html>
`;
}

function legalPage(t, doc) {
  const text = legalText(t.lang, doc, SUPPORT_EMAIL);
  const ids = text.sections.map((_, i) => `b${i + 1}`);
  const sections = text.sections
    .map((s, si) => {
      const items = [];
      let list = [];
      const flush = () => {
        if (list.length) items.push(`<ul>${list.map((p) => `<li>${mail(esc(p.slice(2)))}</li>`).join('')}</ul>`);
        list = [];
      };
      for (const p of s.paragraphs) {
        if (p.startsWith('• ')) list.push(p);
        else {
          flush();
          items.push(`<p>${mail(esc(p))}</p>`);
        }
      }
      flush();
      return `<section id="${ids[si]}"><h2>${esc(s.heading)}</h2>${items.join('')}</section>`;
    })
    .join('\n  ');
  const extra =
    doc === 'support'
      ? `<div class="contact-card"><div><h2>${t.supportExtra.title}</h2><p>${t.supportExtra.text}</p></div><a class="btn light" href="mailto:${SUPPORT_EMAIL}">${ICON.mail}${t.supportExtra.button}</a></div>`
      : '';
  return docPage(t, {
    path: t.paths[doc],
    alt: ALT[doc],
    kicker: doc === 'support' ? t.docKicker.support : t.docKicker.legal,
    title: text.title,
    description: text.intro,
    updated: text.updated,
    intro: mail(esc(text.intro)),
    toc: text.sections.length >= 4 ? text.sections.map((s, i) => [ids[i], s.heading]) : null,
    body: `${extra}\n  ${sections}`,
  });
}

function deletionPage(t) {
  const d = t.deletion;
  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(d.mailSubject)}`;
  return docPage(t, {
    path: t.paths.deletion,
    alt: ALT.deletion,
    kicker: t.docKicker.account,
    title: d.title,
    description: d.intro,
    intro: esc(d.intro),
    body: `<section class="box"><h2>${d.appTitle}</h2><ol class="numbered">${d.appSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><p class="muted">${esc(d.appNote)}</p></section>
  <section class="box"><h2>${d.mailTitle}</h2><p>${mail(esc(d.mailText))}</p><a class="btn" href="${href}">${ICON.mail}${d.mailButton}</a></section>
  <section><h2>${d.deletedTitle}</h2><p>${esc(d.deleted)}</p></section>
  <section><h2>${d.keptTitle}</h2><p>${esc(d.kept).replace(t.lang === 'tr' ? 'Gizlilik Politikası' : 'Privacy Policy', (m) => `<a href="${t.paths.privacy}">${m}</a>`)}</p></section>`,
  });
}

/* ---------- Davet: /davet/<kullanıcı adı> (vercel.json yeniden yazımı) ---------- */
function invitePage() {
  const tr = T.tr;
  const L = { tr: tr.invite, en: T.en.invite };
  return `${head(tr, { title: 'Expeat’e davet edildin', description: tr.invite.text, path: '/davet', noindex: true })}
<body class="invite">
<main class="invite-in">
  <div class="glow" aria-hidden="true"></div>
  <a class="wordmark" href="/">Expeat</a>
  <div class="invite-card">
    <div class="invite-av" id="av" aria-hidden="true">E</div>
    <p class="invite-user" id="user" hidden></p>
    <h1 class="title" id="title">${L.tr.fallbackTitle}</h1>
    <p class="lead" id="text">${L.tr.text}</p>
    ${stores(tr)}
    <a class="btn ghost" id="open" href="${APP_SCHEME}://" hidden>${L.tr.open}${ICON.arrow}</a>
    <small id="have" hidden>${L.tr.have}</small>
  </div>
  <img class="invite-shot" src="/img/ekran-1.webp" alt="" width="${SHOTS[1][0]}" height="${SHOTS[1][1]}">
</main>
<script>
(() => {
  const L = ${JSON.stringify(L)};
  const lang = (navigator.language || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en';
  document.documentElement.lang = lang;
  const m = location.pathname.match(/^\\/davet\\/([^/?#]+)/);
  let u = '';
  try { u = decodeURIComponent(m ? m[1] : '').trim().replace(/^@/, '').toLowerCase(); } catch {}
  if (!/^[a-z0-9._]{3,24}$/.test(u)) u = '';
  const $ = (id) => document.getElementById(id);
  $('text').textContent = L[lang].text;
  $('open').firstChild.textContent = L[lang].open;
  $('have').textContent = L[lang].have;
  if (u) {
    $('user').hidden = false;
    $('user').textContent = '@' + u;
    $('av').textContent = u[0].toUpperCase();
    $('title').textContent = L[lang].title;
    document.title = '@' + u + ' · Expeat';
    $('open').href = '${APP_SCHEME}://davet/' + encodeURIComponent(u);
  } else {
    $('title').textContent = L[lang].fallbackTitle;
  }
  $('open').hidden = false;
  $('have').hidden = false;
  // Google Play: davet eden kişi referrer ile uygulamaya taşınır (src/lib/invite-referrer.ts ile aynı biçim)
  const play = document.querySelector('a.store[data-os="android"]');
  if (play && u) {
    const ref = 'utm_source=davet&utm_medium=invite&davet=' + u;
    play.href += (play.href.includes('?') ? '&' : '?') + 'referrer=' + encodeURIComponent(ref);
  }
})();
</script>
</body>
</html>
`;
}

/* ---------- /indir: cihazın mağazasına yönlendirir, mağaza yoksa ana sayfaya ---------- */
function downloadPage() {
  return `${head(T.tr, { title: 'Expeat’i indir', description: T.tr.meta.description, path: '/indir', noindex: true })}
<body class="invite">
<script>
(() => {
  const S = ${JSON.stringify(STORES)};
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const url = ios ? S.ios : /Android/.test(ua) ? S.android : '';
  const tr = (navigator.language || 'tr').toLowerCase().startsWith('tr');
  location.replace(url || (tr ? '/#indir' : '/en#indir'));
})();
</script>
<noscript><meta http-equiv="refresh" content="0; url=/#indir"></noscript>
</body>
</html>
`;
}

function notFoundPage() {
  const t = T.tr;
  return docPage(t, {
    path: '/404',
    kicker: '404',
    title: t.notFound.title,
    description: t.notFound.text,
    intro: esc(t.notFound.text),
    body: `<p class="nf"><a class="btn" href="/">${t.notFound.back}</a> <a class="btn outline" href="/en">${T.en.notFound.back} (EN)</a></p>`,
  }).replace('<link rel="canonical" href="https://expeat.app/404">', '<meta name="robots" content="noindex">');
}

/* ---------- Stil ---------- */
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const CSS = String.raw`
:root{
  --navy:#0F1E3D;--navy2:#22386A;--navy3:#5670AE;--deep:#081227;--deeper:#050B1A;
  --ink:#111827;--muted:#5B6474;--faint:#9CA3AF;--line:#E6E8EC;--surface:#F5F6F8;--bg:#FFFFFF;--card:#FFFFFF;--accent:var(--navy);
  --green:#65B32E;--green-l:#8FD16A;--gold:#F5B301;
  --w:#fff;--w85:rgba(255,255,255,.85);--w70:rgba(255,255,255,.7);--w55:rgba(255,255,255,.55);--w40:rgba(255,255,255,.4);
  --w14:rgba(255,255,255,.14);--w10:rgba(255,255,255,.1);--w06:rgba(255,255,255,.06);
  --serif:Newsreader,"New York",Georgia,serif;--sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --wrap:1200px;--gut:24px;--ease:cubic-bezier(.2,.7,.2,1);--noise:${NOISE};
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --ink:#F3F4F6;--muted:#A3AAB8;--faint:#6B7280;--line:#22252C;--surface:#111318;--bg:#0A0B0E;--card:#14161B;--accent:#C7D2FE;
  color-scheme:dark;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:90px}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--sans);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:"cv11","ss03";overflow-x:hidden;overflow-x:clip}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
::selection{background:#5670AE;color:#fff}
.wrap{width:100%;max-width:var(--wrap);margin:0 auto;padding:0 var(--gut)}
.center{text-align:center}
.muted{color:var(--muted)}
section{position:relative}

/* Yazı */
.wordmark{font:700 27px/1 var(--serif);letter-spacing:-.6px;text-decoration:none;color:#fff}
.display{font:600 clamp(42px,6.4vw,78px)/1 var(--serif);letter-spacing:-.03em;margin:0;text-wrap:balance}
.display em,.title em{font-style:italic;font-weight:500}
.title{font:600 clamp(34px,4.6vw,58px)/1.04 var(--serif);letter-spacing:-.025em;margin:0;text-wrap:balance}
.lead{font-size:clamp(17px,1.5vw,20px);line-height:1.55;margin:24px 0 0;max-width:560px;color:var(--w70)}
.sub{font-size:clamp(17px,1.4vw,19px);line-height:1.55;margin:18px 0 0;max-width:580px;color:var(--w55);text-wrap:pretty}
.center .sub,.sub.center{margin-inline:auto}
.kicker{display:inline-flex;align-items:center;gap:10px;font-size:12.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--green-l);margin:0 0 18px}
.kicker::before{content:"";width:22px;height:1px;background:currentColor;opacity:.7}
.center .kicker::after{content:"";width:22px;height:1px;background:currentColor;opacity:.7}
.slogan{font:italic 500 20px/1 var(--serif);color:var(--w55);margin:28px 0 0;letter-spacing:-.01em}
.sec-head{max-width:760px}
.sec-head.center{margin-inline:auto}

/* Düğmeler */
.btn{display:inline-flex;align-items:center;gap:9px;background:var(--navy);color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 22px;border-radius:999px;border:0;transition:transform .25s var(--ease),background .25s,box-shadow .25s}
.btn:hover{transform:translateY(-1px)}
.btn svg{width:18px;height:18px}
.btn.small{padding:9px 17px;font-size:15px}
.btn.light{background:#fff;color:var(--navy);box-shadow:0 8px 24px -10px rgba(255,255,255,.5)}
.btn.light:hover{background:#EEF1F8}
.btn.ghost{background:var(--w06);border:1px solid var(--w14);color:#fff;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.btn.ghost:hover{background:var(--w10)}
.btn.outline{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
@media (prefers-color-scheme:dark){.doc-main .btn:not(.outline):not(.light){background:#fff;color:var(--navy)}}

/* Mağaza düğmeleri */
.stores{display:flex;flex-wrap:wrap;gap:12px;margin-top:34px}
.store{display:inline-flex;align-items:center;gap:12px;min-width:188px;padding:11px 20px 11px 16px;border-radius:15px;background:#000;color:#fff;text-decoration:none;border:1px solid var(--w14);transition:transform .25s var(--ease),border-color .25s}
a.store:hover{transform:translateY(-2px);border-color:var(--w40)}
.store svg{width:26px;height:26px;flex:none}
.store span{display:flex;flex-direction:column;line-height:1.1;white-space:nowrap}
.store small{font-size:11.5px;color:var(--w70);letter-spacing:.01em}
.store b{font-size:19px;font-weight:600;letter-spacing:-.01em}
.store.soon{background:var(--w06);cursor:default;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}

/* Cam kart */
.glass{background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.025));border:1px solid var(--w10);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 40px 80px -48px rgba(0,0,0,.8);backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3)}

/* Parıltı (bölüm arka planları) */
.glow{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.glow::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 50% at 85% 18%,rgba(86,112,174,.42),transparent 70%),radial-gradient(42% 42% at 8% 92%,rgba(101,179,46,.14),transparent 70%)}
.glow::after{content:"";position:absolute;inset:0;opacity:.32;background-image:radial-gradient(rgba(255,255,255,.14) 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(180deg,#000,transparent 75%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 75%)}

/* Puan diski */
.disc{--s:44px;width:var(--s);height:var(--s);flex:none;border-radius:50%;border:2.5px solid var(--c);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:calc(var(--s)*.33);letter-spacing:-.02em;color:color-mix(in srgb,var(--c) 55%,#fff);background:rgba(8,18,39,.55);box-shadow:0 0 22px -4px color-mix(in srgb,var(--c) 70%,transparent),inset 0 0 12px -4px color-mix(in srgb,var(--c) 60%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.av{--s:36px;width:var(--s);height:var(--s);flex:none;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:calc(var(--s)*.4);box-shadow:0 0 0 2px rgba(255,255,255,.85)}

/* Üst menü (koyu zemin üstünde) */
.nav{position:fixed;inset:0 0 auto;z-index:50;color:#fff;transition:background .35s,box-shadow .35s,backdrop-filter .35s}
.nav-in{display:flex;align-items:center;gap:28px;height:70px}
.links{display:flex;gap:28px;margin-left:14px}
.links a,.lang{text-decoration:none;font-size:15px;font-weight:500;color:var(--w70);transition:color .2s}
.links a:hover,.lang:hover{color:#fff}
.nav-end{margin-left:auto;display:flex;align-items:center;gap:18px}
.nav.scrolled{background:rgba(6,13,30,.72);backdrop-filter:saturate(1.6) blur(20px);-webkit-backdrop-filter:saturate(1.6) blur(20px);box-shadow:0 1px 0 var(--w10)}
@media (max-width:840px){.links{display:none}}

/* ===== Ana sayfa: baştan sona lacivert ===== */
body.home{background:var(--deep) var(--noise);color:#fff;color-scheme:dark}

/* Kahraman */
.hero{overflow:hidden;background:var(--noise),linear-gradient(170deg,#1B2F5E 0%,var(--navy) 45%,var(--deep) 100%);padding:132px 0 0}
.hero-in{position:relative;display:grid;grid-template-columns:1.02fr 1fr;gap:40px;align-items:center}
.hero-art{position:relative;height:650px}
.hero-art .shot{position:absolute;top:0;width:auto;height:100%;max-width:none;filter:drop-shadow(0 40px 60px rgba(0,0,0,.5))}
.hero-art .main{left:50%;transform:translateX(-50%);z-index:2}
.hero-art .side{height:84%;top:12%}
.hero-art .left{left:-6%;transform:rotate(-7deg)}
.hero-art .right{right:-6%;transform:rotate(7deg)}
.stats{position:relative;display:grid;grid-template-columns:repeat(3,1fr);margin:60px 0 0;padding:30px 0 40px;border-top:1px solid var(--w10)}
.stats div{text-align:center}
.stats dt{font:600 clamp(32px,3.8vw,46px)/1 var(--serif);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stats dd{margin:10px 0 0;font-size:14.5px;color:var(--w55)}
@media (max-width:960px){
  .hero{padding-top:110px}
  .hero-in{grid-template-columns:1fr;text-align:center}
  .hero-copy{display:flex;flex-direction:column;align-items:center}
  .hero .stores{justify-content:center}
  .hero-art{height:520px;margin-top:10px}
  .hero-art .left{left:2%}.hero-art .right{right:2%}
}
@media (max-width:600px){
  .hero-art{height:430px}
  .hero-art .side{height:74%;top:18%}
  .hero-art .left{left:-16%}.hero-art .right{right:-16%}
  .stats dd{font-size:13px}
  .stores{width:100%;max-width:340px;margin-inline:auto}
  .store{flex:1 1 100%;justify-content:center}
}

/* Kayan şeritler */
.marquee{display:flex;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.track{display:flex;flex:none;gap:18px;padding-right:18px;animation:slide 70s linear infinite}
@media (hover:hover){.marquee:hover .track{animation-play-state:paused}}
.marquee.slow .track{animation-duration:55s;gap:34px;padding-right:34px;align-items:center}
@keyframes slide{to{transform:translateX(-100%)}}

/* Yemek akışı */
.feedband{padding:84px 0 40px}
.band-label{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 30px;font-size:14px;font-weight:600;letter-spacing:.04em;color:var(--w55)}
.live{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 0 rgba(101,179,46,.6);animation:pulse 2.2s infinite}
@keyframes pulse{70%{box-shadow:0 0 0 10px rgba(101,179,46,0)}100%{box-shadow:0 0 0 0 rgba(101,179,46,0)}}
.post{position:relative;flex:none;width:250px;height:310px;border-radius:24px;overflow:hidden;background:var(--navy);box-shadow:0 30px 60px -30px rgba(0,0,0,.8),0 0 0 1px var(--w10)}
.post>img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s var(--ease)}
.post:hover>img{transform:scale(1.05)}
.post::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45),transparent 28%,transparent 48%,rgba(5,11,26,.92));pointer-events:none}
.post-top{position:absolute;z-index:1;top:14px;left:14px;right:14px;display:flex;align-items:center;gap:9px;font-size:13px;color:var(--w85)}
.post-top .av{box-shadow:0 0 0 1.5px rgba(255,255,255,.9)}
.post-bottom{position:absolute;z-index:1;left:16px;right:14px;bottom:15px;display:flex;align-items:flex-end;gap:10px}
.post-bottom>div{flex:1;min-width:0}
.post-bottom b{display:block;font:600 19px/1.15 var(--serif);letter-spacing:-.01em}
.post-bottom small{display:block;margin-top:3px;font-size:12.5px;color:var(--w70);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:600px){.post{width:210px;height:262px}}

/* Kime güveniyorsun */
.trust{padding:110px 0 120px}
.versus{display:grid;grid-template-columns:1fr auto 1fr;gap:32px;align-items:center;margin-top:60px;padding:48px;border-radius:36px}
.vcol h3{font-size:12.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--w40);margin:0 0 22px;text-align:center}
.strangers .anon{filter:saturate(.25);opacity:.62}
.anon{background:rgba(255,255,255,.04);border:1px solid var(--w10);border-radius:20px;padding:16px 18px;margin:0 auto 14px;max-width:380px;transform:rotate(var(--r))}
.anon-top{display:flex;gap:12px;align-items:center}
.anon-top>div{flex:1}
.anon .q{width:38px;height:38px;border-radius:50%;background:var(--w06);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--w40)}
.anon b,.friend b{display:block;font-size:15.5px;font-weight:600}
.anon small,.friend small{display:block;color:var(--w55);font-size:13.5px;line-height:1.35}
.anon p{margin:10px 0 0;font-size:15px;color:var(--w70)}
.stars{display:flex;gap:2px}
.stars i{width:15px;height:15px;color:var(--w14)}
.stars i.on{color:var(--gold)}
.stars svg{width:100%;height:100%;display:block}
.vdiv{align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center}
.vdiv::before,.vdiv::after{content:"";flex:1;width:1px;background:linear-gradient(180deg,transparent,var(--w14),transparent)}
.vdiv span{margin:14px 0;width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:italic 600 24px/1 var(--serif);color:var(--w70);border:1px solid var(--w14);background:var(--deep)}
.friend{display:flex;align-items:center;gap:14px;border-radius:20px;padding:14px 16px;margin:0 auto 14px;max-width:400px;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.04));border:1px solid var(--w14);box-shadow:0 20px 50px -24px rgba(0,0,0,.7),0 0 40px -20px rgba(101,179,46,.35)}
.friend>div{flex:1;min-width:0}
.js .versus .anon,.js .versus .friend{opacity:0;translate:0 22px;transition:opacity .8s var(--ease) var(--d),translate .8s var(--ease) var(--d)}
.js .versus.in .anon{opacity:.62;translate:0 0}
.js .versus.in .friend{opacity:1;translate:0 0}
@media (max-width:860px){.versus{grid-template-columns:1fr;padding:32px 20px}.vdiv{flex-direction:row}.vdiv::before,.vdiv::after{height:1px;width:auto;background:linear-gradient(90deg,transparent,var(--w14),transparent)}.vdiv span{margin:0 14px}}

/* Nasıl çalışır */
.how{padding:110px 0}
.how::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(50% 60% at 0% 50%,rgba(86,112,174,.18),transparent 70%)}
.steps{position:relative;list-style:none;padding:0;margin:60px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.step{border-radius:30px;padding:34px 30px 30px;display:flex;flex-direction:column;min-height:400px}
.step-num{font:italic 500 64px/1 var(--serif);letter-spacing:-.03em;background:linear-gradient(180deg,#fff,rgba(255,255,255,.18));-webkit-background-clip:text;background-clip:text;color:transparent}
.step h3{font:600 28px/1.12 var(--serif);letter-spacing:-.015em;margin:22px 0 10px}
.step p{margin:0;color:var(--w55);font-size:16px}
.demo{margin-top:auto;padding-top:28px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chip{font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;border:1px solid var(--w14);color:var(--w55);transition:all .5s var(--ease) .5s}
:root:not(.js) .chip.pick-me,.in .chip.pick-me{background:#fff;border-color:#fff;color:var(--navy)}
.pair{flex-wrap:nowrap;gap:10px}
.pick{flex:1;display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600;line-height:1.25;padding:8px 8px 10px;border-radius:16px;border:1px solid var(--w14);background:var(--w06);transition:all .6s var(--ease) .6s}
.pick img{width:100%;aspect-ratio:1.3;object-fit:cover;border-radius:10px}
:root:not(.js) .pick.pick-me,.in .pick.pick-me{border-color:var(--green);box-shadow:0 0 0 3px rgba(101,179,46,.25),0 0 30px -6px rgba(101,179,46,.55)}
.pair em{font-size:13px;color:var(--w40);font-style:italic;font-family:var(--serif)}
.result{gap:16px}
.result b{display:block;font-size:16px}.result small{color:var(--w55);font-size:14px}
.ring{position:relative;width:72px;height:72px;flex:none}
.ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.ring circle{fill:none;stroke-width:4.5}
.ring-track{stroke:var(--w10)}
.ring-bar{stroke:var(--c);stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:calc(100 - var(--p));filter:drop-shadow(0 0 6px color-mix(in srgb,var(--c) 80%,transparent))}
.js .ring-bar{stroke-dashoffset:100;transition:stroke-dashoffset 1.6s var(--ease) .4s}
.js .in .ring-bar{stroke-dashoffset:calc(100 - var(--p))}
.ring span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:21px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
@media (max-width:960px){.steps{grid-template-columns:1fr}.step{min-height:0}}

/* Özellikler: kaydırdıkça değişen sabit telefon */
.showcase{padding:110px 0 60px}
.show{display:grid;grid-template-columns:1fr 1fr;gap:72px;margin-top:40px}
.show-step{min-height:84vh;display:flex;flex-direction:column;justify-content:center;transition:opacity .6s var(--ease)}
.js .show-step:not(.on){opacity:.22}
.step-label{display:flex;align-items:center;gap:12px;margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--w55)}
.step-label span{font:italic 500 16px/1 var(--serif);letter-spacing:0;color:var(--green-l)}
.show-step .title{font-size:clamp(32px,3.6vw,50px)}
.show-text{font-size:19px;color:var(--w70);margin:22px 0 0;max-width:500px}
.points{list-style:none;padding:0;margin:26px 0 0;display:grid;gap:12px}
.points li{display:flex;align-items:center;gap:12px;font-size:16px;color:var(--w85)}
.points svg{width:24px;height:24px;flex:none;padding:5px;border-radius:50%;color:var(--green-l);background:rgba(101,179,46,.14);border:1px solid rgba(101,179,46,.3)}
.show-stage{position:sticky;top:10vh;height:80vh;align-self:start}
.show-stage::before{content:"";position:absolute;left:50%;top:50%;width:min(560px,90%);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(86,112,174,.5),rgba(86,112,174,.12) 45%,transparent 70%);filter:blur(10px)}
.show-stage::after{content:"";position:absolute;left:50%;top:50%;width:min(440px,80%);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;border:1px solid var(--w10);box-shadow:0 0 0 70px rgba(255,255,255,.015),0 0 0 140px rgba(255,255,255,.01)}
.stage-img{position:absolute;inset:0;z-index:1;display:flex;justify-content:center;align-items:center;opacity:0;transform:translateY(24px) scale(.96);transition:opacity .7s var(--ease),transform .9s var(--ease)}
.stage-img.on{opacity:1;transform:none}
.stage-img .shot{height:100%;width:auto;max-width:none;filter:drop-shadow(0 40px 60px rgba(0,0,0,.55))}
.stage-dots{position:absolute;z-index:2;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:10px}
.stage-dots i{width:6px;height:6px;border-radius:3px;background:var(--w14);transition:all .4s var(--ease)}
.stage-dots i.on{height:26px;background:#fff}
.js .show-step .points li{opacity:0;translate:-12px 0;transition:opacity .6s var(--ease),translate .6s var(--ease)}
.js .show-step.seen .points li{opacity:1;translate:0 0}
.js .show-step.seen .points li:nth-child(2){transition-delay:.1s}
.js .show-step.seen .points li:nth-child(3){transition-delay:.2s}
/* Mobil: telefon ekranın üstünde sabit, özellik kartları buzlu cam gibi üzerinden kayar; gelen kartla ekran değişir */
@media (max-width:900px){
  .show{grid-template-columns:minmax(0,1fr);gap:0;margin-top:8px}
  .show-stage{grid-area:1/1;z-index:0;top:0;height:100vh;height:100svh}
  .show-stage::before,.show-stage::after,.stage-dots{top:46%}
  .show-stage::before{width:120%}
  .stage-img{align-items:flex-start;padding-top:84px}
  .stage-img .shot{height:70vh;height:min(70svh,620px)}
  .stage-dots{right:2px}
  .show-steps{grid-area:1/1;position:relative;z-index:1;padding:66vh 0 6vh;padding:66svh 0 6svh}
  .show-step{min-height:0;margin:0 0 72vh;margin:0 0 72svh;padding:24px 22px 24px;border-radius:28px;background:linear-gradient(180deg,rgba(18,32,66,.72),rgba(8,18,39,.82));border:1px solid var(--w14);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 30px 60px -20px rgba(0,0,0,.7);backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4)}
  .show-step:last-child{margin-bottom:0}
  .js .show-step:not(.on){opacity:1}
  .step-label{margin-bottom:12px}
  .show-step .title{font-size:30px}
  .show-text{font-size:16px;margin-top:12px}
  .points{margin-top:16px;gap:9px}
  .points li{font-size:14.5px}
}

/* Bento */
.more{padding:110px 0}
.bento{display:grid;grid-template-columns:repeat(6,1fr);gap:20px;margin-top:52px}
.tile{grid-column:span 2;position:relative;border-radius:32px;overflow:hidden;display:flex;flex-direction:column;min-height:540px}
.tile:hover{border-color:var(--w14)}
.tile::before{content:"";position:absolute;inset:auto 0 0;height:70%;background:radial-gradient(70% 70% at 50% 100%,rgba(86,112,174,.35),transparent 70%);pointer-events:none}
.tile.wide{grid-column:span 4;flex-direction:row}
.tile-copy{position:relative;padding:34px 34px 0}
.tile h3{font:600 clamp(25px,2.2vw,30px)/1.1 var(--serif);letter-spacing:-.015em;margin:0}
.tile h3 em{font-style:italic;font-weight:500}
.tile p{margin:12px 0 0;color:var(--w55);font-size:16px;max-width:360px}
.tile-art{position:relative;flex:1;display:flex;justify-content:center;margin-top:30px;min-height:300px}
.tile-art .shot{position:absolute;top:0;width:auto;height:560px;max-width:none;filter:drop-shadow(0 30px 40px rgba(0,0,0,.5));transition:transform .8s var(--ease),translate 1.3s var(--ease) .2s}
.js .tile .tile-art .shot{translate:0 90px}
.js .tile.in .tile-art .shot{translate:0 0}
@media (hover:hover){.tile:hover .tile-art .shot{transform:translateY(-10px)}}
.tile.wide .tile-copy{flex:1;align-self:center;padding:44px}
.tile.wide .tile-copy h3{font-size:clamp(30px,3vw,42px)}
.tile.wide .tile-copy p{font-size:18px}
.tile.wide .tile-art{flex:1;margin-top:44px}
@media (max-width:1020px){.bento{grid-template-columns:1fr 1fr}.tile{grid-column:span 1}.tile.wide{grid-column:span 2}}
@media (max-width:660px){.bento{grid-template-columns:1fr}.tile,.tile.wide{grid-column:span 1;flex-direction:column;min-height:500px}.tile.wide .tile-copy{padding:34px 34px 0;align-self:stretch}.tile.wide .tile-art{margin-top:30px}}

/* Şehirler */
.cities{padding:90px 0 110px;overflow:hidden}
.cities .marquee{margin-top:56px}
.city{font:italic 500 clamp(48px,7vw,96px)/1.1 var(--serif);letter-spacing:-.03em;white-space:nowrap;color:#fff}
.city.outline{color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.45)}
.sep{display:flex;color:var(--green-l)}
.sep svg{width:26px;height:26px}

/* SSS */
.faq{padding:100px 0 120px}
.faq-in{display:grid;grid-template-columns:.85fr 1.15fr;gap:64px;align-items:start}
.faq-head{position:sticky;top:120px}
.faq-head .btn{margin-top:28px}
.faq-list{display:grid;gap:12px}
details{border-radius:22px}
summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;font-size:18px;font-weight:600}
summary::-webkit-details-marker{display:none}
.plus{width:34px;height:34px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid var(--w14);transition:transform .35s var(--ease),background .3s}
.plus svg{width:16px;height:16px}
details[open] .plus{transform:rotate(45deg);background:var(--w10)}
details p{margin:-6px 24px 24px;color:var(--w70);font-size:16.5px;max-width:620px}
details a{color:#fff}
@media (max-width:900px){.faq-in{grid-template-columns:1fr;gap:36px}.faq-head{position:static}}

/* Kapanış */
.cta{overflow:hidden;text-align:center;padding:120px 0 0;background:var(--noise),linear-gradient(180deg,var(--deep),#13254F 60%,#1B2F5E)}
.cta-in{position:relative;display:flex;flex-direction:column;align-items:center}
.cta .glow{mask-image:linear-gradient(180deg,transparent,#000 35%);-webkit-mask-image:linear-gradient(180deg,transparent,#000 35%)}
.cta::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent)}
.cta .stores{justify-content:center}
.halo{position:relative;margin-bottom:34px}
.halo::before{content:"";position:absolute;inset:-40px;border-radius:50%;background:radial-gradient(circle,rgba(86,112,174,.6),transparent 65%);animation:breathe 5s ease-in-out infinite}
@keyframes breathe{50%{transform:scale(1.15);opacity:.7}}
.app-icon{position:relative;width:104px;height:104px;border-radius:24px;box-shadow:0 24px 60px rgba(0,0,0,.5),0 0 0 1px var(--w14)}
.cta-phones{position:relative;height:330px;margin-top:70px;display:flex;justify-content:center}
.cta-phones .shot{position:absolute;top:0;width:auto;max-width:none;height:600px;filter:drop-shadow(0 -20px 60px rgba(0,0,0,.45))}
.cta-phones .p2{left:50%;transform:translateX(-50%);z-index:2}
.cta-phones .p1{left:50%;top:70px;transform:translateX(-128%) rotate(-8deg)}
.cta-phones .p3{left:50%;top:70px;transform:translateX(28%) rotate(8deg)}
.js .cta-phones.reveal{opacity:1;transform:none}
.js .cta-phones .shot{translate:0 160px;opacity:0;transition:translate 1.4s var(--ease),opacity 1s var(--ease)}
.js .cta-phones.in .shot{translate:0 0;opacity:1}
.js .cta-phones.in .p1{transition-delay:.25s}.js .cta-phones.in .p3{transition-delay:.4s}
@media (max-width:600px){.cta-phones{height:240px}.cta-phones .shot{height:440px}.cta-phones .p1{transform:translateX(-112%) rotate(-8deg)}.cta-phones .p3{transform:translateX(12%) rotate(8deg)}}

/* Alt bilgi (her sayfada koyu) */
.foot{position:relative;overflow:hidden;background:var(--deeper) var(--noise);color:#fff;padding:72px 0 0;font-size:15px;border-top:1px solid var(--w06)}
.foot-in{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:32px}
.foot-brand p{margin:14px 0 0;color:var(--w55);max-width:300px}
.foot-brand .slogan{margin-top:14px;font-size:18px}
.foot-col h3{font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--w40);margin:4px 0 16px}
.foot-col a{display:block;text-decoration:none;color:var(--w70);margin:0 0 11px;word-break:break-word;transition:color .2s}
.foot-col a:hover{color:#fff}
.foot-base{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:56px;padding-top:22px;border-top:1px solid var(--w10);color:var(--w40);font-size:13.5px}
.foot-mark{font:700 clamp(120px,24vw,360px)/.78 var(--serif);letter-spacing:-.05em;text-align:center;margin-top:28px;color:transparent;background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,0) 80%);-webkit-background-clip:text;background-clip:text;user-select:none;transform:translateY(12%)}
@media (max-width:760px){.foot-in{grid-template-columns:1fr 1fr}.foot-brand{grid-column:1/-1}}

/* ===== Metin sayfaları ===== */
.doc-hero{position:relative;overflow:hidden;color:#fff;background:var(--noise),linear-gradient(170deg,#1B2F5E 0%,var(--navy) 55%,var(--deep) 100%);padding:150px 0 70px}
.doc-hero-in{position:relative;max-width:1080px}
.doc-hero-in.single{max-width:808px}
.doc-hero .display{font-size:clamp(40px,5.6vw,68px)}
.doc-hero .lead{max-width:680px}
.updated{color:var(--w40);font-size:14.5px;margin:22px 0 0}
.doc-main{padding:72px 0 110px}
.doc-grid{display:grid;grid-template-columns:240px minmax(0,720px);gap:72px;justify-content:center}
.doc-grid.single{grid-template-columns:minmax(0,760px)}
.toc{position:sticky;top:100px;align-self:start;font-size:14.5px}
.toc p{font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);margin:6px 0 14px}
.toc a{display:block;text-decoration:none;color:var(--muted);padding:7px 0 7px 14px;border-left:2px solid var(--line);line-height:1.35;transition:color .2s,border-color .2s}
.toc a:hover,.toc a.on{color:var(--ink);border-color:var(--accent)}
.doc-body section{margin-top:44px}
.doc-body section:first-child{margin-top:0}
.doc-body h2{font:600 26px/1.2 var(--serif);letter-spacing:-.015em;margin:0 0 14px;color:var(--ink)}
.doc-body p{margin:0 0 14px;color:var(--ink)}
.doc-body p.muted{color:var(--muted)}
.doc-body ul,.doc-body ol{margin:0 0 14px;padding-left:22px}
.doc-body li{margin:0 0 9px}
.doc-body a:not(.btn){color:var(--accent);text-underline-offset:3px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:26px;padding:30px 32px}
.box+.box{margin-top:18px}
.box .btn{margin-top:8px}
.numbered li::marker{font-weight:700;color:var(--accent)}
.contact-card{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:48px;background:var(--noise),linear-gradient(160deg,#22386A,#0F1E3D);color:#fff;border-radius:26px;padding:30px 32px;box-shadow:0 30px 60px -30px rgba(15,30,61,.6)}
.contact-card h2{color:#fff!important;margin:0 0 4px!important}
.contact-card p{margin:0!important;color:var(--w70)!important}
.nf{display:flex;gap:10px;flex-wrap:wrap}
@media (max-width:900px){.doc-grid{grid-template-columns:minmax(0,1fr);gap:0}.toc{display:none}.doc-hero{padding:120px 0 56px}}

/* ===== Davet ===== */
.invite{background:var(--noise),linear-gradient(170deg,#1B2F5E 0%,var(--navy) 50%,var(--deep) 100%);color:#fff;min-height:100vh;color-scheme:dark}
.invite-in{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:36px var(--gut) 0;overflow:hidden;text-align:center}
.invite-in .wordmark{position:relative}
.invite-card{position:relative;margin-top:56px;display:flex;flex-direction:column;align-items:center;max-width:520px}
.invite-av{width:88px;height:88px;border-radius:50%;background:linear-gradient(140deg,#5670AE,#22386A);border:3px solid rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;font:600 38px/1 var(--serif);box-shadow:0 0 50px -10px rgba(86,112,174,.8)}
.invite-user{font-size:18px;font-weight:600;margin:16px 0 4px;color:var(--w85)}
.invite .title{margin-top:10px;font-size:clamp(32px,7vw,46px)}
.invite .lead{margin-inline:auto}
.invite .stores{justify-content:center}
.invite .btn.ghost{margin-top:18px}
.invite small{margin-top:12px;color:var(--w55);font-size:14px}
.invite-shot{position:relative;width:min(340px,80vw);margin-top:48px;filter:drop-shadow(0 30px 60px rgba(0,0,0,.5));mask-image:linear-gradient(180deg,#000 55%,transparent);-webkit-mask-image:linear-gradient(180deg,#000 55%,transparent)}

/* ===== Hareket (JS yoksa her şey görünür) ===== */
.js .reveal{opacity:0;transform:translateY(28px);transition:opacity .9s var(--ease),transform .9s var(--ease)}
.js .reveal.in{opacity:1;transform:none}
.js .reveal[style*="--i"]{transition-delay:calc(var(--i)*.09s)}
.js .hero-copy>*{animation:rise .9s var(--ease) both}
.js .hero-copy>:nth-child(2){animation-delay:.08s}.js .hero-copy>:nth-child(3){animation-delay:.16s}.js .hero-copy>:nth-child(4){animation-delay:.24s}
.js .hero-art .shot{animation:rise 1.1s .15s var(--ease) both,float 7s 1.4s ease-in-out infinite}
.js .hero-art .side{animation-delay:.3s,1.8s;animation-duration:1.1s,8s}
.js .hero-art .right{animation-delay:.3s,2.6s}
@keyframes float{50%{translate:0 -12px}}
.js .doc-hero-in>*{animation:rise .8s var(--ease) both}
@keyframes rise{from{opacity:0;translate:0 30px}to{opacity:1;translate:0 0}}
@media (prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  .js .reveal{opacity:1;transform:none;transition:none}
  .js .hero-copy>*,.js .hero-art .shot,.js .doc-hero-in>*{animation:none}
  .track{animation:none}.marquee{overflow-x:auto}.marquee .track+.track{display:none}
  .halo::before,.live{animation:none}
  .js .ring-bar{transition:none}
  .js .versus .anon{opacity:.62;translate:none;transition:none}
  .js .versus .friend,.js .tile .tile-art .shot,.js .cta-phones .shot,.js .show-step .points li{opacity:1;translate:none;transition:none}
  .stage-img{transition:none}
}
`;

const JS = `// Menü, beliren bölümler, sayaçlar, sabit telefon ve içindekiler
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = document.querySelector('.nav');
  if (nav) {
    const on = () => nav.classList.toggle('scrolled', scrollY > 24);
    on();
    addEventListener('scroll', on, { passive: true });
  }
  const IO = 'IntersectionObserver' in window;
  const once = (els, fn, opts) => {
    if (!IO) return els.forEach(fn);
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); }
    }, opts);
    els.forEach((e) => io.observe(e));
  };
  once(document.querySelectorAll('.reveal'), (e) => e.classList.add('in'), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  // Sayaçlar: 0'dan hedefe (yazı başta son değerle gelir; JS'siz ve arama motorlarında doğru görünür)
  const lang = document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-US';
  once(document.querySelectorAll('[data-count]'), (el) => {
    if (reduce) return;
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || '';
    const f = (v) => v.toLocaleString(lang, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    const t0 = performance.now(), dur = 1600;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = f(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = f(0);
    setTimeout(() => requestAnimationFrame(tick), el.closest('.ring') ? 400 : 0);
  }, { threshold: 0.6 });

  // Özellikler: ekranın ortasından geçen adım etkin, telefon o ekrana geçer
  // Masaüstü: ekranın ortasından geçen adım; mobil: alttan gelen kart ekranın %72'sine ulaşınca
  const show = document.querySelector('.show');
  if (show && IO) {
    const groups = [show.querySelectorAll('.show-step'), show.querySelectorAll('.stage-img'), show.querySelectorAll('.stage-dots i')];
    const set = (i) => {
      groups.forEach((g) => g.forEach((el, j) => el.classList.toggle('on', j === i)));
      groups[0][i].classList.add('seen');
    };
    set(0);
    const mobile = matchMedia('(max-width: 900px)');
    let io;
    const observe = () => {
      if (io) io.disconnect();
      io = new IntersectionObserver((es) => {
        for (const e of es) if (e.isIntersecting) set(+e.target.dataset.i);
      }, { rootMargin: mobile.matches ? '-72% 0px -28% 0px' : '-50% 0px -50% 0px' });
      groups[0].forEach((s) => io.observe(s));
    };
    observe();
    if (mobile.addEventListener) mobile.addEventListener('change', observe);
  }

  // İçindekiler: okunan bölümü işaretle
  const toc = document.querySelectorAll('.toc a');
  if (toc.length && IO) {
    const map = new Map([...toc].map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) toc.forEach((a) => a.classList.toggle('on', a === map.get(e.target.id)));
    }, { rootMargin: '-30% 0px -60% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }
})();
`;

const VERCEL = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  cleanUrls: true,
  trailingSlash: false,
  rewrites: [{ source: '/davet/:user', destination: '/davet' }],
  redirects: [
    { source: '/privacy', destination: '/en/privacy', permanent: true },
    { source: '/terms', destination: '/en/terms', permanent: true },
    { source: '/support', destination: '/en/support', permanent: true },
    { source: '/delete-account', destination: '/en/delete-account', permanent: true },
  ],
  headers: [
    { source: '/img/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] },
    { source: '/.well-known/apple-app-site-association', headers: [{ key: 'Content-Type', value: 'application/json' }] },
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
};

/* ---------- Yaz ---------- */
function write(rel, content) {
  const file = join(out, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(`web/${rel}`);
}

write('index.html', home(T.tr));
write('en/index.html', home(T.en));
for (const t of [T.tr, T.en]) {
  const dir = t.lang === 'tr' ? '' : 'en/';
  const name = (p) => p.split('/').pop();
  for (const doc of ['privacy', 'terms', 'support']) write(`${dir}${name(t.paths[doc])}.html`, legalPage(t, doc));
  write(`${dir}${name(t.paths.deletion)}.html`, deletionPage(t));
}
write('davet.html', invitePage());
write('indir.html', downloadPage());
write('404.html', notFoundPage());
write('site.css', CSS.trim() + '\n');
write('site.js', JS);
write('vercel.json', JSON.stringify(VERCEL, null, 2) + '\n');
// Depo kökü: Vercel projesinin kök dizini depo köküyse (ayar yapılmadıysa) web/'i derlemeden yayınlar.
// Kök dizin `web` seçilirse bu dosya okunmaz, web/vercel.json geçerli olur.
const rootVercel = {
  ...VERCEL,
  framework: null,
  installCommand: 'echo "kurulum yok"',
  buildCommand: 'echo "derleme yok: site web/ altında hazır"',
  outputDirectory: 'web',
};
writeFileSync(join(root, 'vercel.json'), JSON.stringify(rootVercel, null, 2) + '\n');
console.log('vercel.json');
if (APPLE_TEAM_ID) {
  const details = [{ appIDs: [`${APPLE_TEAM_ID}.${BUNDLE_ID}`], components: [{ '/': '/davet/*', comment: 'Davet' }] }];
  write('.well-known/apple-app-site-association', JSON.stringify({ applinks: { details } }, null, 2) + '\n');
}
if (ANDROID_SHA256.length) {
  const target = { namespace: 'android_app', package_name: BUNDLE_ID, sha256_cert_fingerprints: ANDROID_SHA256 };
  write('.well-known/assetlinks.json', JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target }], null, 2) + '\n');
}
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const urls = ['/', '/en', ...Object.values(ALT).flatMap((a) => [a.tr, a.en])];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u === '/' ? '/' : u}</loc></url>`).join('\n')}\n</urlset>\n`,
);
