import type { SFSymbol } from '@/components/symbol';

import type { Cuisine, Segment } from '@/types';

/**
 * Segmentler: birbiriyle kıyaslanması anlamlı mekân aileleri. Puanlamada yeni mekân yalnızca aynı
 * segmentteki mekânlarla karşılaştırılır ve puanı o segmentteki sırasından hesaplanır (kokoreççi
 * meyhaneyle ya da pizzacıyla değil, kokoreççiler ve dürümcülerle yarışır). Veritabanındaki `cuisines.segment` ile
 * aynı (migration 20261016110000_segment_split). Saf modül (i18n yok): demo betikleri de kullanır. Ekrandaki adı:
 * `t(`segments.${segment}`)`.
 */
export const SEGMENTS: Segment[] = [
  'restaurant',
  'kebab',
  'street',
  'fastfood',
  'breakfast',
  'bakery',
  'cafe',
  'dessert',
  'nightlife',
];

export const SEGMENT_OF: Record<Cuisine, Segment> = {
  Restoran: 'restaurant',
  'Esnaf lokantası': 'restaurant',
  Balıkçı: 'restaurant',
  'Uzak Doğu': 'restaurant',
  'Dünya mutfağı': 'restaurant',

  Kebapçı: 'kebab',

  Dürümcü: 'street',
  Dönerci: 'street',
  Kokoreççi: 'street',
  Ciğerci: 'street',
  Köfteci: 'street',
  'Çiğ köfteci': 'street',
  Pideci: 'street',

  Pizzacı: 'fastfood',
  Burgerci: 'fastfood',
  'Büfe & fast food': 'fastfood',

  Kahvaltıcı: 'breakfast',

  Börekçi: 'bakery',

  Kafe: 'cafe',

  Tatlıcı: 'dessert',
  'Pastane & fırın': 'dessert',
  Dondurmacı: 'dessert',

  Meyhane: 'nightlife',
  Bar: 'nightlife',
};

export const SEGMENT_ICONS: Record<Segment, SFSymbol> = {
  restaurant: 'fork.knife',
  kebab: 'flame',
  street: 'figure.walk',
  fastfood: 'takeoutbag.and.cup.and.straw',
  breakfast: 'sun.horizon',
  bakery: 'basket',
  cafe: 'cup.and.saucer',
  dessert: 'birthday.cake',
  nightlife: 'wineglass',
};

/** Bilinmeyen kategori (eski istemci / yeni eklenen) restoran sayılır; sunucu da aynısını yapar */
export const segmentOf = (cuisine: string | undefined): Segment =>
  SEGMENT_OF[cuisine as Cuisine] ?? 'restaurant';
