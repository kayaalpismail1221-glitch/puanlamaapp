import type { ShareIntent } from 'expo-share-intent';

import { normalizeUrl } from '@/lib/links';

/**
 * Başka uygulamadan (Instagram Reels, TikTok, Safari…) "Paylaş → Puanla" ile gelen içerik.
 * Bağlantı Listem'e "Sosyal medyadan" kaydı olarak eklenir; mümkünse mekân adı tahmin edilir.
 */

/** Paylaşılan bağlantı: doğrudan URL ya da metnin içindeki ilk bağlantı */
export function sharedLink(intent: ShareIntent): string | undefined {
  const url = intent.webUrl ?? intent.text?.match(/https?:\/\/\S+/)?.[0];
  return url ? normalizeUrl(url) : undefined;
}

/**
 * Yemek paylaşımlarında mekân çoğu zaman 📍 ile yazılır: "📍Karaköy Lokantası | Beyoğlu".
 * Bulunursa mekân aramasına ön doldurma olarak kullanılır.
 */
export function pinnedPlace(text?: string | null): string | undefined {
  const match = text?.match(/📍\s*([^\n|,#@•·]+)/u);
  const name = match?.[1]?.trim().slice(0, 60);
  return name && name.length >= 2 ? name : undefined;
}

/**
 * TikTok videosunun açıklaması (herkese açık oEmbed; anahtar gerekmez). Instagram açıklamayı
 * izinsiz vermez, orada yalnızca paylaşılan metne bakılır. Yavaş ağda paylaşımı bekletmesin diye kısa zaman aşımı.
 */
export async function tiktokCaption(link: string, timeoutMs = 2500): Promise<string | undefined> {
  if (!/tiktok\.com/i.test(link)) return undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link)}`, { signal: controller.signal });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { title?: string };
    return data.title || undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Mekân araması için öneri: paylaşılan metin/sayfa başlığı ya da TikTok açıklamasındaki 📍 */
export async function placeHint(intent: ShareIntent, link: string | undefined): Promise<string | undefined> {
  const local = pinnedPlace(intent.text) ?? pinnedPlace(intent.meta?.title);
  if (local) return local;
  return link ? pinnedPlace(await tiktokCaption(link)) : undefined;
}
