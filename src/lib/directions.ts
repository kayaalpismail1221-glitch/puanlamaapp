import { Linking, Platform } from 'react-native';

import i18n, { currentLanguage, currentLocale } from '@/i18n';
import type { Coords } from '@/lib/geo';
import Native from '../../modules/puanla-directions';

/**
 * Uygulama içi yol tarifi: rota, süre ve adımlar Apple'ın rota servisinden (yerel modül
 * modules/puanla-directions). Navigasyon sırasında adım ilerletme ve rotadan çıkma hesabı burada.
 */

export type TravelMode = 'walking' | 'driving' | 'transit';

export type RouteStep = { instruction: string; distance: number; end: Coords };

export type Route = {
  /** Metre */
  distance: number;
  /** Saniye */
  duration: number;
  coordinates: Coords[];
  steps: RouteStep[];
};

/** Yerel modül derlenmiş mi (Expo Go'da ve web'de yok) */
export const inAppDirections = !!Native;

export async function fetchRoute(from: Coords, to: Coords, mode: 'walking' | 'driving'): Promise<Route> {
  if (!Native) throw new Error('directions-unavailable');
  const route = await Native.route(point(from), point(to), mode);
  return {
    distance: route.distance,
    duration: route.duration,
    coordinates: route.coordinates.map(([latitude, longitude]) => ({ latitude, longitude })),
    steps: route.steps.map((s) => ({
      instruction: s.instruction,
      distance: s.distance,
      end: { latitude: s.latitude, longitude: s.longitude },
    })),
  };
}

/** Toplu taşıma süresi (MapKit toplu taşımada rota çizgisi vermez); bulunamazsa null */
export async function fetchEta(from: Coords, to: Coords, mode: TravelMode): Promise<number | null> {
  if (!Native) return null;
  try {
    return await Native.eta(point(from), point(to), mode);
  } catch {
    return null;
  }
}

const point = (c: Coords) => ({ latitude: c.latitude, longitude: c.longitude });

/**
 * Yedek: platformun harita uygulamasında yol tarifi (toplu taşıma adımları ya da yerel modül yoksa).
 * iOS: Apple Haritalar. Android: Google Haritalar (yüklüyse uygulamada, değilse tarayıcıda açılır; Android'de
 * uygulama içi rota yok, adım adım navigasyon Google Haritalar'da).
 */
export function openInMaps(to: Coords, name: string, mode: TravelMode) {
  const url =
    Platform.OS === 'android'
      ? `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=${mode === 'transit' ? 'transit' : mode}`
      : `http://maps.apple.com/?daddr=${to.latitude},${to.longitude}&dirflg=${mode === 'walking' ? 'w' : mode === 'transit' ? 'r' : 'd'}&q=${encodeURIComponent(name)}`;
  return Linking.openURL(url).catch(() => {});
}

/** Harita uygulaması düğmesinin metni: "Apple Haritalar'da aç" / "Google Haritalar'da aç" */
export const openInMapsLabel = () =>
  i18n.t(Platform.OS === 'android' ? 'directions.openInMapsAndroid' : 'directions.openInMaps');

/* ---------- Biçimlendirme ---------- */

/** "12 dk" / "1 sa 5 dk" */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return i18n.t('directions.minutes', { count: minutes });
  return i18n.t('directions.hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

/** Navigasyon için ince mesafe: "80 m", "350 m", "1,2 km" */
export function formatMeters(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = (meters / 1000).toFixed(1);
  return `${currentLanguage() === 'tr' ? km.replace('.', ',') : km} km`;
}

/** Varış saati: "21:05" */
export const arrivalTime = (seconds: number) =>
  new Date(Date.now() + seconds * 1000).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });

/* ---------- Navigasyon ---------- */

/** İki nokta arası metre (kısa mesafede yeterince doğru eşdikdörtgen yaklaşımı) */
export function meters(a: Coords, b: Coords): number {
  const rad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * rad * Math.cos(((a.latitude + b.latitude) / 2) * rad);
  const y = (b.latitude - a.latitude) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

/** Adımın bitişine bu kadar yaklaşınca sonraki talimata geçilir */
export const STEP_REACHED_M = 25;
/** Rota çizgisine bu kadardan uzaksa rota yeniden hesaplanır */
export const OFF_ROUTE_M = 60;
/** Mekâna bu kadar yaklaşınca varılmış sayılır */
export const ARRIVED_M = 30;

/**
 * Konuma göre güncel adım: geçilen adımları atlar (kullanıcı bir adımı kaçırsa da ilerler).
 * Dönen indeks `steps.length` ise son adım da geçildi.
 */
export function currentStep(steps: RouteStep[], position: Coords, from: number): number {
  let index = from;
  while (index < steps.length && meters(position, steps[index]!.end) < STEP_REACHED_M) index += 1;
  return index;
}

/** Konumun rota çizgisine en kısa uzaklığı (köşe noktalarına göre; MapKit çizgisi sık noktalı) */
export function distanceToRoute(position: Coords, coordinates: Coords[]): number {
  let best = Infinity;
  for (const c of coordinates) best = Math.min(best, meters(position, c));
  return best;
}

/** Kalan mesafe: güncel adımın bitişine uzaklık + sonraki adımlar */
export function remainingMeters(steps: RouteStep[], position: Coords, index: number): number {
  if (index >= steps.length) return 0;
  return meters(position, steps[index]!.end) + steps.slice(index + 1).reduce((sum, s) => sum + s.distance, 0);
}
