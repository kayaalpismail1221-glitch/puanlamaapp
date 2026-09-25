import { unwrap } from '@/api/errors';
import { toPlace, toUser } from '@/api/mappers';
import { upsertPlaces, upsertUsers } from '@/data/entities';
import { supabase } from '@/lib/supabase';
import type { Place, User } from '@/types';

/**
 * Rehber eşleştirme ve davetler (masa döngüsü).
 * Numaralar sunucuda yalnızca özetiyle saklanır; eşleşmede yalnızca SMS'le doğrulanmış numaralar sayılır.
 */

export type ContactMatch = { phone: string; user: User; following: boolean };

/**
 * Numaralardan Puanla'da olanlar. `save`: rehberin tamamı gönderiliyorsa sunucu saklar ve
 * rehberdeki kişi sonradan katılınca "arkadaşın katıldı" bildirimi gönderir.
 */
export async function matchContacts(phones: string[], save = false): Promise<ContactMatch[]> {
  const rows = unwrap(await supabase.rpc('match_contacts', { p_phones: phones, p_save: save }));
  const matches = rows.map((r) => ({ phone: r.phone, user: toUser(r.user), following: r.following }));
  upsertUsers(matches.map((m) => m.user));
  return matches;
}

/** Gönderide etiketlenen, uygulamada olmayan kişiler; katılınca davet edene haber verilir */
export async function createInvites(placeId: string, phones: string[], postId?: string) {
  if (!phones.length) return;
  unwrap(await supabase.rpc('create_invites', { p_place_id: placeId, p_phones: phones, p_post_id: postId ?? null }));
}

export type Invite = {
  inviter: User;
  place: Place;
  inviterScore?: number;
  myScore?: number;
  following: boolean;
};

/** Beni davet edenler (onboarding davet bağlamıyla başlar) */
export async function fetchMyInvites(): Promise<Invite[]> {
  const rows = unwrap(await supabase.rpc('my_invites'));
  const invites = rows
    .filter((r) => !!r.place)
    .map((r) => ({
      inviter: toUser(r.inviter),
      place: toPlace(r.place),
      inviterScore: r.inviter_score ?? undefined,
      myScore: r.my_score ?? undefined,
      following: r.following,
    }));
  upsertUsers(invites.map((i) => i.inviter));
  upsertPlaces(invites.map((i) => i.place));
  return invites;
}
