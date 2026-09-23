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
import type { Profile, RankedEntry, Rankings, Sentiment } from '@/types';

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
  wantToGo: string[];
  following: string[];
  likedFeedItems: string[];
};

const initialState: State = {
  hydrated: false,
  signedIn: false,
  onboarded: false,
  profile: null,
  rankings: emptyRankings(),
  wantToGo: [],
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
  | { type: 'toggleWantToGo'; placeId: string }
  | { type: 'toggleFollow'; userId: string }
  | { type: 'toggleLike'; feedItemId: string }
  | { type: 'reset' };

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

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
        // Puanlanan mekân artık "gitmek istiyorum" listesinde durmasın
        wantToGo: state.wantToGo.filter((id) => id !== action.entry.placeId),
      };
    case 'unrank':
      return { ...state, rankings: removeFromRankings(state.rankings, action.placeId) };
    case 'toggleWantToGo':
      return { ...state, wantToGo: toggle(state.wantToGo, action.placeId) };
    case 'toggleFollow':
      return { ...state, following: toggle(state.following, action.userId) };
    case 'toggleLike':
      return { ...state, likedFeedItems: toggle(state.likedFeedItems, action.feedItemId) };
    case 'reset':
      return { ...initialState, hydrated: true };
  }
}

const STORAGE_KEY = 'puanla:state:v1';

type Store = State & {
  dispatch: (action: Action) => void;
  scored: ReturnType<typeof flattenRankings>;
  scoreOf: (placeId: string) => number | undefined;
};

const StoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Açılışta kayıtlı durumu yükle
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => dispatch({ type: 'hydrate', state: raw ? JSON.parse(raw) : {} }))
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

  const value = useMemo(
    () => ({ ...state, dispatch, scored, scoreOf }),
    [state, scored, scoreOf],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore, AppStoreProvider içinde kullanılmalı');
  return store;
}
