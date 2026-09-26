import { publicUrl } from '@/lib/supabase';
import type {
  CommentViewRow,
  PlaceViewRow,
  PostViewRow,
  ProfileViewRow,
  PublicProfileJson,
  RankingViewRow,
  SavedPlaceViewRow,
} from '@/types/database';
import type { Comment, Cuisine, Place, Post, RankedEntry, SavedPlace, User, UserProfile } from '@/types';

/**
 * Veritabanı satırlarını (snake_case) uygulama tiplerine çevirir.
 * Depolama yolları burada tam adrese dönüşür; ekranlar yalnızca adres görür.
 */

const isAbsolute = (path: string) => /^https?:\/\//.test(path);

export function mediaUrl(bucket: 'post-photos' | 'avatars', path?: string | null): string | undefined {
  if (!path) return undefined;
  return isAbsolute(path) ? path : publicUrl(bucket, path);
}

/**
 * Küçük boy kopya: yüklemede "<sıra>.jpg" yanına "<sıra>_t.jpg" de yüklenir.
 * Dış adreslerde (geliştirme verisi) genişlik parametresi küçültülür.
 */
export function thumbUrl(path: string): string {
  if (isAbsolute(path)) return path.replace(/([?&])w=\d+/, '$1w=400');
  return publicUrl('post-photos', path.replace(/\.jpg$/, '_t.jpg'));
}

export function toPlace(row: PlaceViewRow): Place {
  return {
    id: row.id,
    name: row.name,
    cuisine: row.cuisine as Cuisine,
    neighborhood: row.neighborhood,
    district: row.district,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address || undefined,
    phone: row.phone ?? undefined,
    website: row.website ?? undefined,
    closed: !!row.closed_at || undefined,
    photoUrl: mediaUrl('post-photos', row.photo),
    thumbUrl: row.photo ? thumbUrl(row.photo) : undefined,
  };
}

export function toUser(row: PublicProfileJson): User {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    avatarUrl: mediaUrl('avatars', row.avatar_path),
    schoolId: row.school_id ?? undefined,
  };
}

export function toUserProfile(row: ProfileViewRow): UserProfile {
  return {
    ...toUser(row),
    followerCount: row.follower_count,
    followingCount: row.following_count,
    postCount: row.post_count,
    isFollowing: row.is_following,
    followsMe: row.follows_me,
    joinedAt: row.created_at,
  };
}

export function toPost(row: PostViewRow): Post {
  return {
    id: row.id,
    userId: row.user_id,
    placeId: row.place_id,
    photos: row.photos.map((p) => mediaUrl('post-photos', p)!),
    thumbs: row.photos.map(thumbUrl),
    caption: row.caption ?? undefined,
    taggedUserIds: row.tagged.map((u) => u.id),
    score: row.score ?? undefined,
    createdAt: row.created_at,
    // Uygulama kendi beğenisini ayrıca ekler (iyimser güncelleme için)
    likeCount: Math.max(0, row.like_count - (row.liked_by_me ? 1 : 0)),
    commentCount: row.comment_count,
    likedByMe: row.liked_by_me,
    savedByMe: row.saved_by_me,
    meal: row.meal ?? undefined,
    highlights: row.highlights.length ? row.highlights : undefined,
  };
}

export function toComment(row: CommentViewRow): Comment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    text: row.body,
    createdAt: row.created_at,
    parentId: row.parent_id ?? undefined,
    likeCount: row.like_count,
    likedByMe: row.liked_by_me,
  };
}

export function toRankedEntry(row: RankingViewRow): RankedEntry {
  return { placeId: row.place_id, segment: row.segment, note: row.note ?? undefined, ratedAt: row.rated_at };
}

export function toSavedPlace(row: SavedPlaceViewRow): SavedPlace {
  return {
    placeId: row.place_id,
    origin: row.origin,
    link: row.link ?? undefined,
    note: row.note ?? undefined,
    savedAt: row.saved_at,
  };
}
