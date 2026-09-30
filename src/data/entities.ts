import { useEffect, useSyncExternalStore } from 'react';

import { toPlace, toPost, toUser } from '@/api/mappers';
import { supabase } from '@/lib/supabase';
import type { PlaceViewRow, PostViewRow, PublicProfileJson } from '@/types/database';
import type { Place, Post, User } from '@/types';

/**
 * Mekân, kullanıcı ve gönderiler için ortak önbellek.
 *
 * Feed, arama ve profil sorguları gelen her kaydı buraya yazar; ekranlar kimlikle
 * (`usePlace(id)` gibi) anında okur. Önbellekte olmayan kayıtlar küçük gruplar hâlinde
 * tek istekle çekilir. Böylece bir gönderiden mekân sayfasına geçince veri beklenmez.
 */

type Kind = 'place' | 'user' | 'post';

const stores = {
  place: new Map<string, Place>(),
  user: new Map<string, User>(),
  post: new Map<string, Post>(),
};

/** Sunucuda bulunamayan (silinmiş ya da erişilemeyen) kimlikler */
const missing: Record<Kind, Set<string>> = { place: new Set(), user: new Set(), post: new Set() };
/** Son isteği ağ/sunucu hatası veren kimlikler: ekran sonsuz beklemek yerine "Tekrar dene" gösterir */
const failed: Record<Kind, Set<string>> = { place: new Set(), user: new Set(), post: new Set() };

const listeners = new Set<() => void>();
let version = 0;
let emitScheduled = false;

/** Aynı anda gelen birçok güncellemeyi tek yeniden çizime indirir */
function emit() {
  version += 1;
  if (emitScheduled) return;
  emitScheduled = true;
  queueMicrotask(() => {
    emitScheduled = false;
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function upsert<T extends { id: string }>(kind: Kind, items: T[]) {
  if (!items.length) return;
  const store = stores[kind] as unknown as Map<string, T>;
  for (const item of items) {
    store.set(item.id, item);
    missing[kind].delete(item.id);
    failed[kind].delete(item.id);
  }
  emit();
}

export const upsertPlaces = (places: Place[]) => upsert('place', places);
export const upsertUsers = (users: User[]) => upsert('user', users);
export const upsertPosts = (posts: Post[]) => upsert('post', posts);

export const getPlace = (id: string) => stores.place.get(id);
export const getUser = (id: string) => stores.user.get(id);

/* ---------- Sunucu satırlarını içeri alma ---------- */

export function ingestPlaces(rows: PlaceViewRow[]): Place[] {
  const places = rows.map(toPlace);
  upsertPlaces(places);
  return places;
}

export function ingestUsers(rows: PublicProfileJson[]): User[] {
  const users = rows.map(toUser);
  upsertUsers(users);
  return users;
}

/** Gönderileri ve içlerindeki mekân, yazar ve etiketlenen kişileri önbelleğe yazar */
export function ingestPosts(rows: PostViewRow[]): Post[] {
  const posts = rows.map(toPost);
  ingestPlaces(rows.map((r) => r.place));
  ingestUsers(rows.flatMap((r) => [r.author, ...r.tagged]));
  upsertPosts(posts);
  return posts;
}

/** Gönderinin yorum sayısını her listede günceller */
export function adjustCommentCount(id: string, delta: number) {
  const post = stores.post.get(id);
  if (!post) return;
  stores.post.set(id, { ...post, commentCount: Math.max(0, post.commentCount + delta) });
  emit();
}

export function removePost(id: string) {
  if (stores.post.delete(id)) {
    missing.post.add(id);
    emit();
  }
}

/** Oturum kapanınca her şeyi unut */
export function clearEntities() {
  for (const kind of Object.keys(stores) as Kind[]) {
    stores[kind].clear();
    missing[kind].clear();
    failed[kind].clear();
  }
  emit();
}

/* ---------- Eksik kayıtları gruplayarak çekme ---------- */

const pending: Record<Kind, Set<string>> = { place: new Set(), user: new Set(), post: new Set() };
const inflight: Record<Kind, Set<string>> = { place: new Set(), user: new Set(), post: new Set() };
let flushScheduled = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function request(kind: Kind, id: string) {
  if (!UUID.test(id)) {
    missing[kind].add(id);
    return;
  }
  if (stores[kind].has(id) || missing[kind].has(id) || inflight[kind].has(id)) return;
  // Yeniden deneniyor: hata ekranı yerine yeniden yükleniyor görünsün
  if (failed[kind].delete(id)) emit();
  pending[kind].add(id);
  if (!flushScheduled) {
    flushScheduled = true;
    setTimeout(flush, 16);
  }
}

async function load(kind: Kind, ids: string[]) {
  switch (kind) {
    case 'place': {
      const { data, error } = await supabase.from('place_view').select('*').in('id', ids);
      if (error) throw error;
      return ingestPlaces(data);
    }
    case 'user': {
      const { data, error } = await supabase.from('profile_view').select('*').in('id', ids);
      if (error) throw error;
      return ingestUsers(data);
    }
    case 'post': {
      const { data, error } = await supabase.from('post_view').select('*').in('id', ids);
      if (error) throw error;
      return ingestPosts(data);
    }
  }
}

/** Tek istekteki en fazla kimlik: `in (...)` adreste taşınır, çok uzun adresi sunucu reddeder */
const BATCH_SIZE = 100;

function flush() {
  flushScheduled = false;
  for (const kind of Object.keys(pending) as Kind[]) {
    const all = [...pending[kind]];
    pending[kind].clear();
    for (let i = 0; i < all.length; i += BATCH_SIZE) loadBatch(kind, all.slice(i, i + BATCH_SIZE));
  }
}

function loadBatch(kind: Kind, ids: string[]) {
  ids.forEach((id) => inflight[kind].add(id));
  load(kind, ids)
    .then((found) => {
      const got = new Set(found.map((f) => f.id));
      for (const id of ids) if (!got.has(id)) missing[kind].add(id);
      emit();
    })
    // Ağ hatasında "bulunamadı" demeyelim: hata olarak işaretlenir, ekran "Tekrar dene" gösterir
    .catch((error) => {
      if (__DEV__) console.warn('[puanla] önbellek yüklenemedi', kind, error);
      ids.forEach((id) => failed[kind].add(id));
      emit();
    })
    .finally(() => ids.forEach((id) => inflight[kind].delete(id)));
}

/* ---------- Kancalar ---------- */

/**
 * Kaydı önbellekten okur, yoksa sunucudan ister.
 * Dönüş: kayıt | undefined (yükleniyor) | null (bulunamadı)
 */
function useEntity<T>(kind: Kind, id: string | undefined): T | null | undefined {
  const value = useSyncExternalStore(subscribe, () => {
    if (!id) return undefined;
    const item = stores[kind].get(id) as T | undefined;
    if (item) return item;
    return missing[kind].has(id) ? null : undefined;
  });
  useEffect(() => {
    if (id && value === undefined) request(kind, id);
  }, [kind, id, value]);
  return value;
}

/**
 * Kayıt yüklenemediyse (ağ hatası) yeniden deneme işlevi, değilse null. `usePost` vb. `undefined` döndürürken
 * yükleniyor mu yoksa takıldı mı ayırmak için: `retry ? <ErrorView onRetry={retry} /> : <LoadingView />`.
 */
export function useEntityRetry(kind: Kind, id: string | undefined): (() => void) | null {
  const isFailed = useSyncExternalStore(subscribe, () => !!id && failed[kind].has(id));
  return isFailed && id ? () => request(kind, id) : null;
}

export const usePlace = (id: string | undefined) => useEntity<Place>('place', id);
export const useUser = (id: string | undefined) => useEntity<User>('user', id);
export const usePost = (id: string | undefined) => useEntity<Post>('post', id);

/**
 * Önbellek her değiştiğinde artan sayı. Birden çok kaydı `getPlace` ile okuyan
 * hesaplamalar (useMemo) bunu bağımlılık olarak kullanır.
 */
export function useEntitiesVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/** Listede önbellekte olmayan mekânları ister (ör. Listem, Gittiklerim) */
export function usePrefetchPlaces(ids: string[]) {
  const key = ids.join(',');
  useEffect(() => {
    for (const id of key ? key.split(',') : []) request('place', id);
  }, [key]);
}

export function usePrefetchUsers(ids: string[]) {
  const key = ids.join(',');
  useEffect(() => {
    for (const id of key ? key.split(',') : []) request('user', id);
  }, [key]);
}
