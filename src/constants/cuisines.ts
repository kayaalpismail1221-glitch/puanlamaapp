
import type { AppSymbol } from '@/constants/icons';
import i18n from '@/i18n';
import type { Cuisine } from '@/types';

/** Mutfak kategorileri; veritabanındaki `cuisines` tablosuyla aynı sırada (değerler Türkçe, ekranda çevrilir) */
export const CUISINES: { name: Cuisine; icon: AppSymbol }[] = [
  { name: 'Kahvaltıcı', icon: 'sun.horizon' },
  { name: 'Esnaf lokantası', icon: 'fork.knife' },
  { name: 'Dürümcü', icon: 'flame' },
  { name: 'Kokoreççi', icon: 'flame' },
  { name: 'Ciğerci', icon: 'flame' },
  { name: 'Balıkçı', icon: 'fish' },
  { name: 'Meyhane', icon: 'wineglass' },
  { name: 'Kebapçı', icon: 'flame' },
  { name: 'Pideci', icon: 'oven' },
  { name: 'Kafe', icon: 'cup.and.saucer' },
  { name: 'Burgerci', icon: 'takeoutbag.and.cup.and.straw' },
  { name: 'Tatlıcı', icon: 'birthday.cake' },
  { name: 'Restoran', icon: 'fork.knife.circle' },
  { name: 'Dönerci', icon: 'flame' },
  { name: 'Köfteci', icon: 'flame' },
  { name: 'Çiğ köfteci', icon: 'leaf' },
  { name: 'Pizzacı', icon: 'oven' },
  { name: 'Uzak Doğu', icon: 'globe.asia.australia' },
  { name: 'Dünya mutfağı', icon: 'globe.europe.africa' },
  { name: 'Büfe & fast food', icon: 'takeoutbag.and.cup.and.straw' },
  { name: 'Pastane & fırın', icon: 'basket' },
  { name: 'Dondurmacı', icon: 'snowflake' },
  { name: 'Bar', icon: 'mug' },
];

/** Veritabanındaki kategori adını etkin dilde gösterir; bilinmeyen değer olduğu gibi kalır */
export const cuisineLabel = (name: string) =>
  CUISINES.some((c) => c.name === name) ? i18n.t(`cuisines.${name as Cuisine}`) : name;
