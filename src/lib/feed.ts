import { placeById } from '@/data/mock';
import { distanceKm, hotScore, nearestCity, type Coords } from '@/lib/geo';
import type { FeedArea, Post } from '@/types';

export type FeedEntry = { post: Post; distanceKm?: number };

export type PopularFeed =
  | { status: 'needs-location' }
  | {
      status: 'ok';
      entries: FeedEntry[];
      /** Başlıkta gösterilecek bölge adı */
      label: string;
      /** Yakınımda modunda kullanılan yarıçap */
      radiusKm?: number;
      /** Yakında gönderi yoksa gösterilen en yakın şehir */
      fallbackCity?: string;
    };

/** Yakında yeterli gönderi yoksa yarıçap genişler */
const RADII_KM = [3, 10, 30];
const MIN_POSTS = 5;

type Engagement = (post: Post) => { likes: number; comments: number };

const byHot = (engagement: Engagement) => (a: FeedEntry, b: FeedEntry) =>
  hotScore({ ...engagement(b.post), createdAt: b.post.createdAt }) -
  hotScore({ ...engagement(a.post), createdAt: a.post.createdAt });

export function areaLabel(area: FeedArea): string {
  if (area.type === 'near') return 'Yakınımda';
  return area.district ? `${area.district}, ${area.city}` : area.city;
}

/** Seçilen bölgedeki (ya da konuma yakın) gönderiler, popülerliğe göre */
export function popularFeed(
  posts: Post[],
  area: FeedArea,
  coords: Coords | null,
  engagement: Engagement,
): PopularFeed {
  const sort = byHot(engagement);

  if (area.type === 'area') {
    const entries = posts
      .filter((p) => {
        const place = placeById(p.placeId);
        return place && place.city === area.city && (!area.district || place.district === area.district);
      })
      .map((post) => ({ post }))
      .sort(sort);
    return { status: 'ok', entries, label: areaLabel(area) };
  }

  if (!coords) return { status: 'needs-location' };

  const withDistance = posts.flatMap((post) => {
    const place = placeById(post.placeId);
    return place ? [{ post, distanceKm: distanceKm(coords, place) }] : [];
  });

  // İlk yeterli yarıçap; hiçbiri yetmezse en çok gönderiyi kapsayan en küçük yarıçap
  const counts = RADII_KM.map((r) => withDistance.filter((e) => e.distanceKm <= r).length);
  const maxCount = Math.max(...counts);
  const index = counts.findIndex((c) => c >= MIN_POSTS);
  const radius = RADII_KM[index >= 0 ? index : counts.indexOf(maxCount)]!;

  if (maxCount > 0) {
    const nearby = withDistance.filter((e) => e.distanceKm <= radius).sort(sort);
    return { status: 'ok', entries: nearby, label: 'Yakınımda', radiusKm: radius };
  }

  // Yakında hiç gönderi yok: en yakın şehrin popüler gönderileri (uzaklık gösterilmez)
  const city = nearestCity(coords);
  if (!city) return { status: 'ok', entries: [], label: 'Yakınımda' };
  const entries = posts
    .filter((p) => placeById(p.placeId)?.city === city.name)
    .map((post) => ({ post }))
    .sort(sort);
  return { status: 'ok', entries, label: 'Yakınımda', fallbackCity: city.name };
}
