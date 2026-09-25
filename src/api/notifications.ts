import { unwrap } from '@/api/errors';
import { thumbUrl, toUser } from '@/api/mappers';
import { upsertUsers } from '@/data/entities';
import { supabase } from '@/lib/supabase';
import type { AppNotification, NotificationKind } from '@/types';
import type { NotificationRow } from '@/types/database';

/**
 * Bildirimler: bildirim merkezi, okunmamış sayısı, push jetonu ve push tercihleri.
 * Bildirimleri veritabanı tetikleyicileri oluşturur; uygulama yalnızca okur.
 */

export const NOTIFICATION_PAGE = 30;

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.type,
    createdAt: row.created_at,
    read: !!row.read_at,
    actor: toUser(row.actor),
    postId: row.post_id ?? undefined,
    placeId: row.place_id ?? undefined,
    placeName: row.place_name ?? undefined,
    thumbUrl: row.photo ? thumbUrl(row.photo) : undefined,
    comment: row.comment ?? undefined,
    score: row.score ?? undefined,
    myScore: row.my_score ?? undefined,
    following: row.following,
  };
}

export async function fetchNotifications(before?: string): Promise<AppNotification[]> {
  const rows = unwrap(
    await supabase.rpc('my_notifications', { p_before: before ?? null, p_limit: NOTIFICATION_PAGE }),
  ) as NotificationRow[];
  const list = rows.map(toNotification);
  upsertUsers(list.map((n) => n.actor));
  return list;
}

export async function fetchUnreadCount(): Promise<number> {
  return unwrap(await supabase.rpc('unread_notification_count')) ?? 0;
}

export async function markAllRead() {
  unwrap(await supabase.rpc('mark_notifications_read'));
}

export async function registerPushToken(token: string, locale: 'tr' | 'en') {
  unwrap(await supabase.rpc('register_push_token', { p_token: token, p_locale: locale }));
}

export async function unregisterPushToken(token: string) {
  unwrap(await supabase.rpc('unregister_push_token', { p_token: token }));
}

/** Push almak istenmeyen türler */
export async function fetchMutedKinds(userId: string): Promise<NotificationKind[]> {
  const row = unwrap(
    await supabase.from('profile_private').select('push_muted').eq('user_id', userId).maybeSingle(),
  );
  return row?.push_muted ?? [];
}

export async function setMutedKinds(userId: string, kinds: NotificationKind[]) {
  unwrap(await supabase.from('profile_private').update({ push_muted: kinds }).eq('user_id', userId));
}
