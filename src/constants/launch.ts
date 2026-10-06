/**
 * Açılış animasyonu (components/launch-intro): slogan, ölçüler ve zamanlama. Süreler ms, ölçüler pt.
 *
 * Akış: sistem açılış ekranında "Expeat" hemen görünür (telefonun görünümüne göre beyaz ya da koyu) → uygulama
 * aynı kareden devralır, uygulama altta yerleşene kadar yazı sabit kalır → yazı yavaşça büyür (sinematik yakınlaşma)
 * ve büyürken bulanıklaşıp erir → ortada slogan harf harf bulanıktan nete gelir, okunacak kadar kalır → örtü solar,
 * uygulama hafif geriden yerine oturur.
 */

export const TAGLINE = 'Eat The Experience';

/** hidden: slogan henüz yok · shown: slogan görünür · gone: çıkış */
export type LaunchPhase = 'hidden' | 'shown' | 'gone';

export const LAUNCH = {
  /** "Expeat" genişliği: app.json → expo-splash-screen `imageWidth` ile aynı olmalı (ilk kare çakışsın) */
  wordmarkWidth: 150,
  /** Görselin en/boy oranı ve bulanık kopyanın kenar payı (scripts/generate-icons.py yazdırır; görsel değişirse güncelle) */
  wordmarkAspect: 3.61,
  blurMargin: 0.06,
  /** Uygulama altta yerleştikten sonra animasyon başlamadan önceki kısa bekleme (ilk çizim bitsin, akış takılmasın) */
  settle: 200,
  /** Uygulama bu sürede hazır olmazsa animasyon yine de başlar */
  startTimeout: 2500,
  /** "Expeat" yavaşça büyür: süre ve son ölçek */
  zoom: 1700,
  zoomTo: 1.32,
  /** Büyürken erir: başlangıç ve süre; erirken önceden bulanıklaştırılmış kopyasına geçer */
  dissolveStart: 850,
  dissolve: 650,
  /** Slogan: başlama anı (yazı neredeyse tamamen eridiğinde), harfler arası gecikme, bir harfin bulanıktan nete gelişi */
  taglineDelay: 1450,
  stagger: 32,
  charIn: 800,
  /** Sloganın harf aralığının açıktan normale toparlanması */
  tracking: 1400,
  trackingFrom: 3.5,
  /** Slogan tamamlandıktan sonra ekranda kalma süresi */
  hold: 900,
  /** Çıkışta bir harfin dağılması ve harfler arası gecikme */
  charOut: 340,
  outStagger: 10,
  /** Çıkışta örtünün solması: gecikme ve süre */
  overlayDelay: 120,
  overlayOut: 450,
  /** Uygulamanın geriden (ölçek) yerine oturması */
  stageIn: 750,
  stageFrom: 0.97,
  /** Ne olursa olsun örtü en geç bu sürede kalkar (uygulama hazır olmasa da dokunuşu kilitlemesin) */
  failsafe: 10000,
} as const;

/** Son harfin de nete gelmesine kadar geçen süre (slogan başladıktan sonra) */
export const LAUNCH_REVEAL_TOTAL = LAUNCH.stagger * (TAGLINE.length - 1) + LAUNCH.charIn;
/** Çıkışta son harfin de dağılmasına kadar geçen süre */
export const LAUNCH_EXIT_TOTAL = LAUNCH.outStagger * (TAGLINE.length - 1) + LAUNCH.charOut;
