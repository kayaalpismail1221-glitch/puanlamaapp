/**
 * Dünya haritası projeksiyonu (Miller silindirik): kutuplarda Mercator kadar şişmez,
 * yine de tanıdık görünür. Harita şekli (scripts/generate-world-map.mjs) ve noktalar
 * aynı fonksiyonla hesaplanır; böylece noktalar tam yerine oturur.
 *
 * Koordinat sistemi: genişlik 1000 birim; kuzey 84°, güney 57° enlemde kırpılır (Antarktika yok).
 */

export const MAP_WIDTH = 1000;

const NORTH = 84;
const SOUTH = -57;
const K = MAP_WIDTH / (2 * Math.PI);

const rad = (deg: number) => (deg * Math.PI) / 180;
const miller = (lat: number) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * rad(lat)));

const TOP = K * miller(NORTH);

export const MAP_HEIGHT = TOP - K * miller(SOUTH);

export type Point = { x: number; y: number };

/** Enlem/boylamı harita birimine çevirir */
export function project(latitude: number, longitude: number): Point {
  const lat = Math.max(SOUTH, Math.min(NORTH, latitude));
  return {
    x: ((longitude + 180) / 360) * MAP_WIDTH,
    y: TOP - K * miller(lat),
  };
}

/** Haritanın görünen dikdörtgeni (harita birimi) */
export type ViewBox = { x: number; y: number; width: number; height: number };

export const WORLD_VIEW: ViewBox = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };

/**
 * Noktaları kenarlarda boşlukla gösteren, verilen en-boy oranında görünüm.
 * `minWidth`: çok yakınlaşmayı önler (ör. tek şehir varsa ülke ölçeğinde kalsın).
 */
export function fitView(points: Point[], aspect: number, minWidth = 40, padding = 0.35): ViewBox {
  if (!points.length) return clampView(centeredView(WORLD_VIEW, aspect), aspect);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let width = Math.max(minWidth, (maxX - minX) * (1 + padding * 2));
  let height = Math.max(width / aspect, (maxY - minY) * (1 + padding * 2));
  width = Math.max(width, height * aspect);
  height = width / aspect;
  return clampView({ x: (minX + maxX) / 2 - width / 2, y: (minY + maxY) / 2 - height / 2, width, height }, aspect);
}

/** Dünyanın tamamı, verilen en-boy oranına sığacak şekilde ortalanmış */
function centeredView(view: ViewBox, aspect: number): ViewBox {
  const width = Math.max(view.width, view.height * aspect);
  const height = width / aspect;
  return { x: view.x + (view.width - width) / 2, y: view.y + (view.height - height) / 2, width, height };
}

/** Görünümü dünya sınırları içinde tutar; dünyadan büyükse ortalar */
export function clampView(view: ViewBox, aspect: number): ViewBox {
  const max = centeredView(WORLD_VIEW, aspect);
  const width = Math.min(view.width, max.width);
  const height = width / aspect;
  const x = width >= MAP_WIDTH ? max.x : Math.max(0, Math.min(MAP_WIDTH - width, view.x));
  const y = height >= MAP_HEIGHT ? (MAP_HEIGHT - height) / 2 : Math.max(0, Math.min(MAP_HEIGHT - height, view.y));
  return { x, y, width, height };
}
