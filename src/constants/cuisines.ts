import type { SFSymbol } from 'expo-symbols';

import type { Cuisine } from '@/types';

/** Mutfak kategorileri; veritabanındaki `cuisines` tablosuyla aynı sırada */
export const CUISINES: { name: Cuisine; icon: SFSymbol }[] = [
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
];
