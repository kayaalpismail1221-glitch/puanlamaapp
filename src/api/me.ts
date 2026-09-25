import { unwrap } from '@/api/errors';
import { mediaUrl, toRankedEntry, toSavedPlace } from '@/api/mappers';
import { prepareImage, removeFiles, uploadImage, type LocalImage } from '@/api/storage';
import { ingestPlaces } from '@/data/entities';
import { emptyRankings } from '@/lib/ranking';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { Profile, Rankings, SavedPlace, SaveOrigin, Sentiment } from '@/types';

/**
 * Oturum açmış kullanıcının kendi verisi: profil, sıralama, Listem ve takip ettikleri.
 * Uygulama açılınca tek seferde yüklenir; değişiklikler iyimser olarak uygulanıp sunucuya yazılır.
 */

export type MyData = {
  profile: Profile;
  rankings: Rankings;
  saved: SavedPlace[];
  following: string[];
};

export async function loadMyData(userId: string, email?: string): Promise<MyData> {
  const [profileRes, privateRes, rankingRes, savedRes, followRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('profile_private').select('phone_verified_at, discoverable').eq('user_id', userId).maybeSingle(),
    supabase.from('ranking_view').select('*').eq('user_id', userId).order('position'),
    supabase.from('saved_place_view').select('*').eq('user_id', userId).order('saved_at', { ascending: false }),
    supabase.from('follows').select('followee_id').eq('follower_id', userId).order('created_at', { ascending: false }),
  ]);

  const row = unwrap(profileRes);
  const privateRow = unwrap(privateRes);
  const rankingRows = unwrap(rankingRes);
  const savedRows = unwrap(savedRes);

  // Mekânlar ortak önbelleğe; ekranlar kimlikle anında okur
  ingestPlaces([...rankingRows.map((r) => r.place), ...savedRows.map((s) => s.place)]);

  const rankings = emptyRankings();
  for (const r of rankingRows) rankings[r.sentiment as Sentiment].push(toRankedEntry(r));

  return {
    profile: {
      id: row.id,
      name: row.name,
      username: row.username,
      avatarUri: mediaUrl('avatars', row.avatar_path),
      avatarPath: row.avatar_path ?? undefined,
      email,
      schoolId: row.school_id ?? undefined,
      yearGoal: row.year_goal ?? undefined,
      joinedAt: row.created_at,
      onboardedAt: row.onboarded_at ?? undefined,
      phoneVerified: !!privateRow?.phone_verified_at,
      discoverable: privateRow?.discoverable ?? true,
    },
    rankings,
    saved: savedRows.map(toSavedPlace),
    following: unwrap(followRes).map((f) => f.followee_id),
  };
}

export type ProfilePatch = Partial<Pick<Profile, 'name' | 'username' | 'schoolId' | 'yearGoal'>> & {
  onboarded?: boolean;
};

export async function updateMyProfile(userId: string, patch: ProfilePatch) {
  const update: Database['public']['Tables']['profiles']['Update'] = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.username !== undefined) update.username = patch.username;
  if ('schoolId' in patch) update.school_id = patch.schoolId ?? null;
  if ('yearGoal' in patch) update.year_goal = patch.yearGoal ?? null;
  if (patch.onboarded) update.onboarded_at = new Date().toISOString();
  unwrap(await supabase.from('profiles').update(update).eq('id', userId));
}

/** Rehberinde numaram kayıtlı olanlar beni bulabilir mi */
export async function setDiscoverable(userId: string, discoverable: boolean) {
  unwrap(await supabase.from('profile_private').update({ discoverable }).eq('user_id', userId));
}

/** Yeni profil fotoğrafını yükler, profili günceller ve eskisini siler */
export async function updateAvatar(userId: string, image: LocalImage, previousPath?: string) {
  const prepared = await prepareImage(image, 1024, 0.85);
  const path = `${userId}/${Date.now()}.jpg`;
  await uploadImage('avatars', path, prepared.uri);
  unwrap(await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId));
  if (previousPath && !/^https?:/.test(previousPath)) {
    removeFiles('avatars', [previousPath]).catch(() => {});
  }
  return { path, url: mediaUrl('avatars', path)! };
}

export async function removeAvatar(userId: string, previousPath?: string) {
  unwrap(await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId));
  if (previousPath && !/^https?:/.test(previousPath)) removeFiles('avatars', [previousPath]).catch(() => {});
}

/* ---------- Sıralama ve Listem ---------- */

export async function rankPlace(placeId: string, sentiment: Sentiment, index: number, note?: string) {
  return unwrap(
    await supabase.rpc('rank_place', {
      p_place_id: placeId,
      p_sentiment: sentiment,
      p_index: index,
      p_note: note ?? null,
    }),
  );
}

export async function unrankPlace(placeId: string) {
  unwrap(await supabase.rpc('unrank_place', { p_place_id: placeId }));
}

export async function savePlace(entry: SavedPlace) {
  unwrap(
    await supabase.from('saved_places').upsert(
      {
        place_id: entry.placeId,
        origin: entry.origin satisfies SaveOrigin,
        link: entry.link ?? null,
        note: entry.note ?? null,
        saved_at: entry.savedAt,
      },
      { onConflict: 'user_id,place_id' },
    ),
  );
}

export async function unsavePlace(placeId: string) {
  unwrap(await supabase.from('saved_places').delete().eq('place_id', placeId));
}

/* ---------- Takip ---------- */

export async function follow(userId: string) {
  const { error } = await supabase.from('follows').insert({ followee_id: userId });
  // Zaten takip ediliyorsa sorun yok
  if (error && error.code !== '23505') throw error;
}

export async function unfollow(me: string, userId: string) {
  unwrap(await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', userId));
}
