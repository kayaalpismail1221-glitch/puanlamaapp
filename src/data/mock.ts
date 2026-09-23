import type { Comment, Place, Post, User } from '@/types';

/**
 * Geliştirme için sahte veri. Mekân adları kurgusaldır.
 * Supabase ve mekân API'si bağlanınca bu dosya kaldırılacak.
 */

const photo = (id: string) => `https://images.unsplash.com/${id}?w=800&q=70&auto=format&fit=crop`;

const PHOTOS = {
  kahvalti: photo('photo-1533089860892-a7c6f0a88666'),
  sofra: photo('photo-1504674900247-0877df9cc836'),
  izgara: photo('photo-1555939594-58d7cb561ad1'),
  balik: photo('photo-1519708227418-c8fd9a32b7a2'),
  meze: photo('photo-1540189549336-e6e99c3679fe'),
  salata: photo('photo-1546069901-ba9599a7e63c'),
  burger: photo('photo-1568901346375-23c9450c58cd'),
  kahve: photo('photo-1495474472287-4d71bcdd2085'),
  tatli: photo('photo-1488477181946-6428a0291777'),
  pide: photo('photo-1565299624946-b28f40a0ae38'),
  mekan: photo('photo-1517248135467-4c7edcad34c4'),
  mekan2: photo('photo-1414235077428-338989a2e8c0'),
};

export const PLACES: Place[] = [
  { id: 'p1', name: 'Serpme Kahvaltı Evi', cuisine: 'Kahvaltıcı', neighborhood: 'Moda', district: 'Kadıköy', city: 'İstanbul', priceLevel: 2, latitude: 40.9846, longitude: 29.0268, photoUrl: PHOTOS.kahvalti },
  { id: 'p2', name: 'Hünkâr Esnaf Lokantası', cuisine: 'Esnaf lokantası', neighborhood: 'Kadıköy Çarşı', district: 'Kadıköy', city: 'İstanbul', priceLevel: 1, latitude: 40.9905, longitude: 29.0254, photoUrl: PHOTOS.sofra },
  { id: 'p3', name: 'Dürümcü Hasan Usta', cuisine: 'Dürümcü', neighborhood: 'Çarşı', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 1, latitude: 41.0431, longitude: 29.0059, photoUrl: PHOTOS.izgara },
  { id: 'p4', name: 'Kokoreççi Rıza', cuisine: 'Kokoreççi', neighborhood: 'Çarşı', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 1, latitude: 41.0441, longitude: 29.0031 },
  { id: 'p5', name: 'Ciğerci Bekir', cuisine: 'Ciğerci', neighborhood: 'Yeldeğirmeni', district: 'Kadıköy', city: 'İstanbul', priceLevel: 2, latitude: 40.9951, longitude: 29.0292, photoUrl: PHOTOS.izgara },
  { id: 'p6', name: 'Rumeli Balıkçısı', cuisine: 'Balıkçı', neighborhood: 'Rumelihisarı', district: 'Sarıyer', city: 'İstanbul', priceLevel: 3, latitude: 41.0848, longitude: 29.0567, photoUrl: PHOTOS.balik },
  { id: 'p7', name: 'Meyhane Asmalı', cuisine: 'Meyhane', neighborhood: 'Asmalımescit', district: 'Beyoğlu', city: 'İstanbul', priceLevel: 3, latitude: 41.0318, longitude: 28.9762, photoUrl: PHOTOS.meze },
  { id: 'p8', name: 'Kuzguncuk Meze Evi', cuisine: 'Meyhane', neighborhood: 'Kuzguncuk', district: 'Üsküdar', city: 'İstanbul', priceLevel: 3, latitude: 41.0356, longitude: 29.0311, photoUrl: PHOTOS.meze },
  { id: 'p9', name: 'Etiler Burger Co.', cuisine: 'Burgerci', neighborhood: 'Etiler', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 2, latitude: 41.0812, longitude: 29.0334, photoUrl: PHOTOS.burger },
  { id: 'p10', name: 'Hisarüstü Kahve', cuisine: 'Kafe', neighborhood: 'Hisarüstü', district: 'Sarıyer', city: 'İstanbul', priceLevel: 1, latitude: 41.0857, longitude: 29.0443, photoUrl: PHOTOS.kahve },
  { id: 'p11', name: 'Karadeniz Pide Salonu', cuisine: 'Pideci', neighborhood: 'Çarşı', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 1, latitude: 41.0422, longitude: 29.0072, photoUrl: PHOTOS.pide },
  { id: 'p12', name: 'Adana Ocakbaşı', cuisine: 'Kebapçı', neighborhood: 'Levent', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 2, latitude: 41.0781, longitude: 29.0123, photoUrl: PHOTOS.izgara },
  { id: 'p13', name: 'Bahariye Tatlıcısı', cuisine: 'Tatlıcı', neighborhood: 'Bahariye', district: 'Kadıköy', city: 'İstanbul', priceLevel: 1, latitude: 40.9878, longitude: 29.0305, photoUrl: PHOTOS.tatli },
  { id: 'p14', name: 'Arnavutköy Kahvaltı Bahçesi', cuisine: 'Kahvaltıcı', neighborhood: 'Arnavutköy', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 2, latitude: 41.0676, longitude: 29.0431, photoUrl: PHOTOS.kahvalti },
  { id: 'p15', name: 'Yeşil Tabak', cuisine: 'Kafe', neighborhood: 'Cihangir', district: 'Beyoğlu', city: 'İstanbul', priceLevel: 2, latitude: 41.0319, longitude: 28.9834, photoUrl: PHOTOS.salata },
  { id: 'p16', name: 'Çarşı Balık Ekmek', cuisine: 'Balıkçı', neighborhood: 'Çarşı', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 1, latitude: 41.0425, longitude: 29.0049, photoUrl: PHOTOS.balik },
  { id: 'p17', name: 'Usta Ev Yemekleri', cuisine: 'Esnaf lokantası', neighborhood: 'Levent', district: 'Beşiktaş', city: 'İstanbul', priceLevel: 1, latitude: 41.0795, longitude: 29.0101, photoUrl: PHOTOS.sofra },
  { id: 'p18', name: 'Moda Sahil Meyhanesi', cuisine: 'Meyhane', neighborhood: 'Moda', district: 'Kadıköy', city: 'İstanbul', priceLevel: 3, latitude: 40.9818, longitude: 29.0249, photoUrl: PHOTOS.mekan2 },
  // Ankara
  { id: 'p19', name: 'Kızılay Döner Evi', cuisine: 'Dürümcü', neighborhood: 'Kızılay', district: 'Çankaya', city: 'Ankara', priceLevel: 1, latitude: 39.9208, longitude: 32.8541, photoUrl: PHOTOS.izgara },
  { id: 'p20', name: 'Bahçeli Kahvaltı Sokağı', cuisine: 'Kahvaltıcı', neighborhood: 'Bahçelievler', district: 'Çankaya', city: 'Ankara', priceLevel: 2, latitude: 39.9227, longitude: 32.8237, photoUrl: PHOTOS.kahvalti },
  { id: 'p21', name: 'Tunalı Meyhanesi', cuisine: 'Meyhane', neighborhood: 'Kavaklıdere', district: 'Çankaya', city: 'Ankara', priceLevel: 3, latitude: 39.905, longitude: 32.86, photoUrl: PHOTOS.meze },
  { id: 'p22', name: 'Ulus Esnaf Lokantası', cuisine: 'Esnaf lokantası', neighborhood: 'Ulus', district: 'Altındağ', city: 'Ankara', priceLevel: 1, latitude: 39.9416, longitude: 32.8547, photoUrl: PHOTOS.sofra },
  // İzmir
  { id: 'p23', name: 'Kordon Balık', cuisine: 'Balıkçı', neighborhood: 'Alsancak', district: 'Konak', city: 'İzmir', priceLevel: 3, latitude: 38.438, longitude: 27.143, photoUrl: PHOTOS.balik },
  { id: 'p24', name: 'Kemeraltı Boyoz Kahvaltı', cuisine: 'Kahvaltıcı', neighborhood: 'Kemeraltı', district: 'Konak', city: 'İzmir', priceLevel: 1, latitude: 38.4189, longitude: 27.1287, photoUrl: PHOTOS.kahvalti },
  { id: 'p25', name: 'Bornova Kokoreç', cuisine: 'Kokoreççi', neighborhood: 'Küçükpark', district: 'Bornova', city: 'İzmir', priceLevel: 1, latitude: 38.4622, longitude: 27.2166 },
  { id: 'p26', name: 'Karşıyaka Çarşı Tatlıcısı', cuisine: 'Tatlıcı', neighborhood: 'Çarşı', district: 'Karşıyaka', city: 'İzmir', priceLevel: 1, latitude: 38.4561, longitude: 27.1098, photoUrl: PHOTOS.tatli },
];

export const USERS: User[] = [
  { id: 'u1', name: 'Zeynep Aksoy', username: 'zeynepyer', avatarUrl: 'https://i.pravatar.cc/200?img=47' },
  { id: 'u2', name: 'Emre Kaya', username: 'emrekaya', avatarUrl: 'https://i.pravatar.cc/200?img=12' },
  { id: 'u3', name: 'Deniz Yıldız', username: 'denizyildiz', avatarUrl: 'https://i.pravatar.cc/200?img=32' },
  { id: 'u4', name: 'Can Öztürk', username: 'canozturk', avatarUrl: 'https://i.pravatar.cc/200?img=15' },
  { id: 'u5', name: 'Elif Demir', username: 'elifdemir', avatarUrl: 'https://i.pravatar.cc/200?img=45' },
  { id: 'u6', name: 'Mert Şahin', username: 'mertsahin', avatarUrl: 'https://i.pravatar.cc/200?img=53' },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export const POSTS: Post[] = [
  { id: 'g1', userId: 'u1', placeId: 'p1', score: 9.4, photos: [PHOTOS.kahvalti, PHOTOS.kahve], caption: 'Pazar sabahı için en iyisi. Menemen efsane, çay sınırsız.', taggedUserIds: ['u3'], createdAt: hoursAgo(2), likeCount: 12 },
  { id: 'g2', userId: 'u2', placeId: 'p4', score: 8.8, photos: [PHOTOS.izgara], caption: 'Gece 2’de bile kuyruk vardı, hak ediyor.', taggedUserIds: ['u4', 'u6'], createdAt: hoursAgo(5), likeCount: 8 },
  { id: 'g3', userId: 'u3', placeId: 'p7', score: 8.1, photos: [PHOTOS.meze, PHOTOS.mekan2, PHOTOS.balik], caption: 'Mezeler taze, fava ve topik mutlaka. Rakı masası için ideal.', taggedUserIds: ['u1', 'u5'], createdAt: hoursAgo(9), likeCount: 21 },
  { id: 'g4', userId: 'u4', placeId: 'p9', score: 6.2, photos: [PHOTOS.burger], caption: 'Fena değil ama fiyatına göre küçük.', taggedUserIds: [], createdAt: hoursAgo(20), likeCount: 4 },
  { id: 'g5', userId: 'u5', placeId: 'p2', score: 9.0, photos: [PHOTOS.sofra], caption: 'Kuru fasulye pilav, annemin yemeği gibi.', taggedUserIds: [], createdAt: hoursAgo(26), likeCount: 15 },
  { id: 'g6', userId: 'u1', placeId: 'p6', score: 8.6, photos: [PHOTOS.balik, PHOTOS.meze], caption: 'Manzara + levrek. Ders çıkışı gidilir.', taggedUserIds: ['u2'], createdAt: hoursAgo(40), likeCount: 30 },
  { id: 'g7', userId: 'u6', placeId: 'p3', score: 7.4, photos: [PHOTOS.izgara], caption: 'Acılı dürüm iyi, lavaş biraz kuru.', taggedUserIds: [], createdAt: hoursAgo(52), likeCount: 3 },
  { id: 'g8', userId: 'u2', placeId: 'p13', score: 7.9, photos: [PHOTOS.tatli], caption: 'Kazandibi çok iyi.', taggedUserIds: [], createdAt: hoursAgo(70), likeCount: 9 },
  { id: 'g9', userId: 'u3', placeId: 'p10', score: 8.3, photos: [PHOTOS.kahve], caption: 'Ders çalışmak için sessiz ve priz bol.', taggedUserIds: [], createdAt: hoursAgo(96), likeCount: 11 },
  { id: 'g10', userId: 'u5', placeId: 'p7', score: 7.6, photos: [PHOTOS.mekan2], caption: 'Servis biraz yavaştı ama ortam güzel.', taggedUserIds: [], createdAt: hoursAgo(120), likeCount: 6 },
  { id: 'g11', userId: 'u6', placeId: 'p1', score: 8.9, photos: [PHOTOS.kahvalti], caption: 'Hafta içi sabah sakin, tavsiye.', taggedUserIds: [], createdAt: hoursAgo(150), likeCount: 5 },
  { id: 'g12', userId: 'u4', placeId: 'p20', score: 9.1, photos: [PHOTOS.kahvalti], caption: 'Ankara’da serpme kahvaltının adresi. Sucuklu yumurta şahane.', taggedUserIds: ['u6'], createdAt: hoursAgo(6), likeCount: 27 },
  { id: 'g13', userId: 'u6', placeId: 'p19', score: 8.4, photos: [PHOTOS.izgara], caption: 'Kızılay’da gece yarısı dönerci. Porsiyon büyük.', taggedUserIds: [], createdAt: hoursAgo(14), likeCount: 18 },
  { id: 'g14', userId: 'u5', placeId: 'p21', score: 7.8, photos: [PHOTOS.meze, PHOTOS.mekan2], caption: 'Tunalı’da samimi bir meyhane, ara sıcaklar iyi.', taggedUserIds: ['u3'], createdAt: hoursAgo(30), likeCount: 12 },
  { id: 'g15', userId: 'u2', placeId: 'p22', score: 8.9, photos: [PHOTOS.sofra], caption: 'Ulus’ta öğlen kuyruğu var ama değer. Etli nohut 10/10.', taggedUserIds: [], createdAt: hoursAgo(48), likeCount: 22 },
  { id: 'g16', userId: 'u1', placeId: 'p23', score: 8.7, photos: [PHOTOS.balik], caption: 'Kordon’da gün batımı + çipura. İzmir’e gelen gitsin.', taggedUserIds: ['u5'], createdAt: hoursAgo(4), likeCount: 41 },
  { id: 'g17', userId: 'u3', placeId: 'p24', score: 9.2, photos: [PHOTOS.kahvalti], caption: 'Boyoz, yumurta, çay. İzmir sabahı böyle başlar.', taggedUserIds: [], createdAt: hoursAgo(10), likeCount: 35 },
  { id: 'g18', userId: 'u4', placeId: 'p25', score: 8.0, photos: [PHOTOS.izgara], caption: 'Öğrenci dostu fiyat, kokoreç bol baharatlı.', taggedUserIds: [], createdAt: hoursAgo(28), likeCount: 9 },
  { id: 'g19', userId: 'u6', placeId: 'p26', score: 7.5, photos: [PHOTOS.tatli], caption: 'Lokma sıcak sıcak geliyor.', taggedUserIds: [], createdAt: hoursAgo(60), likeCount: 7 },
];

export const COMMENTS: Comment[] = [
  { id: 'c1', postId: 'g1', userId: 'u2', text: 'Bir dahakine beni de çağır!', createdAt: hoursAgo(1.5) },
  { id: 'c2', postId: 'g1', userId: 'u3', text: 'Menemen gerçekten iyiydi 🙌', createdAt: hoursAgo(1) },
  { id: 'c3', postId: 'g3', userId: 'u4', text: 'Rezervasyon gerekiyor mu?', createdAt: hoursAgo(8) },
  { id: 'c4', postId: 'g3', userId: 'u3', text: 'Hafta sonu kesin gerekiyor.', createdAt: hoursAgo(7) },
  { id: 'c5', postId: 'g6', userId: 'u5', text: 'Fiyatlar nasıl?', createdAt: hoursAgo(30) },
  { id: 'c6', postId: 'g16', userId: 'u2', text: 'Kesin gidiyorum!', createdAt: hoursAgo(3) },
  { id: 'c7', postId: 'g16', userId: 'u4', text: 'Rezervasyon şart mı?', createdAt: hoursAgo(2) },
  { id: 'c8', postId: 'g12', userId: 'u1', text: 'Ankara’ya gelince ilk durak.', createdAt: hoursAgo(5) },
];

/** Varsayılan harita merkezi: Beşiktaş–Bebek hattı */
export const DEFAULT_REGION = {
  latitude: 41.03,
  longitude: 29.02,
  latitudeDelta: 0.14,
  longitudeDelta: 0.14,
};

export const placeById = (id: string) => PLACES.find((p) => p.id === id);
export const userById = (id: string) => USERS.find((u) => u.id === id);

/** Türkçe duyarlı basit arama */
export function searchPlaces(query: string): Place[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return PLACES;
  return PLACES.filter((p) =>
    [p.name, p.cuisine, p.neighborhood, p.district, p.city].some((f) => f.toLocaleLowerCase('tr').includes(q)),
  );
}

export function searchUsers(query: string): User[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return USERS;
  return USERS.filter((u) =>
    [u.name, u.username].some((f) => f.toLocaleLowerCase('tr').includes(q)),
  );
}
