import type { SFSymbol } from '@/components/symbol';

import type { Cuisine, Segment } from '@/types';

/**
 * Segmentler: birbiriyle kıyaslanması anlamlı mekân aileleri. Puanlamada yeni mekân yalnızca aynı
 * segmentteki mekânlarla karşılaştırılır ve puanı o segmentteki sırasından hesaplanır (kokoreççi
 * meyhaneyle değil, kokoreççiler ve dürümcülerle yarışır). Veritabanındaki `cuisines.segment` ile aynı.
 * Saf modül (i18n yok): demo betikleri de kullanır. Ekrandaki adı: `t(`segments.${segment}`)`.
 */
export const SEGMENTS: Segment[] = ['restaurant', 'street', 'breakfast', 'cafe', 'nightlife'];

export const SEGMENT_OF: Record<Cuisine, Segment> = {
  Restoran: 'restaurant',
  'Esnaf lokantası': 'restaurant',
  Kebapçı: 'restaurant',
  Balıkçı: 'restaurant',
  'Uzak Doğu': 'restaurant',
  'Dünya mutfağı': 'restaurant',

  Dürümcü: 'street',
  Dönerci: 'street',
  Kokoreççi: 'street',
  Ciğerci: 'street',
  Köfteci: 'street',
  'Çiğ köfteci': 'street',
  Pideci: 'street',
  Pizzacı: 'street',
  Burgerci: 'street',
  'Büfe & fast food': 'street',

  Kahvaltıcı: 'breakfast',

  Kafe: 'cafe',
  Tatlıcı: 'cafe',
  'Pastane & fırın': 'cafe',
  Dondurmacı: 'cafe',

  Meyhane: 'nightlife',
  Bar: 'nightlife',
};

export const SEGMENT_ICONS: Record<Segment, SFSymbol> = {
  restaurant: 'fork.knife',
  street: 'flame',
  breakfast: 'sun.horizon',
  cafe: 'cup.and.saucer',
  nightlife: 'wineglass',
};

/** Bilinmeyen kategori (eski istemci / yeni eklenen) restoran sayılır; sunucu da aynısını yapar */
export const segmentOf = (cuisine: string | undefined): Segment =>
  SEGMENT_OF[cuisine as Cuisine] ?? 'restaurant';
