/**
 * Yasal metinlerin (src/constants/legal.ts) düz metin yedekleri. Asıl herkese açık sayfalar web sitesinde
 * (`npm run web:build`, `legalUrl` → https://expeat.app/gizlilik …); bunlar ona bağlantı verir.
 * - .txt: `--upload` ile Supabase Storage'daki herkese açık "legal" klasörüne yüklenir. Supabase güvenlik gereği
 *   HTML'i düz metin olarak sunduğundan (text/plain + sandbox) okunaklı düz metin kullanılır.
 *   Başa UTF-8 BOM eklenir; tarayıcılar Türkçe karakterleri doğru gösterir.
 * - .html: yerel önizleme (scripts/.cache/legal/).
 *
 * Çalıştırma: npm run legal:build            (yalnızca scripts/.cache/legal/ altına yazar)
 *             npm run legal:build -- --upload (SUPABASE_SERVICE_ROLE_KEY gerekir)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { legalUrl, SUPPORT_EMAIL } from '../../src/constants/contact.ts';
import { legalText } from '../../src/constants/legal.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'scripts/.cache/legal');
const BUCKET = 'legal';

const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const linkify = (s) =>
  escape(s).replaceAll(SUPPORT_EMAIL, `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`);

function page(lang, doc) {
  const text = legalText(lang, doc, SUPPORT_EMAIL);
  const other = lang === 'tr' ? 'en' : 'tr';
  const sections = text.sections
    .map(
      (s) => `<section>
      <h2>${escape(s.heading)}</h2>
      ${s.paragraphs.map((p) => (p.startsWith('• ') ? `<p class="item">${linkify(p.slice(2))}</p>` : `<p>${linkify(p)}</p>`)).join('\n      ')}
    </section>`,
    )
    .join('\n    ');
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(text.title)} · Expeat</title>
  <meta name="description" content="${escape(text.intro)}">
  <link rel="alternate" hreflang="${other}" href="${legalUrl(doc, other)}">
  <style>
    :root { --bg: #ffffff; --text: #111827; --muted: #6b7280; --primary: #0f1e3d; --line: #e5e7eb; color-scheme: light dark; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0b1220; --text: #e5e7eb; --muted: #9ca3af; --primary: #c7d2fe; --line: #1f2937; } }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    .brand { font: 700 26px/1 "New York", Georgia, serif; color: var(--primary); text-decoration: none; }
    .lang { color: var(--primary); font-weight: 600; text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px; font-size: 15px; }
    h1 { font-size: 32px; line-height: 1.2; margin: 0 0 8px; color: var(--primary); }
    .updated { color: var(--muted); font-size: 15px; margin: 0 0 24px; }
    .intro { font-size: 18px; }
    h2 { font-size: 20px; margin: 32px 0 8px; color: var(--primary); }
    p { margin: 0 0 12px; }
    p.item { padding-left: 20px; position: relative; }
    p.item::before { content: "•"; position: absolute; left: 4px; color: var(--muted); }
    a { color: var(--primary); }
    footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <header>
      <span class="brand">Expeat</span>
      <a class="lang" href="${legalUrl(doc, other)}" hreflang="${other}">${other === 'en' ? 'English' : 'Türkçe'}</a>
    </header>
    <h1>${escape(text.title)}</h1>
    <p class="updated">${escape(text.updated)}</p>
    <p class="intro">${linkify(text.intro)}</p>
    ${sections}
    <footer>© ${new Date().getFullYear()} Expeat · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></footer>
  </main>
</body>
</html>
`;
}

/** Okunaklı düz metin: başlıklar alt çizgili, maddeler girintili, satırlar ~78 karakterde kırılır */
function plain(lang, doc) {
  const text = legalText(lang, doc, SUPPORT_EMAIL);
  const other = lang === 'tr' ? 'en' : 'tr';
  const wrap = (s, indent = '') => {
    const words = s.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 78 - indent.length) {
        lines.push(line.trim());
        line = w;
      } else line += ' ' + w;
    }
    if (line.trim()) lines.push(line.trim());
    return lines.map((l, i) => (i === 0 ? l : indent + l)).join('\n');
  };
  const out = [
    'EXPEAT',
    '',
    text.title.toLocaleUpperCase(lang === 'tr' ? 'tr-TR' : 'en-US'),
    '='.repeat(text.title.length),
    text.updated,
    '',
    wrap(text.intro),
  ];
  for (const s of text.sections) {
    out.push('', '', s.heading, '-'.repeat(s.heading.length));
    for (const p of s.paragraphs) {
      out.push('');
      out.push(p.startsWith('• ') ? '  • ' + wrap(p.slice(2), '    ') : wrap(p));
    }
  }
  out.push('', '', `${lang === 'tr' ? 'English version' : 'Türkçe sürüm'}: ${legalUrl(doc, other)}`, '');
  return BOM + out.join('\n');
}

/** UTF-8 bayt sırası işareti: Supabase charset göndermese de tarayıcı metni UTF-8 okur */
const BOM = String.fromCharCode(0xfeff);

mkdirSync(outDir, { recursive: true });
const files = [];
for (const lang of ['tr', 'en']) {
  for (const doc of ['terms', 'privacy', 'support']) {
    writeFileSync(join(outDir, `${doc}-${lang}.html`), page(lang, doc));
    writeFileSync(join(outDir, `${doc}-${lang}.txt`), plain(lang, doc));
    files.push(`${doc}-${lang}.txt`);
  }
}
console.log(`Hazır (.txt + .html): ${files.join(', ')} → scripts/.cache/legal/`);

if (process.argv.includes('--upload')) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local içinde olmalı');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: bucket } = await supabase.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ['text/plain'] });
    if (error) throw error;
  } else {
    await supabase.storage.updateBucket(BUCKET, { public: true, allowedMimeTypes: ['text/plain'] });
  }
  // Önceki denemeden kalan HTML'ler (Supabase onları kaynak kod olarak gösteriyordu)
  await supabase.storage.from(BUCKET).remove(files.map((f) => f.replace('.txt', '.html')));
  for (const name of files) {
    const { error } = await supabase.storage.from(BUCKET).upload(name, readFileSync(join(outDir, name)), {
      contentType: 'text/plain; charset=utf-8',
      upsert: true,
      cacheControl: '300',
    });
    if (error) throw error;
    console.log(`yüklendi: ${url}/storage/v1/object/public/${BUCKET}/${name}`);
  }
}
