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
  | 'Tatlıcı'
  | 'Restoran'
  | 'Dönerci'
  | 'Köfteci'
  | 'Çiğ köfteci'
  | 'Pizzacı'
  | 'Uzak Doğu'
  | 'Dünya mutfağı'
  | 'Büfe & fast food'
  | 'Pastane & fırın'
  | 'Dondurmacı'
  | 'Bar'
  | 'Börekçi';

export type Place = {
  id: string;
  name: string;
  cuisine: Cuisine;
  /** Semt / mahalle (ör. Moda) */
  neighborhood: string;
  /** İlçe (ör. Kadıköy) */
  district: string;
  city: string;
  latitude: number;
  longitude: number;
  /** Sokak ve kapı no: "Güneşlibahçe Sk. No:48/B" (mahalle/ilçe ayrı alanlarda) */
  address?: string;
  /** E.164: "+902161234567" */
  phone?: string;
  /** Mekânın sitesi ya da Instagram'ı */
  website?: string;
  /** Kullanıcı bildirimleriyle kalıcı olarak kapandı */
  closed?: boolean;
  photoUrl?: string;
  /** Listeler için küçük boy kapak fotoğrafı */
  thumbUrl?: string;
};

/** Beli tarzı ilk izlenim */
export type Sentiment = 'liked' | 'fine' | 'disliked';

/** Birbiriyle kıyaslanan mekân ailesi (bkz. constants/segments) */
export type Segment =
  | 'restaurant'
  | 'kebab'
  | 'street'
  | 'fastfood'
  | 'breakfast'
  | 'bakery'
  | 'cafe'
  | 'dessert'
  | 'nightlife';

/** Kullanıcının puanladığı bir mekân. Puan, segmentindeki sıralamadan hesaplanır. */
export type RankedEntry = {
  placeId: string;
  segment: Segment;
  note?: string;
  ratedAt: string; // ISO tarih
  /** Listede bir üstteki mekânla aynı seviyede ("İkisi aynı"): puanları eşit */
  tied?: boolean;
};

/**
 * Her izlenim grubu en iyiden en kötüye sıralı. Segmentler aynı dizide karışık durur; bir segmentin
 * kendi sırası, dizideki o segmente ait kayıtların sırasıdır.
 */
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

/** Profil sayfası: kullanıcı + sayaçlar + mevcut kullanıcıyla ilişkisi */
export type UserProfile = User & {
  followerCount: number;
  followingCount: number;
  postCount: number;
  isFollowing: boolean;
  followsMe: boolean;
  joinedAt: string;
};

/** Oturum açmış kullanıcının kendi profili */
export type Profile = {
  id: string;
  name: string;
  username: string;
  avatarUri?: string;
  /** Depolamadaki avatar yolu (değiştirilince eskisi silinir) */
  avatarPath?: string;
  /** Yalnızca kullanıcının kendisinin görebildiği iletişim bilgisi */
  email?: string;
  schoolId?: string;
  yearGoal?: number;
  /** Favori 4: profilde ve hikâyede gösterilen, seçilen sırayla en fazla dört mekân (eski önbellekte yok) */
  favoritePlaces?: string[];
  joinedAt: string;
  onboardedAt?: string;
  /** Telefonu SMS ile doğrulandı (rehber eşleştirme için gerekli) */
  phoneVerified: boolean;
  /** Rehberinde numarası olanlar onu bulabilir */
  discoverable: boolean;
  /** "Seni kim davet etti?" dolduruldu (XP: davet edene +100, sana +50) */
  hasInviter?: boolean;
  /** Davet eden (elle ya da davet bağlantısıyla, `lib/invite-code`); kurulumda takip önerilerinin başında */
  inviterId?: string;
};

/** Kayıt sırasında hesap açılmadan önce toplanan bilgiler (şifre hariç; şifre cihazda saklanmaz) */
export type SignupDraft = {
  email?: string;
  name?: string;
  username?: string;
};

export type Comment = {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: string;
  /** Yanıtsa yanıtlanan yorum (o da bir yanıt olabilir; ekranda ilk yorumun altında toplanır) */
  parentId?: string;
  likeCount: number;
  likedByMe: boolean;
};

export type Meal = 'kahvalti' | 'ogle' | 'aksam' | 'gece';

/** Bir mekân hakkında paylaşılan gönderi: fotoğraflar, yorum, birlikte gidilen arkadaşlar */
export type Post = {
  id: string;
  userId: string;
  placeId: string;
  /** Tam boy fotoğraf adresleri */
  photos: string[];
  /** Izgaralar için küçük boy kopyalar (photos ile aynı sırada) */
  thumbs: string[];
  caption?: string;
  /** Gönderide etiketlenen arkadaşlar */
  taggedUserIds: string[];
  /** Paylaşanın o mekâna verdiği puan */
  score?: number;
  createdAt: string;
  /** Başkalarından gelen beğeni sayısı (kullanıcının kendi beğenisi hariç) */
  likeCount: number;
  commentCount: number;
  /** Sunucuya göre mevcut kullanıcı beğenmiş / kaydetmiş mi */
  likedByMe: boolean;
  savedByMe: boolean;
  /** Yapılandırılmış bilgiler (hepsi isteğe bağlı) */
  highlights?: string[];
  meal?: Meal;
};

/** Paylaşılabilir liste ("Kadıköy'de en iyi dürümcülerim"): kart ve başlık bilgisi */
export type PlaceList = {
  id: string;
  title: string;
  description?: string;
  author: User;
  placeCount: number;
  /** Başkalarının kaydetme sayısı */
  saveCount: number;
  /** En iyi 3 mekânın küçük kapak fotoğrafları */
  covers: string[];
  savedByMe: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Listedeki mekân: sahibinin güncel puanı ve listeye özel notu */
export type PlaceListItem = { place: Place; score?: number; note?: string };

/** Popüler feed'in hangi bölgeyi gösterdiği */
export type FeedArea = { type: 'near' } | { type: 'area'; city: string; district?: string };

export type NotificationKind =
  | 'like'
  | 'comment'
  | 'reply'
  | 'comment_like'
  | 'tag'
  | 'follow'
  | 'friend_rated'
  | 'friend_joined';

/** Keşfet'te bulunan bölge: şehir, ilçe ya da mahalle */
export type AreaHit = {
  kind: 'city' | 'district' | 'neighborhood';
  name: string;
  city: string;
  /** Mahallenin ilçesi; ilçenin kendisi; şehirde yok */
  district?: string;
  placeCount: number;
};

/** Neden önerildiği: en güçlü bağ (bkz. people_you_may_know) */
export type SuggestionReason = 'follows_you' | 'contact' | 'together' | 'mutual' | 'engaged' | 'school' | 'popular';

/** "Tanıyor olabileceğin kişiler" satırı */
export type PersonSuggestion = {
  user: User;
  reason: SuggestionReason;
  mutualCount: number;
  /** Ortak arkadaşlardan birinin adı ("Ayşe ve 2 kişi daha takip ediyor") */
  mutualName?: string;
};

/** Bildirim merkezindeki bir satır */
export type AppNotification = {
  id: string;
  kind: NotificationKind;
  createdAt: string;
  read: boolean;
  actor: User;
  postId?: string;
  placeId?: string;
  placeName?: string;
  /** Gönderinin küçük boy ilk fotoğrafı */
  thumbUrl?: string;
  comment?: string;
  /** "Arkadaşın gittiğin yeri puanladı": onun ve senin puanın */
  score?: number;
  myScore?: number;
  /** Bildirimi yapanı takip ediyor musun (takip bildiriminde geri takip düğmesi) */
  following: boolean;
};

/** Yıllık hedef yarışında bir kişi: hedef (koymadıysa yok) ve bu yıl puanladığı mekân sayısı */
export type YearChallengeEntry = {
  userId: string;
  goal?: number;
  done: number;
};
