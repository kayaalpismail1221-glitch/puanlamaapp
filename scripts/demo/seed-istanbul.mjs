/**
 * Gerçek İstanbul mekânları (OSM) üzerine demo içerik: 7 kullanıcı, 25 gönderi, puanlar, beğeni ve yorumlar.
 * Demo hesaplar `@demo.puanla.app` uzantılıdır, şifresizdir (giriş yapılamaz).
 * Tekrar çalıştırılırsa önce eski demo hesapları (ve tüm içerikleri) silinir.
 * Tamamen kaldırmak için: supabase/scripts/remove-demo-data.sql
 *
 * Çalıştırma: npm run demo:seed  (.env.local'da SUPABASE_SERVICE_ROLE_KEY gerekir)
 */
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { SENTIMENT_ORDER, scoreAt } from '../../src/lib/ranking.ts';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local içinde olmalı.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const DOMAIN = '@demo.puanla.app';

const USERS = {
  selin: { name: 'Selin Arslan', username: 'selinarslan', avatar: 47, school: 'bogazici' },
  kaan: { name: 'Kaan Yılmaz', username: 'kaanyilmaz', avatar: 12, school: 'istanbul-teknik' },
  ece: { name: 'Ece Koç', username: 'ecekoc', avatar: 44, school: 'bogazici' },
  burak: { name: 'Burak Çelik', username: 'burakcelik', avatar: 15, school: 'yildiz-teknik' },
  defne: { name: 'Defne Aydın', username: 'defneaydin', avatar: 32, school: 'galatasaray' },
  onur: { name: 'Onur Polat', username: 'onurpolat', avatar: 53, school: 'marmara' },
  melis: { name: 'Melis Güneş', username: 'melisgunes', avatar: 49, school: 'istanbul-bilgi' },
};

// Mekânlar ad + mahalleyle bulunur (OSM verisindeki yazımıyla)
const PLACES = {
  ciya: ['Çiya Sofrası', 'Caferağa'],
  baylan: ['Baylan Pastanesi', 'Caferağa'],
  cavit: ['Asmalı Cavit', 'Asmalı Mescit'],
  durumzade: ['Dürümzade', 'Hüseyinağa'],
  kizilkayalar: ['Kızılkayalar Hamburger', 'Caferağa'],
  zubeyir: ['Zübeyir Ocakbaşı', 'Şehit Muhtar'],
  pandeli: ['Pandeli', 'Rüstempaşa'],
  cag: ['Şehzade Cağ Kebap', 'Hocapaşa'],
  kronotrop: ['Kronotrop Cihangir', 'Kuloğlu'],
  petra: ['Petra Roasting', 'Bebek'],
  hafiz: ['Hafiz Mustafa 1864', 'Hocapaşa'],
  kasap: ['Kasap Doner', 'Caferağa'],
  borsam: ['Borsam Taş Fırın Rıhtım', 'Osmanağa'],
  sutis: ['Emirgan Sütiş', 'Emirgan'],
  van: ['Van Kahvaltı Evi', 'Kılıçali Paşa'],
  arnavutkoy: ['Arnavutköy Balıkçısı', 'Arnavutköy'],
  midye: ['Kadikoy Midyecisi', 'Caferağa'],
  yare: ['Yare Meyhane', 'Asmalı Mescit'],
  karakoy: ['Karaköy Lokantası', 'Kemankeş Karamustafa Paşa'],
  kokorec: ['Şampiyon Kokoreç', 'Hüseyinağa'],
  mitto: ['Mitto Pizza', 'Kuloğlu'],
};

const img = (id) => `https://images.unsplash.com/photo-${id}?w=1080&q=75&auto=format&fit=crop`;
const PHOTOS = {
  kahvalti: img('1533089860892-a7c6f0a88666'),
  kahve: img('1509042239860-f550ce710b93'),
  kahve2: img('1495474472287-4d71bcdd2085'),
  kebap: img('1555939594-58d7cb561ad1'),
  doner: img('1529006557810-274b9b2fc783'),
  izgara: img('1544025162-d76694265947'),
  meze: img('1540189549336-e6e99c3679fe'),
  restoran: img('1414235077428-338989a2e8c0'),
  balik: img('1519708227418-c8fd9a32b7a2'),
  burger: img('1551782450-a2132b4ba21d'),
  esnaf: img('1504674900247-0877df9cc836'),
  pilav: img('1603133872878-684f208fb84b'),
  tatli: img('1488477181946-6428a0291777'),
  krep: img('1519676867240-f03562e64548'),
  pizza: img('1565299624946-b28f40a0ae38'),
  firin: img('1509440159596-0249088772ff'),
};

/** score: kullanıcının niyet ettiği puan; gerçek puan sıralama formülünden gelir */
const POSTS = [
  { user: 'selin', place: 'ciya', score: 9.6, hours: 3, meal: 'ogle', photos: ['esnaf', 'meze'], tags: ['ece'], highlights: ['Fiyat/performans'], caption: 'Kadıköy’e gelip Çiya’ya uğramamak olmaz. Günün tenceresinden ne varsa söyleyin, hepsi ayrı güzel.' },
  { user: 'kaan', place: 'zubeyir', score: 9.3, hours: 5, meal: 'aksam', photos: ['izgara', 'kebap'], tags: ['burak'], highlights: ['Kalabalık gruba uygun'], caption: 'Ocakbaşına oturun, ustayı izleyin. Adana ve kaburga efsane, lavaşı közde ısıtıyorlar.' },
  { user: 'ece', place: 'baylan', score: 8.7, hours: 8, meal: 'ogle', photos: ['tatli'], highlights: ['Sessiz, sohbetlik', 'Tatlısı iyi'], caption: 'Kup Griye yemeden çıkmayın. Eski İstanbul havası hâlâ yerinde.' },
  { user: 'defne', place: 'cavit', score: 9.1, hours: 11, meal: 'aksam', photos: ['meze', 'restoran'], tags: ['melis'], highlights: ['Rezervasyon şart'], caption: 'Klasik meyhane dendiğinde aklıma ilk gelen yer. Mezeler taze, ciğer tava mutlaka.' },
  { user: 'burak', place: 'durumzade', score: 8.9, hours: 14, meal: 'gece', photos: ['doner'], highlights: ['Hızlı servis', 'Öğrenci dostu'], caption: 'Gece 1’de Beyoğlu’ndan çıkınca tek adres. Adana dürüm acılı söyleyin.' },
  { user: 'onur', place: 'kizilkayalar', score: 7.4, hours: 16, meal: 'gece', photos: ['burger'], highlights: ['Öğrenci dostu'], caption: 'Islak hamburger klasiği. Gurme değil ama gece gece başka türlü keyifli.' },
  { user: 'melis', place: 'kronotrop', score: 8.4, hours: 20, meal: 'ogle', photos: ['kahve'], highlights: ['Sessiz, sohbetlik'], caption: 'Filtre kahveleri gerçekten iyi, barista ne içmek istediğimi sorup önerdi. Cihangir sokaklarına bakan cam kenarı favorim.' },
  { user: 'selin', place: 'petra', score: 8.1, hours: 26, meal: 'kahvalti', photos: ['kahve2'], highlights: ['Manzaralı'], caption: 'Bebek sahilinde yürüyüşten önce kahve molası. Flat white başarılı, kurabiyeler biraz pahalı.' },
  { user: 'kaan', place: 'cag', score: 9.4, hours: 30, meal: 'ogle', photos: ['doner', 'kebap'], highlights: ['Fiyat/performans', 'Porsiyon büyük'], caption: 'Erzurum usulü cağ kebabı İstanbul’da bundan iyisini bulamadım. Şişi bitirmeden bir sonraki geliyor.' },
  { user: 'ece', place: 'hafiz', score: 7.8, hours: 34, meal: 'aksam', photos: ['tatli'], highlights: ['Tatlısı iyi'], caption: 'Fıstıklı baklava ve künefe söyledik. Turist kalabalığı var ama lezzet tutarlı.' },
  { user: 'defne', place: 'pandeli', score: 8.6, hours: 40, meal: 'ogle', photos: ['restoran'], highlights: ['Manzaralı'], caption: 'Mısır Çarşısı’nın üstünde, turkuaz çiniler arasında öğle yemeği. Patlıcan böreği çok iyi.' },
  { user: 'burak', place: 'kasap', score: 8.2, hours: 46, meal: 'ogle', photos: ['doner'], highlights: ['Hızlı servis'], caption: 'Yaprak döner ince ince, yağı dengeli. Porsiyon biraz küçük ama tadı yerinde.' },
  { user: 'onur', place: 'borsam', score: 8.8, hours: 52, meal: 'aksam', photos: ['kebap'], highlights: ['Fiyat/performans'], caption: 'Taş fırından çıkan lahmacun incecik ve çıtır. Yanına ayran, başka bir şey istemez.' },
  { user: 'melis', place: 'sutis', score: 7.6, hours: 60, meal: 'kahvalti', photos: ['kahvalti', 'krep'], tags: ['defne'], highlights: ['Manzaralı', 'Kalabalık gruba uygun'], caption: 'Boğaz manzarasına karşı kahvaltı. Hafta sonu sıra var, erken gidin. Sütlaçları hâlâ en iyisi.' },
  { user: 'selin', place: 'van', score: 9.0, hours: 70, meal: 'kahvalti', photos: ['kahvalti'], tags: ['kaan', 'ece'], highlights: ['Porsiyon büyük'], caption: 'Otlu peynir, murtuğa, kavut… Van kahvaltısının hakkını veriyorlar. Pazar sabahı için ideal.' },
  { user: 'kaan', place: 'arnavutkoy', score: 8.0, hours: 76, meal: 'aksam', photos: ['balik', 'meze'], highlights: ['Manzaralı'], caption: 'Levrek ızgara tam kıvamında, deniz kenarında akşam serinliği ayrı güzel.' },
  { user: 'ece', place: 'midye', score: 7.2, hours: 84, meal: 'gece', photos: ['balik'], highlights: ['Öğrenci dostu'], caption: 'Midye dolma taze ve limonu bol. Çarşıda gezerken ayakta 10 tane gider.' },
  { user: 'defne', place: 'yare', score: 8.3, hours: 90, meal: 'aksam', photos: ['meze'], tags: ['melis', 'selin'], highlights: ['Sessiz, sohbetlik'], caption: 'Asmalı’nın gürültüsünden uzak, samimi bir meyhane. Fava ve topik çok iyiydi.' },
  { user: 'burak', place: 'karakoy', score: 8.5, hours: 100, meal: 'ogle', photos: ['pilav', 'esnaf'], highlights: ['Fiyat/performans'], caption: 'Öğlen menüsü tam esnaf lokantası tadında, akşamları meyhaneye dönüyor. Hünkâr beğendi harika.' },
  { user: 'onur', place: 'kokorec', score: 6.1, hours: 110, meal: 'gece', photos: ['kebap'], highlights: [], caption: 'Kokoreç fena değil ama biraz yağlıydı, ekmek de bayattı. Başka zaman tekrar denerim.' },
  { user: 'melis', place: 'mitto', score: 7.9, hours: 120, meal: 'aksam', photos: ['pizza'], highlights: ['Hızlı servis'], caption: 'İnce hamur, odun fırını. Margherita basit ama başarılı.' },
  // Aynı mekâna farklı kişilerden ikinci gönderiler
  { user: 'melis', place: 'ciya', score: 9.2, hours: 130, meal: 'aksam', photos: ['meze'], highlights: ['Porsiyon büyük'], caption: 'Güneydoğu mutfağından bilmediğim üç yemek denedim, hepsi ayrı dünya. Kebaplarına da ayrıca gitmek lazım.' },
  { user: 'burak', place: 'zubeyir', score: 8.7, hours: 140, meal: 'aksam', photos: ['izgara'], highlights: ['Rezervasyon şart'], caption: 'Hafta sonu rezervasyonsuz gitmeyin. Ciğer şiş ve çoban salata çok iyi.' },
  { user: 'defne', place: 'van', score: 8.4, hours: 150, meal: 'kahvalti', photos: ['kahvalti'], highlights: ['Kalabalık gruba uygun'], caption: 'Kalabalık grupla serpme kahvaltı yaptık, eksik olan hemen tamamlandı.' },
  { user: 'kaan', place: 'kizilkayalar', score: 6.4, hours: 160, meal: 'gece', photos: ['burger'], highlights: [], caption: 'Nostalji için güzel ama bu sefer ekmek çok ıslaktı. İdare eder.' },
];

// Gönderisiz puanlar: haritada ortalamalar birden fazla kişiden oluşsun
const EXTRA_RATINGS = [
  ['ece', 'ciya', 9.4], ['kaan', 'ciya', 9.0], ['onur', 'zubeyir', 9.0], ['selin', 'cavit', 8.8],
  ['melis', 'durumzade', 8.3], ['onur', 'durumzade', 8.6], ['defne', 'kronotrop', 8.0], ['selin', 'kronotrop', 7.7],
  ['burak', 'cag', 9.1], ['selin', 'hafiz', 7.2], ['onur', 'kasap', 7.9], ['ece', 'borsam', 8.4],
  ['burak', 'sutis', 7.0], ['melis', 'arnavutkoy', 8.5], ['kaan', 'yare', 7.8], ['ece', 'karakoy', 8.8],
  ['defne', 'mitto', 7.1], ['burak', 'kokorec', 5.4], ['selin', 'baylan', 8.2], ['onur', 'pandeli', 7.5],
];

const COMMENTS = [
  [0, 'kaan', 'Bir dahakine beni de çağırın!'],
  [0, 'ece', 'Etli ekmek de çok iyiydi 🙌'],
  [1, 'onur', 'Rezervasyon gerekiyor mu?'],
  [1, 'kaan', 'Hafta sonu kesin gerekiyor.'],
  [3, 'selin', 'Ciğer tava gerçekten başka.'],
  [4, 'melis', 'Gece dürümcüsü ararken tam aradığım buydu.'],
  [8, 'burak', 'Cağ kebap listemde, bu hafta gidiyorum.'],
  [14, 'defne', 'Murtuğa neydi ya, hâlâ aklımda.'],
  [17, 'kaan', 'Asmalı’da sakin yer bulmak zor, not aldım.'],
  [19, 'ece', 'Bence Beşiktaş’taki daha iyi, bir de oraya bak.'],
];

const sentimentOf = (score) => (score >= 6.7 ? 'liked' : score >= 3.4 ? 'fine' : 'disliked');
const hoursAgo = (h) => new Date(Date.now() - h * 3600_000).toISOString();

async function check(result, label) {
  const { error, data } = await result;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

// 1) Eski demo hesaplarını sil (içerikleri cascade ile gider)
const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
for (const u of list.users.filter((u) => u.email?.endsWith(DOMAIN))) {
  await db.auth.admin.deleteUser(u.id);
}

// 2) Mekânları bul
const placeIds = {};
for (const [k, [name, neighborhood]] of Object.entries(PLACES)) {
  const rows = await check(
    db.from('places').select('id').eq('source', 'osm').eq('name', name).eq('neighborhood', neighborhood).limit(1),
    `mekân ${name}`,
  );
  if (!rows.length) throw new Error(`Mekân bulunamadı: ${name} (${neighborhood})`);
  placeIds[k] = rows[0].id;
}

// 3) Kullanıcılar ve profiller
const userIds = {};
for (const [k, u] of Object.entries(USERS)) {
  const { data, error } = await db.auth.admin.createUser({
    email: `${u.username}${DOMAIN}`,
    email_confirm: true,
    user_metadata: { name: u.name, username: u.username },
  });
  if (error) throw error;
  userIds[k] = data.user.id;
  await check(
    db
      .from('profiles')
      .update({ avatar_path: `https://i.pravatar.cc/200?img=${u.avatar}`, school_id: u.school, onboarded_at: hoursAgo(400) })
      .eq('id', data.user.id),
    'profil',
  );
}
const ids = Object.keys(USERS);

// 4) Takip: herkes çoğu kişiyi takip eder
const follows = [];
ids.forEach((a, i) => ids.forEach((b, j) => a !== b && (i + j) % 3 !== 0 && follows.push({ follower_id: userIds[a], followee_id: userIds[b] })));
await check(db.from('follows').insert(follows), 'takip');

// 5) Sıralamalar: kişi başına grup içi sıra, puan uygulamanın formülüyle
const ratings = {};
for (const p of POSTS) (ratings[p.user] ??= new Map()).set(p.place, { score: p.score, at: p.hours });
for (const [u, place, score] of EXTRA_RATINGS) if (!ratings[u].has(place)) ratings[u].set(place, { score, at: 200 });
const finalScore = {};
const rankingRows = [];
for (const [u, map] of Object.entries(ratings)) {
  for (const sentiment of SENTIMENT_ORDER) {
    const group = [...map.entries()].filter(([, r]) => sentimentOf(r.score) === sentiment).sort((a, b) => b[1].score - a[1].score);
    group.forEach(([place, r], index) => {
      const score = scoreAt(sentiment, index, group.length);
      finalScore[`${u}/${place}`] = score;
      rankingRows.push({ user_id: userIds[u], place_id: placeIds[place], sentiment, position: index, score, rated_at: hoursAgo(r.at) });
    });
  }
}
await check(db.from('rankings').insert(rankingRows), 'sıralama');

// 6) Gönderiler, fotoğraflar, etiketler
const postIds = [];
for (const p of POSTS) {
  const id = randomUUID();
  postIds.push(id);
  await check(
    db.from('posts').insert({
      id,
      user_id: userIds[p.user],
      place_id: placeIds[p.place],
      caption: p.caption,
      score: finalScore[`${p.user}/${p.place}`],
      meal: p.meal,
      highlights: p.highlights,
      created_at: hoursAgo(p.hours),
    }),
    'gönderi',
  );
  await check(
    db.from('post_photos').insert(p.photos.map((ph, position) => ({ post_id: id, position, path: PHOTOS[ph], width: 1080, height: 1350 }))),
    'fotoğraf',
  );
  if (p.tags?.length) {
    await check(db.from('post_tags').insert(p.tags.map((t) => ({ post_id: id, user_id: userIds[t] }))), 'etiket');
  }
}

// 7) Beğeniler (puanı yüksek ve yeni gönderi daha çok beğenilir) ve yorumlar
const likes = [];
POSTS.forEach((p, i) => {
  const count = Math.max(1, Math.min(ids.length - 1, Math.round((p.score - 5) * 1.4) - Math.floor(p.hours / 60)));
  ids.filter((u) => u !== p.user).slice(0, count).forEach((u) => likes.push({ post_id: postIds[i], user_id: userIds[u], created_at: hoursAgo(p.hours - 1) }));
});
await check(db.from('post_likes').insert(likes), 'beğeni');
await check(
  db.from('comments').insert(
    COMMENTS.map(([i, u, body], n) => ({ post_id: postIds[i], user_id: userIds[u], body, created_at: hoursAgo(POSTS[i].hours - 1 + n * 0.01) })),
  ),
  'yorum',
);

console.log(
  `Hazır: ${ids.length} kullanıcı, ${POSTS.length} gönderi, ${rankingRows.length} puan, ${likes.length} beğeni, ${COMMENTS.length} yorum, ${Object.keys(placeIds).length} mekân`,
);
