export type Cuisine =
  | 'Kahvaltıcı'
  | 'Esnaf lokantası'
  | 'Dürümcü'
  | 'Kokoreççi'
  | 'Ciğerci'
  | 'Balıkçı'
  | 'Meyhane'
  | 'Kebapçı'
  | 'Pideci'
  | 'Kafe'
  | 'Burgerci'
  | 'Tatlıcı';

export type Place = {
  id: string;
  name: string;
  cuisine: Cuisine;
  neighborhood: string;
  city: string;
  priceLevel: 1 | 2 | 3 | 4;
  latitude: number;
  longitude: number;
  photoUrl?: string;
};

/** Beli tarzı ilk izlenim */
export type Sentiment = 'liked' | 'fine' | 'disliked';

/** Kullanıcının puanladığı bir mekân. Puan, sıralamadaki konumdan hesaplanır. */
export type RankedEntry = {
  placeId: string;
  note?: string;
  ratedAt: string; // ISO tarih
};

/** Her grup en iyiden en kötüye sıralı */
export type Rankings = Record<Sentiment, RankedEntry[]>;

/** "Listem"e kaydedilen, henüz gidilmemiş mekân */
export type SavedPlace = {
  placeId: string;
  /** Mekânı nerede gördüğü: Instagram, TikTok vb. bağlantı */
  link?: string;
  note?: string;
  savedAt: string; // ISO tarih
};

export type User = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
};

export type Profile = {
  name: string;
  username: string;
  avatarUri?: string;
};

export type FeedItem = {
  id: string;
  userId: string;
  placeId: string;
  score: number;
  note?: string;
  photoUrl?: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
};
