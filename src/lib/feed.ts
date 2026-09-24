import type { FeedArea } from '@/types';

/** Feed başlığında gösterilecek bölge adı */
export function areaLabel(area: FeedArea): string {
  if (area.type === 'near') return 'Yakınımda';
  return area.district ? `${area.district}, ${area.city}` : area.city;
}
