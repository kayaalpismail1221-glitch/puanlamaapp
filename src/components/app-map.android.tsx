import {
  Camera,
  Map,
  UserLocation,
  ViewAnnotation,
  type Anchor,
  type CameraRef,
  type InitialViewState,
  type ViewAnnotationRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import {
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from 'react';
import { View } from 'react-native';
import type MapView from 'react-native-maps';
import type { Camera as MapsCamera, LatLng, MapMarkerProps, MapViewProps, Region } from 'react-native-maps';

import { mapLibreStyle } from '@/constants/map-style';
import { useScheme } from '@/hooks/use-palette';

/**
 * Android haritası: MapLibre + OpenFreeMap (ücretsiz OpenStreetMap karoları, anahtar yok; stil
 * `constants/map-style`). Ekranlar iOS'taki react-native-maps arayüzüyle yazılır (`app-map.tsx`); burada
 * kullandıkları kısım MapLibre'ye çevrilir: `initialRegion`/`initialCamera`, `onRegionChangeComplete`, `onPress`,
 * dokunma kilitleri, `showsUserLocation`, ref'te `animateToRegion`/`fitToCoordinates`/`animateCamera`/`setCamera`.
 * Yakınlaştırma: MapLibre 512 px'lik karo kullanır, Google/Apple yakınlığının bir eksiği.
 * Haritada çocuk olarak yalnızca `PinMarker` çizilir (çoklu çizgi vb. Android'de yok: uygulama içi rota iOS'ta).
 */

type Props = MapViewProps & {
  ref?: Ref<MapView>;
  /** Süs amaçlı harita (karşılama): atıf düğmesi gizlenir (harita zaten degrade altında) */
  decorative?: boolean;
};

/** Pine dokunulunca hemen ardından gelen harita dokunuşu yok sayılır (iOS'taki `stopPropagation` karşılığı) */
const MarkerPressContext = createContext<{ current: number }>({ current: 0 });

const regionBounds = (r: Region): [number, number, number, number] => [
  r.longitude - r.longitudeDelta / 2,
  r.latitude - r.latitudeDelta / 2,
  r.longitude + r.longitudeDelta / 2,
  r.latitude + r.latitudeDelta / 2,
];

function initialView(props: Props): InitialViewState | undefined {
  if (props.initialRegion) return { bounds: regionBounds(props.initialRegion) };
  const camera = props.initialCamera;
  if (camera?.center) {
    return {
      center: [camera.center.longitude, camera.center.latitude],
      zoom: camera.zoom !== undefined ? camera.zoom - 1 : 12,
      bearing: camera.heading,
      pitch: camera.pitch,
    };
  }
  return undefined;
}

export function AppMapView({
  ref,
  decorative,
  children,
  style,
  initialRegion,
  initialCamera,
  onRegionChangeComplete,
  onPress,
  scrollEnabled = true,
  zoomEnabled = true,
  rotateEnabled = true,
  pitchEnabled = true,
  showsUserLocation,
}: Props) {
  const scheme = useScheme();
  const camera = useRef<CameraRef>(null);
  const markerPressedAtRef = useRef(0);
  // İlk görünüm yalnızca açılışta (sonraki çizimlerde değişse de kamera oynamasın)
  const [initial] = useState(() => initialView({ initialRegion, initialCamera }));

  useImperativeHandle(
    ref,
    () =>
      ({
        animateToRegion: (region: Region, duration = 500) =>
          camera.current?.fitBounds(regionBounds(region), { duration, easing: 'ease' }),
        fitToCoordinates: (
          coordinates: LatLng[],
          options?: { edgePadding?: { top: number; right: number; bottom: number; left: number }; animated?: boolean },
        ) => {
          if (!coordinates.length) return;
          const lngs = coordinates.map((c) => c.longitude);
          const lats = coordinates.map((c) => c.latitude);
          camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
            padding: options?.edgePadding,
            duration: options?.animated === false ? 0 : 500,
          });
        },
        animateCamera: (target: Partial<MapsCamera>, options?: { duration?: number }) =>
          target.center &&
          camera.current?.easeTo({
            center: [target.center.longitude, target.center.latitude],
            ...(target.zoom !== undefined && { zoom: target.zoom - 1 }),
            ...(target.heading !== undefined && { bearing: target.heading }),
            ...(target.pitch !== undefined && { pitch: target.pitch }),
            duration: options?.duration ?? 500,
          }),
        // Animasyonsuz: karede bir çağrılarak elle canlandırılan kamera için (karşılama haritası)
        setCamera: (target: Partial<MapsCamera>) =>
          target.center &&
          camera.current?.jumpTo({
            center: [target.center.longitude, target.center.latitude],
            ...(target.zoom !== undefined && { zoom: target.zoom - 1 }),
            ...(target.heading !== undefined && { bearing: target.heading }),
            ...(target.pitch !== undefined && { pitch: target.pitch }),
          }),
      }) as unknown as MapView,
  );

  const regionChanged = onRegionChangeComplete
    ? ({ nativeEvent: e }: { nativeEvent: ViewStateChangeEvent }) => {
        const [west, south, east, north] = e.bounds;
        onRegionChangeComplete(
          {
            latitude: e.center[1],
            longitude: e.center[0],
            latitudeDelta: north - south,
            longitudeDelta: east - west,
          },
          { isGesture: e.userInteraction },
        );
      }
    : undefined;

  return (
    <MarkerPressContext.Provider value={markerPressedAtRef}>
      <Map
        style={style}
        mapStyle={mapLibreStyle(scheme)}
        dragPan={scrollEnabled}
        touchZoom={zoomEnabled}
        doubleTapZoom={zoomEnabled}
        doubleTapHoldZoom={zoomEnabled}
        touchRotate={rotateEnabled}
        touchPitch={pitchEnabled}
        logo={false}
        compass={false}
        scaleBar={false}
        attribution={!decorative}
        attributionPosition={{ bottom: 8, left: 8 }}
        onRegionDidChange={regionChanged}
        onPress={
          onPress &&
          (({ nativeEvent: e }) => {
            if (Date.now() - markerPressedAtRef.current < 400) return;
            onPress(pressEvent(e.lngLat, e.point));
          })
        }>
        <Camera ref={camera} initialViewState={initial} />
        {showsUserLocation && <UserLocation animated accuracy />}
        {children}
      </Map>
    </MarkerPressContext.Provider>
  );
}

/** react-native-maps'in dokunma olayı biçimi (ekranlar `e.stopPropagation()` çağırır) */
function pressEvent([longitude, latitude]: [number, number], [x, y]: [number, number]) {
  return {
    nativeEvent: { coordinate: { latitude, longitude }, position: { x, y } },
    stopPropagation: () => {},
  } as unknown as Parameters<NonNullable<MapViewProps['onPress']>>[0];
}

/** react-native-maps'in `anchor` kesirini (0–1) MapLibre'nin dokuz konumundan en yakınına çevirir */
function toAnchor(anchor: MapMarkerProps['anchor']): Anchor {
  // Google Maps'teki varsayılan: pinin alt ortası koordinatta
  const { x, y } = anchor ?? { x: 0.5, y: 1 };
  const col = x < 0.33 ? 'left' : x > 0.67 ? 'right' : '';
  const row = y < 0.33 ? 'top' : y > 0.67 ? 'bottom' : '';
  return ((row && col ? `${row}-${col}` : row || col) || 'center') as Anchor;
}

/**
 * Özel görünümlü pin (görünüm `children`). Android'de görünüm bir kez bit eşleme çizilip haritanın içinde çizilir
 * (`ViewAnnotation`): harita kayarken pin aynı karede gider. (`Marker` haritanın üstünde ayrı görünüm, kaydırırken
 * geride kalıyordu.) Görünüm değişince (`redraw`: seçili pin büyür, puan değişir) bit eşlem yeniden çizilir.
 * Dokunma olayı react-native-maps biçiminde.
 */
export function PinMarker({
  coordinate,
  anchor,
  onPress,
  children,
  redraw,
}: MapMarkerProps & { redraw?: string | number | boolean }) {
  const markerPressedAtRef = useContext(MarkerPressContext);
  const annotationRef = useRef<ViewAnnotationRef>(null);
  const content = useMemo(
    () => (isValidElement(children) ? (children as ReactElement) : <View>{children}</View>),
    [children],
  );
  // Yeni görünüm bir sonraki karede yerleşir; bit eşlem ondan sonra alınır
  useEffect(() => {
    const frame = requestAnimationFrame(() => annotationRef.current?.refresh());
    return () => cancelAnimationFrame(frame);
  }, [redraw]);
  return (
    <ViewAnnotation
      ref={annotationRef}
      lngLat={[coordinate.longitude, coordinate.latitude]}
      anchor={toAnchor(anchor)}
      onPress={
        onPress &&
        (({ nativeEvent: e }) => {
          markerPressedAtRef.current = Date.now();
          onPress(pressEvent(e.lngLat, e.point) as unknown as Parameters<NonNullable<MapMarkerProps['onPress']>>[0]);
        })
      }>
      {content}
    </ViewAnnotation>
  );
}
