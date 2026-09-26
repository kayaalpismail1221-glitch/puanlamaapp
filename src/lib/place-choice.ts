import type { Place } from '@/types';

/**
 * Mekân ekleme ekranından geri dönüş: seçicinin "Mekân ekle" düğmesi bir istek açar, mekân ekleme ekranı
 * yeni eklenen ya da "Bunlardan biri mi?" ile seçilen mevcut mekânı bu isteğe teslim eder. Böylece
 * kullanıcı ekledikten sonra listede aynı mekânı tekrar aramaz. Aynı anda açık başka ekranlar (ör. Ara
 * sekmesi) yanlışlıkla tepki vermesin diye her istek kendi kimliğiyle eşleşir.
 */
const waiting = new Map<string, (place: Place) => void>();

export function requestPlaceChoice(onChosen: (place: Place) => void): string {
  const id = Math.random().toString(36).slice(2, 10);
  waiting.set(id, onChosen);
  return id;
}

export function deliverPlaceChoice(requestId: string | undefined, place: Place) {
  if (!requestId) return;
  const onChosen = waiting.get(requestId);
  waiting.delete(requestId);
  onChosen?.(place);
}
