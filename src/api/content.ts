import * as Crypto from 'expo-crypto';
import { Image } from 'expo-image';

import { unwrap } from '@/api/errors';
import { mediaUrl, toComment, toUserProfile } from '@/api/mappers';
import { prepareImage, removeFiles, uploadImage, type LocalImage } from '@/api/storage';
import { ingestPlaces, ingestPosts, ingestUsers, upsertUsers } from '@/data/entities';
import type { Coords } from '@/lib/geo';
import type { LeaderboardEntry, LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboard';
import { supabase } from '@/lib/supabase';
import type { AreaViewRow, CorrectionField, PlaceDetailsJson, PopularFeedJson, ProfileViewRow } from '@/types/database';
import type { Comment, FeedArea, Meal, Place, Post, UserProfile } from '@/types';

/**
 * Paylaşılan içerik: feed, gönderiler, yorumlar, mekânlar, kişiler ve liderlik tablosu.
 * Gelen her kayıt ortak önbelleğe de yazılır (bkz. data/entities).
 */

const PAGE = 20;

/* ---------- Feed ---------- */

export type FeedEntry = { post: Post; distanceKm?: number };

/** Popüler feed sayfası: `asOf` sıralamanın sabit anı, sonraki sayfalarda aynen geri yollanır */
export type PopularCursor = { offset: number; asOf?: string };

export type PopularPage = {
  entries: FeedEntry[];
  radiusKm?: number;
  fallbackCity?: string;
  next?: PopularCursor;
};

export async function fetchPopularFeed(
  area: FeedArea,
  coords: Coords | null,
  cursor: PopularCursor = { offset: 0 },
): Promise<PopularPage> {
  const page = { p_offset: cursor.offset, p_limit: PAGE, p_as_of: cursor.asOf };
  const args =
    area.type === 'area'
      ? { p_city: area.city, p_district: area.district, ...page }
      : { p_latitude: coords?.latitude, p_longitude: coords?.longitude, ...page };
  const feed = unwrap(await supabase.rpc('feed_popular', args)) as unknown as PopularFeedJson;
  const posts = ingestPosts(feed.entries.map((e) => e.post));
  prefetchPostPhotos(posts);
  return {
    entries: posts.map((post, i) => ({ post, distanceKm: feed.entries[i]!.distance_km ?? undefined })),
    radiusKm: feed.radius_km ?? undefined,
    fallbackCity: feed.fallback_city ?? undefined,
    next: feed.entries.length === PAGE ? { offset: cursor.offset + PAGE, asOf: feed.as_of ?? cursor.asOf } : undefined,
  };
}

/** Takip feed'i; imleç son gönderinin tarihi */
export async function fetchFollowingFeed(before?: string): Promise<Post[]> {
  const posts = ingestPosts(unwrap(await supabase.rpc('feed_following', { p_before: before, p_limit: PAGE })));
  prefetchPostPhotos(posts);
  return posts;
}

/**
 * Yeni gelen sayfanın fotoğrafları kaydırmadan önce diske indirilir: kart ekrana girdiğinde
 * küçük kopya anında, tam boy çoğu zaman hazır olur.
 */
function prefetchPostPhotos(posts: Post[]) {
  const urls = posts.flatMap((p) => [p.thumbs[0], p.photos[0]].filter((u): u is string => !!u));
  if (urls.length) Image.prefetch(urls, 'disk').catch(() => {});
}

export async function fetchUserPosts(userId: string, before?: string): Promise<Post[]> {
  return ingestPosts(unwrap(await supabase.rpc('list_posts', { p_user_id: userId, p_before: before, p_limit: 60 })));
}

export async function fetchPlacePosts(placeId: string, before?: string): Promise<Post[]> {
  return ingestPosts(unwrap(await supabase.rpc('list_posts', { p_place_id: placeId, p_before: before, p_limit: 60 })));
}

export async function fetchSavedPosts(offset = 0): Promise<Post[]> {
  return ingestPosts(unwrap(await supabase.rpc('saved_posts', { p_offset: offset, p_limit: 60 })));
}

/* ---------- Gönderi paylaşma ---------- */

export type NewPost = {
  placeId: string;
  photos: LocalImage[];
  caption?: string;
  meal?: Meal;
  highlights: string[];
  taggedUserIds: string[];
};

/**
 * Fotoğrafları küçültüp yükler, sonra gönderiyi tek işlemde oluşturur.
 * Bir adım başarısız olursa yüklenen fotoğraflar silinir.
 * `onProgress`: 0–1 arası ilerleme (yükleme çubuğu için).
 */
export async function createPost(userId: string, input: NewPost, onProgress?: (p: number) => void): Promise<Post> {
  const id = Crypto.randomUUID();
  const uploaded: string[] = [];
  const steps = input.photos.length * 2 + 1;
  let done = 0;
  const tick = () => onProgress?.(++done / steps);

  try {
    const photos = await Promise.all(
      input.photos.map(async (photo, i) => {
        const base = `${userId}/${id}/${i}`;
        const [full, thumb] = await Promise.all([prepareImage(photo, 1440, 0.8), prepareImage(photo, 480, 0.7)]);
        await uploadImage('post-photos', `${base}.jpg`, full.uri);
        uploaded.push(`${base}.jpg`);
        tick();
        await uploadImage('post-photos', `${base}_t.jpg`, thumb.uri);
        uploaded.push(`${base}_t.jpg`);
        tick();
        return { path: `${base}.jpg`, width: full.width, height: full.height };
      }),
    );

    const rows = unwrap(
      await supabase.rpc('create_post', {
        p_id: id,
        p_place_id: input.placeId,
        p_caption: input.caption ?? null,
        // Fiyat ve yenilenler artık sorulmuyor; sütunlar eski gönderiler için duruyor
        p_price: null,
        p_meal: input.meal ?? null,
        p_dishes: [],
        p_highlights: input.highlights,
        p_tagged: input.taggedUserIds,
        p_photos: photos,
      }),
    );
    tick();
    const [post] = ingestPosts(rows);
    if (!post) throw new Error('Gönderi oluşturulamadı');
    return post;
  } catch (error) {
    removeFiles('post-photos', uploaded).catch(() => {});
    throw error;
  }
}

export type PostPatch = { caption?: string; meal?: Meal; highlights: string[] };

/** Gönderinin metin bilgilerini düzenler (fotoğraflar ve puan değişmez); güncel gönderiyi döner */
export async function updatePost(post: Post, patch: PostPatch): Promise<Post> {
  unwrap(
    await supabase
      .from('posts')
      .update({ caption: patch.caption ?? null, meal: patch.meal ?? null, highlights: patch.highlights })
      .eq('id', post.id),
  );
  return {
    ...post,
    caption: patch.caption,
    meal: patch.meal,
    highlights: patch.highlights.length ? patch.highlights : undefined,
  };
}

export async function deletePost(userId: string, post: Post) {
  unwrap(await supabase.from('posts').delete().eq('id', post.id));
  // Fotoğrafları arka planda temizle (tam boy ve küçük kopyalar)
  const paths = post.photos.flatMap((_, i) => [`${userId}/${post.id}/${i}.jpg`, `${userId}/${post.id}/${i}_t.jpg`]);
  removeFiles('post-photos', paths).catch(() => {});
}

/* ---------- Beğeni, kaydetme, yorum, şikâyet ---------- */

export async function setLiked(postId: string, liked: boolean) {
  if (liked) {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId });
    if (error && error.code !== '23505') throw error;
  } else {
    unwrap(await supabase.from('post_likes').delete().eq('post_id', postId));
  }
}

export async function setPostSaved(postId: string, saved: boolean) {
  if (saved) {
    const { error } = await supabase.from('post_saves').insert({ post_id: postId });
    if (error && error.code !== '23505') throw error;
  } else {
    unwrap(await supabase.from('post_saves').delete().eq('post_id', postId));
  }
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const rows = unwrap(
    await supabase.from('comment_view').select('*').eq('post_id', postId).order('created_at').limit(500),
  );
  ingestUsers(rows.map((r) => r.author));
  return rows.map(toComment);
}

export async function addComment(postId: string, text: string): Promise<Comment> {
  const row = unwrap(await supabase.from('comments').insert({ post_id: postId, body: text }).select().single());
  return { id: row.id, postId: row.post_id, userId: row.user_id, text: row.body, createdAt: row.created_at };
}

export async function deleteComment(commentId: string) {
  unwrap(await supabase.from('comments').delete().eq('id', commentId));
}

export type ReportReason = 'spam' | 'offensive' | 'fake' | 'other';

export async function report(target: { postId?: string; commentId?: string; userId?: string }, reason: ReportReason) {
  unwrap(
    await supabase.from('reports').insert({
      post_id: target.postId ?? null,
      comment_id: target.commentId ?? null,
      user_id: target.userId ?? null,
      reason,
    }),
  );
}

export async function block(userId: string) {
  const { error } = await supabase.from('blocks').insert({ blocked_id: userId });
  if (error && error.code !== '23505') throw error;
}

export type BlockedUser = { id: string; name: string; username: string; avatarUrl?: string };

/** Engellediğin kişiler (Ayarlar > Engellenenler) */
export async function fetchBlockedUsers(): Promise<BlockedUser[]> {
  const rows = unwrap(await supabase.rpc('blocked_users'));
  return rows.map((r) => ({ id: r.id, name: r.name, username: r.username, avatarUrl: mediaUrl('avatars', r.avatar_path) }));
}

export async function unblock(userId: string) {
  unwrap(await supabase.from('blocks').delete().eq('blocked_id', userId));
}

/* ---------- Mekânlar ---------- */

export type MapBounds = { south: number; west: number; north: number; east: number };
export type RatedPlace = { place: Place; average: number; count: number };

/** Haritada görünen bölgede Puanla kullanıcılarının puanladığı mekânlar ve topluluk ortalaması */
export async function fetchMapPlaces(bounds: MapBounds): Promise<RatedPlace[]> {
  const rows = unwrap(
    await supabase.rpc('map_places', {
      p_south: bounds.south,
      p_west: bounds.west,
      p_north: bounds.north,
      p_east: bounds.east,
    }),
  );
  const places = ingestPlaces(rows);
  return rows.map((r, i) => ({ place: places[i]!, average: r.average, count: r.rating_count }));
}

export async function searchPlaces(query: string, coords: Coords | null): Promise<Place[]> {
  const rows = unwrap(
    await supabase.rpc('search_places', {
      p_query: query,
      p_latitude: coords?.latitude,
      p_longitude: coords?.longitude,
      p_limit: 30,
    }),
  );
  return ingestPlaces(rows);
}

export type NewPlace = Pick<Place, 'name' | 'cuisine' | 'neighborhood' | 'district' | 'city' | 'latitude' | 'longitude'> & {
  address: string;
};

/**
 * Veritabanında olmayan bir mekânı ekler (günlük sınır veritabanında). Sınırları bilinen bölgede
 * (İstanbul) il/ilçe/mahalleyi veritabanı koordinattan yazar; burada gönderilenler yalnızca dışarısı için.
 */
export async function createPlace(input: NewPlace): Promise<Place> {
  const { id } = unwrap(
    await supabase
      .from('places')
      .insert({
        name: input.name.trim(),
        cuisine: input.cuisine,
        neighborhood: input.neighborhood.trim(),
        district: input.district.trim(),
        city: input.city.trim(),
        address: input.address.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
      })
      .select('id')
      .single(),
  );
  const rows = unwrap(await supabase.from('place_view').select('*').eq('id', id));
  return ingestPlaces(rows)[0]!;
}

/**
 * "Bilgi yanlış mı?" önerisi. Tek kişinin önerisi beklemeye alınır; bağımsız bir kişi daha aynısını
 * söyleyince (kapandı için iki kişi daha) ya da yönetici onaylayınca uygulanır.
 */
export async function suggestPlaceCorrection(
  placeId: string,
  field: CorrectionField,
  input: { value?: string; coords?: Coords } = {},
): Promise<'applied' | 'pending'> {
  return unwrap(
    await supabase.rpc('suggest_place_correction', {
      p_place_id: placeId,
      p_field: field,
      p_value: input.value ?? null,
      p_latitude: input.coords?.latitude ?? null,
      p_longitude: input.coords?.longitude ?? null,
    }),
  );
}

export type AreaAt = { city: string; district: string; neighborhood: string };

/** Koordinattaki il/ilçe/mahalle; sınırları bilinmeyen bölgede null (o zaman kullanıcı yazar) */
export async function fetchAreaAt(coords: Coords): Promise<AreaAt | null> {
  const rows = unwrap(await supabase.rpc('area_at', { p_latitude: coords.latitude, p_longitude: coords.longitude }));
  return rows[0] ?? null;
}

export type PlaceDetails = {
  place: Place;
  rating?: { average: number; count: number };
  postCount: number;
  summary: {
    highlights: { label: string; count: number }[];
  };
  /** Takip edilenlerin puanları, yüksekten düşüğe */
  friends: { userId: string; score: number; postId?: string }[];
};

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails | null> {
  const details = unwrap(await supabase.rpc('place_details', { p_place_id: placeId })) as unknown as PlaceDetailsJson | null;
  if (!details) return null;
  const [place] = ingestPlaces([details.place]);
  ingestUsers(details.friends.map((f) => f.user));
  return {
    place: place!,
    rating: details.rating.count ? { average: details.rating.average ?? 0, count: details.rating.count } : undefined,
    postCount: details.post_count,
    summary: {
      highlights: details.summary.highlights,
    },
    friends: details.friends.map((f) => ({ userId: f.user.id, score: f.score, postId: f.post_id ?? undefined })),
  };
}

export type Recommendation = {
  place: Place;
  friendAverage?: number;
  friendCount: number;
  communityAverage: number;
  communityCount: number;
  distanceKm?: number;
};

/** Sana özel öneriler: arkadaşlarının ve topluluğun beğendiği, henüz gitmediğin mekânlar */
export async function fetchRecommendations(coords: Coords | null): Promise<Recommendation[]> {
  const rows = unwrap(
    await supabase.rpc('recommended_places', {
      p_latitude: coords?.latitude,
      p_longitude: coords?.longitude,
      p_limit: 40,
    }),
  );
  const places = ingestPlaces(rows);
  return rows.map((r, i) => ({
    place: places[i]!,
    friendAverage: r.friend_average ?? undefined,
    friendCount: r.friend_count,
    communityAverage: r.community_average,
    communityCount: r.community_count,
    distanceKm: r.distance_km ?? undefined,
  }));
}

export type FriendScore = { average: number; count: number };

export async function fetchFriendScores(placeIds: string[]): Promise<Record<string, FriendScore>> {
  if (!placeIds.length) return {};
  const rows = unwrap(await supabase.rpc('friend_scores', { p_place_ids: placeIds }));
  return Object.fromEntries(rows.map((r) => [r.place_id, { average: r.average, count: r.count }]));
}

export type District = { name: string; center: Coords; placeCount: number; postCount: number };
export type City = { name: string; center: Coords; postCount: number; districts: District[] };

/** Konum seçici için şehirler ve ilçeleri */
export async function fetchAreas(): Promise<City[]> {
  const rows: AreaViewRow[] = unwrap(await supabase.from('area_view').select('*'));
  const byCity = new Map<string, AreaViewRow[]>();
  for (const r of rows) {
    const list = byCity.get(r.city);
    if (list) list.push(r);
    else byCity.set(r.city, [r]);
  }
  return [...byCity.entries()]
    .map(([name, list]) => {
      const total = list.reduce((s, r) => s + r.place_count, 0);
      return {
        name,
        // Şehir merkezi: ilçe merkezlerinin mekân sayısıyla ağırlıklı ortalaması
        center: {
          latitude: list.reduce((s, r) => s + r.latitude * r.place_count, 0) / total,
          longitude: list.reduce((s, r) => s + r.longitude * r.place_count, 0) / total,
        },
        postCount: list.reduce((s, r) => s + r.post_count, 0),
        districts: list
          .map((r) => ({
            name: r.district,
            center: { latitude: r.latitude, longitude: r.longitude },
            placeCount: r.place_count,
            postCount: r.post_count,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

/* ---------- Kişiler ---------- */

function ingestProfiles(rows: ProfileViewRow[]): UserProfile[] {
  const profiles = rows.map(toUserProfile);
  upsertUsers(profiles.map(({ id, name, username, avatarUrl, schoolId }) => ({ id, name, username, avatarUrl, schoolId })));
  return profiles;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  return ingestProfiles(unwrap(await supabase.from('profile_view').select('*').eq('id', userId)))[0] ?? null;
}

export async function searchUsers(query: string): Promise<UserProfile[]> {
  return ingestProfiles(unwrap(await supabase.rpc('search_users', { p_query: query, p_limit: 30 })));
}

export async function fetchSuggestedUsers(limit = 30): Promise<UserProfile[]> {
  return ingestProfiles(unwrap(await supabase.rpc('suggested_users', { p_limit: limit })));
}

export async function fetchConnections(userId: string, kind: 'followers' | 'following'): Promise<UserProfile[]> {
  const fn = kind === 'followers' ? 'followers_of' : 'following_of';
  return ingestProfiles(unwrap(await supabase.rpc(fn, { p_user_id: userId, p_limit: 100 })));
}

/** Başka bir kullanıcının sıralaması (Gittikleri), puana göre */
export async function fetchUserRankings(userId: string): Promise<{ placeId: string; score: number; ratedAt: string }[]> {
  const rows = unwrap(
    await supabase.from('ranking_view').select('*').eq('user_id', userId).order('score', { ascending: false }),
  );
  ingestPlaces(rows.map((r) => r.place));
  return rows.map((r) => ({ placeId: r.place_id, score: r.score, ratedAt: r.rated_at }));
}

/* ---------- Liderlik tablosu ---------- */

export async function fetchLeaderboard(
  scope: LeaderboardScope,
  period: LeaderboardPeriod,
  schoolId?: string,
): Promise<LeaderboardEntry[]> {
  const rows = unwrap(
    await supabase.rpc('leaderboard', { p_scope: scope, p_period: period, p_school_id: schoolId, p_limit: 100 }),
  );
  ingestUsers(rows.map((r) => r.profile));
  return rows.map((r) => ({ userId: r.user_id, reviews: r.reviews, likes: r.likes, rank: r.rank }));
}

export async function fetchUserRank(userId: string): Promise<number | null> {
  return unwrap(await supabase.rpc('user_rank', { p_user_id: userId }));
}

