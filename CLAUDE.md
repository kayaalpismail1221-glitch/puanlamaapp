# Proje: Türkiye için sosyal restoran sıralama uygulaması (Beli uyarlaması)

## Fikir
Kullanıcılar gittikleri restoranları puanlar ve sıralar, arkadaşlarının nerede yediğini görür,
arkadaş tavsiyesine dayalı öneriler alır. Hedef kitle: Türkiye'de 18–35 yaş, şehirli, genç kullanıcılar.
Uygulama Türkçe ve İngilizce (kaynak dil Türkçe; bkz. "Çok dillilik").

## Yayın öncesi kontrol listesi (kullanıcı isteği 2026-10-01: hatırlat)
Kullanıcı mağazaya çıkmayı, yayını, App Store/Play kaydını ya da production build'i açtığında bu listeyi kendiliğinden
hatırlat; biten maddeyi listeden sil. Ayrıntılar SUPABASE.md ve ilgili bölümlerde.
- [ ] **SMS doğrulama:** sağlayıcı (Twilio ya da Netgsm + Send SMS hook) → `PHONE_VERIFICATION_ENABLED = true`.
  Yoksa rehber eşleştirmesi ve telefonla davetin "arkadaşın katıldı" eşleşmesi hiç çalışmaz (ilk dalga kaçar).
- [ ] **Mağaza bağlantıları:** `APP_STORE_URL`, `PLAY_STORE_URL` (`constants/app.ts`). `PLAY_STORE_URL` dolmadan
  Android davet bağlantısı davet edeni taşımaz.
- [ ] **Alan adı + davet sayfası (iOS davet bağlantısı için şart):** `https://puanla.app/davet/<kullanıcı adı>` web
  sayfası (mağazaya yönlendirir), iOS Universal Links + Android App Links, `appLink` https'e. App Store kaynak
  taşımadığı için iOS'ta davet edenin kendiliğinden bağlanması ancak bununla olur (bkz. "Davet bağlantısı").
- [ ] **E-posta:** alan adıyla Resend SMTP → şablonlar → *Confirm email* açık → `EMAIL_CODES_ENABLED = true`.
  Kapalıyken aynı e-postalı hesaplar Google girişinde birleşebilir. Destek adresi `destek@puanla.app` çalışır olmalı.
- [ ] **Android konsol ayarları:** Google ile giriş (Web + Android OAuth istemcileri, Supabase Google sağlayıcısı),
  Firebase + FCM V1; Play App Signing SHA-1'i de Google Cloud'a (SUPABASE.md → "Android: …"). Harita anahtar istemez.
- [ ] **Apple ile giriş:** Apple Developer + Supabase Apple sağlayıcısı → `APPLE_SIGN_IN_ENABLED = true`.
- [ ] **Demo hesapları sil:** gerçek mekânlara kurgusal puan veriyorlar.
- [ ] **Yasal:** KVKK veri sorumlusu gerçek kişi/şirket ve adres; `legal.ts`'teki "devredilemeyen" içerik izni ve
  birleşme/devir maddesi (avukat onayıyla).

## Geliştirici ortamı
- Windows PC + iPhone 11 (Mac yok).
- Test: iPhone'da Expo Go (gerekirse EAS development build).
- iOS derlemesi: EAS Build (bulutta). Xcode'a veya Mac'e bağımlı adım önerme.
- iOS ve Android ayrı ayrı native hissettirmeli (2026-09-30 kullanıcı kararı: "her yerini iOS ayrı Android ayrı
  geliştir", Android'in tasarımı ve akışları da premium). Türkiye'de kullanıcıların çoğu Android'de; davet/masa
  döngüsü Android'e çıkmaza gitmemeli. Ayrıntılar aşağıda "Android".
- Yerel Android derlemesi mümkün (Android SDK + emülatör kurulu, `JAVA_HOME` = Microsoft JDK 17; SDK'daki
  `ndk/27.0.12077973` klasörü boş, `android/build.gradle`'a NDK 27.1 zorlaması gerekir) ama **C: diski dolu**
  (2026-09-30: ~5 GB boş; emülatör cihazı ~4 GB, Gradle önbelleği ~2 GB ister). Yer açılmadan emülatör kurma.

## Teknoloji
- React Native + Expo (en güncel SDK), TypeScript
- Navigasyon: Expo Router (dosya tabanlı), alt bar için native tabs
- Harita: react-native-maps (iOS'ta Apple Haritalar)
- Animasyon ve his: react-native-reanimated, expo-haptics, expo-blur
- Backend: Supabase (auth, Postgres + PostGIS, storage). Apple ile Giriş desteklenmeli. Kurulum: SUPABASE.md
- Mekân verisi: kendi `places` tablomuz; kullanıcılar mekân ekleyebilir (`mekan-ekle`). İstanbul verisi iki açık
  kaynağın birleşimi (~35,7 bin mekân, %78'inde sokak adresi, %70'inde telefon), `scripts/places/`:
  `npm run places:fetch` (OSM Overpass 0,2°'lik karelerle, IP başına ~4 sorgu sonra bekletir, ~20 dk →
  `scripts/.cache/osm/`; ardından `fetch-overture.py` Overture Maps Places'i DuckDB ile S3'ten çeker, ~1 dk, `pip install duckdb`)
  → `places:build` (isim/adres/telefon temizliği `lib.mjs`, testleri `npm run test:places`; aynı mekânın kayıtları
  mesafe + benzer ad + kapı no/telefonla birleşir, zincirleme birleşme engellenir; ad/konum/adres/telefon önce Overture'dan (işletmenin güncel sayfası; OSM girişleri
  eskiyebiliyor, pinler arası medyan 10 m), tür önce OSM'den, OSM eksikleri ve Overture'da olmayan ~6,5 bin mekânı tamamlar; yalnızca
  Overture'da olup güveni < 0,75 olan, yalnızca Foursquare kaynaklı, kaynağın ilçesi pinden > 1,5 km uzak olan ve
  OSM'den silinmiş kayıtlar atılır) → `places:upload` (`.env.local`'da `SUPABASE_SERVICE_ROLE_KEY`;
  sınırlar `admin_areas`'a, mekânlar `import_places` ile: kaynak kimliği `place_sources`'ta eşleşirse aynı satır
  güncellenir, kimlik/puan korunur; `--prune` kaynaktan düşen ve hiçbir kayda bağlı olmayanları siler).
  **İl/ilçe/mahalle her zaman koordinattan:** `places_fill_area` tetikleyicisi `area_at` ile OSM sınırlarından yazar
  (sınır dışı ≤ 500 m tolerans); İstanbul yazılıp konum dışarıdaysa reddeder (`place_outside_city`). `mekan-ekle`:
  semt iğneden (elle yazılmaz); GPS'le konan iğne "Şu an buradayım" ile onaylanmadıkça ya da harita/adres aramasıyla
  (Apple geokodlama) taşınmadıkça kayıt yok; adres `lib/address.ts` ile veri setindeki biçime ("Moda Cd. No:12")
  gelir, kapı numarası varsa geokodlanıp iğneyle karşılaştırılır (> 250 m → kayıt durur); 150 m içinde benzer adlı
  mekân varsa "Bunlardan biri mi?" (seçilirse yeni kayıt açılmaz). Sonuç çağıran ekrana `lib/place-choice.ts` ile döner. Ekranda yer metni yalnızca `lib/place.ts` (`placeSubtitle`, `placeArea`…).
  Lisans: OSM ODbL + Overture CDLA-Permissive; Ayarlar ve mekân sayfasındaki atıf zorunlu, kaldırma. Fotoğraf yok;
  Google Places kalıcı saklanamaz. Overture aylık yayımlanır: yenilemek için fetch-overture → build → upload.
  **Doğruluk ilkesi (kullanıcı kararı 2026-09-26: en kritik şey doğru bilgi):** emin olunmayan veri değiştirilmez.
  **Ölçüm:** `npm run places:audit -- <tohum>` katmanlı 50 mekân + Google Haritalar bağlantıları üretir; kurallar
  değişince yeni tohumla ölçülür (Google verisi yalnızca karşılaştırma, saklanmaz). 2026-09-26: gevşek kurallarla
  50'de 25 tam doğru / 5 yanlış bilgi / 4 kapalı / 10 yok; sıkı kurallarla 31 doğru / 0 yanlış bilgi / 2 kapalı /
  7 yok / 3 mekân değil (kurala eklendi) / 7 belirsiz. Telefonlar iki turda da neredeyse hep tuttu. OSM son düzenleme
  tarihi doğrulukla ilişkili çıkmadı (eleme ölçütü değil). Zayıf halka: yalnızca OSM'de olan eski kayıtlar ve
  kapanmış mekânlar → "Bilgi yanlış mı?" bildirimleri ve aylık yenileme.
  Türkçe karakter düzeltmesi (`buildDiacriticDictionary`) sözlüğü veriden çıkarır, yalnızca tutarlı kelimeleri ve
  hiç Türkçe harf içermeyen metinleri düzeltir. **"Bilgi yanlış mı?"** (`mekan-duzelt/[id]`, migration
  `20261004100000_place_corrections`): tek kişinin önerisi uygulanmaz; bağımsız 2 kişi aynı değeri (kapandı için 3)
  önerince ya da yönetici onaylayınca (`admin_place_corrections`/`admin_resolve_correction`) uygulanır ve alan
  `locked_fields`'a girer, içe aktarım onu ezmez. Kapanan mekân (`closed_at`) arama/harita/önerilerden çıkar.

## Backend mimarisi (kalıcı ilke)
- Şema değişikliği her zaman yeni bir migration dosyasıyla (`supabase/migrations/`), eskileri düzenlenmez
  (canlıya çıkmadan önceki ilk sürüm hariç). Her değişiklikten sonra `npm run test:db` geçmeli; yeni kurala test eklenir.
- Güvenlik veritabanında: her tabloda RLS, türetilmiş alanlar (sayaçlar, puanlar) sütun yetkileriyle korunur.
  Uygulamadaki kontroller yalnızca kullanıcı deneyimi içindir.
- Karmaşık okumalar görünüm/fonksiyon (`post_view`, `feed_popular`, `place_details`…) ile tek istekte yapılır.
- **Ölçek:** sık çağrılan okuma tüm tabloyu taramaz (aynı anda binlerce kullanıcı). Toplamlar sayaçtan
  (`places.rating_count/post_count`, `profiles.like_total/post_count/follower_count`, tetikleyicilerle), sıralama
  indeksten (`posts.hot`), ağır hesap yalnızca aday kümesinde; `place_view` gibi pahalı görünümler sıralayıp kestikten
  sonra birleştirilir (`materialized` CTE). Yabancı anahtarın indeksi olur (cascade silmeler taramasın). Yeni RPC
  `npm run bench:db`'ye eklenir (PGlite'ta 20 bin kullanıcı/60 bin gönderi; süre veri büyüdükçe artmamalı).
  Migration `20261010100000_scale` (başka bir oturumun `claude/friendly-albattani-ymieij` dalındaki eski `main`'den
  yazılmış `20261004100000_scale`'inin bu dala taşınmışı; o dosya canlıya **uygulanmamalı**; 2026-09-29 canlıda, sayaçlar doğrulandı).
  **XP sayaçları** (migration `20261013110000_xp_counters`): XP bileşenleri olay anında tetikleyicilerle `xp_all` /
  `xp_monthly` (İstanbul ayı) sayaçlarına yazılır (günlük 20 puan sınırı `xp_rating_days`, davetler
  `xp_invite_credits`/`xp_welcome_credits`, fotoğraflar komut düzeyinde tetikleyiciyle: tek komutta çok fotoğraf).
  `leaderboard`/`user_rank` indeksten okur (benchte lig 1,1 sn → 44 ms, sıra 1,75 sn → 2 ms). `xp_totals` doğruluk
  referansı olarak kalır; test dosyasının sonundaki "XP sayaçları" testi tüm olaylardan sonra sayaçların onunla
  birebir tuttuğunu denetler — XP kuralı değişirse tetikleyici, `xp_totals`, `lib/xp.ts` birlikte değişir.
  Bench verisi tetikleyiciler kapalıyken yüklenir (ertelenebilir benzersizlik denetlenmez): sıralar ve XP sayaçları
  yükten sonra yeniden hesaplanır.
- İstemci katmanları: `src/api/*` (Supabase çağrıları) → `data/entities` (ortak önbellek) ve `hooks/queries`
  (TanStack Query) → ekranlar. Kullanıcının kendi verisi `store/app-store` içinde iyimser güncellenir.
- Ekranlar Supabase'i doğrudan çağırmaz; `src/api` üzerinden gider. `src/types/database.ts` şemayla aynı tutulur.
- Canlıya migration uygulama: Supabase CLI kurulu değil; yeni migration dosyası kullanıcıya panoya kopyalanır
  (`Get-Content -Raw -Encoding utf8 <dosya> | Set-Clipboard`), kullanıcı SQL Editor'de çalıştırır. Sonra
  publishable key ile canlıda doğrulanır (geçici test hesabı açılır, iş bitince `delete_account` ile silinir).

## Canlı ortam ve durum (2026-09-24 itibarıyla)
- Supabase projesi: `kzedsqgegrzmngxvhmfk` (Frankfurt). `.env.local` dolu (git'e girmez). Uygulanmış migration'lar:
  `20260924100000…100300` (şema, RLS, API, storage), `20260925100000_search_popularity` ve
  `20260926100000_osm_places` ('osm' kaynağı + 11 yeni kategori, toplam 23), `20260926110000_map_places`
  (harita topluluk katmanı), `20260927100000_moderation` (uygunsuz ifade filtresi + `blocked_users`).
  `20260928100000_recs_moderation_admin` (telefon o an kapatılmıştı, `is_admin` + şikâyet kuyruğu RPC'leri,
  `recommended_places`), `20260929100000_phone_optional`, `20260930100000_notifications` (bildirimler, 2026-09-25 canlıda doğrulandı),
  `20261002100000_table_loop` (telefon doğrulama, rehber eşleştirme, davetler; 2026-09-26 canlıda doğrulandı),
  `20261003100000_place_quality` (2026-09-26: `admin_areas`, `place_sources`, adres/telefon/web, koordinattan semt),
  `20261004100000_place_corrections` ("Bilgi yanlış mı?", `closed_at`), `20261003100001_taste_match` ve
  `20261003110000_lists` (hepsi 2026-09-26 itibarıyla canlıda).
  `20261005100000_segment_rankings`, `20261006100000_comment_notification_types` ve `20261006110000_comment_social`
  2026-09-26'da canlıya uygulandı ve iki geçici hesapla uçtan uca doğrulandı (segment puanları, Bayes topluluk puanı,
  harita/öneriler, yorum yanıtı ve beğenisi, bildirimler, kişi önerileri ve gizleme; 13/13). Canlıdaki fonksiyonu yeniden tanımlayan migration her zaman o fonksiyonun **en son**
  tanımından (tüm dallar dahil) yola çıkmalı. Eski demo silindi; canlıda OSM + Overture mekânları ve gerçek mekânlar
  üzerine yeni demo var (`npm run demo:seed`: 7 `@demo.puanla.app` hesabı, 25 gönderi).
- **Denetim düzeltmeleri (2026-09-30), `20261014100000_audit_fixes`:** mekân düzeltmesi yalnızca güvenilir hesapların
  (≥ 7 gün, ≥ 5 puan) oyuyla kendiliğinden uygulanır (telefon/web/kapandı 3 kişi), engelliler birbirinin puanlarını
  görmez (`rankings` politikası `block_peer_ids()`), `avatar_path` yalnızca kendi klasörü, `xp_totals` istemciye kapalı.
  2026-09-30'da canlıya uygulandı.
- **Puanlama doğruluğu, `20261015100000_calibrated_scores`** (kalibre topluluk katkısı, eşitlik zinciri): 2026-10-01'de
  canlıda (`calibrated_score()` canlıda 8,900 / 9,993 döndü); aynı gün istemci OTA güncellemesi gönderildi.
- **Segment bölme ve Puanla modeli** (`20261016100000_segment_values`, `20261016110000_segment_split`,
  `20261017100000_place_model`): 2026-10-01'de canlıda (9 tür eşlemesi, `Börekçi`, `place_strengths` doğrulandı);
  aynı gün OTA güncellemesi (mekân sayfası Puanla puanı, hedef hikâye kartı, yorum klavye kaydırma) gönderildi.
- Auth: e-posta/şifre açık, **Confirm email kapalı**. SMTP yok (Supabase SMTP'siz şablon düzenletmiyor ve
  varsayılan e-posta kod değil bağlantı gönderiyor). Bu yüzden `src/constants/features.ts` →
  `EMAIL_CODES_ENABLED = false` ("Şifremi unuttum" ve kod doğrulama gizli). Alan adı alınınca: Resend SMTP →
  `supabase/templates/` şablonlarını yükle (konuya `{{ .Token }}`) → Confirm email aç → bayrağı `true` yap.
- Apple ile giriş kodda hazır (`src/api/auth.ts`) ama `APPLE_SIGN_IN_ENABLED = false`: Apple Developer +
  Supabase Apple provider ayarlanınca açılır (yarım ayarlı buton inceleme reddi sebebi).
- Uçtan uca doğrulandı: canlıda 22 adımlık API testi (kayıt→puan→foto yükleme→gönderi→feed→hesap silme) ve
  web'de tüm ekran akışı. iPhone'da henüz doğrulanmayan: galeriden fotoğraf seçip yükleme, react-native-maps
  haritaları, avatar değiştirme.
- Kullanıcı ve bir yakını (İsmail/İbrahim Kayaalp) telefondan gerçek hesap açtı; test verisi üretirken onları
  kirletme, test hesaplarını mutlaka sil.

## Yapılanlar (özet)
- Backend: Supabase şeması (profiller, mekânlar/PostGIS, sıralamalar, Listem, takip/engelleme, gönderi/foto/etiket/
  beğeni/kaydetme/yorum, şikâyet), RLS + sütun yetkileri, günlük sınırlar, sayaç tetikleyicileri; RPC'ler:
  `rank_place`, `create_post`, `feed_popular` (3→10→30 km, yoksa en yakın şehir), `feed_following`,
  `place_details`, `search_places` (Türkçe katlama + trigram + popülerlik), `search_users`, `suggested_users`,
  `leaderboard`/`user_rank`, `saved_posts`, `delete_account`. PGlite+PostGIS ile 109 DB testi (`npm run test:db`).
- **Keşfet araması (2026-09-26):** mekân, kişi ve semt/ilçe; her harfte canlı (120 ms gecikme, önceki sonuç yenisi
  gelene kadar kalır, eşleşen kısım `HighlightText` ile vurgulu, Türkçe harfsiz yazım `lib/fold.ts` = `tr_fold`).
  `search_areas` şehir/ilçe/mahalle; semt tam yazılınca oranın en yüksek puanlıları Keşfet'te (5), tümü `bolge`
  ekranında (`area_top_places`: topluluk puanı, segment süzgeci, sayfalı, kapanan mekân yok). Migration
  `20261007100000_area_search`; hız için `20261007110000_search_speed` (`area_index` tetikleyiciyle güncel sayaç
  tablosu, `search_places` indeks dostu plpgsql, 1–2 harfte `places_name_fold_idx`).
- **Harita araması (2026-09-26):** üstte cam arama (mekân + semt/ilçe/şehir, Keşfet'teki canlı arama), altında
  Puanla/Gittiklerim/Listem. Mekân seçilince harita süzülür (uzaksa önce uzaklaşıp yaklaşır) ve kartı açılır, katmanda
  olmasa da pini görünür; bölge seçilince `area_bounds` (mekânlarının %2–98 alanı) sınırına oturur ve "X'in en yüksek
  puanlıları" kısayolu çıkar. Migration `20261007120000_area_bounds`.
- **Mekân sayfası puanı (2026-10-01, kullanıcı: "önemli hata"):** başlıktaki büyük rozet mekânın Puanla puanı (altında
  "Puanla"); kendi puanın altında küçük rozetle "Senin puanın · Kahvaltıcılar: 12 mekân arasında 2.". Eskiden büyük
  rozet kendi puanındı, Puanla puanı en altta küçük satırdaydı.
- Yorumlar (2026-09-26): yanıt (`comments.parent_id`, yanıtın yanıtı olabilir; ekranda ilk yorumun altında toplanır,
  2'den fazla yanıt "N yanıt daha gör"), yorum beğenme (`comment_likes`, kimin beğendiği gizli, sayaç `like_count`).
  Klavye açılınca liste kaydırılır (2026-10-01): yanıtta yanıtlanan yorum giriş çubuğunun hemen üstüne, yeni yorumda
  son yorumlar (`KeyboardEvents` `keyboardDidShow`; eskiden yorum klavyenin altında kalıp ekranda fotoğraf görünüyordu).
  Bildirim türleri `reply` (yanıtlanan yorumun yazarına) ve `comment_like`. Bildirim merkezinde ilk 3 bildirimden sonra
  **Tanıyor olabileceğin kişiler** (`people_you_may_know`: seni takip eden > rehber > birlikte etiketlenen > ortak
  arkadaş > etkileşen > okul > popüler; gerekçesiyle, Takip et + ✕). ✕ `suggestion_dismissals`'a yazılır, kişi hiçbir
  öneri listesinde (`suggested_users` dahil) bir daha çıkmaz.
- Puan formülü istemci (`lib/ranking.ts` `scoreAt`) ve sunucu (`sentiment_score`) birebir aynı (tam sayı onda birlik).
- **Segment bazlı sıralama (2026-09-26, kullanıcı isteği: "aynı segmentteki mekânlarla kıyasla"):** 24 kategori 9
  segmente ayrılır (`constants/segments.ts` = `cuisines.segment`): restoran · kebapçı · sokak lezzeti (dürüm, döner,
  kokoreç, ciğer, köfte, çiğ köfte, pide) · pizza ve burger (+ büfe) · kahvaltı · börekçi ve fırın · kafe · tatlıcı ve
  pastane (+ dondurma) · meyhane ve bar. İlk hâli 5 segmentti; 2026-10-01 kullanıcı kararıyla bölündü ("börekçi kafe ve
  tatlıcıyla, pizzacı kokoreççiyle aynı listede olmasın"; migration `20261016100000_segment_values` (enum değerleri, ayrı
  çalıştırılır) + `20261016110000_segment_split`). Yeni "Börekçi" kategorisi: adında börek/simit/poğaça geçen, pastane
  geçmeyen ve kategorisi kilitli olmayan pastaneler taşındı; içe aktarım kuralı `scripts/places/lib.mjs` aynı. Mevcut
  listeler `resegment_rankings()` ile bölündü: her yeni liste tek bir eski listeden gelir (Pideci bu yüzden sokak
  lezzetinde kaldı), sıra aynen korunur, eşitlik yalnızca eski listede aynı seviyedeki komşuyla kalır. Öne çıkanların
  segment listeleri (`lib/post-meta.ts`) yeni segmentlere göre. Segment ikonları yalnızca Android karşılığı olan SF
  sembollerinden (yeni sembol yazı tipi ister). Karşılaştırma ve puan yalnızca segment + izlenim listesi içinde;
  `rankings.segment` mekânın kategorisinden tetikleyiciyle gelir, kategori segment değiştirirse mekân yeni listenin
  sonuna taşınır.
  Segmentteki favorin her zaman grubun üst sınırı (Beğendim 10,0 · İdare eder 6,6 · Beğenmedim 3,3; kullanıcı kararı
  2026-09-30: 8,4 görünen favori paylaşılmıyordu). Puan **seviyeden** ve **eğriyle**: iniş = (üst − alt) ×
  (seviye / max(seviye sayısı − 1, 4))²; 5 seviye 10 · 9,8 · 9,2 · 8,1 · 6,7, 30 seviyede ilk 20'si 8,4 üstü (çok
  puanlayan dezavantajlı kalmasın). **"İkisi aynı"** (eski "Emin değilim" yerine, aşağı yanlılık yoktu olsun):
  `rankings.tied` = listede bir üsttekiyle aynı seviye, puan eşit; başa eşitlik konmaz, kayan kayıt bayrağını korur
  (`rank_place(…, p_tie)`, istemci `tieComparison`/`insertEntry`). **Eşit grup bütün kalır** (migration
  `20261015100000_calibrated_scores`): ikili arama seviyeler üzerinde yürür (`levelStarts`, `placementIndex`; eşitler
  tek soru, yeni mekân grubu bölemez); grubun başı çıkınca altındaki eşiti yeni baş olur (`detach_ranking` /
  `removeFromRankings`; eskiden A > B = C iken B çıkınca C, A'ya eşitleniyordu); eşitliksiz sıra grubun içine düşerse
  grubun sonuna iner (`rank_place` / `insertEntry`, eski uygulamalar için). Uzun listede 10,0 · 10,0 gibi yuvarlama
  eşitliği kaçınılmaz (0,1 çözünürlükte 8,4–10 arası 17 değer; "ilk 20'si 8,4 üstü" kararıyla birlikte), ama sıra
  seviyeden: "12 mekân arasında 2." yalnızca "İkisi aynı" denenleri aynı sıraya koyar (`segmentStanding`,
  `RankResult.rank`); "puan netleşecek" notu seviye sayısına bakar (`RankResult.levels`). Sonuç ekranı eşitliği ve eski
  favorinin yeni puanını söyler (`RankResult.displaced`); mekân sayfasında "Kahvaltıcılar: 12 mekân arasında 2." ve
  "Puanlar nasıl hesaplanır?". **Puanlama rehberi** (`components/scoring-guide`): 4 kısa görsel sayfa (his aralığı →
  kıyasla/"İkisi aynı" → favorin 10 merdiveni → Puanla puanı neden güvenilir); ilk puanlamada (`degerlendir`,
  gönderi ekranı) cihazda bir kez kendiliğinden, sonra ?/mekân sayfası/Ayarlar'dan; son sayfada "Tüm ayrıntılar"
  → `app/puanlama`. Migration'lar `20261013130000_top_anchored_scores`,
  `20261013140000_score_curve_ties` (gönderi puanları her ölçek değişiminde bir kez güncel puana eşitlendi).
  Topluluk puanı (mekân sayfası, harita, bölge, öneriler) ham ortalama değil **ağırlıklı** Bayes ortalaması
  `place_community_score(mekân, Σ ağırlık×puan, Σ ağırlık)` (C = 2, m = mekânın türünün ağırlıklı ortalaması:
  `community_priors`, saatte bir tazelenir; türde < 30 puan varsa tüm puanlarınki, o da yoksa 7,5). Ağırlık = deneyim ×
  tazelik (`rating_recency`: son 1 yıl 1, 1–2 yıl 0,75, daha eski 0,5). Ağırlık (`rankings.weight`,
  tetikleyiciyle) puanlayanın puanladığı mekân sayısından: min(n, 5)/5 — yeni/sahte hesaplar ve herkesin otomatik
  8,4'lük ilk puanı ortalamayı oynatamaz (migration `20261013100000_trusted_community_score`). Arkadaş puanı düz
  ortalama kalır. Segment/formül değişirse iki taraf ve testler birlikte değişir.
  **Kalibre katkı (kullanıcı kararı 2026-09-30: "kişisel ve genel puan çok doğru olsun"):** topluluk ortalamasına
  kişinin gördüğü puan değil `rankings.calibrated_score` girer = seviyenin uzun listede beklenen puanı:
  üst − (üst − alt) × (s+1)(s+2) / ((n+1)(n+2)) (sunucu `calibrated_score()`, istemci `calibratedScoreAt`, binde
  birlik tam sayı). Tek mekânlık listenin favorisi 8,9, 30'luk listeninki 9,993; bir listenin katkı ortalaması
  uzunluktan bağımsız (Beğendim 8,9). `recompute_group_scores`/`normalize_rankings` ikisini birlikte yazar; toplayan
  her yer (`place_details`, `map_places`, `area_top_places`, `recommended_places`, `refresh_community_priors`)
  `coalesce(calibrated_score, score)` kullanır (doğrudan eklenen satırda boşsa puan; demo betiği katkıyı kendisi
  yazar). Simülasyon (400 mekân, az/orta/çok puanlayan karışımı): az puanlayanların gittiği yerlerin ~5 yüzdelik puanlık
  kayrılması sıfırlandı, kaliteyle uyum 0,957 → 0,965; C = 2 en iyisi (3 ve 5 kötü).
  **Puanla puanı modeli (kullanıcı kararı 2026-10-01, migration `20261017100000_place_model`):** gösterilen topluluk
  puanı artık Bayes ortalaması değil, tüm listelerden global karşılaştırma modeli (Plackett–Luce): her (kişi, segment)
  listesi tek sıralama = beğendikleri > beğendim çizgisi > idare ettikleri > beğenmedim çizgisi > beğenmedikleri;
  mekân kendinden aşağıdaki her şeyi, çizgi yalnızca aşağıdaki mekânları geçer (çizgiler yarışmaz), eşitler aynı
  basamakta; ağırlık = deneyim × tazelik; öncül: güç 1'lik sanal mekânla bir galibiyet + bir yenilgi. MM yinelemesi
  SQL'de (`refresh_place_strengths(n)`, önceki çözümden ısınır; geçici tablolar), sonuç `place_strengths` (log güç,
  puan, `fit_weight` = 2 + Σ ağırlık) ve `segment_anchors`. Gösterilen puan = çok mekân puanlamış tipik kullanıcının
  beklenen puanı: grup olasılıkları çizgilerden (γ/(γ+γ_beğendim) …), grup içindeki yer o gruba girme olasılığıyla
  tartılmış yüzdelik (eşitlere orta nokta), puan kişisel eğriyle (üst − (üst − alt) × yer²); güçle aynı sırada. Okuma:
  `puanla_score(mekân, Σ, Σ ağırlık, Σ yeni, Σ yeni ağırlık)`: model gördüyse model puanı, son hesaptan (`model_state`,
  `model_fitted_at()`, dahil) sonraki puanların kalibre katkısıyla harmanlanır; görmediyse kalibre Bayes. Yenileme: pg_cron
  varsa 15 dakikada bir `puanla-place-model` görevi, yoksa puan değişince en fazla 15 dakikada bir tetikleyici
  (`rankings_place_model`). Testteki `fitPlaceModel` başvuru uygulamasıyla birebir (güç, çizgi, puan < 1e-6). Gerçekçi
  sentetik veride (400 mekân, 1.860 kullanıcı, 8,3 bin puan) gerçek ilk 20'yi bulma 11 → 15 / 20, kaliteyle uyum 0,965 →
  0,968, turistik yanlılık ~0; seyrekte (1,5 bin puan) 11,7 → 14,3. PGlite'ta 8 yineleme 8,3 bin puanda 0,9 sn;
  ~100 bin puanı geçince tetikleyici yerine pg_cron şart (istekte beklenmesin).
  **Öneriler:** tahmin = (topluluk ağırlığı × Puanla puanı + 2 × Σ arkadaşların kalibre katkısı) / (topluluk ağırlığı +
  2 × arkadaş sayısı); arkadaş toplulukta zaten bir kez var, toplam üç kat. Tek arkadaşın 6,6'sı topluluğun favorisini
  eleyemez, 10'u sevilmeyeni başa taşıyamaz (eskiden `coalesce(arkadaş, topluluk)` topluluğu tamamen eziyordu). Güven
  çarpanı kalktı; süzgeç tahmin ≥ 6,7; gösterilen arkadaş ortalaması arkadaşların kendi puanı.
- Puanlama Beli tarzı kalır (kullanıcı kararı 2026-09-25; direkt 0–10 kaydırıcı denendi, vazgeçildi). Akış mantığı
  `hooks/use-rank-flow.ts`, görünüm `components/rank-steps.tsx` (`compact`). `degerlendir` tam ekran; gönderi ekranında
  aynı akış "Puanın" bölümüne gömülü ve zorunlu (puanlıysa rozet + "Değiştir"); yeni puan paylaşırken kaydedilir.
- İstemci: sahte veri tamamen kaldırıldı. Oturum/iyimser güncelleme/cihaz önbelleği `store/app-store.tsx`;
  gönderi paylaşımı yeni puanın yazılmasını bekler (`waitForRank`). Foto: telefonda 1440 px + 480 px küçük kopya
  (`<kullanıcı>/<gönderi>/<n>.jpg` ve `_t.jpg`).
- Özellikler: kayıt/giriş/Apple/şifre sıfırlama (kapalı), kod doğrulama ekranı (kapalı), mekân ekleme
  (`mekan-ekle`, haritadan konum + ters geokodlama), gönderi şikâyeti, kullanıcı engelleme, yorum silme,
  hesap silme, Listem, konum yokken feed İstanbul'a düşer + "konumunu aç" bandı.
- Profilde **Lezzet haritası** (Beli "Dining Map" esinli, kopya değil): Natural Earth'ten üretilen çizim tarzı
  dünya haritası (`npm run generate:world-map` → `constants/world-map.ts`, Miller projeksiyonu `lib/world-projection.ts`),
  şehir başına nokta, en fazla Marmara/bölge ölçeğine yakınlaşır (`MIN_MAP_VIEW_WIDTH`). İki çözünürlük: dünya 1:50m,
  Avrupa–Türkiye–Orta Doğu 1:10m (görünüm bölgedeyse; kıyı ve ülke sınırı ayrı çizilir). Görünüm: kâğıt tonunda kara +
  gölge, yumuşak deniz (enlem-boylam ağı yok: yakında tek çizgi kusur gibi duruyor); noktalar tek renk (puan değil,
  gidilen yer; kullanıcı kararı), çakışmayan şehir etiketleri (uygulama yazı tipiyle, SVG üstünde). Büyük hâli `gittigi-yerler/[id]`: şehir noktasına ya da
  Mutfaklar/Şehirler/İlçeler satırına dokununca o yerdeki gönderiler. Kart gönderilerin üstünde.

## Geliştirme notları
- **Anında güncelleme (EAS Update):** `expo-updates`, kanal `production` (eas.json), `runtimeVersion: appVersion`.
  Yalnızca JS/asset değişikliği → build yok: `npm run update -- --message "…"` (EAS'taki production ortam
  değişkenleriyle yayınlanır); telefonlar arka planda indirir, bir sonraki açılışta uygular.
  **Yeni yerel paket / config eklentisi / app.json yerel ayarı değişirse**: `app.json` → `version` artırılır
  (1.0.0 → 1.0.1) ve yeni build alınır; aksi hâlde güncelleme eski ikiliye gider ve çöker. Fingerprint politikası
  kullanılmaz: Windows'taki satır sonları yüzünden yerel parmak izi EAS build'inkiyle tutmayabilir.
  Android'in kendi `android.runtimeVersion`'ı var (`android-N`): yerel değişiklik yalnız Android'i etkiliyorsa
  (ör. JS'te yalnız Android'de yüklenen paket) yalnızca o artırılır, iOS'a güncelleme gitmeye devam eder.
  `android-2` (2026-10-01): Google ile giriş paketi.
- Web'de hızlı akış testi: `npx expo start --web --port 8090` (8081 kullanıcının Expo Go sunucusu olabilir, dokunma).
  Web için: `metro.config.js` react-native-maps'i `src/shims/react-native-maps.web.tsx` yer tutucusuyla değiştirir;
  SwiftUI bileşeni `segmented-control.ios.tsx`'e ayrıldı; `app.json` web çıktısı `single`.
- Web'de Alert görünmez ve tarayıcı aracının tıklaması bazı Pressable'lara ulaşmaz; gerekirse düğmenin
  `onPress`'i React fiber'dan tetiklenir. Reanimated `entering` animasyonları web'de öğeyi gizli bırakabiliyor.
- `package.json`'daki `tunnel` betiği ve `@expo/ngrok` kullanıcının eklediği, commit edilmemiş değişiklik.

## Sıradaki işler (büyüme önceliğine göre; bkz. "Büyüme" ilkesi)
1. **Alan adı + web önizleme sayfaları** (`/p/<gönderi>`, `/m/<mekân>`, `/@<kullanıcı>`, `/l/<liste>`, OG görseli, App Store butonu)
   — **kullanıcı kararı 2026-09-26: web sayfası şimdilik yapılmayacak** (geliştirilmeyecek), önerme. Listeler yalnızca
   uygulama içinde (profil + hikâye kartı).
   + Universal Links (`appLink` https'e geçer) + App Store `ct` kampanya parametresi. Aynı alan adıyla Resend SMTP →
   e-posta doğrulama/şifre sıfırlama; yasal sayfalar HTML.
2. **Birinci taraf ölçüm:** paylaşımlar kaydediliyor (`share_events` + `log_share`, istemci `api/growth.ts` →
   `lib/share.ts`, hikâye, harita, davet; migration `20261013120000_share_events`), yönetim özeti
   `growth_stats(gün)`: aktif/yeni, 7 günde aktivasyon, paylaşım (türe göre), telefon daveti, davetle gelen ve
   K = davetle gelen / aktif. Kalan: paylaşım linkinde davet kodu/`sharer_id` (alan adı gelince), uzak özellik
   bayrakları (A/B), gizlilik metnine paylaşım ölçümü satırı.
3. **Masa döngüsü canlıya:** 1.0.1 build'i al, `APP_STORE_URL`'i doldur. Sonra: davet web sayfası (`/d/<davet>`),
   ayrı karşılaştırma ekranı. SMS doğrulaması ertelendi (aşağıdaki not).
4. Bildirimler: ölü jeton temizliği (Expo yanıtı `DeviceNotRegistered`).
5. Hikâye kartlarına link/CTA; damak uyumu hikâye kartı; grup oylaması; şehir içi "lezzet rotası" kartı.
6. App Store çıkışı (`docs/app-store.md`), web yönetim paneli (şikâyet kuyruğu; RPC'ler hazır),
   Overture'ın aylık yayınıyla mekân verisini yenileme (`places:fetch` → `build` → `upload -- --prune`).

## Büyüme: viralite ve ağ etkisi (kalıcı ilke)
Amaç: kullanıcı kazanımını ürünün kendisi üretsin, dağıtım pahalı olmasın. Her yeni özellik şu sorulardan geçer:
1. **Hangi döngüyü besliyor?** Kullanıcı → eylem → paylaşım → yeni kullanıcı → aktivasyon → tekrar. Hiçbir döngüye
   ya da ağ etkisine hizmet etmiyorsa önceliği düşük.
2. **Ağ etkisi yaratıyor mu?** Yeni kullanıcı geldikçe mevcut kullanıcının değeri artmalı (arkadaş puanları
   `friend_scores`, öneriler `recommended_places`, topluluk ortalaması `map_places`, feed yoğunluğu). Ağ etkisi yerel:
   büyüme İstanbul'da semt/kampüs kümelerinde yoğunlaşır, dağınık büyüme etkiyi sulandırır.
3. **Paylaşım temel eylemin yan ürünü mü?** Paylaşım puanlama/gönderi anına bağlanır (ör. gönderi sonrası hikâye
   önerisi). Doğal viralite: kullanıcı kendi isteğiyle paylaşır. Bazı özellikler ileride davetle açılabilir.
4. **Paylaşılan her şeyin gidecek yeri var mı?** Her dış paylaşım uygulaması olmayan kişiyi de karşılar (web sayfası +
   App Store) ve bir çağrı içerir ("Sen kaç verirdin?", "Listeyi kaydet"). Uygulamaya özel `puanla://` tek başına yetmez.
5. **Ölçülebilir mi?** Paylaşımlar kaynağını taşır (davet kodu/`sharer_id`, App Store `ct`). Ölçüm birinci taraf
   (Supabase); üçüncü taraf analiz SDK'sı yok. Huni: paylaşım oranı → link açılma → kurulum → kayıt → 7 günde
   aktivasyon (≥3 puan + ≥3 takip) → ikinci kuşak paylaşım; kohort bazlı K ve döngü süresi.
6. **Davet bağlamı korunur:** linkle gelen kişinin onboarding'i o mekânla (`ilk-puan`) ve davet edenle (`takip`) başlar.

Durum (2026-09-25): K ≈ 0. `puanla://` linkleri uygulaması olmayana açılmıyor, Ayarlar'daki davet mesajında link yok,
etiketleme yalnızca mevcut kullanıcılar arası ve bildirimsiz, ölçüm yok. En zayıf halka: link → karşılama.
Başlangıç dağıtımı kullanıcının ~180 bin takipçili gastronomi hesabı: bu bir kanal, döngü değil; döngüler onu çoğaltır.
Gerçekçi hedef K ≈ 0,3 (her kampanyanın etkisini ~1,4 katına çıkarmak), K > 1 beklenmez.

**Ana döngü, Masa döngüsü:** restorana genelde birlikte gidilir. Puanla → masadakileri rehberden etiketle →
"X, Y'ye 8,7 verdi. Sen kaç verirdin?" (sistem paylaşım menüsüyle WhatsApp/iMessage) → web sayfası (puan, sen
puanlayınca açılır) → kurulum → aynı mekânı puanla + davet edeni takip et → karşılaştırma → bir sonraki yemekte kendi
masasını etiketler. Atıf kayıttaki telefon numarasıyla (SDK'sız). Viral etkiyle ağ etkisini aynı eylemde birleştirir.

Diğer döngüler: hikâye kartları (var), paylaşılabilir listeler (içerik üreticisi → takipçi kaydeder → kendi listesi),
damak uyumu %, "Nerede yiyoruz?" grup oylaması (uygulamasız web), okul rekabeti kartı, web mekân sayfalarıyla SEO.
Tutunma tarafı: bildirimler ve rehber eşleştirme olmadan ağın ürettiği değer kullanıcıya ulaşmaz.

## Çok dillilik (kalıcı ilke)
- i18next + react-i18next + expo-localization. `src/i18n/index.ts`: uygulamaya özel örnek, dil tercihi
  (`system`/`tr`/`en`, AsyncStorage `puanla:language`), `useLanguagePreference`, `currentLanguage/currentLocale`.
  Varsayılan: cihaz Türkçe ise Türkçe, değilse İngilizce. **Ayarlar → Dil** anında uygular; açılış ekranı tercih
  okunana kadar bekler.
- **Kullanıcıya görünen her metin `t()` ile**: önce `locales/tr.ts` (kaynak), sonra `locales/en.ts`. `en.ts`
  `Translation` tipiyle tr'nin ağacını birebir karşılamak zorunda (eksik anahtar = tsc hatası). Çoğul: `_one/_other` + `count`.
  Cümle içi bağlantı/vurgu için `<Trans>` (ör. `LegalConsent`). Render dışındaki kod `i18n.t` kullanır.
- Veritabanı değerleri Türkçe kalır, ekranda çevrilir: `cuisineLabel`, `highlightLabel`, `mealLabel`,
  `t('sentiments.*')`, `t('badges.<id>.*')`. Veritabanı hata mesajları `api/errors.ts`'te `hint` ile çevrilir.
- Biçimlendirme dile göre: `formatScore` (8,7 / 8.7), `timeAgo`, `monthYear`, `formatDistance`. Bunları kullanan
  bileşen `useTranslation()` çağırmalı ki dil değişince yeniden çizilsin.
- iOS: `app.json` → `locales` (`assets/locales/{tr,en}.json`: izin açıklamaları), `CFBundleLocalizations`.
- Okul adları, mekân/semt adları özel isim: çevrilmez. `backend-setup.tsx` yalnızca geliştiriciye görünür.

## App Store ve kullanıcı güvenliği (kalıcı ilke)
- Kural 1.2: her gönderi/yorum/profilde şikâyet + engelle (`lib/moderation.ts`: `showMenu`, `openReportMenu`,
  `confirmBlock`); Ayarlar → Engellenen kişiler (`blocked_users` RPC, engel kaldırma). Yeni kullanıcı içeriği
  ekranı eklenirse aynı menü eklenmeli.
- Uygunsuz ifade filtresi veritabanında (`is_objectionable`, `hint = 'objectionable'`); İngilizceyle çakışan kısa
  kelimeler (got, pic, oc) listede yok — eklerken test yaz.
- Yasal metinler tek kaynak `src/constants/legal.ts` (terms/privacy/support, TR+EN, `{{email}}` yer tutucu).
  Uygulama içi `app/yasal/[belge]` (kosullar/gizlilik, kayıt öncesi de açılır). Herkese açık kopya:
  `npm run legal:build -- --upload` → Supabase Storage `legal/*.txt` (Supabase HTML sunmuyor; UTF-8 BOM'lu düz metin).
  İletişim adresi `constants/app.ts` → `SUPPORT_EMAIL` (şimdilik `destek@puanla.app`, henüz çalışmıyor).
- Kayıtta telefon isteğe bağlı ("Şimdilik geç"; `profile_private.phone`, yalnızca sahibi görür). Kullanıcı kararı
  (2026-09-25): rehber eşleştirme geldi ama telefon isteğe bağlı kalır; eşleşme için SMS doğrulaması şart. Migration
  `20260929100000_phone_optional`. İlk puan ve takip adımları atlanabilir (2.1).
  Hesap silme Ayarlar'da.
- Şikâyet işleme **ayrı bir web yönetim panelinden** yapılacak (kullanıcı kararı; uygulamada moderasyon ekranı yok).
  Hazır RPC'ler: `admin_reports`, `admin_resolve_report` (dismiss/remove/ban; ban = `auth.users.banned_until =
  infinity`), yetki `profiles.is_admin` (yalnızca SQL ile). Panel gelene kadar şikâyetler Supabase → `reports`.
- `app.json`: `privacyManifests`, `ITSAppUsesNonExemptEncryption: false`. Özellik bayrakları `constants/features.ts`.
- İkon/açılış görseli `npm run icons:generate` (`scripts/generate-icons.py`, Georgia Bold "p" + puan yeşili nokta).

## Tasarım sistemi
- Arka plan: tamamen beyaz `#FFFFFF`. Yemek fotoğrafları öne çıksın diye ekranlar sade ve ferah kalmalı.
- Ana marka rengi (Primary): gece mavisi / lacivert `#0F1E3D`.
  Header'lar, alt bar, yapısal ikonlar, ana butonlar, puan rozetleri gibi işlevsel ve dekoratif öğelerde kullanılır.
- Metin: ana metin `#0F1E3D` veya `#111827`, ikincil metin `#6B7280`
- Ayırıcı çizgiler ve kart kenarları: `#E5E7EB`, açık gri yüzeyler: `#F5F6F8`
- Puan renkleri (her yerde: pin, rozet, ızgara, arkadaş puanı): kırmızı 0–3,3 → sarı 3,4–6,6 → yeşil 6,7–10,
  grup içinde uca doğru koyulaşır (10'a yaklaştıkça koyu yeşil). `theme.ts`: `scoreColor` (dolgu/kenar),
  `scoreInk` (beyaz zeminde yazı), `onScoreColor` (dolgu üstünde yazı).
- Font: iOS sistem fontu (SF Pro), ayrı font yükleme yok
- Köşe yarıçapları: kartlar 16, butonlar 12, avatarlar tam yuvarlak
- Boşluklar 4'ün katları (4, 8, 12, 16, 24, 32)
- Renkleri ve ölçüleri tek bir `theme.ts` dosyasında token olarak tut. Bileşenlerde sabit renk yazma.
- Açık/koyu görünüm (2026-09-29): `colors` iOS'ta `DynamicColorIOS`; Ayarlar → Görünüm değişince yeniden çizim
  olmadan uyum sağlar. Varsayılan AÇIK (kullanıcı kararı: telefon koyu olsa da uygulama beyaz açılır). Seçenekler yalnızca
  Açık / Koyu: "Cihazla aynı" kaldırıldı (kullanıcı kararı 2026-09-30), kayıtlı eski tercih açığa döner; açılış ekranı her zaman beyaz. Koyuda `primary` açık mavi-beyaz, `onPrimary` lacivert olur (dolu düğmeler
  tersine döner). Fotoğraf, degrade ya da renkli (puan/kırmızı/beğeni) zemin üstündeki beyaz yazı/simge için
  `fixed.white`; görünümden bağımsız lacivert için `fixed.navy`. Dinamik renk almayan yerlerde (SVG, gezinme teması
  ve başlık seçenekleri, `@expo/ui` seedColor, harita çizgisi, degrade) `usePalette()` düz değerleri. Paylaşılan
  görseller (hikâye kartları) her zaman açık paletle (`palettes.light`) çizilir. Android: bkz. "Android".
  Koyu palet iOS'un nötr katmanlarıyla uyumlu (zemin #0B0B0D, bir kat yukarısı #1C1C1E). Katmanlar: gruplu liste
  ekranı `grouped` + satırlar `card`; açılır pencere/alttan panel `card`; kart üstündeki düğme/alan `fill`.
  Gölge rengi `fixed.navy` (koyuda beyaz parlama olmasın). Açma/kapama için RN `Switch` değil `components/toggle`
  (iOS'ta SwiftUI Toggle; RN Switch iOS 26'da satırda yukarı kayıyordu).
- Dokunmalarda hafif haptik geri bildirim, geçişler akıcı olmalı
- Veri yüklenirken spinner değil, ekranın düzenini taklit eden iskelet (`components/skeleton.tsx`). Spinner yalnızca
  buton içi işlemler, sayfa sonu yükleme ve açılışta kullanılır. Yeni liste/ekran eklenirse iskeleti de eklenir.

## Android (kalıcı ilke, 2026-09-30)
Aynı ekran iki platformda o platformun diliyle: iOS dosyası/dalı olduğu gibi kalır, Android karşılığı ayrı dosya
(`*.android.tsx`) ya da `Platform.OS` dalı. Android tarafı Material 3.
- **Renkler ve koyu görünüm:** palet `constants/palettes.ts` (yalnız veri). `plugins/with-android-theme.js` onu
  `res/values(-night)/colors.xml` içine `puanla_*` olarak yazar; `colors` Android'de `PlatformColor('@color/puanla_*')`.
  Görünüm değişince (`useAppearanceRemountKey`, kök düzen) gezinme ağacı yeniden kurulur, ekran yığını geri yüklenir
  (veri/oturum yerinde). Expo Go'da kaynak yok → açık görünüm (`darkModeSupported`). Palet değişirse yeni build.
  Aynı eklenti: EditText zemini saydam (iOS gibi dolgusuz alan), imleç/seçim marka rengi, pencere zemini görünüme göre.
- **Simgeler:** SF adı → Material Symbols Rounded (`constants/android-symbols.ts`, gömülü yazı tipi). Yeni SF simgesi
  kullanınca eşlemeye ekle + `npm run icons:android`. Taşma menüsü dikey üç nokta, geri `arrow.left`.
- **Gezinme:** alt çubuk Material 3 (marka renkli hap, seçili sekmede dolu simge `lib/tab-icons`; Material'ın dolu hâli iOS'tan farklıysa çizilmiş görsel
  `assets/images/tabs`, ör. harita: üç panel dolu, kıvrımlar açık; geri tuşu Feed'e);
  üst çubuk düz, başlık solda; modal = tam ekran diyalog, solda ✕ (`constants/navigation.tsx` → `modal`);
  başlık düğmeleri `components/header-button` (48 dp, ripple); fotoğraf üstü saydam başlıkta `FloatingBackButton`.
  Ekran içi adımlar geri tuşunu `useAndroidBack` ile yakalar; açılır pencereler geri tuşuyla kapanır.
- **Bileşenler:** segment → Compose `SegmentedButton`; anahtar → Compose `Switch`; ayarlar → Material liste
  (`settings-list.android.tsx`: tam genişlik, radyo, değer alt satırda); arama → her zaman görünen hap arama çubuğu
  (`SearchField`, temizle düğmeli); cam yüzey yerine opak yükseltilmiş yüzey; yenileme göstergesi marka renginde.
- **Klavye:** `KeyboardProvider` pencereyi küçültmez. Alt çubuklu formlar `useKeyboardFooterStyle`; diğer formlar
  `FormScrollView`, altta sabit girişli ekranlar `components/keyboard-avoiding-view` (Android'de keyboard-controller).
- **Harita (kullanıcı kararı 2026-10-01: Google Maps faturalandırması/ön ödemesi istenmedi):** MapLibre +
  OpenFreeMap (ücretsiz OpenStreetMap vektör karoları; anahtar, kart, kota yok). `components/app-map.android.tsx`
  ekranların kullandığı react-native-maps arayüzünü (`initialRegion`/`initialCamera`, `onRegionChangeComplete`,
  `onPress`, dokunma kilitleri, `showsUserLocation`, ref'te `animateToRegion`/`fitToCoordinates`/`animateCamera`,
  `PinMarker`) MapLibre'ye çevirir; ekranlar değişmez. Pin `ViewAnnotation`: görünüm bit eşlem olarak haritanın
  içinde çizilir (MapLibre `Marker` haritanın üstünde ayrı görünüm, kaydırırken geride kalıyordu); görünüm değişince
  `redraw` değeri değişmeli (yeniden çizim). MapLibre yakınlığı Google/Apple'ınkinin bir eksiği (512 px
  karo). Stil `constants/map-style` (Puanla renkleri, POI yok, yerel adlar, açık/koyu); atıf ⓘ düğmesi kalır (süs
  haritada gizli). Karo kaynağı değişirse (kendi sunucu, MapTiler) yalnızca `TILES`/`GLYPHS`. MapLibre iOS'a
  bağlanmaz (`react-native.config.js`). react-native-maps Android'de bağlı kalır ama çizilmez.
  Uygulama içi rota yok (Apple servisi): yol tarifi Google Haritalar'da açılır (`openInMaps`).
- **Paylaşım/davet:** "Paylaş → Puanla" ACTION_SEND ile gelir, `useShareIntentRedirect` karşılama ekranına götürür.
  Davet ve hikâye kartı Android'den Google Play der (`PLAY_STORE_URL`, yayınlanınca doldur).
- **İzinler:** kamera açık; medya okuma izinleri engelli (Play politikası; kaydetme yalnız yazma ister).
  Bildirim kanalı `default` (Android 13+ izin penceresi için şart). Push için Firebase: `google-services.json`
  (`app.config.ts`, EAS'ta `GOOGLE_SERVICES_JSON` dosya değişkeni) + EAS'a FCM V1 hizmet hesabı anahtarı.
- **Google ile giriş** (yalnız Android; iOS'ta Apple): `@react-native-google-signin/google-signin` → Supabase
  `signInWithIdToken` (`api/auth.ts`), düğme `components/google-button` (Google marka kuralı) karşılamada "Başla"nın
  altında ve giriş ekranında. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` yoksa ya da Expo Go'daysa düğme görünmez; yerel modül
  ilk kullanımda içe aktarılır. Config eklentisi eklenmez (Android'de gerekmiyor; iOS'ta `iosUrlScheme` olmadan prebuild
  patlar). Kurulum adımları SUPABASE.md → "Android: Google ile giriş ve push".
- **Yazı:** Roboto; ölçek Material 3'e yakın (`typography`, gövde 16).
- **Bilinen tuzaklar (2026-09-30 emülatör testinde bulundu):** expo-image `PlatformColor` kabul etmez → görseller `components/image` (tema rengini düz değere çevirir), `expo-image`
  doğrudan içe aktarılmaz. Başlıksız modal ve RN `Modal` Android'de tam ekran: üst boşluk `insets.top` (iOS'ta sayfa).
  Saydam başlıkta `headerStyle: { backgroundColor: 'transparent' }` şart (yoksa Android üst çubuk zemini ezer).
  Konum izni: Android'de kapatılan pencere "denied" görünür ama sorulabilir; düğmeyle her zaman yeniden istenir
  (`lib/location`), dengeli hassasiyet konum veremezse GPS'le denenir.
- **Yerel test:** `npx expo prebuild --platform android --clean` → `android/build.gradle`'a NDK 27.1 zorlaması →
  `./gradlew app:assembleDebug -PreactNativeArchitectures=x86_64` (JAVA_HOME JDK 17; emülatör KAPALIYKEN ve
  `gradle.properties`'te düşük bellekle: aksi hâlde pagefile şişip C: dolar). Emülatör `Puanla_API_34`, penceresi
  ekran dışına açılabiliyor (SetWindowPos ile sola alınır). Metro 8082'de; uygulamaya `debug_http_host=10.0.2.2:8082`
  (shared_prefs) yazılır. Geliştirme sürümünde açılışta ~3 sn siyah ekran Metro'dan paket indirmesinden (release'te yok).
- Denendi (2026-09-30, emülatör, Android 14): karşılama/giriş/kayıt adımları, 5 sekme, açık/koyu geçişi (ekran yerinde
  kalıyor), feed + menüler + geri tuşu, yorum + klavye, Ara, gönderi oluşturma + kamera + kırpma, mekân sayfası,
  puanlama ve rehber, profil düzenle, hikâye kartı + paylaşım sayfası, lig, bildirimler, ayarlar/görünüm.
  Denenmedi: push (FCM yok), "Paylaş → Puanla" ile gelen paylaşım, rehberden kişi seçme.
- Kodda hazır, kurulum bekliyor (2026-10-01): Google ile giriş, FCM (SUPABASE.md). Henüz yok:
  Play Store kaydı (`PLAY_STORE_URL`).

## Kalite ve premium his (kalıcı ilke)
- Uygulama premium hissettirmeli; güncel iOS tasarım dili ve yetenekleri tercih edilir.
- Mümkün olan her yerde native bileşen: native tabs (iOS 26'da Liquid Glass), native stack başlıkları,
  SwiftUI bileşenleri (`@expo/ui/swift-ui`, ör. segmented Picker), cam yüzeyler (`expo-glass-effect`,
  eski iOS'ta `expo-blur` yedeği → `components/glass-surface.tsx`), SF Symbols, sistem paylaşım menüsü.
- Her etkileşimde haptik + yay animasyonu (`PressableScale`); stil doğrudan dokunma alanına uygulanır.
- Kod kalitesi: tip güvenliği, tek sorumluluklu bileşenler, mantık `lib/` altında ve test edilebilir.
  Her adım sonunda `tsc`, `expo lint` ve iOS bundle temiz olmalı.

## Ekranlar ve akış
### Onboarding
1. Karşılama: süzülen İstanbul haritası ve puan pinleri, beyaza eriyen geçiş, serif "puanla" logosu,
   otomatik ilerleyen 3 slayt (Hatırla · Güven · Keşfet), "Başla" (oksuz) ve "Giriş yap" (`onboarding/giris`).
2. E-posta → 3. Ad ve soyad (kullanıcı adı otomatik türetilir, boşta mı kontrol edilir;
   istenirse aynı ekranda "Değiştir" ile elle seçilir, zorunlu değil) → 4. Şifre + koşulları kabul cümlesi →
   Supabase `signUp` (taslak AsyncStorage'da, şifre asla saklanmaz).
   Doğrulama açıksa `onboarding/dogrula` (6 haneli kod). Oturum açılınca kök düzen yarım kalan kuruluma
   (`ilk-puan`) yönlendirir; `profiles.onboarded_at` dolunca sekmelere geçilir.
   Her adımda tek soru, büyük giriş alanı, adım ikonu ve ince ilerleme çubuğu.
5. En son gidilen 1 restoranı Beli tarzı puanla ("Beğendim / İdare eder / Beğenmedim" + ikili karşılaştırma),
   ardından normal gönderi ekranı açılır (fotoğraf isteğe bağlı, "Şimdilik atla" var). Adım atlanabilir.
   Telefon (kullanıcı kararı 2026-10-01): kaydın başından kaldırıldı; SMS doğrulaması (`PHONE_VERIFICATION_ENABLED`)
   açılınca numarası doğrulanmamış herkese (e-posta da Google da) ilk puandan sonra `onboarding/telefon` isteğe bağlı
   (`PhoneVerification`). Kapalıyken numara hiç sorulmaz.
6. En az 5 kişiyi takip et ("Hepsini takip et" kısayolu) → Başla; "Şimdilik geç" ile atlanabilir.

### Alt bar (5 sekme)
- **Feed:** iki sekme. *Popüler* (varsayılan): konumun yakınındaki en popüler gönderiler (3→10→30 km,
  yoksa en yakın şehir); kullanıcı şehir/ilçe seçerse o bölgenin popüler feed'i. *Takip*: takip edilenlerin
  ve kullanıcının gönderileri. Gönderi = mekân + fotoğraflar (en fazla 5) + yorum
  + birlikte gidilen arkadaş etiketleri + puan. Beğenilir (çift dokunuş dahil), yorum yapılır, kaydedilir.
  Mekân sayfasında o mekânın gönderileri "Gönderiler" ızgarasında listelenir.
  Gönderide yapılandırılmış bilgi: öne çıkanlar (en fazla 3), `lib/post-meta.ts` → `HIGHLIGHTS`. Restoran yorumu
  araştırmalarındaki en sık başlıklara göre 5 grup (Lezzet ve değer · Hizmet · Ortam · Kimle, ne için · Bilmen
  gerekenler) ve mekânın türüne göre (kahvaltıcıda "Kahvaltısı dopdolu", kafede "Laptopla çalışılır", meyhanede
  "Mezeleri iyi"…; `highlightsFor(segment)`). Genel lezzet puanla söylendiği için etiketler puanın söylemediğini anlatır.
  Saklanan değer değişmez (mekân özeti sayar), etiket i18n'de (eski "Porsiyon büyük" → "Porsiyon doyurucu").
  Öğün artık sorulmuyor (eski gönderilerde gösterilir).
  Mekân sayfası öne çıkanlardan "Puanla kullanıcılarına göre" özetini çıkarır.
  **Ürün kararı:** fiyat hiçbir yerde yok — mekânda ₺/$ fiyat seviyesi gösterilmez, kişi başı hesap ve
  "ne yedin" sorulmaz (Beli'deki statü/gösteriş eleştirisine karşı; kimse hesap vermek zorunda kalmasın).
  DB'deki `price_level`, `price_per_person`, `dishes` sütunları eski veri için duruyor, istemci kullanmıyor.
- **Ara:** mekân ve kişi araması tek yerde (Tümü / Mekânlar / Kişiler)
- **Harita:** Puanla (varsayılan; görünen bölgede topluluğun puanladığı mekânlar, topluluk ortalamasıyla — `map_places`) ·
  Gittiklerim · Listem; pinler puan renginde
- **Listem:** gitmek istenen mekânlar, iki bölüm:
  - *Sosyal medyadan*: Instagram/TikTok'ta görülen mekân, gönderi bağlantısı ve notla (panodaki link otomatik yakalanır)
  - *Kaydettiklerim*: uygulama içinde yer imiyle kaydedilen mekânlar ve gönderiler
  - Mutfak/kaynak filtresi, sıralama (en yeni, arkadaş puanı, A–Z), sola kaydır → Gittim / Sil, haritada gör
- **Profilim:** Beli tarzı istatistik satırı: Takipçi · Takip · Sıralama. Sıralama = paylaşılan değerlendirme
  (gönderi) sayısına göre liderlik tablosundaki yer (eşitlikte beğeni); ilk değerlendirmeye kadar kilitli.
  Liderlik tablosu: Genel / Arkadaşlar, Tüm zamanlar / Bu ay.
  Beli'nin kopyası değil, kendi karakteri var: Top 3'üm vitrini, Damak zevkin (mutfak payları),
  Türk mutfağına özel rozetler, Seri, yıllık hedef, Gönderilerim ızgarası. Sağ üstte paylaş + ⚙️ Ayarlar.

### Diğer ekranlar
- **Puanla Ligi / XP (2026-09-27):** liderlik tablosu XP'ye göre (`xp_totals`, `lib/xp.ts` aynı değerler): puanlama
  +10 (günde en fazla 20), gönderi +20, fotoğraflı +20 ek, gelen beğeni +2 (kendi beğenin değil), davetle katılan
  ilk puanını verince davet edene +100 / davetliye +50. XP saklanmaz, veriden hesaplanır (silinen gönderinin XP'si
  düşer). Seviyeler: Çaylak 0 · Meraklı 100 · Gurme 300 · Usta 800 · Efsane 2000. Ligler Genel / Okulum /
  Arkadaşlar, tüm zamanlar ya da bu ay (İstanbul saatiyle ayın 1'i). Profildeki "Sıralama" = genel XP sırası
  (`user_rank`). Davet eden: `set_inviter` ("Seni kim davet etti?", ilk 30 gün, bir kez, davet eden daha eski üye;
  `profile_private.invited_by` yalnızca sahibine görünür); davet mesajı kullanıcı adını söyler.
  **Davet bağlantısı (2026-10-01, telefondan bağımsız):** davet eden kendiliğinden bağlanır (`lib/invite-code`,
  biçim `lib/invite-referrer`): Android'den giden davetlerde Play bağlantısı `referrer=…davet=<kullanıcı adı>` taşır
  (`inviteLink(username)`; `PLAY_STORE_URL` dolunca çalışır), ilk açılışta Play yükleme kaynağı bir kez okunur
  (`expo-application`); uygulama yüklüyse `puanla://davet/<kullanıcı adı>` (`+native-intent`, sayfa değil). Kod
  cihazda saklanır, oturum açılınca `set_inviter` (kök düzen `useInviteCode`; kalıcı ret kodu siler, ağ hatası
  bekletir) ve davet eden `takip` önerilerinin başına gelir (`Profile.inviterId`). iOS'tan giden davette App Store
  kaynak taşımaz: alan adı gelince `https://puanla.app/davet/<kullanıcı adı>` sayfası + evrensel bağlantı aynı yolu
  kullanır; o zamana dek "@kullanıcı adı yaz" ipucu. İlk girişte 4 adımlı
  tanıtım (`leaderboard-intro`, cihazda bir kez; ⓘ ile tekrar). Migration `20261008100000_xp`.
- **Yıllık hedef sayfası (2026-09-29, `hedef`):** profildeki hedef kartından (dokun; basılı tut = değiştir/kaldır)
  açılır. Üstte lacivert kartta kendi hedefin, altında sen + takip ettiklerin tamamlanma oranına göre (`year_challenge`:
  o yılın `rated_at`'ı, İstanbul yılı, engellenenler yok; kendi satırın cihazdaki `placesThisYear` ile). Hedefsiz
  arkadaşlar yalnızca sayı olarak; paylaş metni hedef sayfasına bağlanır. Migration `20261009100000_year_challenge`
  (2026-09-29 canlıda). 2026-10-01 (kullanıcı isteği): adı "Yıllık mekân hedefi", kartta ne saydığı yazar ("bu yıl
  puanladığın her mekân"); **hedef hikâye kartı** (`GoalStoryCard`, `hikaye?tur=goal`, profil kartları arasında da;
  büyük sayı + ilerleme + tamamlanma/kalan gün + "Sen de Puanla'da hedef koy" imzası), hedef kartında "Hikâyede paylaş".
- **Liderlik tablosu sponsoru** (`constants/sponsors.ts`, `components/sponsor-card.tsx`): ilk ortak Culinora (gastronomi
  kursları; kullanıcının kendi uygulaması). Genel · bu ay tablosunun ilk 10'una Culinora Premium %20 indirimli; kart Culinora'nın tasarım dilinde (siyah, turuncu #FE6E00, logo `assets/images/partners`, "Sponsor" etiketi yok), her
  sekmede, uygunluk hep o tabloya göre. Üç durum: kazanan (tebrik, kod varsa kopyala), yakın ("ilk 10'a N değerlendirme
  kaldı"), duyuru. "Culinora'ya git" platformun mağazasını açar. `promoCode` boşken indirim yalnızca duyuru; kapatmak
  için `LEADERBOARD_SPONSOR = null`. **2026-09-27'den beri kapalı** (kullanıcı kararı); açmak için `= CULINORA`.
- **Sana özel öneriler** (`oneriler`, profilde 10 puandan sonra açılır): `recommended_places` — gitmediğin, arkadaş
  (öncelikli) ya da topluluk ortalaması ≥ 6,7 mekânlar; sevdiğin mutfağa bonus, konum varsa uzaklık cezası. Adaylar:
  arkadaşların en beğendiği 200 mekân + en çok puanlanan 100 (genel) + 150 (~15 km); puanlar yalnızca onlar için toplanır.
- **Paylaşım** `lib/share.ts`: profil, gönderi (… menüsü), mekân (sağ üst) → metin + `appLink()` (`puanla://…`,
  Expo Router rotalarını doğrudan açar). Alan adı gelince `constants/app.ts` → `appLink` https evrensel bağlantıya çevrilir.
- **Bildirimler** (migration `20260930100000_notifications`): `notifications` tablosunu yalnızca tetikleyiciler yazar
  (beğeni, yorum, etiket, takip; "arkadaşın gittiğin yeri puanladı" = puanlayanı takip eden ve o mekânı puanlamış
  kişilere, işlem sonunda çalışan ertelenmiş tetikleyiciyle). Kendine, engelli çiftlere ve oturumsuz betiklere bildirim
  yok; `notifications_once` tekrarları yutar, beğeni/takip/etiket geri alınınca bildirim silinir. Push: bildirim eklenince
  `pg_net` ile Expo Push API'ye (alıcının dilinde metin `notification_text`, dokununca açılan yol `notification_path`,
  rozet = okunmamış sayısı); pg_net yoksa (testler) atlanır. Jetonlar `push_tokens` (yalnızca `register/unregister_push_token`),
  tür başına kapatma `profile_private.push_muted`. İstemci: `lib/notifications.ts` (izin öncesi açıklama, cihaz kaydı,
  dokununca yönlendirme, çıkışta jeton silme), `bildirimler` (Bugün/Bu hafta/Daha önce, açılınca okundu), `bildirim-ayarlari`,
  Feed'de zil + okunmamış rozeti. APNs anahtarı EAS build sırasında kurulur; yeni build gerekir.
- **Feed mekaniği (akıcılık):** FlashList (`getItemType` foto/fotosuz), `PostCard` memo ve yalnızca kendi beğeni/kaydetme
  durumunu dinler (`useAppSelector` / `useAppActions`; uzun listelerde `useAppStore` kullanma, her değişimde yeniden çizer).
  Popüler sıra `posts.hot` (üretilen sütun, `hot_rank`: ln(1 + beğeni + 2×yorum) + yaş; etkileşim 3 katına çıkınca
  gönderi 2 hafta daha yeni sayılır — kullanıcı kararı 2026-09-29: "o konumdaki en popüler gönderiler önce"; migration
  `20261011100000_feed_popularity`; zamandan bağımsız olduğu için indeksli, sayfalar kaymaz). Bölge yoğunsa indeksten
  okunur, seyrekse bölge toplanıp sıralanır (migration `20261010100000_scale`). `p_as_of` sonradan paylaşılanları o
  oturumun sayfalarından uzak tutar (yanıttaki `as_of` geri yollanır), istemci ayrıca tekrarları ayıklar. Yenileme
  yalnızca ilk sayfayı çeker (`restart`); feed'ler 2 dk taze sayılır (ön plana her dönüşte tüm sayfalar çekilmez).
  Beğeni/kaydetme/takip/puan istekleri öğe başına sırayla gider (`serial`, app-store): hızlı art arda dokunuşta ters
  sırayla sunucuya ulaşmaz.
  Fotoğraf: küçük kopya `placeholder`, `recyclingKey`, yeni sayfanın görselleri diske önceden indirilir; karusel genişliği
  ekrandan. Açılışta açılış görseli yalnızca oturum/tercih okunana kadar; veri beklenirken `LaunchSkeleton`.
- **Masa döngüsü ve rehber** (migration `20261002100000_table_loop`, `app.json` 1.0.1: `expo-contacts` yeni build ister):
  gönderide "Kimlerle gittin?" → **Rehberden** (sistem kişi seçicisi, `lib/contacts.ts`): Puanla'daysa etiketlenir,
  değilse paylaşınca `davet-et` açılır ("X, Y için 8,7 verdi. Sen kaç verirdin?" doğrudan kişiye WhatsApp `wa.me`/SMS;
  indirme bağlantısı `constants/app.ts` → `APP_STORE_URL`, boşsa "App Store'da arat"). Davet `invites`'a numara özetiyle
  yazılır. Telefon SMS koduyla doğrulanır (Supabase Auth `phone_change`; `PHONE_VERIFICATION_ENABLED`, SMS sağlayıcısı
  bağlanınca açılır → SUPABASE.md); eşleşmede yalnızca doğrulanmış numara, bir numara tek hesapta. Doğrulanınca
  `on_auth_user_phone` → davet edenlere ve rehberinde numara olanlara `friend_joined` bildirimi (oturumsuz bağlam:
  `notify_system`). Davetli aynı mekânı puanlayınca davet edene `friend_rated` karşılaştırması. Onboarding:
  `ilk-puan` davet kartı (davet edenin mekânı, puanlayınca
  "Sen 7,9 · İsmail 8,7") → SMS açıksa ve numara doğrulanmamışsa `telefon` (atlanabilir) → `takip`'te davet eden en üstte + "Rehberinden bul" kartı (`components/contact-friends.tsx`,
  Arkadaş bul'da da). Rehber sunucuda yalnızca SHA-256 özeti (`contact_hashes`, `match_contacts(p_save)`), günde 30
  eşleştirme; Ayarlar → "Rehberden bulunabilirim" (`discoverable`). Telefon hâlâ isteğe bağlı (kullanıcı kararı 2026-09-25).
  **SMS ertelendi (kullanıcı kararı 2026-09-25):** SMS sağlayıcısı (Twilio vb., SMS başına ücretli) şimdilik entegre
  edilmeyecek; `PHONE_VERIFICATION_ENABLED = false` kalır, SMS kurulumu önerme. Bu yüzden telefon doğrulaması,
  "Rehberinden bul" ve `friend_joined` bildirimleri kapalı/çalışmaz (eşleşme doğrulanmış numara ister); gönderide
  rehberden etiketleme ve WhatsApp/SMS daveti çalışır, davetler özetiyle birikir ve SMS açıldığı gün eşleşir.
  Açmak gerekirse: Supabase Phone sağlayıcısı (ya da ucuz yerli sağlayıcı için Auth Hooks → Send SMS) → bayrak `true`
  → `npm run update` (build gerekmez).
- **Yol tarifi** (`yol-tarifi/[id]`, mekân sayfasındaki haritaya dokununca): yerel Expo modülü `modules/puanla-directions`
  (Swift, Apple MKDirections; anahtar/ücret yok, EAS build'de derlenir, Expo Go ve web'de yok → `inAppDirections` false,
  kuş uçuşu + Apple Haritalar yedeği). Yürüyerek/arabayla rota çizgisi, süre, mesafe, varış, adımlar; Başlat: konum takibi,
  talimat bandı + sesli okuma (`expo-speech`), adım ilerletme/rotadan çıkınca yeniden hesaplama/varış (`lib/directions.ts`),
  ekran açık kalır. Toplu taşımada MapKit yalnızca süre verir; hat adımları için Apple Haritalar açılır.
- **Paylaş → Puanla** (`expo-share-intent`, iOS paylaşım uzantısı `app.puanla.share-extension`, App Group `group.app.puanla`):
  Reels/TikTok/Safari'den paylaşılan bağlantı → `+native-intent` (`dataUrl=` yolunu `paylasim-al`'a çevirir) →
  `listeye-ekle` (`baglanti` hazır, `ara`: paylaşımdaki 📍 mekân adı; TikTok'ta açıklama oEmbed'den, Instagram açıklama vermez).
  Sağlayıcı kök düzende en dışta; Expo Go ve web'de kapalı. Yeni build gerekir.
  Uzantının Xcode hedefi `PuanlaShare` (ana hedef "Puanla" ile aynı olursa EAS uzantının profilini ana uygulamaya
  takar, build düşer); menüdeki ad `plugins/with-share-extension-display-name` ile "Puanla" (app.json'da
  expo-share-intent'ten ÖNCE durmalı: eklentilerde son eklenen önce çalışır).
- **Lezzet haritası paylaşımı** (`harita-paylas/[id]`, profildeki harita kartının paylaş simgesi; kendi ve başkasının):
  degrade zeminde beyaz kart ("{Ad}'ın lezzet haritası" — `lib/possessive.ts` Türkçe iyelik eki —, şehir · mekân sayısı,
  harita, en çok gidilen mutfaklar), altta Paylaş / Kaydet (Fotoğraflar, yalnızca ekleme izni) / Mesajlar (görsel ekli) /
  Bağlantı. Dışa aktarma `lib/story-export.ts`; `expo-media-library` ve `expo-sms` yalnızca düğmeye basınca yüklenir
  (yerel modül yoksa dosya yüklenirken hata veriyor). Beli'den esinli, birebir kopya değil (App Store 4.1/4.3);
  Instagram/TikTok logoları kullanılmaz.
- **Hikâye kartları** (`hikaye`, 1080×1920 PNG, `react-native-view-shot` + `expo-sharing`): altta "App Store'da
  Puanla" rozeti (uygulaması olmayan izleyici için); `APP_STORE_URL` doluysa paylaşırken bağlantı panoya kopyalanır
  ve Instagram'ın Bağlantı çıkartması önerilir. Kartlar: Favori 4, En iyi 5, Lezzet haritası,
  Bu ay (aylık özet; bu ay boşsa geçen ay), tek gönderi. Kartlar `components/story-cards.tsx` (540×960 çizilir,
  Instagram güvenli alanı içinde), veri `lib/story.ts`. Giriş: Profil → Paylaş menüsü, kendi gönderisinin … menüsü,
  lezzet haritası paylaş ikonu, gönderi paylaşıldıktan sonra öneri (onboarding hariç).
- **"Sen kaç verirdin?" (feed):** başkasının puanlı gönderisinde aksiyon satırında hap: mekânı puanladıysan "Sen 7,9"
  (dokununca mekân), puanlamadıysan "Ben de gittim" → `degerlendir` (`karsi`/`karsiPuan` parametreleriyle sonuçta
  "İsmail'in puanı 8,7" gösterilir). Kart yalnızca kendi mekânının puanını dinler (`scoreInRankings` seçicisi).
- **Damak uyumu** (migration `20261003100000_taste_match`, `taste_match(p_user_id)`): başkasının profilinde menünün
  başında "%82 · 14 ortak mekân" satırı (`components/taste-match.tsx`); ayrıntı `uyum/[id]` (ikinizin de favorisi,
  ayrıldığınız yerler, tüm ortak mekânlar, paylaş). Formül: ortak mekân başına 1 − |fark|/5, iki yarı uyumlu mekânla
  dengelenir; 3 ortak mekândan az ise yüzde yok (`taste_match_percent`). Yüzde puan renk skalasında (%82 → 8,2 rengi).
- **Paylaşılabilir listeler** (migration `20261003110000_lists`): `lists` + `list_places` (listeye özel not) +
  `list_saves` (kaydetme, `save_count` tetikleyiciyle). Yazma yalnızca `save_list` (1–50 mekân, günde 20 liste, uygunsuz
  ifade filtresi); sıra her okumada sahibin güncel puanına göre. Okuma: `user_lists`, `saved_lists`, `list_details`
  (yalnızca üyeler; web/girişsiz erişim yok, kullanıcı kararı). Kimin kaydettiği gizli, engelli kişi listeyi görmez,
  listeler şikâyet edilebilir (`reports.list_id`, yönetim RPC'leri kapsıyor). İstemci: `api/lists.ts`,
  `components/list-card.tsx`: başkasının profilinde "İsmail'in listeleri" şeridi (listesi yoksa görünmez); kendi
  profilinde "Listelerim" + Yeni liste kartı, hiç liste yoksa "Favori mekânlarını listele" kartı (düzenleyici "Favori
  mekânlarım" başlığıyla açılır, `baslik` parametresi); Listem → Kaydettiklerim'de kaydedilen listeler. `liste/[id]`:
  kaydet/paylaş/hikâye kartı (kendi ve başkasının listesi; başkasınınkinde kartın altında liste sahibi)/düzenle/sil;
  başkasının listesinde her mekânda senin puanın + "Sen de liste yap". `liste-duzenle`: puanladıklarından seçim,
  mutfak/ilçe çipleri, "Görünenleri seç", mekân başına not (mantık `lib/lists.ts`). Hikâye kartı `hikaye?liste=<id>`.
  Paylaşım `shareList` diğer paylaşımlar gibi `appLink('liste/<id>')`.
- **Gönderi oluşturma** (`gonderi-olustur`, 2026-09-30 yeniden düzen): mekân → puan kartı (gri kart, büyük rozet,
  tür bağlamı, ? rehber) → fotoğraf (boşken tek dokunuşla Çek / Galeriden, ilki büyük "Kapak") → "Nasıldı?" →
  "Kimlerle gittin?" (masa döngüsü açıklamalı) → öne çıkanlar (açıkta). Kullanıcı kararı: alanlar "isteğe bağlı" diye
  etiketlenmez (görülsün, doldurulsun), öğün sorulmaz (açıklamaya yazılır; eski gönderilerin öğünü korunur).
  Paylaş düğmesi puan yokken "Önce puanını ver". Mekân sayfasında rehber düğmesi `ScoringGuideLink`.
  **Kırpma** (`components/photo-cropper.tsx`): çekilen/seçilen her fotoğraf önce siyah tam ekran kırpma ekranına gider;
  akıştaki 4:5 çerçeve (`POST_PHOTO_ASPECT` = PhotoCarousel), sıkıştır-yakınlaştır/sürükle (fotoğraf çerçeveyi hep
  kaplar), sürüklerken 3×3 ızgara, çift dokunuş sıfırlar, çoklu seçimde İleri/Bitti + küçük resimler. Kesim
  `cropImage` (expo-image-manipulator, orijinal çözünürlük); karoya dokununca orijinal üzerinden yeniden kırpılır.
- **Gönderi düzenleme** (`gonderi-duzenle`, kendi gönderinde … → Düzenle): açıklama, öğün, öne çıkanlar;
  fotoğraf ve puan değişmez. Öğün/öne çıkan seçicileri `components/post-fields.tsx` (oluşturma ile ortak).

## Türkiye'ye özgü notlar (ileride)
- Kategoriler: kahvaltıcı, esnaf lokantası, dürümcü, kokoreççi, ciğerci, balıkçı, meyhane
- İlk hedef tek bir şehir ve tek bir çevre (ör. bir üniversite)
- Paylaşılabilir "en iyi mekânlarım" kartı (Instagram hikâyesi için)

## Çalışma kuralları
- Küçük adımlarla ilerle. Her adım sonunda `npx expo start` ile iPhone'da test edilebilir olsun
- Kullanıcı Türkçe ve gündelik konuşur ("bro"); Beli'den ilham alınır ama ekranlar birebir kopyalanmaz
- Kod açıklamaları Türkçe; kullanıcıya görünen metinler i18n'de (Türkçe kaynak + İngilizce çeviri)
