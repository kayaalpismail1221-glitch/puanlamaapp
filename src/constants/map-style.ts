import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import type { Scheme } from '@/constants/theme';

/**
 * Android haritası (MapLibre) için Puanla stili: OpenFreeMap'in ücretsiz OpenStreetMap vektör karoları
 * (OpenMapTiles şeması; anahtar, kota, kart yok). Positron'dan sadeleştirildi: mekân/POI katmanı hiç yok, yollar
 * yumuşak, su marka mavisine yakın; puan pinleri haritada tek renkli öğe olarak öne çıksın. Yer adları yerel
 * (`name:tr`, yoksa `name`). iOS'ta Apple Haritalar kendi görünümünde kalır, bu stil kullanılmaz.
 * Atıf (OpenFreeMap, OpenMapTiles, OpenStreetMap) karo kaynağından gelir; haritadaki ⓘ düğmesi kaldırılmaz.
 * Karo kaynağı değişirse (ör. kendi sunucumuz, MapTiler) yalnızca `TILES` ve `GLYPHS` değişir.
 */
const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

type MapColors = {
  background: string;
  residential: string;
  park: string;
  water: string;
  building: string;
  buildingOutline: string;
  road: string;
  roadMinor: string;
  roadCasing: string;
  motorway: string;
  rail: string;
  boundary: string;
  text: string;
  textStrong: string;
  textWater: string;
  halo: string;
};

const light: MapColors = {
  background: '#F5F6F8',
  residential: '#EEF0F3',
  park: '#E3EFE2',
  water: '#CFDDED',
  building: '#ECEEF1',
  buildingOutline: '#E1E4E9',
  road: '#FFFFFF',
  roadMinor: '#FFFFFF',
  roadCasing: '#DEE3EA',
  motorway: '#E5E7EB',
  rail: '#E1E4E9',
  boundary: '#C9D2DE',
  text: '#6B7280',
  textStrong: '#0F1E3D',
  textWater: '#7A8CA5',
  halo: '#FFFFFF',
};

const dark: MapColors = {
  background: '#16181C',
  residential: '#1A1C21',
  park: '#18241C',
  water: '#18212E',
  building: '#1E2025',
  buildingOutline: '#24272D',
  road: '#2A2D33',
  roadMinor: '#24272C',
  roadCasing: '#1C1E23',
  motorway: '#34383F',
  rail: '#26292E',
  boundary: '#3A3E46',
  text: '#8E8E96',
  textStrong: '#E5E7EB',
  textWater: '#46505F',
  halo: '#0B0B0D',
};

const name = ['coalesce', ['get', 'name:tr'], ['get', 'name']];
const lines = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const polygons = ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false];
const major = ['match', ['get', 'class'], ['primary', 'secondary', 'tertiary', 'trunk'], true, false];
const minor = ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false];

function build(c: MapColors): StyleSpecification {
  return {
    version: 8,
    sources: { openmaptiles: { type: 'vector', url: TILES } },
    glyphs: GLYPHS,
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': c.background } },
      {
        id: 'residential',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['all', polygons, ['==', ['get', 'class'], 'residential']],
        paint: { 'fill-color': c.residential },
      },
      {
        id: 'wood',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        minzoom: 10,
        filter: ['all', polygons, ['match', ['get', 'class'], ['wood', 'grass'], true, false]],
        paint: { 'fill-color': c.park, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 0.8] },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        filter: polygons,
        paint: { 'fill-color': c.park },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        filter: ['all', polygons, ['!=', ['get', 'brunnel'], 'tunnel']],
        paint: { 'fill-color': c.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        filter: lines,
        paint: { 'line-color': c.water },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-color': c.building,
          'fill-outline-color': c.buildingOutline,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1],
        },
      },
      {
        id: 'path',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 14,
        filter: ['all', lines, ['==', ['get', 'class'], 'path']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.roadMinor,
          'line-opacity': 0.8,
          'line-width': ['interpolate', ['exponential', 1.2], ['zoom'], 14, 0.8, 20, 6],
        },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['all', lines, minor],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.roadMinor,
          'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 12, 0.6, 13, 1.6, 20, 20],
        },
      },
      {
        id: 'road-major-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['all', lines, major],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.roadCasing,
          'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 10, 3, 20, 23],
        },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 11,
        filter: ['all', lines, major],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road,
          'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 10, 2, 20, 20],
        },
      },
      {
        id: 'road-major-far',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        maxzoom: 11,
        filter: ['all', lines, major],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.motorway, 'line-width': 1.5 },
      },
      {
        id: 'motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 5,
        filter: ['all', lines, ['==', ['get', 'class'], 'motorway']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.motorway,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 5, 1, 10, 2.5, 20, 30],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['all', lines, ['==', ['get', 'class'], 'rail'], ['!', ['has', 'service']]],
        paint: { 'line-color': c.rail, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 20, 4] },
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': c.boundary, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 12, 2.5] },
      },
      // Yerleşim (nokta/çizgi) veriye bağlanamaz: su adları geometriye göre iki katman
      ...(['point', 'line'] as const).map((placement) => ({
        id: `water-name-${placement}`,
        type: 'symbol' as const,
        source: 'openmaptiles',
        'source-layer': 'water_name',
        filter: placement === 'line' ? lines : ['!', lines],
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Italic'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 14],
          'text-letter-spacing': 0.1,
          'text-max-width': 6,
          'symbol-placement': placement,
        },
        paint: { 'text-color': c.textWater, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
      })),
      {
        id: 'road-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 13,
        filter: ['any', ['all', major, ['>=', ['zoom'], 13]], ['all', minor, ['>=', ['zoom'], 15.5]]],
        layout: {
          'symbol-placement': 'line',
          'text-field': name,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10.5, 17, 13],
          'text-rotation-alignment': 'map',
        },
        paint: { 'text-color': c.text, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
      },
      {
        // Semt ve mahalle adları: yemek haritasında kentin yön bulma noktaları
        id: 'place-neighbourhood',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 11,
        filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false],
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 13],
          'text-letter-spacing': 0.05,
          'text-max-width': 8,
        },
        paint: { 'text-color': c.text, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-town',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 8,
        filter: ['match', ['get', 'class'], ['town', 'village'], true, false],
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 13, 14],
          'text-max-width': 8,
        },
        paint: { 'text-color': c.textStrong, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-city',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 4,
        maxzoom: 12,
        filter: ['==', ['get', 'class'], 'city'],
        layout: {
          'text-field': name,
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 10, 17],
          'text-max-width': 8,
        },
        paint: { 'text-color': c.textStrong, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
      },
    ],
  } as StyleSpecification;
}

const styles = { light: build(light), dark: build(dark) };

export const mapLibreStyle = (scheme: Scheme) => styles[scheme];
