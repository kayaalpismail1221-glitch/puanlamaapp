/**
 * Liste web sayfası: sunucuda çizilen tek HTML (bağlantı önizlemesi için OG etiketleri dahil).
 * Saf fonksiyonlar; veri `public_list` RPC'sinden gelir (bkz. api/list.js).
 * Uygulamanın tasarım dili: beyaz zemin, lacivert #0F1E3D, serif başlık, puan renk skalası.
 */

/* ---------- Metinler (uygulamadaki i18n'in web için küçük kopyası) ---------- */

const TEXT = {
  tr: {
    listOf: (name) => `${turkishPossessive(name)} listesi`,
    places: (n) => `${n} mekân`,
    saves: (n) => `${n} kişi kaydetti`,
    save: 'Listeyi kaydet',
    open: 'Puanla’da aç',
    ctaTitle: 'Listeyi kaydet, gidince sen de puanla',
    ctaText: 'Puanla’da arkadaşlarının gittiği yerleri ve verdikleri puanları görürsün.',
    searchStore: 'App Store’da “Puanla”yı aratıp indirebilirsin.',
    download: 'Puanla’yı indir',
    unrated: 'Puanı yok',
    notFoundTitle: 'Bu liste artık yok',
    notFoundText: 'Liste silinmiş ya da bağlantı hatalı olabilir.',
    description: (name, n, top) => `${turkishPossessive(name)} Puanla’daki ${n} mekânlık listesi${top ? `: ${top}` : ''}`,
    osm: 'Mekân bilgisi: © OpenStreetMap katkıcıları',
    tagline: 'Gittiğin yerleri puanla, arkadaşlarının favorilerini keşfet.',
  },
  en: {
    listOf: (name) => `${englishPossessive(name)} list`,
    places: (n) => `${n} ${n === 1 ? 'place' : 'places'}`,
    saves: (n) => `${n} ${n === 1 ? 'save' : 'saves'}`,
    save: 'Save list',
    open: 'Open in Puanla',
    ctaTitle: 'Save the list, rate it when you go',
    ctaText: 'On Puanla you see where your friends eat and the scores they give.',
    searchStore: 'Search for “Puanla” on the App Store.',
    download: 'Get Puanla',
    unrated: 'No score',
    notFoundTitle: 'This list no longer exists',
    notFoundText: 'It may have been deleted, or the link is wrong.',
    description: (name, n, top) => `${englishPossessive(name)} ${n}-place list on Puanla${top ? `: ${top}` : ''}`,
    osm: 'Place data: © OpenStreetMap contributors',
    tagline: 'Rate the places you go, discover your friends’ favorites.',
  },
};

/** Accept-Language ya da ?lang= → 'tr' | 'en' (uygulamadaki gibi: Türkçe değilse İngilizce) */
export function pickLanguage(param, acceptLanguage) {
  if (param === 'tr' || param === 'en') return param;
  const first = String(acceptLanguage ?? '').split(',')[0]?.trim().toLowerCase() ?? '';
  return first.startsWith('tr') ? 'tr' : first ? 'en' : 'tr';
}

/* ---------- Yardımcılar ---------- */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Türkçe iyelik eki (lib/possessive.ts ile aynı kural) */
function turkishPossessive(name) {
  const trimmed = String(name).trim();
  const vowels = 'aıeioöuüâîû';
  const lower = trimmed.toLocaleLowerCase('tr');
  const last = [...lower].reverse().find((c) => vowels.includes(c)) ?? 'e';
  const vowel = 'aı'.includes(last) ? 'ı' : 'ou'.includes(last) ? 'u' : 'öü'.includes(last) ? 'ü' : 'i';
  const endsWithVowel = vowels.includes(lower.at(-1) ?? '');
  return `${trimmed}'${endsWithVowel ? 'n' : ''}${vowel}n`;
}

const englishPossessive = (name) => (/s$/i.test(String(name).trim()) ? `${String(name).trim()}'` : `${String(name).trim()}'s`);

export const formatScore = (score, lang) => {
  const text = (Math.round(score * 10) / 10).toFixed(1);
  return lang === 'tr' ? text.replace('.', ',') : text;
};

/** Puan renk skalası (src/constants/theme.ts ile aynı) */
const SCORE_BANDS = [
  { min: 6.7, max: 10, from: '#65B32E', to: '#1E7B3C' },
  { min: 3.4, max: 6.6, from: '#F2A516', to: '#F5C518' },
  { min: 0, max: 3.3, from: '#B42318', to: '#EF4B3C' },
];
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbToHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
const mix = (a, b, t) => {
  const [x, y] = [hexToRgb(a), hexToRgb(b)];
  return rgbToHex(x.map((c, i) => c + (y[i] - c) * t));
};
export function scoreColor(score) {
  const band = SCORE_BANDS.find((b) => score >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
  const t = Math.min(1, Math.max(0, (score - band.min) / (band.max - band.min)));
  return mix(band.from, band.to, t);
}
export const scoreInk = (score) => mix(scoreColor(score), '#000000', score >= 3.4 && score < 6.7 ? 0.38 : 0.2);

/** Depolama yolu ya da tam adres → görsel adresi; `thumb` küçük kopya (_t.jpg) */
export function photoUrl(path, supabaseUrl, thumb = false) {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return thumb ? path.replace(/([?&])w=\d+/, '$1w=400') : path;
  const file = thumb ? path.replace(/\.jpg$/, '_t.jpg') : path;
  return `${supabaseUrl}/storage/v1/object/public/post-photos/${file.split('/').map(encodeURIComponent).join('/')}`;
}

const placeLine = (place) => [place.cuisine, place.neighborhood || place.district].filter(Boolean).join(' · ');

/* ---------- Sayfa ---------- */

/**
 * @param {object} data public_list() yanıtı: { list, items }
 * @param {'tr'|'en'} lang
 * @param {{ supabaseUrl: string, pageUrl: string, appStoreUrl?: string, appStoreId?: string }} config
 */
export function renderListPage(data, lang, config) {
  const t = TEXT[lang];
  const { list, items } = data;
  const author = list.author;
  const firstName = author.name.split(' ')[0] || author.username;
  const deepLink = `puanla://liste/${list.id}`;
  const cover = items.map((i) => photoUrl(i.place.photo, config.supabaseUrl)).find(Boolean);
  const avatar = photoUrl(author.avatar_path, config.supabaseUrl);
  const top = items
    .slice(0, 3)
    .map((i) => i.place.name)
    .join(', ');
  const description = list.description || t.description(firstName, list.place_count, top);
  const title = `${list.title} · ${t.listOf(firstName)}`;

  const stats = [t.places(list.place_count), list.save_count > 0 ? t.saves(list.save_count) : null].filter(Boolean).join(' · ');

  const rows = items
    .map((item, i) => {
      const thumb = photoUrl(item.place.photo, config.supabaseUrl, true);
      const score =
        item.score === null || item.score === undefined
          ? `<span class="unrated">${escapeHtml(t.unrated)}</span>`
          : `<span class="score" style="border-color:${scoreColor(item.score)};color:${scoreInk(item.score)}">${formatScore(item.score, lang)}</span>`;
      return `
      <li class="row">
        <span class="rank">${i + 1}</span>
        ${thumb ? `<img class="thumb" src="${escapeHtml(thumb)}" alt="" onerror="this.removeAttribute('src')" loading="lazy">` : '<span class="thumb empty"></span>'}
        <div class="info">
          <div class="name">${escapeHtml(item.place.name)}</div>
          <div class="sub">${escapeHtml(placeLine(item.place))}</div>
          ${item.note ? `<div class="note">“${escapeHtml(item.note)}”</div>` : ''}
        </div>
        ${score}
      </li>`;
    })
    .join('');

  const storeLink = config.appStoreUrl
    ? `<a class="button secondary" href="${escapeHtml(config.appStoreUrl)}">${escapeHtml(t.download)}</a>`
    : `<p class="hint">${escapeHtml(t.searchStore)}</p>`;

  return page({
    lang,
    title,
    description,
    image: cover,
    url: config.pageUrl,
    appStoreId: config.appStoreId,
    deepLink,
    body: `
    <main>
      <header class="brand"><span class="wordmark">puanla</span><span class="dot"></span></header>
      ${cover ? `<img class="cover" src="${escapeHtml(cover)}" alt="" onerror="this.removeAttribute('src')">` : ''}
      <p class="kicker">${escapeHtml(t.listOf(firstName))}</p>
      <h1>${escapeHtml(list.title)}</h1>
      ${list.description ? `<p class="description">${escapeHtml(list.description)}</p>` : ''}
      <div class="author">
        ${avatar ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="" onerror="this.removeAttribute('src')">` : `<span class="avatar initials">${escapeHtml(firstName[0] ?? '?')}</span>`}
        <span><strong>${escapeHtml(author.name)}</strong> <span class="muted">@${escapeHtml(author.username)} · ${escapeHtml(stats)}</span></span>
      </div>
      <a class="button primary js-open" href="${deepLink}">${escapeHtml(t.save)}</a>
      <ol class="rows">${rows}
      </ol>
      <section class="cta">
        <h2>${escapeHtml(t.ctaTitle)}</h2>
        <p>${escapeHtml(t.ctaText)}</p>
        <a class="button primary js-open" href="${deepLink}">${escapeHtml(t.open)}</a>
        ${storeLink}
      </section>
      <footer><a href="https://www.openstreetmap.org/copyright">${escapeHtml(t.osm)}</a></footer>
    </main>`,
    storeUrl: config.appStoreUrl,
  });
}

export function renderNotFound(lang) {
  const t = TEXT[lang];
  return page({
    lang,
    title: t.notFoundTitle,
    description: t.tagline,
    body: `
    <main class="center">
      <header class="brand"><span class="wordmark">puanla</span><span class="dot"></span></header>
      <h1>${escapeHtml(t.notFoundTitle)}</h1>
      <p class="description">${escapeHtml(t.notFoundText)}</p>
    </main>`,
  });
}

function page({ lang, title, description, image, url, appStoreId, deepLink, body, storeUrl }) {
  const meta = [
    `<meta property="og:site_name" content="Puanla">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    url ? `<meta property="og:url" content="${escapeHtml(url)}">` : '',
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    appStoreId
      ? `<meta name="apple-itunes-app" content="app-id=${escapeHtml(appStoreId)}${deepLink ? `, app-argument=${escapeHtml(deepLink)}` : ''}">`
      : '',
  ]
    .filter(Boolean)
    .join('\n  ');

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#FFFFFF">
  ${meta}
  <style>${CSS}</style>
</head>
<body>${body}
${deepLink ? openScript(storeUrl) : ''}
</body>
</html>`;
}

/**
 * "Listeyi kaydet": uygulama yüklüyse `puanla://` açılır; açılmazsa (sayfa hâlâ görünürse)
 * App Store'a gider. Alan adı + Universal Links gelince bu betiğe gerek kalmaz.
 */
function openScript(storeUrl) {
  return `<script>
document.querySelectorAll('.js-open').forEach(function (a) {
  a.addEventListener('click', function (e) {
    var store = ${JSON.stringify(storeUrl || '')};
    if (!store) return;
    e.preventDefault();
    var started = Date.now();
    window.location.href = a.getAttribute('href');
    setTimeout(function () {
      if (!document.hidden && Date.now() - started < 2500) window.location.href = store;
    }, 1400);
  });
});
</script>`;
}

const CSS = `
:root { --navy:#0F1E3D; --text:#111827; --muted:#6B7280; --faint:#9CA3AF; --border:#E5E7EB; --surface:#F5F6F8; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: #FFFFFF; color: var(--text);
  font: 17px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; }
main { max-width: 560px; margin: 0 auto; padding: 16px 16px 40px; }
main.center { text-align: center; padding-top: 25vh; }
a { color: var(--navy); }
.brand { display: flex; align-items: flex-end; gap: 3px; margin: 8px 0 20px; }
main.center .brand { justify-content: center; }
.wordmark { font: 700 26px/1 ui-serif, "New York", Georgia, serif; color: var(--navy); letter-spacing: -0.5px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: ${scoreColor(9)}; margin-bottom: 4px; }
.cover { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 16px; background: var(--surface); display: block; }
.kicker { margin: 20px 0 4px; font-size: 15px; font-weight: 600; color: var(--muted); }
h1 { margin: 0; font: 700 32px/1.15 ui-serif, "New York", Georgia, serif; color: var(--navy); letter-spacing: -0.3px; overflow-wrap: anywhere; }
.description { margin: 12px 0 0; color: var(--muted); font-size: 16px; overflow-wrap: anywhere; }
.author { display: flex; align-items: center; gap: 8px; margin: 16px 0; font-size: 15px; }
.author strong { font-weight: 600; }
.muted { color: var(--muted); }
.avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex: none; background: var(--surface); }
.avatar.initials { display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: var(--navy); }
.button { display: flex; align-items: center; justify-content: center; height: 50px; border-radius: 12px;
  font-weight: 600; font-size: 17px; text-decoration: none; }
.button.primary { background: var(--navy); color: #FFFFFF; }
.button.secondary { background: var(--surface); color: var(--navy); margin-top: 8px; }
.rows { list-style: none; margin: 16px 0 0; padding: 0; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.row:last-child { border-bottom: 0; }
.rank { width: 24px; flex: none; text-align: center; font: 700 20px ui-serif, Georgia, serif; color: var(--faint); font-variant-numeric: tabular-nums; }
.thumb { width: 56px; height: 56px; flex: none; border-radius: 12px; object-fit: cover; background: var(--surface); }
.info { flex: 1; min-width: 0; }
.name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.note { margin-top: 2px; font-size: 15px; font-style: italic; overflow-wrap: anywhere; }
.score { flex: none; width: 40px; height: 40px; border: 2px solid; border-radius: 50%; display: inline-flex;
  align-items: center; justify-content: center; font-weight: 700; font-size: 14px; font-variant-numeric: tabular-nums; }
.unrated { flex: none; font-size: 12px; color: var(--faint); }
.cta { margin-top: 32px; padding: 24px 20px; border-radius: 16px; background: var(--surface); text-align: center; }
.cta h2 { margin: 0 0 8px; font-size: 20px; color: var(--navy); }
.cta p { margin: 0 0 16px; color: var(--muted); font-size: 15px; }
.cta .hint { margin: 12px 0 0; font-size: 13px; }
footer { margin-top: 24px; text-align: center; font-size: 12px; }
footer a { color: var(--faint); }
`;
