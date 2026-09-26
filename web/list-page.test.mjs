/**
 * Web liste sayfası testleri: çizim, kaçış (XSS), dil seçimi ve istek işleyici.
 * Çalıştırma: npm run test:web
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import handler, { fetchList, readConfig } from './api/list.js';
import { formatScore, photoUrl, pickLanguage, renderListPage, renderNotFound, scoreColor } from './lib/list-page.js';

const LIST_ID = '11111111-2222-4333-8444-555555555555';

export const sample = {
  list: {
    id: LIST_ID,
    title: 'Kadıköy’de en iyi dürümcüler',
    description: 'Gece acıkınca <gidilecek> yerler',
    save_count: 12,
    place_count: 3,
    covers: [],
    saved_by_me: false,
    author: { id: 'u1', username: 'ismailk', name: 'İsmail Kayaalp', avatar_path: 'u1/avatar.jpg', school_id: null },
  },
  items: [
    {
      place: { id: 'p1', name: 'Dürümcü Hasan Usta', cuisine: 'Dürümcü', neighborhood: 'Moda', district: 'Kadıköy', photo: 'u1/post/0.jpg' },
      score: 9.4,
      note: 'Acılı iste',
    },
    {
      place: { id: 'p2', name: 'Ciğerci "Bekir" & Oğulları', cuisine: 'Ciğerci', neighborhood: '', district: 'Kadıköy', photo: 'https://images.example.com/x.jpg?w=1080' },
      score: 5.1,
      note: null,
    },
    { place: { id: 'p3', name: 'Yeni Yer', cuisine: 'Kafe', neighborhood: 'Yeldeğirmeni', district: 'Kadıköy', photo: null }, score: null, note: null },
  ],
};

const config = { supabaseUrl: 'https://abc.supabase.co', pageUrl: `https://puanla.app/l/${LIST_ID}` };

describe('liste sayfası', () => {
  test('başlık, sahibi, sıra, puanlar ve OG etiketleri', () => {
    const html = renderListPage(sample, 'tr', config);
    assert.match(html, /<title>Kadıköy’de en iyi dürümcüler · İsmail&#39;in listesi<\/title>/);
    assert.match(html, /property="og:title" content="Kadıköy’de en iyi dürümcüler · İsmail&#39;in listesi"/);
    assert.match(html, /property="og:image" content="https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/post-photos\/u1\/post\/0\.jpg"/);
    assert.match(html, /og:url" content="https:\/\/puanla\.app\/l\//);
    assert.match(html, /3 mekân · 12 kişi kaydetti/);
    assert.match(html, />9,4</);
    assert.match(html, />5,1</);
    assert.match(html, /Puanı yok/);
    assert.match(html, /“Acılı iste”/);
    assert.match(html, /href="puanla:\/\/liste\/11111111-2222-4333-8444-555555555555"/);
    assert.match(html, /© OpenStreetMap/);
    // Küçük kopya: depolamada _t.jpg, dış adreste genişlik küçülür
    assert.match(html, /post-photos\/u1\/post\/0_t\.jpg/);
    assert.match(html, /x\.jpg\?w=400/);
    // App Store adresi yoksa aratma önerisi, akıllı bant yok
    assert.match(html, /App Store’da “Puanla”yı aratıp/);
    assert.doesNotMatch(html, /apple-itunes-app/);
  });

  test('kullanıcı metinleri kaçışlanır', () => {
    const evil = structuredClone(sample);
    evil.list.title = '<script>alert(1)</script>';
    evil.items[0].note = '"><img src=x onerror=alert(1)>';
    const html = renderListPage(evil, 'tr', config);
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;gidilecek&gt;/);
    assert.match(html, /Ciğerci &quot;Bekir&quot; &amp; Oğulları/);
  });

  test('İngilizce, App Store bağlantısı ve akıllı bant', () => {
    const html = renderListPage(sample, 'en', { ...config, appStoreUrl: 'https://apps.apple.com/app/id123', appStoreId: '123' });
    assert.match(html, /<html lang="en">/);
    assert.match(html, /İsmail&#39;s list/);
    assert.match(html, /3 places · 12 saves/);
    assert.match(html, />9\.4</);
    assert.match(html, /href="https:\/\/apps\.apple\.com\/app\/id123"/);
    assert.match(html, /app-id=123, app-argument=puanla:\/\/liste\//);
  });

  test('yardımcılar', () => {
    assert.equal(pickLanguage(undefined, 'tr-TR,tr;q=0.9'), 'tr');
    assert.equal(pickLanguage(undefined, 'en-GB,en;q=0.8'), 'en');
    assert.equal(pickLanguage(undefined, undefined), 'tr');
    assert.equal(pickLanguage('en', 'tr-TR'), 'en');
    assert.equal(formatScore(10, 'tr'), '10,0');
    assert.equal(formatScore(6.7, 'en'), '6.7');
    assert.equal(scoreColor(10), '#1e7b3c');
    assert.equal(photoUrl(null, 'x'), undefined);
    assert.equal(renderNotFound('en').includes('This list no longer exists'), true);
  });
});

describe('istek işleyici', () => {
  const call = async (url, fetchResult) => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => fetchResult;
    process.env.SUPABASE_URL = 'https://abc.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
    try {
      await handler({ url, headers: { host: 'puanla.app', 'accept-language': 'tr' } }, res);
    } finally {
      globalThis.fetch = original;
    }
    return res;
  };

  test('liste bulunursa 200 ve önbellek başlığı', async () => {
    const res = await call(`/api/list?id=${LIST_ID}`, { ok: true, json: async () => sample });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['Cache-Control'], /s-maxage=60/);
    assert.match(res.body, /Dürümcü Hasan Usta/);
  });

  test('geçersiz kimlik, olmayan liste ve sunucu hatası', async () => {
    assert.equal((await call('/api/list?id=../../etc', null)).statusCode, 404);
    assert.equal((await call(`/api/list?id=${LIST_ID}`, { ok: true, json: async () => null })).statusCode, 404);
    assert.equal((await call(`/api/list?id=${LIST_ID}`, { ok: false, status: 500 })).statusCode, 502);
  });

  test('RPC isteği yalnızca publishable anahtarla', async () => {
    let request;
    await fetchList(LIST_ID, readConfig({ SUPABASE_URL: 'https://abc.supabase.co/', SUPABASE_PUBLISHABLE_KEY: 'k' }), async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => null };
    });
    assert.equal(request.url, 'https://abc.supabase.co/rest/v1/rpc/public_list');
    assert.deepEqual(request.init.headers, { apikey: 'k', 'Content-Type': 'application/json' });
    assert.equal(request.init.body, JSON.stringify({ p_list_id: LIST_ID }));
  });
});
