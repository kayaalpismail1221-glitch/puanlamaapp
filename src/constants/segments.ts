import type { SFSymbol } from '@/components/symbol';

import type { Cuisine, Segment } from '@/types';

/**
 * Segmentler: birbiriyle kıyaslanması anlamlı mekân aileleri. Puanlamada yeni mekân yalnızca aynı
 * segmentteki mekânlarla karşılaştırılır ve puanı o segmentteki sırasından hesaplanır (kokoreççi
 * meyhaneyle, burgerci pizzacıyla değil; kokoreççi ciğerciyle, burgerci burgerciyle yarışır). Aile yalnızca gerçekten
 * aynı deneyimi birleştirir (Döner + Dürüm, Kokoreç + Ciğer, Tatlıcı + Pastane + Dondurma, oturup yemek yenen
 * restoranlar); gerisi tek kategoridir. Veritabanındaki `cuisines.segment` ile aynı (migration
 * 20261022110000_segment_families). Saf modül (i18n yok): demo betikleri de kullanır. Ekrandaki adı:
 * `t(`segments.${segment}`)`.
 */
export const SEGMENTS: Segment[] = [
  'restaurant',
  'kebab',
  'doner',
  'offal',
  'meatball',
  'cigkofte',
  'pide',
  'pizza',
  'burger',
  'fastfood',
  'breakfast',
  'bakery',
  'cafe',
  'dessert',
  'meyhane',
  'bar',
];

export const SEGMENT_OF: Record<Cuisine, Segment> = {
  Restoran: 'restaurant',
  'Esnaf lokantası': 'restaurant',
  Balıkçı: 'restaurant',
  'Uzak Doğu': 'restaurant',
  'Dünya mutfağı': 'restaurant',

  Kebapçı: 'kebab',

  Dürümcü: 'doner',
  Dönerci: 'doner',

  Kokoreççi: 'offal',
  Ciğerci: 'offal',

  Köfteci: 'meatball',

  'Çiğ köfteci': 'cigkofte',

  Pideci: 'pide',

  Pizzacı: 'pizza',

  Burgerci: 'burger',

  'Büfe & fast food': 'fastfood',

  Kahvaltıcı: 'breakfast',

  Börekçi: 'bakery',

  Kafe: 'cafe',

  Tatlıcı: 'dessert',
  'Pastane & fırın': 'dessert',
  Dondurmacı: 'dessert',

  Meyhane: 'meyhane',

  Bar: 'bar',
};

/** Yalnızca Android karşılığı olan SF sembolleri (constants/android-symbols) */
export const SEGMENT_ICONS: Record<Segment, SFSymbol> = {
  restaurant: 'fork.knife',
  kebab: 'flame',
  doner: 'figure.walk',
  offal: 'moon.stars',
  meatball: 'fork.knife.circle',
  cigkofte: 'leaf',
  pide: 'oven',
  pizza: 'flame.fill',
  burger: 'takeoutbag.and.cup.and.straw',
  fastfood: 'takeoutbag.and.cup.and.straw',
  breakfast: 'sun.horizon',
  bakery: 'basket',
  cafe: 'cup.and.saucer',
  dessert: 'birthday.cake',
  meyhane: 'wineglass',
  bar: 'music.note',
};

/** Bilinmeyen kategori (eski istemci / yeni eklenen) restoran sayılır; sunucu da aynısını yapar */
export const segmentOf = (cuisine: string | undefined): Segment =>
  SEGMENT_OF[cuisine as Cuisine] ?? 'restaurant';
