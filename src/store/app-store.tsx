import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import * as authApi from '@/api/auth';
import * as contentApi from '@/api/content';
import { showError } from '@/api/errors';
import * as meApi from '@/api/me';
import type { LocalImage } from '@/api/storage';
import { clearEntities, getPlace, upsertPlaces, upsertUsers } from '@/data/entities';
import { setHapticsEnabled } from '@/lib/haptics';
import { unregisterDevice } from '@/lib/notifications';
import i18n from '@/i18n';
import { keys, queryClient } from '@/lib/query-client';
import { emptyRankings, flattenRankings, insertEntry, removeFromRankings, type Placement } from '@/lib/ranking';
import { setCurrentUserId } from '@/lib/session';
import { isBackendConfigured, supabase } from '@/lib/supabase';
import type {
  FeedArea,
  Place,
  Post,
  Profile,
  RankedEntry,
  Rankings,
  SavedPlace,
  Segment,
  SignupDraft,
  User,
} from '@/types';

/**
 * Uygulama durumu: oturum, kullanıcının kendi verisi (profil, sıralama, Listem, takip)
 * ve cihaz tercihleri.
 *
 * Kendi verisi iyimser güncellenir: değişiklik ekranda hemen görünür, sunucuya arkadan yazılır;
 * yazma başarısız olursa eski hâline döner ve kullanıcıya söylenir. Son bilinen hâli cihazda da
 * saklanır, böylece uygulama bağlantı yokken bile açılır.
 *
 * Başkalarının içeriği (feed, profiller, mekân sayfaları) TanStack Query ile yönetilir (hooks/queries).
 */

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type State = {
  status: AuthStatus;
  userId?: string;
  email?: string;
  /** Kullanıcı verisi yüklendi (sunucudan ya da cihazdaki son hâlinden) */
  ready: boolean;
  /** Veri yüklenemediyse (ör. ilk açılışta bağlantı yok) */
  loadError?: unknown;
  profile: Profile | null;
  rankings: Rankings;
  /** "Listem": gitmek istenen mekânlar, en yeni başta */
  saved: SavedPlace[];
  following: string[];
  /** Beğeni ve kaydetmelerde sunucu cevabını beklemeden gösterilen durum */
  likeOverrides: Record<string, boolean>;
  saveOverrides: Record<string, boolean>;
  /* Cihaz tercihleri */
  prefsLoaded: boolean;
  feedArea: FeedArea;
  hapticsEnabled: boolean;
  /** Hesap açılmadan önce kayıt adımlarında girilenler */
  draft: SignupDraft;
};

/** Oturumdan bağımsız, cihazda kalan alanlar */
type DeviceState = Pick<State, 'prefsLoaded' | 'feedArea' | 'hapticsEnabled' | 'draft'>;

const initialState: State = {
  status: 'loading',
  ready: false,
  profile: null,
  rankings: emptyRankings(),
  saved: [],
  following: [],
  likeOverrides: {},
  saveOverrides: {},
  prefsLoaded: false,
  feedArea: { type: 'near' },
  hapticsEnabled: true,
  draft: {},
};

const deviceState = (s: State): DeviceState => ({
  prefsLoaded: s.prefsLoaded,
  feedArea: s.feedArea,
  hapticsEnabled: s.hapticsEnabled,
  draft: s.draft,
});

type MyData = meApi.MyData;
type Restorable = Partial<Pick<State, 'rankings' | 'saved' | 'following' | 'profile'>>;

type Action =
  | { type: 'prefsLoaded'; feedArea?: FeedArea; hapticsEnabled?: boolean; draft?: SignupDraft }
  | { type: 'signedIn'; userId: string; email?: string }
  | { type: 'signedOut' }
  | { type: 'dataLoaded'; data: MyData }
  | { type: 'loadFailed'; error: unknown }
  | { type: 'restore'; patch: Restorable }
  | { type: 'updateProfile'; patch: Partial<Profile> }
  | { type: 'setDraft'; draft: SignupDraft }
  | { type: 'rank'; placement: Placement; entry: RankedEntry }
  | { type: 'unrank'; placeId: string }
  | { type: 'savePlace'; entry: SavedPlace }
  | { type: 'unsavePlace'; placeId: string }
  | { type: 'setFollowing'; userId: string; following: boolean }
  | { type: 'setLiked'; postId: string; liked: boolean | undefined }
  | { type: 'setPostSaved'; postId: string; saved: boolean | undefined }
  | { type: 'setFeedArea'; area: FeedArea }
  | { type: 'setHapticsEnabled'; enabled: boolean };

const withoutSaved = (list: SavedPlace[], placeId: string) => list.filter((s) => s.placeId !== placeId);

const setKey = (map: Record<string, boolean>, key: string, value: boolean | undefined) => {
  const next = { ...map };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'prefsLoaded':
      return {
        ...state,
        prefsLoaded: true,
        feedArea: action.feedArea ?? state.feedArea,
        hapticsEnabled: action.hapticsEnabled ?? state.hapticsEnabled,
        draft: action.draft ?? state.draft,
      };
    case 'signedIn':
      if (state.userId === action.userId) return { ...state, status: 'signedIn', email: action.email ?? state.email };
      return {
        ...initialState,
        ...deviceState(state),
        status: 'signedIn',
        userId: action.userId,
        email: action.email,
      };
    case 'signedOut':
      return { ...initialState, ...deviceState(state), status: 'signedOut' };
    case 'dataLoaded':
      return {
        ...state,
        ready: true,
        loadError: undefined,
        profile: action.data.profile,
        rankings: action.data.rankings,
        saved: action.data.saved,
        following: action.data.following,
      };
    case 'loadFailed':
      return { ...state, loadError: action.error };
    case 'restore':
      return { ...state, ...action.patch };
    case 'updateProfile':
      return state.profile ? { ...state, profile: { ...state.profile, ...action.patch } } : state;
    case 'setDraft':
      return { ...state, draft: action.draft };
    case 'rank':
      return {
        ...state,
        rankings: insertEntry(state.rankings, action.placement, action.entry),
        // Puanlanan mekân artık "Listem"de durmasın
        saved: withoutSaved(state.saved, action.entry.placeId),
      };
    case 'unrank':
      return { ...state, rankings: removeFromRankings(state.rankings, action.placeId) };
    case 'savePlace':
      // Aynı mekân tekrar kaydedilirse bilgileri güncellenir ve başa alınır
      return { ...state, saved: [action.entry, ...withoutSaved(state.saved, action.entry.placeId)] };
    case 'unsavePlace':
      return { ...state, saved: withoutSaved(state.saved, action.placeId) };
    case 'setFollowing':
      return {
        ...state,
        following: action.following
          ? [action.userId, ...state.following.filter((id) => id !== action.userId)]
          : state.following.filter((id) => id !== action.userId),
      };
    case 'setLiked':
      return { ...state, likeOverrides: setKey(state.likeOverrides, action.postId, action.liked) };
    case 'setPostSaved':
      return { ...state, saveOverrides: setKey(state.saveOverrides, action.postId, action.saved) };
    case 'setFeedArea':
      return { ...state, feedArea: action.area };
    case 'setHapticsEnabled':
      return { ...state, hapticsEnabled: action.enabled };
  }
}

/* ---------- Cihazda saklama ---------- */

const PREFS_KEY = 'puanla:prefs:v2';
const DRAFT_KEY = 'puanla:draft:v1';
// v2: sıralama kayıtlarında segment var; eski önbellek okunmaz, sunucudan yeniden yüklenir
const cacheKey = (userId: string) => `puanla:me:v2:${userId}`;

type CachedData = MyData & { places: Place[] };

async function readJson<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

const writeJson = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

const profileUser = (p: Profile): User => ({
  id: p.id,
  name: p.name,
  username: p.username,
  avatarUrl: p.avatarUri,
  schoolId: p.schoolId,
});

/** Listelerde satır başına tüm sıralamayı taramamak için kimlikten puana sabit süreli arama */
function scoreLookup(scored: ReturnType<typeof flattenRankings>) {
  const byPlace = new Map(scored.map((e) => [e.placeId, e.score]));
  return (placeId: string) => byPlace.get(placeId);
}

/* ---------- Bağlam ---------- */

export type Actions = {
  updateDraft: (patch: SignupDraft) => void;
  /** Sunucudan yeniden yükle (ör. aşağı çekip yenileme, hata sonrası) */
  refresh: () => Promise<void>;
  updateProfile: (patch: meApi.ProfilePatch) => Promise<boolean>;
  /** Telefon SMS ile doğrulandı (rehber eşleştirme açılır) */
  markPhoneVerified: () => void;
  /** Davet eden sunucuya yazıldı (`set_inviter`) */
  markInvited: (inviterId: string) => void;
  /** Rehberinde numaram olanlar beni bulabilir mi */
  setDiscoverable: (discoverable: boolean) => void;
  /** Yeni profil fotoğrafı; null fotoğrafı kaldırır */
  updateAvatar: (image: LocalImage | null) => Promise<boolean>;
  completeOnboarding: () => Promise<boolean>;
  /** Mekânı segmentindeki listede `placement` yerine koyar (bkz. hooks/use-rank-flow) */
  rank: (placeId: string, placement: Placement & { segment: Segment }, note?: string) => void;
  /** Mekânın puanı hâlâ sunucuya yazılıyorsa bitmesini bekler (gönderi puanı boş kalmasın) */
  waitForRank: (placeId: string) => Promise<void>;
  unrank: (placeId: string) => void;
  savePlace: (entry: SavedPlace) => void;
  unsavePlace: (placeId: string) => void;
  toggleSaved: (placeId: string) => void;
  toggleFollow: (userId: string) => void;
  toggleLike: (post: Post) => void;
  /** Çift dokunuş: yalnızca beğenir, geri almaz */
  like: (post: Post) => void;
  togglePostSaved: (post: Post) => void;
  setFeedArea: (area: FeedArea) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

export type Store = State & {
  onboarded: boolean;
  actions: Actions;
  scored: ReturnType<typeof flattenRankings>;
  scoreOf: (placeId: string) => number | undefined;
  isSaved: (placeId: string) => boolean;
  isFollowing: (userId: string) => boolean;
  isLiked: (post: Post) => boolean;
  isPostSaved: (post: Post) => boolean;
  /** Beğeni sayısı, kullanıcının kendi (iyimser) beğenisi dahil */
  likeCountOf: (post: Post) => number;
};

const StoreContext = createContext<Store | null>(null);

/**
 * Seçici abonelik: uzun listelerdeki bileşenler (feed kartları) tüm mağazayı değil yalnızca seçtikleri
 * değeri dinler; bir beğeni bütün kartları yeniden çizdirmez. Eylemler sabit, ayrı bağlamda.
 */
type StateSource = { get: () => State; subscribe: (listener: () => void) => () => void };
const StateSourceContext = createContext<StateSource | null>(null);
const ActionsContext = createContext<Actions | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Eşzamansız işlemler en güncel duruma baksın
  const stateRef = useRef(state);
  // Sunucuya yazılmakta olan puanlamalar
  const pendingRanks = useRef(new Map<string, Promise<void>>());
  const requestQueues = useRef(new Map<string, Promise<unknown>>());
  const listeners = useRef(new Set<() => void>());
  useLayoutEffect(() => {
    if (stateRef.current === state) return;
    stateRef.current = state;
    listeners.current.forEach((listener) => listener());
  });
  const source = useMemo<StateSource>(
    () => ({
      get: () => stateRef.current,
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
    }),
    [],
  );

  /* Tercihler ve kayıt taslağı */
  useEffect(() => {
    Promise.all([
      readJson<Pick<State, 'feedArea' | 'hapticsEnabled'>>(PREFS_KEY),
      readJson<SignupDraft>(DRAFT_KEY),
    ]).then(([prefs, draft]) => dispatch({ type: 'prefsLoaded', ...prefs, draft }));
  }, []);

  useEffect(() => {
    if (state.prefsLoaded) writeJson(PREFS_KEY, { feedArea: state.feedArea, hapticsEnabled: state.hapticsEnabled });
  }, [state.prefsLoaded, state.feedArea, state.hapticsEnabled]);

  useEffect(() => {
    if (state.prefsLoaded) writeJson(DRAFT_KEY, state.draft);
  }, [state.prefsLoaded, state.draft]);

  useEffect(() => setHapticsEnabled(state.hapticsEnabled), [state.hapticsEnabled]);

  /* Kullanıcı verisini sunucudan yükleme */
  const load = useCallback(async (userId: string, email?: string) => {
    try {
      // Sunucuya yazılmakta olan puan/takip/beğeni önce bitsin: yoksa gelen eski veri iyimser değişikliği ezer
      await Promise.allSettled([...requestQueues.current.values()]);
      const data = await meApi.loadMyData(userId, email);
      if (stateRef.current.userId !== userId) return;
      upsertUsers([profileUser(data.profile)]);
      dispatch({ type: 'dataLoaded', data });
    } catch (error) {
      if (stateRef.current.userId === userId) dispatch({ type: 'loadFailed', error });
    }
  }, []);

  /* Oturum değişiklikleri */
  useEffect(() => {
    if (!isBackendConfigured) {
      dispatch({ type: 'signedOut' });
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase, bu geri çağırmanın içinde başka auth çağrısı yapılmamasını ister
      setTimeout(async () => {
        if (!session) {
          if (stateRef.current.userId) {
            clearEntities();
            queryClient.clear();
          }
          setCurrentUserId(undefined);
          dispatch({ type: 'signedOut' });
          return;
        }
        const userId = session.user.id;
        const isNewUser = stateRef.current.userId !== userId;
        setCurrentUserId(userId);
        dispatch({ type: 'signedIn', userId, email: session.user.email });
        // Token yenilemesi gibi olaylarda veriyi baştan yüklemeye gerek yok
        if (!isNewUser && event !== 'SIGNED_IN' && event !== 'USER_UPDATED') return;

        if (isNewUser) {
          // Önce cihazdaki son hâli göster, sonra sunucudan tazele
          const cached = await readJson<CachedData>(cacheKey(userId));
          if (cached && stateRef.current.userId === userId) {
            upsertPlaces(cached.places);
            upsertUsers([profileUser(cached.profile)]);
            dispatch({ type: 'dataLoaded', data: cached });
          }
        }
        load(userId, session.user.email);
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  /* Son hâli cihaza yaz (yalnızca saklanan alanlar değişince; beğeni/kaydetme gibi geçici durumlar tetiklemez) */
  const { userId, ready, profile, rankings, saved, following } = state;
  useEffect(() => {
    if (!userId || !ready || !profile) return;
    const timer = setTimeout(() => {
      const placeIds = new Set([...Object.values(rankings).flat(), ...saved].map((e) => e.placeId));
      const places = [...placeIds].flatMap((id) => getPlace(id) ?? []);
      writeJson(cacheKey(userId), { profile, rankings, saved, following, places } satisfies CachedData);
    }, 500);
    return () => clearTimeout(timer);
  }, [userId, ready, profile, rankings, saved, following]);

  /* ---------- Eylemler ---------- */

  const actions = useMemo<Actions>(() => {
    const me = () => stateRef.current.userId!;

    /**
     * Aynı öğeye giden istekler sırayla gönderilir: hızlı art arda dokunuşta (beğen → vazgeç) istekler
     * sunucuya ters sırada ulaşıp ekranla sunucu farklı kalmasın.
     */
    const serial = <T,>(key: string, call: () => Promise<T>): Promise<T> => {
      const queues = requestQueues.current;
      const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(call);
      queues.set(key, next);
      next
        .finally(() => {
          if (queues.get(key) === next) queues.delete(key);
        })
        .catch(() => {});
      return next;
    };

    /**
     * İyimser güncelleme: önce ekrana uygula, sonra sunucuya yaz.
     * Başarısız olursa önceki hâline döndür ve kullanıcıya bildir.
     */
    const optimistic = (
      action: Action,
      snapshot: Restorable,
      call: () => Promise<unknown>,
      errorTitle: string,
      onSuccess?: () => void,
    ): Promise<void> => {
      dispatch(action);
      return call().then(
        () => onSuccess?.(),
        (error) => {
          dispatch({ type: 'restore', patch: snapshot });
          showError(error, errorTitle);
        },
      );
    };

    const invalidateSocial = (userId: string) => {
      for (const queryKey of [
        keys.profile(userId),
        keys.profile(me()),
        ['connections'],
        keys.feedFollowing(),
        ['leaderboard'],
        ['friend-scores'],
        ['place'],
      ]) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    const savePlace = (entry: SavedPlace) =>
      optimistic(
        { type: 'savePlace', entry },
        { saved: stateRef.current.saved },
        () => serial(`place:${entry.placeId}`, () => meApi.savePlace(entry)),
        i18n.t('failures.listAdd'),
      );

    const unsavePlace = (placeId: string) =>
      optimistic(
        { type: 'unsavePlace', placeId },
        { saved: stateRef.current.saved },
        () => serial(`place:${placeId}`, () => meApi.unsavePlace(placeId)),
        i18n.t('failures.listRemove'),
      );

    const effectiveLiked = (post: Post) => stateRef.current.likeOverrides[post.id] ?? post.likedByMe;
    const effectiveSaved = (post: Post) => stateRef.current.saveOverrides[post.id] ?? post.savedByMe;

    const setLike = (post: Post, liked: boolean) => {
      const previous = stateRef.current.likeOverrides[post.id];
      dispatch({ type: 'setLiked', postId: post.id, liked });
      serial(`like:${post.id}`, () => contentApi.setLiked(post.id, liked)).then(
        () => queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
        (error) => {
          dispatch({ type: 'setLiked', postId: post.id, liked: previous });
          showError(error, i18n.t('failures.like'));
        },
      );
    };

    return {
      updateDraft: (patch) => dispatch({ type: 'setDraft', draft: { ...stateRef.current.draft, ...patch } }),

      refresh: async () => {
        const { userId, email } = stateRef.current;
        if (userId) await load(userId, email);
      },

      updateProfile: async (patch) => {
        const { profile } = stateRef.current;
        if (!profile) return false;
        const local: Partial<Profile> = {};
        if (patch.name !== undefined) local.name = patch.name.trim();
        if (patch.username !== undefined) local.username = patch.username;
        if ('schoolId' in patch) local.schoolId = patch.schoolId;
        if ('yearGoal' in patch) local.yearGoal = patch.yearGoal;
        if (patch.favoritePlaces) local.favoritePlaces = patch.favoritePlaces;
        dispatch({ type: 'updateProfile', patch: local });
        try {
          await meApi.updateMyProfile(me(), patch);
          upsertUsers([profileUser({ ...profile, ...local })]);
          queryClient.invalidateQueries({ queryKey: keys.profile(me()) });
          if ('schoolId' in patch) queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
          return true;
        } catch (error) {
          dispatch({ type: 'restore', patch: { profile } });
          showError(error, i18n.t('failures.profileUpdate'));
          return false;
        }
      },

      markPhoneVerified: () => dispatch({ type: 'updateProfile', patch: { phoneVerified: true } }),

      markInvited: (inviterId) => dispatch({ type: 'updateProfile', patch: { hasInviter: true, inviterId } }),

      setDiscoverable: (discoverable) => {
        const { profile } = stateRef.current;
        if (!profile) return;
        optimistic(
          { type: 'updateProfile', patch: { discoverable } },
          { profile },
          () => meApi.setDiscoverable(me(), discoverable),
          i18n.t('failures.settingsSave'),
        );
      },

      updateAvatar: async (image) => {
        const { profile } = stateRef.current;
        if (!profile) return false;
        try {
          let patch: Partial<Profile>;
          if (image) {
            const { path, url } = await meApi.updateAvatar(me(), image, profile.avatarPath);
            patch = { avatarPath: path, avatarUri: url };
          } else {
            await meApi.removeAvatar(me(), profile.avatarPath);
            patch = { avatarPath: undefined, avatarUri: undefined };
          }
          dispatch({ type: 'updateProfile', patch });
          upsertUsers([profileUser({ ...profile, ...patch })]);
          return true;
        } catch (error) {
          showError(error, i18n.t('failures.photoUpdate'));
          return false;
        }
      },

      completeOnboarding: async () => {
        try {
          await meApi.updateMyProfile(me(), { onboarded: true });
          dispatch({ type: 'updateProfile', patch: { onboardedAt: new Date().toISOString() } });
          dispatch({ type: 'setDraft', draft: {} });
          return true;
        } catch (error) {
          showError(error);
          return false;
        }
      },

      rank: (placeId, { sentiment, index, segment, tied }, note) => {
        const { rankings, saved } = stateRef.current;
        const entry = { placeId, segment, note: note?.trim() || undefined, ratedAt: new Date().toISOString() };
        const write = optimistic(
          { type: 'rank', placement: { sentiment, index, tied }, entry },
          { rankings, saved },
          () => serial(`rank:${placeId}`, () => meApi.rankPlace(placeId, sentiment, index, entry.note, tied)),
          i18n.t('failures.rankSave'),
          () => {
            queryClient.invalidateQueries({ queryKey: keys.place(placeId) });
            queryClient.invalidateQueries({ queryKey: keys.userRankings(me()) });
            queryClient.invalidateQueries({ queryKey: ['map-places'] });
            queryClient.invalidateQueries({ queryKey: ['taste-match'] });
            // Listeler sahibin güncel puanına göre sıralanır
            queryClient.invalidateQueries({ queryKey: ['lists'] });
            // Puanlama XP verir (profildeki "Sıralama" ilk puanla açılır); puanlanan mekân önerilerden çıkar
            queryClient.invalidateQueries({ queryKey: keys.userRank(me()) });
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
            queryClient.invalidateQueries({ queryKey: ['recommendations'] });
          },
        );
        // Gönderi paylaşılırken puanın sunucuya yazılmış olması beklenir (bkz. waitForRank)
        const tracked = write.finally(() => {
          if (pendingRanks.current.get(placeId) === tracked) pendingRanks.current.delete(placeId);
        });
        pendingRanks.current.set(placeId, tracked);
      },

      waitForRank: (placeId) => pendingRanks.current.get(placeId) ?? Promise.resolve(),

      unrank: (placeId) =>
        optimistic(
          { type: 'unrank', placeId },
          { rankings: stateRef.current.rankings },
          () => serial(`rank:${placeId}`, () => meApi.unrankPlace(placeId)),
          i18n.t('failures.rankDelete'),
          () => {
            queryClient.invalidateQueries({ queryKey: keys.place(placeId) });
            queryClient.invalidateQueries({ queryKey: keys.userRankings(me()) });
            queryClient.invalidateQueries({ queryKey: ['map-places'] });
            queryClient.invalidateQueries({ queryKey: ['taste-match'] });
            // Listeler sahibin güncel puanına göre sıralanır
            queryClient.invalidateQueries({ queryKey: ['lists'] });
            queryClient.invalidateQueries({ queryKey: keys.userRank(me()) });
            queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
            queryClient.invalidateQueries({ queryKey: ['recommendations'] });
          },
        ),

      savePlace,
      unsavePlace,
      toggleSaved: (placeId) => {
        if (stateRef.current.saved.some((s) => s.placeId === placeId)) unsavePlace(placeId);
        else savePlace({ placeId, origin: 'app', savedAt: new Date().toISOString() });
      },

      toggleFollow: (userId) => {
        const next = !stateRef.current.following.includes(userId);
        optimistic(
          { type: 'setFollowing', userId, following: next },
          { following: stateRef.current.following },
          () => serial(`follow:${userId}`, () => (next ? meApi.follow(userId) : meApi.unfollow(me(), userId))),
          next ? i18n.t('failures.follow') : i18n.t('failures.unfollow'),
          () => invalidateSocial(userId),
        );
      },

      toggleLike: (post) => setLike(post, !effectiveLiked(post)),
      like: (post) => {
        if (!effectiveLiked(post)) setLike(post, true);
      },

      togglePostSaved: (post) => {
        const saved = !effectiveSaved(post);
        const previous = stateRef.current.saveOverrides[post.id];
        dispatch({ type: 'setPostSaved', postId: post.id, saved });
        serial(`postSave:${post.id}`, () => contentApi.setPostSaved(post.id, saved)).then(
          () => queryClient.invalidateQueries({ queryKey: keys.savedPosts() }),
          (error) => {
            dispatch({ type: 'setPostSaved', postId: post.id, saved: previous });
            showError(error, i18n.t('failures.postSave'));
          },
        );
      },

      setFeedArea: (area) => dispatch({ type: 'setFeedArea', area }),
      setHapticsEnabled: (enabled) => dispatch({ type: 'setHapticsEnabled', enabled }),

      signOut: async () => {
        const userId = stateRef.current.userId;
        await unregisterDevice();
        await authApi.signOut();
        if (userId) AsyncStorage.removeItem(cacheKey(userId)).catch(() => {});
      },

      deleteAccount: async () => {
        const userId = me();
        await authApi.deleteAccount(userId);
        AsyncStorage.removeItem(cacheKey(userId)).catch(() => {});
      },
    };
  }, [load]);

  /* ---------- Türetilmiş değerler ---------- */

  const scored = useMemo(() => flattenRankings(state.rankings), [state.rankings]);
  const scoreOf = useMemo(() => scoreLookup(scored), [scored]);
  const isSaved = useCallback((placeId: string) => state.saved.some((s) => s.placeId === placeId), [state.saved]);
  const isFollowing = useCallback((userId: string) => state.following.includes(userId), [state.following]);
  const isLiked = useCallback((post: Post) => state.likeOverrides[post.id] ?? post.likedByMe, [state.likeOverrides]);
  const isPostSaved = useCallback(
    (post: Post) => state.saveOverrides[post.id] ?? post.savedByMe,
    [state.saveOverrides],
  );
  const likeCountOf = useCallback((post: Post) => post.likeCount + (isLiked(post) ? 1 : 0), [isLiked]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      onboarded: !!state.profile?.onboardedAt,
      actions,
      scored,
      scoreOf,
      isSaved,
      isFollowing,
      isLiked,
      isPostSaved,
      likeCountOf,
    }),
    [state, actions, scored, scoreOf, isSaved, isFollowing, isLiked, isPostSaved, likeCountOf],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <StateSourceContext.Provider value={source}>
        <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
      </StateSourceContext.Provider>
    </ActionsContext.Provider>
  );
}

export function useAppStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore, AppStoreProvider içinde kullanılmalı');
  return store;
}

/** Oturum açmış kullanıcının kimliği (oturum yoksa boş metin) */
export function useMyId(): string {
  return useAppSelector((s) => s.userId) ?? '';
}

/** Mağazadan tek bir değer; yalnızca o değer değişince yeniden çizer (seçici ilkel ya da sabit referans dönmeli) */
export function useAppSelector<T>(selector: (state: State) => T): T {
  const source = useContext(StateSourceContext);
  if (!source) throw new Error('useAppSelector, AppStoreProvider içinde kullanılmalı');
  return useSyncExternalStore(source.subscribe, () => selector(source.get()));
}

/** Puanlanan mekânlar puanlarıyla; yalnızca sıralama değişince yeniden hesaplanır */
export function useScored() {
  const rankings = useAppSelector((s) => s.rankings);
  return useMemo(() => flattenRankings(rankings), [rankings]);
}

/** Mekânın kullanıcının sıralamasındaki puanı; yalnızca sıralama değişince yeniden oluşur */
export function useScoreOf() {
  const scored = useScored();
  return useMemo(() => scoreLookup(scored), [scored]);
}

/** Eylemler (sabit; mağaza değişince yeniden çizdirmez) */
export function useAppActions(): Actions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('useAppActions, AppStoreProvider içinde kullanılmalı');
  return actions;
}
