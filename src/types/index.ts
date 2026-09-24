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
  /** Semt / mahalle (ör. Moda) */
  neighborhood: string;
  /** İlçe (ör. Kadıköy) */
  district: string;
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

/** Kaydın nereden geldiği: sosyal medyada görülen ya da uygulama içinde kaydedilen */
export type SaveOrigin = 'social' | 'app';

/** "Listem"e kaydedilen, henüz gidilmemiş mekân */
export type SavedPlace = {
  placeId: string;
  origin: SaveOrigin;
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
  /** Okul (üniversite) kimliği, bkz. data/schools */
  schoolId?: string;
};

export type Profile = {
  name: string;
  username: string;
  avatarUri?: string;
  /** Kayıtta alınan iletişim bilgileri (şifre asla cihazda saklanmaz) */
  phone?: string;
  email?: string;
  schoolId?: string;
};

/** Oturum açmış kullanıcının kimliği (Supabase gelene kadar sabit) */
export const ME = 'me';

export type Comment = {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
};

/** Kişi başı hesap aralığı */
export type PriceBucket = 'u250' | '250-500' | '500-1000' | '1000-2000' | 'o2000';

export type Meal = 'kahvalti' | 'ogle' | 'aksam' | 'gece';

/** Bir mekân hakkında paylaşılan gönderi: fotoğraflar, yorum, birlikte gidilen arkadaşlar */
export type Post = {
  id: string;
  userId: string;
  placeId: string;
  photos: string[];
  caption?: string;
  /** Gönderide etiketlenen arkadaşlar */
  taggedUserIds: string[];
  /** Paylaşanın o mekâna verdiği puan */
  score?: number;
  createdAt: string;
  /** Başkalarından gelen beğeni sayısı (kullanıcının kendi beğenisi hariç) */
  likeCount: number;
  /** Yapılandırılmış bilgiler (hepsi isteğe bağlı) */
  pricePerPerson?: PriceBucket;
  dishes?: string[];
  highlights?: string[];
  meal?: Meal;
};

/** Popüler feed'in hangi bölgeyi gösterdiği */
export type FeedArea = { type: 'near' } | { type: 'area'; city: string; district?: string };
