import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

import { COMMENTS, FOLLOWS, POSTS, USERS, userById } from '@/data/mock';
import { setHapticsEnabled } from '@/lib/haptics';
import { emptyRankings, flattenRankings, insertEntry, removeFromRankings } from '@/lib/ranking';
import {
  ME,
  type Comment,
  type FeedArea,
  type Post,
  type Profile,
  type RankedEntry,
  type Rankings,
  type SavedPlace,
  type Sentiment,
  type User,
} from '@/types';

/**
 * Uygulama durumu. Şimdilik cihazda (AsyncStorage) saklanıyor;
 * Supabase bağlanınca buradaki eylemler API çağrılarına dönüşecek.
 */

type State = {
  hydrated: boolean;
  signedIn: boolean;
  onboarded: boolean;
  profile: Profile | null;
  rankings: Rankings;
  /** "Listem": gitmek istenen mekânlar, en yeni başta */
  saved: SavedPlace[];
  following: string[];
  /** Kullanıcının paylaştığı gönderiler ve yazdığı yorumlar */
  myPosts: Post[];
  myComments: Comment[];
  likedPosts: string[];
  /** Kaydedilen gönderiler */
  savedPosts: string[];
  /** Popüler feed bölgesi: yakınımda ya da seçilen şehir/ilçe */
  feedArea: FeedArea;
  /** Üyelik başlangıcı (onboarding bitişi) */
  joinedAt?: string;
  /** Bu yıl denenmek istenen mekân sayısı hedefi */
  yearGoal?: number;
  /** Ayarlar: dokunmalarda titreşim */
  hapticsEnabled: boolean;
};

const initialState: State = {
  hydrated: false,
  signedIn: false,
  onboarded: false,
  profile: null,
  rankings: emptyRankings(),
  saved: [],
  following: [],
  myPosts: [],
  myComments: [],
  likedPosts: [],
  savedPosts: [],
  feedArea: { type: 'near' },
  hapticsEnabled: true,
};

type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'signIn' }
  | { type: 'setProfile'; profile: Profile }
  | { type: 'updateProfile'; patch: Partial<Profile> }
  | { type: 'completeOnboarding' }
  | { type: 'rank'; sentiment: Sentiment; index: number; entry: RankedEntry }
  | { type: 'unrank'; placeId: string }
  | { type: 'savePlace'; entry: SavedPlace }
  | { type: 'unsavePlace'; placeId: string }
  | { type: 'toggleSaved'; placeId: string }
  | { type: 'toggleFollow'; userId: string }
  | { type: 'createPost'; post: Post }
  | { type: 'deletePost'; postId: string }
  | { type: 'toggleLikePost'; postId: string }
  | { type: 'toggleSavePost'; postId: string }
  | { type: 'addComment'; comment: Comment }
  | { type: 'setFeedArea'; area: FeedArea }
  | { type: 'setYearGoal'; goal: number | undefined }
  | { type: 'setHapticsEnabled'; enabled: boolean }
  | { type: 'reset' };

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const withoutSaved = (list: SavedPlace[], placeId: string) =>
  list.filter((s) => s.placeId !== placeId);

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.state, hydrated: true };
    case 'signIn':
      return { ...state, signedIn: true };
    case 'setProfile':
      return { ...state, profile: { ...state.profile, ...action.profile } };
    case 'updateProfile':
      return {
        ...state,
        profile: { name: '', username: '', ...state.profile, ...action.patch },
      };
    case 'completeOnboarding':
      return { ...state, onboarded: true, joinedAt: state.joinedAt ?? new Date().toISOString() };
    case 'rank':
      return {
        ...state,
        rankings: insertEntry(state.rankings, action.sentiment, action.index, action.entry),
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
    case 'toggleSaved':
      return state.saved.some((s) => s.placeId === action.placeId)
        ? { ...state, saved: withoutSaved(state.saved, action.placeId) }
        : {
            ...state,
            saved: [
              { placeId: action.placeId, origin: 'app', savedAt: new Date().toISOString() },
              ...state.saved,
            ],
          };
    case 'toggleFollow':
      return { ...state, following: toggle(state.following, action.userId) };
    case 'createPost':
      return { ...state, myPosts: [action.post, ...state.myPosts] };
    case 'deletePost':
      return {
        ...state,
        myPosts: state.myPosts.filter((p) => p.id !== action.postId),
        myComments: state.myComments.filter((c) => c.postId !== action.postId),
        likedPosts: state.likedPosts.filter((id) => id !== action.postId),
        savedPosts: state.savedPosts.filter((id) => id !== action.postId),
      };
    case 'toggleLikePost':
      return { ...state, likedPosts: toggle(state.likedPosts, action.postId) };
    case 'toggleSavePost':
      return { ...state, savedPosts: toggle(state.savedPosts, action.postId) };
    case 'addComment':
      return { ...state, myComments: [...state.myComments, action.comment] };
    case 'setFeedArea':
      return { ...state, feedArea: action.area };
    case 'setYearGoal':
      return { ...state, yearGoal: action.goal };
    case 'setHapticsEnabled':
      return { ...state, hapticsEnabled: action.enabled };
    case 'reset':
      return { ...initialState, hydrated: true };
  }
}

const STORAGE_KEY = 'puanla:state:v1';

/** Eski kayıt biçimlerini güncel duruma çevirir */
function migrate(raw: Record<string, unknown>): Partial<State> {
  const { wantToGo, likedFeedItems: _, ...rest } = raw as Partial<State> & {
    wantToGo?: string[];
    likedFeedItems?: string[];
  };
  if (!rest.saved && Array.isArray(wantToGo)) {
    const now = new Date().toISOString();
    rest.saved = wantToGo.map((placeId) => ({ placeId, origin: 'app' as const, savedAt: now }));
  }
  // Kaynağı olmayan eski kayıtlar: bağlantı varsa sosyal medyadan gelmiştir
  rest.saved = rest.saved?.map((s) => ({ ...s, origin: s.origin ?? (s.link ? 'social' : 'app') }));
  return rest;
}

type Store = State & {
  dispatch: (action: Action) => void;
  scored: ReturnType<typeof flattenRankings>;
  scoreOf: (placeId: string) => number | undefined;
  isSaved: (placeId: string) => boolean;
  /** Mock gönderiler + kullanıcının kendi gönderileri, en yeni başta */
  posts: Post[];
  postById: (postId: string) => Post | undefined;
  commentsFor: (postId: string) => Comment[];
  /** `ME` dahil herhangi bir kullanıcıyı çözer */
  getUser: (userId: string) => User | undefined;
  /** Takip edilenlerin bu mekâna verdiği puanların ortalaması */
  friendScoreOf: (placeId: string) => { average: number; count: number } | undefined;
  /** Bir kullanıcının takip ettikleri ve takipçileri (`ME` dahil) */
  followingOf: (userId: string) => string[];
  followersOf: (userId: string) => string[];
};

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Açılışta kayıtlı durumu yükle
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'hydrate', state: raw ? migrate(JSON.parse(raw)) : {} }))
      .catch(() => dispatch({ type: 'hydrate', state: {} }));
  }, []);

  // Titreşim tercihini haptik yardımcısına yansıt
  useEffect(() => setHapticsEnabled(state.hapticsEnabled), [state.hapticsEnabled]);

  // Her değişiklikte kaydet
  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated: _, ...persisted } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }, [state]);

  const scored = useMemo(() => flattenRankings(state.rankings), [state.rankings]);
  const scoreOf = useCallback(
    (placeId: string) => scored.find((e) => e.placeId === placeId)?.score,
    [scored],
  );
  const isSaved = useCallback(
    (placeId: string) => state.saved.some((s) => s.placeId === placeId),
    [state.saved],
  );

  const posts = useMemo(
    () =>
      [...state.myPosts, ...POSTS].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [state.myPosts],
  );
  const postById = useCallback((postId: string) => posts.find((p) => p.id === postId), [posts]);
  const commentsFor = useCallback(
    (postId: string) =>
      [...COMMENTS, ...state.myComments]
        .filter((c) => c.postId === postId)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [state.myComments],
  );
  const getUser = useCallback(
    (userId: string): User | undefined =>
      userId === ME
        ? {
            id: ME,
            name: state.profile?.name ?? 'Sen',
            username: state.profile?.username ?? '',
            avatarUrl: state.profile?.avatarUri,
          }
        : userById(userId),
    [state.profile],
  );

  const friendScoreOf = useCallback(
    (placeId: string) => {
      // Kişi başına en yeni gönderideki puan
      const seen = new Set<string>();
      const scores: number[] = [];
      for (const p of posts) {
        if (p.placeId !== placeId || p.score === undefined || !state.following.includes(p.userId)) continue;
        if (seen.has(p.userId)) continue;
        seen.add(p.userId);
        scores.push(p.score);
      }
      if (!scores.length) return undefined;
      return { average: scores.reduce((a, b) => a + b, 0) / scores.length, count: scores.length };
    },
    [posts, state.following],
  );

  const followingOf = useCallback(
    (userId: string) => (userId === ME ? state.following : (FOLLOWS[userId] ?? [])),
    [state.following],
  );
  const followersOf = useCallback(
    (userId: string) => [...USERS.map((u) => u.id), ME].filter((id) => id !== userId && followingOf(id).includes(userId)),
    [followingOf],
  );

  const value = useMemo(
    () => ({
      ...state,
      dispatch,
      scored,
      scoreOf,
      isSaved,
      posts,
      postById,
      commentsFor,
      getUser,
      friendScoreOf,
      followingOf,
      followersOf,
    }),
    [state, scored, scoreOf, isSaved, posts, postById, commentsFor, getUser, friendScoreOf, followingOf, followersOf],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore, AppStoreProvider içinde kullanılmalı');
  return store;
}
