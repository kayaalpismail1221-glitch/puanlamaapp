# Puanla tanıtım Reels'i — seslendirme metni

Video: `out/puanla-reels.mp4` (1080×1920, 30 fps, 26,5 sn, sessiz). Sesi sen okuyup üstüne eklersin.

## Metin (sahne zamanlarıyla)

| Süre | Ekranda | Seslendirme |
|---|---|---|
| 0,0 – 3,8 | Yabancı yorum kartları → arkadaş puanları | **Gitmeden önce kime güveniyorsun? Yabancılara mı, arkadaşlarına mı?** |
| 3,8 – 7,6 | Feed | **Puanla’da arkadaşlarının nerede ne yediğini, gerçek puanlarıyla görüyorsun.** |
| 7,6 – 11,8 | Hangisi daha iyiydi? | **Puan vermek yok: yeni mekânı gittiklerinle kıyaslıyorsun, puanın kendiliğinden çıkıyor.** |
| 11,8 – 15,4 | Listem | **Instagram’da gördüğün mekânı tek dokunuşla kaydet, bir daha unutma.** |
| 15,4 – 18,6 | Harita | **Haritada şehrin en iyileri, puan renkleriyle.** |
| 18,6 – 22,2 | Mekân + damak uyumu | **Hangi arkadaşın kaç verdi, kiminle damak zevkin uyuşuyor… hepsi burada.** |
| 22,2 – 26,5 | Logo + App Store | **Puanla’yı indir, ilk puanını ver. Ben de oradayım, gel takip et!** |

Toplam ~70 kelime; rahat ama enerjik bir tempoyla 25 saniyeye oturur.

## Kayıt ipuçları
- Telefonun ses kaydedicisiyle, sessiz ve yumuşak eşyalı bir odada (dolap önü iyi), ağız–telefon arası bir karış.
- Her cümleyi ayrı kaydet; CapCut'ta sahne başlangıçlarına oturt. Sığmayan cümlede %5–10 hızlandırma fark edilmez.
- İlk cümle en önemli: soru sorar gibi, merak uyandıran tonla. Son cümle gülümseyerek.
- Arkaya düşük sesli (%10–15) trend bir müzik: Instagram'ın kendi ses kütüphanesinden seçersen telif sorunu olmaz.

## Altyazı
`puanla-reels.srt` aynı zamanlamada. CapCut → Metin → Altyazı içe aktar ya da Instagram'ın otomatik altyazısını kullan.

## Paylaşım açıklaması (öneri)
> Nereye gideceğine artık yabancıların yorumlarıyla karar verme. 🍽️
> Puanla’da arkadaşlarının gittiği yerleri gerçek puanlarıyla görüyorsun; Instagram’da gördüğün mekânı tek dokunuşla kaydediyorsun.
> Uygulama App Store’da, bağlantı profilimde. Beni de orada takip et! 👇
>
> #puanla #istanbulyemek #nereyegidelim #yemekönerisi #istanbulrestoran #kadıköy #beyoğlu #gastronomi

## Yeniden üretme
Görseller değişirse: `bash render-layers.sh` → `python make_reel.py` (kontrol kareleri için `--kareler`).
Sahne süreleri `make_reel.py` → `SCENES`; metin değişirse bu dosya ve `.srt` birlikte güncellenir.
