import { Platform } from 'react-native';

import { playInviteUrl } from '@/lib/invite-referrer';

/**
 * Uygulama geneli sabitler. Alan adı alınınca yalnızca buradaki değerler güncellenir.
 */

// Bağımlılıksız modülde: yasal metin betiği (scripts/legal/build.mjs) Node'da doğrudan okur
export { legalUrl, SUPPORT_EMAIL } from '@/constants/contact';

/**
 * Uygulamayı ilgili ekranda açan bağlantı (ör. `expeat://mekan/<id>`; Expo Router rotaları doğrudan eşler).
 * Uygulama yüklü olanlarda açılır. Alan adı alınınca https evrensel bağlantıya (Universal Links) geçilir;
 * paylaşım metinleri yalnızca bu fonksiyonu kullandığı için tek yerden değişir. Eski ad döneminde paylaşılan
 * `puanla://` bağlantıları da açılır: app.json'da iki şema kayıtlı (ilki, `expeat`, paylaşım uzantısının da şeması).
 * `expeat://` 1.0.2 derlemesiyle geldi; daha eski derlemelere giden güncellemede bu değer `puanla` kalmalı.
 */
export const APP_SCHEME = 'expeat';
export const appLink = (path: string) => `${APP_SCHEME}://${path}`;

/**
 * Davet mesajlarındaki indirme bağlantısı: App Store sayfası (uygulama kimliğinden; yayından önce açılmaz, "bu
 * uygulama mevcut değil" der). Boş bırakılırsa mesaj "App Store'da Expeat'i arat" der.
 * Alan adı gelince web önizleme sayfasına çevrilir (ör. `https://expeat.app/indir`) — tek yer burası.
 */
export const APP_STORE_URL = 'https://apps.apple.com/app/id6815859231';
/** Google Play sayfası (yayınlanınca: https://play.google.com/store/apps/details?id=app.puanla) */
export const PLAY_STORE_URL = '';
/**
 * Davet eden kişinin platformunun mağazası: Android'den gönderilen davetin alıcısı da büyük olasılıkla Android'de.
 * Kullanıcı adı verilirse Google Play bağlantısı onu taşır; katılan kişi davet edene kendiliğinden bağlanır
 * (`lib/invite-code`). App Store kaynak taşımaz.
 */
export function inviteLink(username?: string) {
  if (Platform.OS !== 'android') return APP_STORE_URL;
  return PLAY_STORE_URL && username ? playInviteUrl(PLAY_STORE_URL, username) : PLAY_STORE_URL;
}

/** App Store Connect uygulama kimliği ve Android paket adı (değişmez; `app.json`) */
export const APP_STORE_ID = '6815859231';
export const ANDROID_PACKAGE = 'app.puanla';

/**
 * Uygulamanın mağaza sayfası (zorunlu güncelleme): önce mağaza uygulaması, açılmazsa web adresi.
 * Yayın öncesi kimlikten kurulur; davet bağlantılarındaki boş `APP_STORE_URL`/`PLAY_STORE_URL`'e bağlı değil.
 */
export const storePageUrls = () =>
  Platform.OS === 'android'
    ? [`market://details?id=${ANDROID_PACKAGE}`, `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`]
    : [`itms-apps://apps.apple.com/app/id${APP_STORE_ID}`, `https://apps.apple.com/app/id${APP_STORE_ID}`];
