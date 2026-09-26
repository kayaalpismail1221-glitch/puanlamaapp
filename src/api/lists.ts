import { unwrap } from '@/api/errors';
import { thumbUrl, toUser } from '@/api/mappers';
import { ingestPlaces, ingestUsers } from '@/data/entities';
import { supabase } from '@/lib/supabase';
import type { ListDetailsJson, ListJson } from '@/types/database';
import type { PlaceList, PlaceListItem } from '@/types';

/**
 * Paylaşılabilir listeler: kullanıcının kendi sıralamasından seçtiği mekânlar.
 * Sıra sunucuda sahibin güncel puanına göre gelir; yazma tek fonksiyonla (save_list).
 */

function toList(row: ListJson): PlaceList {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    author: toUser(row.author),
    placeCount: row.place_count,
    saveCount: row.save_count,
    covers: row.covers.map(thumbUrl),
    savedByMe: row.saved_by_me,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ingestLists(rows: ListJson[]): PlaceList[] {
  ingestUsers(rows.map((r) => r.author));
  return rows.map(toList);
}

export async function fetchUserLists(userId: string): Promise<PlaceList[]> {
  return ingestLists(unwrap(await supabase.rpc('user_lists', { p_user_id: userId })) as unknown as ListJson[]);
}

export async function fetchSavedLists(): Promise<PlaceList[]> {
  return ingestLists(unwrap(await supabase.rpc('saved_lists')) as unknown as ListJson[]);
}

export type ListDetails = { list: PlaceList; items: PlaceListItem[] };

export async function fetchListDetails(listId: string): Promise<ListDetails | null> {
  const json = unwrap(await supabase.rpc('list_details', { p_list_id: listId })) as unknown as ListDetailsJson | null;
  if (!json) return null;
  const [list] = ingestLists([json.list]);
  const places = ingestPlaces(json.items.map((i) => i.place));
  return {
    list: list!,
    items: json.items.map((i, n) => ({ place: places[n]!, score: i.score ?? undefined, note: i.note ?? undefined })),
  };
}

export type ListInput = {
  /** Düzenlenen listenin kimliği; yoksa yeni liste */
  id?: string;
  title: string;
  description?: string;
  items: { placeId: string; note?: string }[];
};

/** Listeyi oluşturur ya da günceller; liste kimliğini döner */
export async function saveList(input: ListInput): Promise<string> {
  return unwrap(
    await supabase.rpc('save_list', {
      p_id: input.id ?? null,
      p_title: input.title,
      p_description: input.description ?? null,
      p_place_ids: input.items.map((i) => i.placeId),
      p_notes: input.items.map((i) => i.note ?? null),
    }),
  );
}

export async function deleteList(listId: string) {
  unwrap(await supabase.from('lists').delete().eq('id', listId));
}

export async function setListSaved(listId: string, saved: boolean) {
  if (saved) {
    const { error } = await supabase.from('list_saves').insert({ list_id: listId });
    if (error && error.code !== '23505') throw error;
  } else {
    unwrap(await supabase.from('list_saves').delete().eq('list_id', listId));
  }
}
