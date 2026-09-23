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

import { emptyRankings, flattenRankings, insertEntry, removeFromRankings } from '@/lib/ranking';
import type { Profile, RankedEntry, Rankings, SavedPlace, Sentiment } from '@/types';

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
  likedFeedItems: string[];
};

const initialState: State = {
  hydrated: false,
  signedIn: false,
  onboarded: false,
  profile: null,
  rankings: emptyRankings(),
  saved: [],
  following: [],
  likedFeedItems: [],
};

type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'signIn' }
  | { type: 'setProfile'; profile: Profile }
  | { type: 'completeOnboarding' }
  | { type: 'rank'; sentiment: Sentiment; index: number; entry: RankedEntry }
  | { type: 'unrank'; placeId: string }
  | { type: 'savePlace'; entry: SavedPlace }
  | { type: 'unsavePlace'; placeId: string }
  | { type: 'toggleSaved'; placeId: string }
  | { type: 'toggleFollow'; userId: string }
  | { type: 'toggleLike'; feedItemId: string }
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
      return { ...state, profile: action.profile };
    case 'completeOnboarding':
      return { ...state, onboarded: true };
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
            saved: [{ placeId: action.placeId, savedAt: new Date().toISOString() }, ...state.saved],
          };
    case 'toggleFollow':
      return { ...state, following: toggle(state.following, action.userId) };
    case 'toggleLike':
      return { ...state, likedFeedItems: toggle(state.likedFeedItems, action.feedItemId) };
    case 'reset':
      return { ...initialState, hydrated: true };
  }
}

const STORAGE_KEY = 'puanla:state:v1';

/** Eski kayıt biçimlerini güncel duruma çevirir */
function migrate(raw: Record<string, unknown>): Partial<State> {
  const { wantToGo, ...rest } = raw as Partial<State> & { wantToGo?: string[] };
  if (!rest.saved && Array.isArray(wantToGo)) {
    const now = new Date().toISOString();
    rest.saved = wantToGo.map((placeId) => ({ placeId, savedAt: now }));
  }
  return rest;
}

type Store = State & {
  dispatch: (action: Action) => void;
  scored: ReturnType<typeof flattenRankings>;
  scoreOf: (placeId: string) => number | undefined;
  isSaved: (placeId: string) => boolean;
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

  const value = useMemo(
    () => ({ ...state, dispatch, scored, scoreOf, isSaved }),
    [state, scored, scoreOf, isSaved],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore, AppStoreProvider içinde kullanılmalı');
  return store;
}
