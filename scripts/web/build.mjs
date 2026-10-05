/**
 * Expeat web sitesi (tanıtım + mağazaların istediği sayfalar) → web/ (statik; Vercel kök dizini `web`).
 * Yasal metinler uygulamadakiyle aynı kaynaktan (src/constants/legal.ts) üretilir; metin değişince yeniden çalıştır.
 * Görseller: `bash scripts/web/shots.sh` (telefonlar), `python scripts/web/icons.py` (ikonlar + paylaşım görseli).
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

/** Alan adı alınınca güncellenir (paylaşım önizlemeleri ve site haritası mutlak adres ister) */
const SITE = 'https://expeat.app';
/** Mağaza sayfaları yayınlanınca: `src/constants/app.ts` APP_STORE_URL / PLAY_STORE_URL ile aynı tutulur */
const STORES = { ios: '', android: '' };
const APP_SCHEME = 'expeat';
const YEAR = new Date().getFullYear();

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
/** Başlıklarda `*vurgu*` → <em> */
const em = (s) => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');
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
const scoreInk = (s) => mix(scoreColor(s), '#000000', s >= 3.4 && s < 6.7 ? 0.38 : 0.2);
const fmt = (s) => s.toFixed(1).replace('.', ',');
const disc = (s, size = 44, en = false) =>
  `<span class="disc" style="--c:${scoreColor(s)};--si:${scoreInk(s)};--s:${size}px">${en ? s.toFixed(1) : fmt(s)}</span>`;

/* ---------- İkonlar (satır içi SVG) ---------- */
const ICON = {
  apple:
    '<svg viewBox="0 0 384 512" aria-hidden="true"><path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>',
  play:
    '<svg viewBox="0 0 512 512" aria-hidden="true"><path fill="#00D7FE" d="M48 59.5v393c0 6 2.4 11 6.4 14.6L271 256 54.4 44.9c-4 3.6-6.4 8.6-6.4 14.6z"/><path fill="#FFCE00" d="M354.6 339.4 271 256l83.6-83.4 94.3 53.6c22.4 12.7 22.4 33 0 45.7z"/><path fill="#FF3A44" d="M354.6 339.4 271 256 54.4 467.1c8 7.2 21.1 7.8 35.3-.3z"/><path fill="#00F076" d="M354.6 172.6 89.7 20.2c-14.2-8.1-27.3-7.5-35.3-.3L271 256z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="M3.5 6.5h17v11h-17z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="m4 7 8 6.2L20 7"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/></svg>',
};

/* ---------- Metinler ---------- */
const T = {
  tr: {
    lang: 'tr',
    locale: 'tr_TR',
    home: '/',
    other: { label: 'English', href: '/en' },
    paths: { privacy: '/gizlilik', terms: '/kosullar', support: '/destek', deletion: '/hesap-silme' },
    nav: { how: 'Nasıl çalışır', features: 'Özellikler', faq: 'SSS', support: 'Destek', download: 'İndir' },
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
      ['70.000+', 'mekân'],
      ['8', 'şehir'],
      ['10', 'üzerinden kıyas puanı'],
      ['0', 'yıldız'],
    ],
    trust: {
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
        ['Selin', 'S', 9.6, 'Çiya Sofrası’nı 2. sıraya koydu'],
        ['Kaan', 'K', 9.3, 'Ocakbaşı listesinde ilk 3’te'],
        ['Ece', 'E', 9.4, '“Beğendim” listesinde 24 mekân arasında'],
      ],
    },
    how: {
      kicker: 'Nasıl çalışır',
      title: 'Puan yazmazsın, *kıyaslarsın*',
      steps: [
        ['Nasıldı?', 'Gittiğin mekânı bul; beğendin mi, idare eder miydi, beğenmedin mi?'],
        ['Hangisi daha iyiydi?', 'Aynı türden gittiğin yerlerle ikişer ikişer karşılaştır. Birkaç dokunuş yeter.'],
        ['Puanın hazır', 'Sıralaman 10 üzerinden puana döner. Favorin hep 10; listen büyüdükçe puanların netleşir.'],
      ],
      sentiments: ['Beğendim', 'İdare eder', 'Beğenmedim'],
      vs: 'veya',
      result: '“Beğendim” listende 2. sırada',
    },
    featuresTitle: 'Arkadaşlarının sevdiği yerler, *tek uygulamada*',
    features: [
      { img: 1, title: 'Mekân yorumları *artık feed’de*', text: 'Arkadaşlarının ve çevrendekilerin nerede ne yediğini, kiminle gittiğini ve kaç puan verdiğini akışında gör. Beğendiğin gönderide “Ben de gittim” de, sıralamana ekle.' },
      { img: 2, title: 'Kıyasla, puanın *kendiliğinden* çıksın', text: 'Yıldız düşünmek yok. Yeni mekânı daha önce gittiklerinle karşılaştırırsın; Expeat sıralamanı 10 üzerinden puana çevirir.' },
      { img: 5, title: 'Hangi arkadaşın *kaç puan* verdi?', text: 'Her mekânın sayfasında önce arkadaşlarının puanları görünür, sonra topluluğun. Kime güvendiğini sen seçersin.' },
      { img: 3, title: 'Gitmek istediğin yeri *artık unutma*', text: 'Sosyal medyada gördüğün mekânı paylaş menüsünden tek dokunuşla Listem’e kaydet. Gittiğinde puanla, listen kendiliğinden güncellensin.' },
    ],
    moreTitle: 'Dahası da var',
    more: [
      { img: 4, title: 'Şehrin en iyileri, *haritada*', text: 'Yakınındaki en iyi mekânlar, puan renkleriyle.' },
      { img: 6, title: 'Favori listeni oluştur, *arkadaşların görsün*', text: 'Listelerin profilinde; istersen hikâyende de paylaş.' },
      { img: 7, title: 'Zevkin kiminle *uyuşuyor?*', text: 'Ortak mekânlardaki puanlarınızdan uyum yüzdesi.' },
      { img: 8, title: 'Puanla, XP kazan, *zirveye* çık', text: 'Arkadaşlarınla yarış; her davete +100 XP.' },
      { img: 9, title: 'Lezzet haritan, *şehir şehir*', text: 'Gittiğin şehirler ve mekânlar, tek haritada.' },
    ],
    faqTitle: 'Sık sorulanlar',
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
    updated: 'Güncellendi',
  },
  en: {
    lang: 'en',
    locale: 'en_US',
    home: '/en',
    other: { label: 'Türkçe', href: '/' },
    paths: { privacy: '/en/privacy', terms: '/en/terms', support: '/en/support', deletion: '/en/delete-account' },
    nav: { how: 'How it works', features: 'Features', faq: 'FAQ', support: 'Support', download: 'Download' },
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
      ['70,000+', 'places'],
      ['8', 'cities'],
      ['10', 'point comparison score'],
      ['0', 'stars'],
    ],
    trust: {
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
        ['Selin', 'S', 9.6, 'Ranked Çiya Sofrası 2nd'],
        ['Kaan', 'K', 9.3, 'Top 3 in grill houses'],
        ['Ece', 'E', 9.4, 'Among 24 places she liked'],
      ],
    },
    how: {
      kicker: 'How it works',
      title: 'Don’t score it, *compare it*',
      steps: [
        ['How was it?', 'Find the place you went to. Did you like it, was it fine, or didn’t you like it?'],
        ['Which was better?', 'Compare it with places of the same kind, two at a time. A few taps is all it takes.'],
        ['Your score is ready', 'Your ranking turns into a score out of 10. Your favorite is always a 10; scores sharpen as your list grows.'],
      ],
      sentiments: ['I liked it', 'It was fine', 'I didn’t like it'],
      vs: 'or',
      result: '2nd on your “liked” list',
    },
    featuresTitle: 'Places your friends love, *in one app*',
    features: [
      { img: 1, title: 'Restaurant reviews, *now in your feed*', text: 'See where friends and people nearby eat, who they went with and what score they gave. Tap “I’ve been” on any post to add it to your ranking.' },
      { img: 2, title: 'Compare, and your score *writes itself*', text: 'No more agonizing over stars. Compare a new place with ones you’ve been to, and Expeat turns your ranking into a score out of 10.' },
      { img: 5, title: 'Which friend gave it *what score?*', text: 'Every place page shows your friends’ scores first, then the community’s. You choose whose taste to trust.' },
      { img: 3, title: 'Never forget a place *you want to try*', text: 'Save spots you see on social media to your list with one tap from the share menu. Rate it once you go and your list updates itself.' },
    ],
    moreTitle: 'And there’s more',
    more: [
      { img: 4, title: 'The city’s best, *on the map*', text: 'The best places near you, colored by score.' },
      { img: 6, title: 'Build your favorites, *let friends see*', text: 'Lists live on your profile; share them to your story too.' },
      { img: 7, title: 'Whose taste *matches yours?*', text: 'A match percentage from places you’ve both rated.' },
      { img: 8, title: 'Rate, earn XP, *climb to the top*', text: 'Compete with friends; +100 XP for every invite.' },
      { img: 9, title: 'Your food map, *city by city*', text: 'Every city and place you’ve been, on one map.' },
    ],
    faqTitle: 'FAQ',
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
    updated: 'Updated',
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
<meta name="theme-color" content="#0F1E3D">
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
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=Newsreader:ital,opsz,wght@0,6..72,500..700;1,6..72,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
<script>document.documentElement.classList.add('js')</script>
</head>`;
}

function nav(t, { solid = false, alt } = {}) {
  const h = t.home === '/' ? '' : t.home;
  const otherHref = alt ? alt[t.lang === 'tr' ? 'en' : 'tr'] : t.other.href;
  return `<header class="nav${solid ? ' solid' : ''}">
  <div class="wrap nav-in">
    <a class="wordmark" href="${t.home}" aria-label="Expeat">Expeat</a>
    <nav class="links" aria-label="${t.lang === 'tr' ? 'Ana menü' : 'Main menu'}">
      <a href="${h}/#nasil">${t.nav.how}</a>
      <a href="${h}/#ozellikler">${t.nav.features}</a>
      <a href="${h}/#sss">${t.nav.faq}</a>
      <a href="${t.paths.support}">${t.nav.support}</a>
    </nav>
    <div class="nav-end">
      <a class="lang" href="${otherHref}" hreflang="${t.lang === 'tr' ? 'en' : 'tr'}">${t.lang === 'tr' ? 'EN' : 'TR'}</a>
      <a class="btn small" href="${h}/#indir">${t.nav.download}</a>
    </div>
  </div>
</header>`;
}

function stores(t, { light = false } = {}) {
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
  return `<div class="stores${light ? ' light' : ''}">${badge('ios')}${badge('android')}</div>`;
}

function footer(t) {
  return `<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-brand">
      <a class="wordmark" href="${t.home}">Expeat</a>
      <p>${esc(t.footer.tagline)}</p>
      <p class="slogan">Eat the experience.</p>
    </div>
    <div class="foot-col">
      <h3>${t.footer.app}</h3>
      <a href="${t.home === '/' ? '' : t.home}/#nasil">${t.nav.how}</a>
      <a href="${t.home === '/' ? '' : t.home}/#ozellikler">${t.nav.features}</a>
      <a href="${t.home === '/' ? '' : t.home}/#sss">${t.nav.faq}</a>
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
</footer>`;
}

/** Telefon görselleri ve boyutları (scripts/web/shots.sh üretir) */
const SHOTS = JSON.parse(readFileSync(join(out, 'img/ekran.json'), 'utf8'));
const shot = (n, alt, cls = '', eager = false) =>
  `<img class="shot ${cls}" src="/img/ekran-${n}.webp" alt="${esc(alt)}" width="${SHOTS[n][0]}" height="${SHOTS[n][1]}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
const plain = (s) => s.replaceAll('*', '');

/* ---------- Ana sayfa ---------- */
function home(t) {
  const en = t.lang === 'en';
  const stars = (n) => `<span class="stars" aria-label="${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`;
  return `${head(t, { title: t.meta.title, description: t.meta.description, path: t.home, alt: { tr: '/', en: '/en' } })}
<body class="home">
${nav(t, { alt: { tr: '/', en: '/en' } })}
<main>
  <section class="hero">
    <div class="hero-glow" aria-hidden="true"></div>
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
        ${t.stats.map(([n, l]) => `<div><dt>${esc(n)}</dt><dd>${esc(l)}</dd></div>`).join('\n        ')}
      </dl>
    </div>
  </section>

  <section class="trust reveal">
    <div class="wrap">
      <h2 class="title center">${em(t.trust.title)}</h2>
      <p class="sub center">${esc(t.trust.text)}</p>
      <div class="versus">
        <div class="side-col strangers">
          <h3>${t.trust.strangers}</h3>
          ${t.trust.cards.map(([n, m, s, q], i) => `<div class="anon" style="--r:${[-3, 2.5, -1.5][i]}deg"><div class="anon-top"><span class="q">?</span><div><b>${esc(n)}</b><small>${esc(m)}</small></div></div>${stars(s)}<p>${esc(q)}</p></div>`).join('\n          ')}
        </div>
        <div class="vs-mark" aria-hidden="true">vs</div>
        <div class="side-col friends">
          <h3>${t.trust.friends}</h3>
          ${t.trust.people.map(([n, i, s, d]) => `<div class="friend"><span class="av av-${i}">${i}</span><div><b>${esc(n)}</b><small>${esc(d)}</small></div>${disc(s, 46, en)}</div>`).join('\n          ')}
        </div>
      </div>
    </div>
  </section>

  <section class="how" id="nasil">
    <div class="wrap">
      <p class="kicker reveal">${t.how.kicker}</p>
      <h2 class="title reveal">${em(t.how.title)}</h2>
      <ol class="steps">
        <li class="step reveal">
          <span class="num">1</span>
          <h3>${esc(t.how.steps[0][0])}</h3>
          <p>${esc(t.how.steps[0][1])}</p>
          <div class="demo chips"><span class="chip on">${t.how.sentiments[0]}</span><span class="chip">${t.how.sentiments[1]}</span><span class="chip">${t.how.sentiments[2]}</span></div>
        </li>
        <li class="step reveal">
          <span class="num">2</span>
          <h3>${esc(t.how.steps[1][0])}</h3>
          <p>${esc(t.how.steps[1][1])}</p>
          <div class="demo pair"><span class="pick on">Şehzade Cağ Kebap</span><em>${t.how.vs}</em><span class="pick">Karaköy Lokantası</span></div>
        </li>
        <li class="step reveal">
          <span class="num">3</span>
          <h3>${esc(t.how.steps[2][0])}</h3>
          <p>${esc(t.how.steps[2][1])}</p>
          <div class="demo result">${disc(9.4, 52, en)}<div><b>Şehzade Cağ Kebap</b><small>${esc(t.how.result)}</small></div></div>
        </li>
      </ol>
    </div>
  </section>

  <section class="features" id="ozellikler">
    <div class="wrap">
      <h2 class="title center reveal">${em(t.featuresTitle)}</h2>
      ${t.features
        .map(
          (f, i) => `<article class="feature${i % 2 ? ' flip' : ''} reveal">
        <div class="feature-art">${shot(f.img, plain(f.title))}</div>
        <div class="feature-copy">
          <h3 class="title">${em(f.title)}</h3>
          <p>${esc(f.text)}</p>
        </div>
      </article>`,
        )
        .join('\n      ')}
    </div>
  </section>

  <section class="more">
    <div class="wrap">
      <h2 class="title reveal">${esc(t.moreTitle)}</h2>
    </div>
    <div class="rail reveal" tabindex="0" aria-label="${esc(t.moreTitle)}">
      ${t.more
        .map(
          (f) => `<article class="card">
        <div class="card-art">${shot(f.img, plain(f.title))}</div>
        <h3>${em(f.title)}</h3>
        <p>${esc(f.text)}</p>
      </article>`,
        )
        .join('\n      ')}
    </div>
  </section>

  <section class="faq" id="sss">
    <div class="wrap narrow">
      <h2 class="title center reveal">${esc(t.faqTitle)}</h2>
      ${t.faq.map(([q, a]) => `<details class="reveal"><summary>${esc(q)}${ICON.plus}</summary><p>${a}</p></details>`).join('\n      ')}
    </div>
  </section>

  <section class="cta" id="indir">
    <div class="hero-glow" aria-hidden="true"></div>
    <div class="wrap cta-in reveal">
      <img class="app-icon" src="/img/icon-192.png" alt="" width="96" height="96">
      <h2 class="display">${em(t.cta.title)}</h2>
      <p class="lead">${esc(t.cta.text)}</p>
      ${stores(t)}
    </div>
  </section>
</main>
${footer(t)}
<script src="/site.js" defer></script>
</body>
</html>
`;
}

/* ---------- Metin sayfaları (yasal, destek, hesap silme) ---------- */
function docPage(t, { path, alt, title, description, updated, body }) {
  return `${head(t, { title: `${title} · Expeat`, description, path, alt })}
<body class="doc">
${nav(t, { solid: true, alt })}
<main class="wrap narrow doc-in">
  <h1 class="title">${esc(title)}</h1>
  ${updated ? `<p class="updated">${esc(updated)}</p>` : ''}
  ${body}
</main>
${footer(t)}
<script src="/site.js" defer></script>
</body>
</html>
`;
}

const ALT = {
  privacy: { tr: '/gizlilik', en: '/en/privacy' },
  terms: { tr: '/kosullar', en: '/en/terms' },
  support: { tr: '/destek', en: '/en/support' },
  deletion: { tr: '/hesap-silme', en: '/en/delete-account' },
};

function legalPage(t, doc) {
  const text = legalText(t.lang, doc, SUPPORT_EMAIL);
  const sections = text.sections
    .map((s) => {
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
      return `<section><h2>${esc(s.heading)}</h2>${items.join('')}</section>`;
    })
    .join('\n  ');
  const extra =
    doc === 'support'
      ? `<div class="contact-card"><div><h2>${t.supportExtra.title}</h2><p>${t.supportExtra.text}</p></div><a class="btn" href="mailto:${SUPPORT_EMAIL}">${ICON.mail}${t.supportExtra.button}</a></div>`
      : '';
  return docPage(t, {
    path: t.paths[doc],
    alt: ALT[doc],
    title: text.title,
    description: text.intro,
    updated: text.updated,
    body: `${extra}<p class="intro">${mail(esc(text.intro))}</p>\n  ${sections}`,
  });
}

function deletionPage(t) {
  const d = t.deletion;
  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(d.mailSubject)}`;
  return docPage(t, {
    path: t.paths.deletion,
    alt: ALT.deletion,
    title: d.title,
    description: d.intro,
    body: `<p class="intro">${esc(d.intro)}</p>
  <section class="box"><h2>${d.appTitle}</h2><ol class="numbered">${d.appSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><p class="muted">${esc(d.appNote)}</p></section>
  <section class="box"><h2>${d.mailTitle}</h2><p>${mail(esc(d.mailText))}</p><a class="btn" href="${href}">${ICON.mail}${d.mailButton}</a></section>
  <section><h2>${d.deletedTitle}</h2><p>${esc(d.deleted)}</p></section>
  <section><h2>${d.keptTitle}</h2><p>${esc(d.kept).replace(t.lang === 'tr' ? 'Gizlilik Politikası' : 'Privacy Policy', (m) => `<a href="${t.paths.privacy}">${m}</a>`)}</p></section>`,
  });
}

/* ---------- Davet: /davet/<kullanıcı adı> (vercel.json yeniden yazımı) ---------- */
function invitePage() {
  const tr = T.tr;
  const en = T.en;
  const L = { tr: tr.invite, en: en.invite };
  return `${head(tr, { title: 'Expeat’e davet edildin', description: tr.invite.text, path: '/davet', noindex: true })}
<body class="invite">
<main class="invite-in">
  <div class="hero-glow" aria-hidden="true"></div>
  <a class="wordmark light" href="/">Expeat</a>
  <div class="invite-card">
    <div class="invite-av" id="av" aria-hidden="true">E</div>
    <p class="invite-user" id="user" hidden></p>
    <h1 class="title" id="title">${L.tr.fallbackTitle}</h1>
    <p class="lead" id="text">${L.tr.text}</p>
    ${stores(tr, { light: true })}
    <a class="btn ghost" id="open" href="${APP_SCHEME}://" hidden>${L.tr.open}${ICON.arrow}</a>
    <small class="muted" id="have" hidden>${L.tr.have}</small>
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
    $('title').textContent = lang === 'tr' ? L.tr.title : L.en.title;
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
<body class="doc">
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
  return `${head(t, { title: `${t.notFound.title} · Expeat`, description: t.notFound.text, path: '/404', noindex: true })}
<body class="doc">
${nav(t, { solid: true })}
<main class="wrap narrow doc-in nf">
  <p class="nf-code">404</p>
  <h1 class="title">${t.notFound.title}</h1>
  <p class="intro">${t.notFound.text}</p>
  <p><a class="btn" href="/">${t.notFound.back}</a> <a class="btn ghost dark" href="/en">${T.en.notFound.back} (EN)</a></p>
</main>
${footer(t)}
</body>
</html>
`;
}

/* ---------- Stil ---------- */
const CSS = String.raw`
:root{
  --navy:#0F1E3D;--navy2:#22386A;--navy3:#5670AE;--deep:#0A1530;
  --ink:#111827;--muted:#6B7280;--faint:#9CA3AF;--line:#E5E7EB;--surface:#F5F6F8;--bg:#FFFFFF;--card:#FFFFFF;
  --green:#65B32E;--green2:#1E7B3C;--accent:var(--navy);
  --serif:Newsreader,"New York",Georgia,serif;--sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --r:22px;--wrap:1160px;--gut:24px;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --ink:#F3F4F6;--muted:#A1A7B3;--faint:#6B7280;--line:#24262D;--surface:#121318;--bg:#0B0B0D;--card:#141519;--accent:#C7D2FE;
  color-scheme:dark;
}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:84px}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.6 var(--sans);-webkit-font-smoothing:antialiased;font-feature-settings:"cv11","ss03";overflow-x:hidden}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
.wrap{width:100%;max-width:var(--wrap);margin:0 auto;padding:0 var(--gut)}
.wrap.narrow{max-width:760px}
.center{text-align:center}
.muted{color:var(--muted)}

/* Yazı */
.wordmark{font:700 27px/1 var(--serif);letter-spacing:-.6px;text-decoration:none;color:var(--accent)}
.display{font:600 clamp(40px,6.2vw,72px)/1.02 var(--serif);letter-spacing:-.025em;margin:0;text-wrap:balance}
.display em,.title em{font-style:italic;font-weight:500}
.title{font:600 clamp(30px,4.2vw,48px)/1.08 var(--serif);letter-spacing:-.02em;margin:0;text-wrap:balance}
.lead{font-size:clamp(17px,1.6vw,20px);line-height:1.55;margin:22px 0 0;max-width:560px}
.sub{color:var(--muted);font-size:18px;margin:14px auto 0;max-width:560px}
.kicker{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--green2);margin:0 0 12px}
@media (prefers-color-scheme:dark){.kicker{color:var(--green)}}
.slogan{font:italic 500 19px/1 var(--serif);opacity:.7;margin:26px 0 0;letter-spacing:-.01em}

/* Düğmeler */
.btn{display:inline-flex;align-items:center;gap:9px;background:var(--navy);color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:13px 22px;border-radius:999px;border:0;transition:transform .2s,background .2s}
.btn:hover{transform:translateY(-1px);background:var(--navy2)}
.btn svg{width:19px;height:19px}
.btn.small{padding:9px 16px;font-size:15px}
.btn.ghost{background:transparent;border:1.5px solid rgba(255,255,255,.4);color:#fff}
.btn.ghost.dark{border-color:var(--line);color:var(--ink)}
@media (prefers-color-scheme:dark){.btn{background:#fff;color:var(--navy)}.btn:hover{background:#E8ECF6}.btn.ghost.dark{background:transparent;color:var(--ink)}}

/* Mağaza düğmeleri */
.stores{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
.store{display:inline-flex;align-items:center;gap:11px;min-width:184px;padding:11px 20px 11px 16px;border-radius:14px;background:#000;color:#fff;text-decoration:none;border:1px solid rgba(255,255,255,.22);transition:transform .2s}
a.store:hover{transform:translateY(-2px)}
.store svg{width:26px;height:26px;flex:none}
.store span{display:flex;flex-direction:column;line-height:1.1;white-space:nowrap}
.store small{font-size:11.5px;opacity:.78;letter-spacing:.01em}
.store b{font-size:19px;font-weight:600;letter-spacing:-.01em}
.store.soon{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.18);cursor:default}
.stores.light .store.soon{background:rgba(255,255,255,.1)}

/* Üst menü */
.nav{position:fixed;inset:0 0 auto;z-index:50;transition:background .3s,box-shadow .3s,color .3s;color:#fff}
.nav-in{display:flex;align-items:center;gap:28px;height:68px}
.nav .wordmark{color:#fff}
.links{display:flex;gap:26px;margin-left:12px}
.links a,.lang{text-decoration:none;font-size:15px;font-weight:500;opacity:.82;transition:opacity .2s}
.links a:hover,.lang:hover{opacity:1}
.nav-end{margin-left:auto;display:flex;align-items:center;gap:16px}
.nav .btn{background:#fff;color:var(--navy)}
.nav .btn:hover{background:#E8ECF6}
.nav.scrolled,.nav.solid{background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.6) blur(18px);-webkit-backdrop-filter:saturate(1.6) blur(18px);box-shadow:0 1px 0 var(--line);color:var(--ink)}
.nav.scrolled .wordmark,.nav.solid .wordmark{color:var(--accent)}
.nav.scrolled .btn,.nav.solid .btn{background:var(--navy);color:#fff}
@media (prefers-color-scheme:dark){.nav.scrolled .btn,.nav.solid .btn{background:#fff;color:var(--navy)}}
@media (max-width:820px){.links{display:none}}

/* Kahraman */
.hero{position:relative;overflow:hidden;color:#fff;background:linear-gradient(170deg,#1B2F5E 0%,var(--navy) 45%,var(--deep) 100%);padding:128px 0 0}
.hero-glow{position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(60% 50% at 85% 20%,rgba(86,112,174,.45),transparent 70%),
  radial-gradient(40% 40% at 10% 90%,rgba(101,179,46,.16),transparent 70%)}
.hero-glow::after{content:"";position:absolute;inset:0;opacity:.35;background-image:radial-gradient(rgba(255,255,255,.14) 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(180deg,#000,transparent 75%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 75%)}
.hero-in{position:relative;display:grid;grid-template-columns:1.02fr 1fr;gap:40px;align-items:center}
.hero .lead{color:rgba(255,255,255,.78)}
.hero-art{position:relative;height:640px}
.hero-art .shot{position:absolute;top:0;width:auto;height:100%;filter:drop-shadow(0 40px 60px rgba(0,0,0,.45))}
.hero-art .main{left:50%;transform:translateX(-50%);z-index:2}
.hero-art .side{height:84%;top:12%;opacity:.95}
.hero-art .left{left:-4%;transform:rotate(-7deg)}
.hero-art .right{right:-4%;transform:rotate(7deg)}
.stats{position:relative;display:grid;grid-template-columns:repeat(4,1fr);margin:56px 0 0;padding:28px 0 34px;border-top:1px solid rgba(255,255,255,.12)}
.stats div{text-align:center}
.stats dt{font:600 clamp(30px,3.6vw,42px)/1 var(--serif);letter-spacing:-.02em}
.stats dd{margin:8px 0 0;font-size:14.5px;color:rgba(255,255,255,.62)}
@media (max-width:960px){
  .hero{padding-top:108px}
  .hero-in{grid-template-columns:1fr;text-align:center}
  .hero-copy{display:flex;flex-direction:column;align-items:center}
  .stores{justify-content:center}
  .hero-art{height:520px;margin-top:8px}
  .hero-art .left{left:2%}.hero-art .right{right:2%}
}
@media (max-width:600px){
  .hero-art{height:430px}
  .hero-art .side{height:74%;top:18%}
  .hero-art .left{left:-14%}.hero-art .right{right:-14%}
  .stats{grid-template-columns:repeat(2,1fr);row-gap:26px}
  .stores{width:100%;max-width:340px;margin-inline:auto}
  .store{flex:1 1 100%;justify-content:center}
}

/* Puan diski */
.disc{--s:44px;width:var(--s);height:var(--s);flex:none;border-radius:50%;border:2.5px solid var(--c);color:var(--si);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:calc(var(--s)*.34);letter-spacing:-.02em;background:var(--card)}
@media (prefers-color-scheme:dark){.disc{color:color-mix(in srgb,var(--c) 88%,#fff)}}

/* Kime güveniyorsun */
section{position:relative}
.trust{padding:110px 0 100px}
.versus{display:grid;grid-template-columns:1fr auto 1fr;gap:28px;align-items:center;margin-top:56px}
.side-col h3{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:0 0 18px;text-align:center}
.strangers{filter:grayscale(1);opacity:.75}
.anon{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px;margin:0 auto 14px;max-width:360px;transform:rotate(var(--r));box-shadow:0 10px 30px rgba(15,30,61,.06)}
.anon-top{display:flex;gap:12px;align-items:center}
.anon .q{width:36px;height:36px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--faint)}
.anon b,.friend b{display:block;font-size:15.5px}
.anon small,.friend small{display:block;color:var(--muted);font-size:13.5px;line-height:1.35}
.anon p{margin:6px 0 0;font-size:15px}
.stars{display:flex;gap:2px;margin-top:10px}
.stars i{width:16px;height:16px;color:var(--line)}
.stars i.on{color:#F5B301}
.stars svg{width:100%;height:100%}
.vs-mark{font:italic 600 34px/1 var(--serif);color:var(--faint)}
.friend{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px;margin:0 auto 14px;max-width:380px;box-shadow:0 14px 40px rgba(15,30,61,.08)}
.friend>div{flex:1;min-width:0}
.av{width:44px;height:44px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:17px}
.av-S{background:linear-gradient(140deg,#E8618C,#B83280)}.av-K{background:linear-gradient(140deg,#3B82F6,#1E3A8A)}.av-E{background:linear-gradient(140deg,#F59E0B,#C2410C)}
@media (max-width:820px){.versus{grid-template-columns:1fr;gap:18px}.vs-mark{text-align:center}}

/* Nasıl çalışır */
.how{background:var(--surface);padding:110px 0}
.steps{list-style:none;padding:0;margin:52px 0 0;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.step{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:30px 28px 28px;display:flex;flex-direction:column}
.step .num{font:600 15px/1 var(--sans);width:32px;height:32px;border-radius:50%;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:center}
@media (prefers-color-scheme:dark){.step .num{background:#fff;color:var(--navy)}}
.step h3{font:600 26px/1.15 var(--serif);letter-spacing:-.015em;margin:20px 0 8px}
.step p{margin:0;color:var(--muted);font-size:16px}
.demo{margin-top:auto;padding-top:26px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chip{font-size:14px;font-weight:600;padding:8px 13px;border-radius:999px;border:1.5px solid var(--line);color:var(--muted)}
.chip.on{background:var(--navy);border-color:var(--navy);color:#fff}
@media (prefers-color-scheme:dark){.chip.on{background:#fff;border-color:#fff;color:var(--navy)}}
.pair{flex-wrap:nowrap}
.pick{flex:1;font-size:14px;font-weight:600;padding:12px;border-radius:14px;border:1.5px solid var(--line);text-align:center;line-height:1.25}
.pick.on{border-color:var(--green);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 22%,transparent)}
.pair em{font-size:13px;color:var(--faint);font-style:normal}
.result{gap:14px}
.result b{display:block;font-size:16px}.result small{color:var(--muted);font-size:14px}
@media (max-width:900px){.steps{grid-template-columns:1fr}}

/* Özellikler */
.features{padding:120px 0 40px}
.feature{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;margin-top:90px}
.feature-art{position:relative;height:580px;border-radius:32px;overflow:hidden;display:flex;justify-content:center;padding-top:60px;
  background:radial-gradient(70% 60% at 50% 0%,rgba(86,112,174,.55),transparent 70%),linear-gradient(165deg,#22386A,#0F1E3D 70%)}
.feature-art .shot{height:680px;width:auto;max-width:none;filter:drop-shadow(0 30px 40px rgba(0,0,0,.45))}
.feature.flip .feature-art{order:2}
.feature-copy p{font-size:19px;color:var(--muted);margin:20px 0 0;max-width:470px}
@media (max-width:860px){
  .feature{grid-template-columns:1fr;gap:34px;margin-top:70px;text-align:center}
  .feature.flip .feature-art{order:0}
  .feature-copy p{margin-inline:auto}
  .feature-art{height:470px;padding-top:44px}
  .feature-art .shot{height:560px}
}

/* Dahası */
.more{padding:90px 0 110px}
.rail{--rp:max(var(--gut),calc((100vw - var(--wrap))/2 + var(--gut)));display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,300px);gap:20px;overflow-x:auto;scroll-snap-type:x proximity;scroll-padding-inline:var(--rp);padding:40px var(--rp) 20px;scrollbar-width:thin;outline:none}
.card{scroll-snap-align:start;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:22px 22px 26px;display:flex;flex-direction:column}
.card-art{border-radius:16px;background:radial-gradient(70% 60% at 50% 0%,rgba(86,112,174,.55),transparent 70%),linear-gradient(165deg,#22386A,#0F1E3D 70%);height:340px;overflow:hidden;display:flex;justify-content:center;padding-top:26px}
.card-art .shot{width:auto;height:430px;max-width:none;filter:drop-shadow(0 20px 30px rgba(0,0,0,.4))}
.card h3{font:600 23px/1.15 var(--serif);letter-spacing:-.015em;margin:22px 0 6px}
.card h3 em{font-style:italic;font-weight:500}
.card p{margin:0;color:var(--muted);font-size:15.5px}

/* SSS */
.faq{padding:40px 0 120px}
.faq .title{margin-bottom:36px}
details{border-bottom:1px solid var(--line)}
summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 0;font-size:19px;font-weight:600}
summary::-webkit-details-marker{display:none}
summary svg{width:22px;height:22px;flex:none;color:var(--muted);transition:transform .25s}
details[open] summary svg{transform:rotate(45deg)}
details p{margin:-6px 0 24px;color:var(--muted);font-size:17px;max-width:660px}
details a{color:var(--accent)}

/* Kapanış */
.cta{position:relative;overflow:hidden;color:#fff;background:linear-gradient(170deg,#1B2F5E 0%,var(--navy) 50%,var(--deep) 100%);padding:110px 0 120px;text-align:center}
.cta-in{position:relative;display:flex;flex-direction:column;align-items:center}
.cta .lead{color:rgba(255,255,255,.75)}
.app-icon{width:96px;height:96px;border-radius:22px;margin-bottom:30px;box-shadow:0 20px 50px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.12)}
.cta .stores{justify-content:center}

/* Alt bilgi */
.foot{border-top:1px solid var(--line);padding:64px 0 28px;font-size:15px}
.foot-in{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:32px}
.foot-brand p{margin:12px 0 0;color:var(--muted);max-width:300px}
.foot-brand .slogan{margin-top:14px;font-size:17px}
.foot-col h3{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin:4px 0 14px}
.foot-col a{display:block;text-decoration:none;color:var(--muted);margin:0 0 10px;word-break:break-word}
.foot-col a:hover{color:var(--ink)}
.foot-base{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-top:48px;padding-top:22px;border-top:1px solid var(--line);color:var(--faint);font-size:13.5px}
@media (max-width:760px){.foot-in{grid-template-columns:1fr 1fr}.foot-brand{grid-column:1/-1}}

/* Metin sayfaları */
.doc-in{padding-top:128px;padding-bottom:96px}
.doc-in .title{font-size:clamp(34px,5vw,48px)}
.updated{color:var(--faint);font-size:15px;margin:12px 0 0}
.doc-in .intro{font-size:20px;line-height:1.55;margin:28px 0 8px}
.doc-in section{margin-top:40px}
.doc-in h2{font:600 24px/1.2 var(--serif);letter-spacing:-.01em;margin:0 0 12px}
.doc-in p{margin:0 0 14px}
.doc-in ul,.doc-in ol{margin:0 0 14px;padding-left:22px}
.doc-in li{margin:0 0 8px}
.doc-in a:not(.btn){color:var(--accent);text-underline-offset:3px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:26px 28px}
.box .btn{margin-top:6px}
.numbered li::marker{font-weight:700;color:var(--accent)}
.contact-card{display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-top:32px;background:linear-gradient(160deg,#22386A,#0F1E3D);color:#fff;border-radius:var(--r);padding:28px}
.contact-card h2{color:#fff;margin:0 0 4px}.contact-card p{margin:0;color:rgba(255,255,255,.75)}
.contact-card .btn{background:#fff;color:var(--navy)}
.nf{text-align:center}.nf .intro{margin-inline:auto}
.nf-code{font:600 120px/1 var(--serif);color:var(--line);margin:0}
.nf .btn{margin:8px 4px}

/* Davet */
.invite{background:linear-gradient(170deg,#1B2F5E 0%,var(--navy) 50%,var(--deep) 100%);color:#fff;min-height:100vh}
.invite-in{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:36px var(--gut) 0;overflow:hidden;text-align:center}
.wordmark.light{color:#fff;position:relative}
.invite-card{position:relative;margin-top:56px;display:flex;flex-direction:column;align-items:center;max-width:520px}
.invite-av{width:84px;height:84px;border-radius:50%;background:linear-gradient(140deg,#5670AE,#22386A);border:3px solid rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;font:600 36px/1 var(--serif)}
.invite-user{font-size:18px;font-weight:600;margin:16px 0 4px;opacity:.9}
.invite .title{margin-top:10px}
.invite .lead{color:rgba(255,255,255,.75);margin-inline:auto}
.invite .stores{justify-content:center}
.invite .btn.ghost{margin-top:18px}
.invite small{margin-top:12px;color:rgba(255,255,255,.55);font-size:14px}
.invite-shot{position:relative;width:min(340px,80vw);margin-top:48px;filter:drop-shadow(0 30px 60px rgba(0,0,0,.5));mask-image:linear-gradient(180deg,#000 55%,transparent);-webkit-mask-image:linear-gradient(180deg,#000 55%,transparent)}

/* Kayarak beliren bölümler (JS yoksa hepsi görünür) */
.js .reveal{opacity:0;transform:translateY(26px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1)}
.js .reveal.in{opacity:1;transform:none}
.js .hero-copy>*{animation:rise .9s cubic-bezier(.2,.7,.2,1) both}
.js .hero-copy>:nth-child(2){animation-delay:.08s}.js .hero-copy>:nth-child(3){animation-delay:.16s}.js .hero-copy>:nth-child(4){animation-delay:.24s}
.js .hero-art .shot{animation:rise 1.1s .15s cubic-bezier(.2,.7,.2,1) both}
.js .hero-art .side{animation-delay:.3s}
@keyframes rise{from{opacity:0;translate:0 30px}to{opacity:1;translate:0 0}}
@media (prefers-reduced-motion:reduce){.js .reveal{opacity:1;transform:none;transition:none}.js .hero-copy>*,.js .hero-art .shot{animation:none}html{scroll-behavior:auto}}
`;

const JS = `// Menü kaydırınca katılaşır; bölümler görünüme girince belirir
(() => {
  const nav = document.querySelector('.nav:not(.solid)');
  if (nav) {
    const on = () => nav.classList.toggle('scrolled', scrollY > 24);
    on();
    addEventListener('scroll', on, { passive: true });
  }
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((e) => io.observe(e));
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
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const urls = ['/', '/en', ...Object.values(ALT).flatMap((a) => [a.tr, a.en])];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u === '/' ? '/' : u}</loc></url>`).join('\n')}\n</urlset>\n`,
);
