import i18n from '@/i18n';
import type { FeedArea } from '@/types';

/** Feed başlığında gösterilecek bölge adı */
export function areaLabel(area: FeedArea): string {
  if (area.type === 'near') return i18n.t('feed.near');
  return area.district ? `${area.district}, ${area.city}` : area.city;
}
