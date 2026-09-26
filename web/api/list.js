/**
 * GET /l/<liste>  (vercel.json bu yolu buraya yönlendirir: /api/list?id=<liste>)
 * Supabase `public_list` RPC'sini publishable (anon) anahtarla çağırır ve sayfayı sunucuda çizer;
 * WhatsApp/Instagram önizlemesi JavaScript çalıştırmadığı için OG etiketleri HTML'de olmalı.
 *
 * Ortam değişkenleri (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   zorunlu
 *   APP_STORE_URL                            isteğe bağlı: "İndir" düğmesi ve uygulama yoksa yönlendirme
 *   APP_STORE_ID                             isteğe bağlı: Safari'nin akıllı uygulama bandı
 */
import { pickLanguage, renderListPage, renderNotFound } from '../lib/list-page.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readConfig(env) {
  return {
    supabaseUrl: (env.SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, ''),
    key: env.SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    appStoreUrl: env.APP_STORE_URL || undefined,
    appStoreId: env.APP_STORE_ID || undefined,
  };
}

export async function fetchList(id, config, fetchImpl = fetch) {
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/public_list`, {
    method: 'POST',
    headers: { apikey: config.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_list_id: id }),
  });
  if (!response.ok) throw new Error(`public_list ${response.status}`);
  return response.json();
}

function send(res, status, html, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(html);
}

export default async function handler(req, res) {
  const url = new URL(req.url ?? '/', `https://${req.headers.host ?? 'localhost'}`);
  const id = url.searchParams.get('id') ?? '';
  const lang = pickLanguage(url.searchParams.get('lang'), req.headers['accept-language']);
  const config = readConfig(process.env);

  if (!UUID.test(id)) return send(res, 404, renderNotFound(lang), 'public, max-age=300');

  try {
    const data = await fetchList(id, config);
    if (!data) return send(res, 404, renderNotFound(lang), 'public, s-maxage=60');
    const pageUrl = `https://${req.headers.host}/l/${id}`;
    const html = renderListPage(data, lang, { ...config, pageUrl });
    // Liste değişince en geç bir dakikada güncellenir; arada önbellekten hızlı sunulur
    return send(res, 200, html, 'public, s-maxage=60, stale-while-revalidate=600');
  } catch (error) {
    console.error('[puanla] liste sayfası', error);
    return send(res, 502, renderNotFound(lang), 'no-store');
  }
}
