import type { SFSymbol } from '@/components/symbol';
import type { ImageSourcePropType } from 'react-native';

import type { LeaderboardPeriod, LeaderboardScope } from '@/lib/leaderboard';

type Localized = { tr: string; en: string };

/**
 * Liderlik tablosu sponsoru. İlk ortak: Culinora (gastronomi kursları; culinora.net).
 * Kampanya: seçilen tablonun ilk `topN`'ine giren Puanla kullanıcılarına Culinora Premium `discountPercent` indirimli.
 * Kart sponsorun kendi tasarım dilinde çizilir (`brand`); kampanyayı kapatmak için `LEADERBOARD_SPONSOR` null yapılır.
 */
export type LeaderboardSponsor = {
  name: string;
  /** Wordmark iki parça, logo işaretinden ("C") sonra: turuncu "ulin" + beyaz "ora" */
  wordmark: [accent: string, plain: string];
  logo: ImageSourcePropType;
  /** Ne yaptığı, logonun altında: "Gastronomi eğitim platformu" */
  category: Localized;
  /** Sitedeki tanıtım cümlesi; kendi sözlerimizle yazmıyoruz */
  tagline: Localized;
  /** Kartın altındaki kurs şeridi (sitedeki gerçek kurslar; görseller uygulamaya gömülü küçük kopyalar) */
  courses: { title: string; image: ImageSourcePropType }[];
  /** Öne çıkanlar (sitedeki anlatımdan): SF Symbol + metin */
  features: { icon: SFSymbol; label: Localized }[];
  /** Kazananlık hangi tabloya göre: varsayılan genel · bu ay (her ay sıfırlanır, yeni gelenin de şansı olur) */
  scope: LeaderboardScope;
  period: LeaderboardPeriod;
  topN: number;
  discountPercent: number;
  appStoreUrl: string;
  playStoreUrl: string;
  /** Sponsorun verdiği ortak indirim kodu; yalnızca ilk N'dekilere gösterilir. Yoksa kartta yalnızca duyuru olur. */
  promoCode?: string;
  /** Sponsorun marka renkleri (culinora.net: siyah zemin, beyaz yazı, turuncu vurgu) */
  brand: {
    background: string;
    surface: string;
    accent: string;
    accentDeep: string;
    glow: string;
    text: string;
    textSoft: string;
    textFaint: string;
  };
};

/** Şimdilik kapalı (2026-09-27, kullanıcı kararı); açmak için `CULINORA` verilir */
export const LEADERBOARD_SPONSOR: LeaderboardSponsor | null = null;

export const CULINORA: LeaderboardSponsor = {
  name: 'Culinora',
  wordmark: ['ulin', 'ora'],
  logo: require('../../assets/images/partners/culinora-mark.png'),
  category: { tr: 'Gastronomi eğitim platformu', en: 'Culinary education platform' },
  tagline: {
    tr: 'Profesyonel şeflerden sertifikalı gastronomi kursları.',
    en: 'Certified cooking courses from professional chefs.',
  },
  courses: [
    { title: 'Uluslararası Doğrama Şekilleri', image: require('../../assets/images/partners/culinora-course-dograma.jpg') },
    { title: 'Temel Soslar ve Türevleri', image: require('../../assets/images/partners/culinora-course-soslar.jpg') },
    { title: 'Profesyonel Fond Üretimi', image: require('../../assets/images/partners/culinora-course-fond.jpg') },
    { title: 'Lezzet Verici Karışımlar', image: require('../../assets/images/partners/culinora-course-karisimlar.jpg') },
  ],
  features: [
    { icon: 'play.rectangle.fill', label: { tr: 'Video dersler', en: 'Video lessons' } },
    { icon: 'checkmark.seal.fill', label: { tr: 'Sertifika', en: 'Certificates' } },
  ],
  scope: 'all',
  period: 'month',
  topN: 10,
  discountPercent: 20,
  appStoreUrl: 'https://apps.apple.com/tr/app/culinora-gastronomi-kurslar%C4%B1/id6760206517',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.chef2.app',
  promoCode: undefined,
  brand: {
    background: '#000000',
    surface: '#141414',
    accent: '#FE6E00',
    accentDeep: '#F05100',
    glow: 'rgba(254, 110, 0, 0.32)',
    text: '#FFFFFF',
    textSoft: 'rgba(255, 255, 255, 0.72)',
    textFaint: 'rgba(255, 255, 255, 0.45)',
  },
};
