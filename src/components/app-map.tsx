import { useIsFocused } from 'expo-router';
import { useEffect, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, type MapMarkerProps, type MapViewProps } from 'react-native-maps';
import Animated, { FadeOut } from 'react-native-reanimated';

import { palettes } from '@/constants/theme';
import { useScheme } from '@/hooks/use-palette';

/** Harita ekrana gelip çizmeye başladıktan sonra örtünün kalkması için beklenen süre; olay hiç gelmezse üst sınır */
const COVER_AFTER_READY_MS = 600;
const COVER_MAX_MS = 1800;

/**
 * Uygulamadaki tüm haritalar. iOS'ta Apple Haritalar (react-native-maps) olduğu gibi; Android'de MapLibre +
 * OpenFreeMap (`app-map.android.tsx`, aynı arayüz). Ekranlar haritayı yalnızca bu dosyanın dışa aktardıklarıyla çizer.
 *
 * Görünüm haritaya açıkça verilir: verilmezse harita pencereye eklenmeden önce cihazın görünümüyle çizmeye
 * başlıyor, uygulama koyudayken bir an beyaz parlayıp siyaha dönüyordu. Koyuda ilk açılışta ayrıca koyu bir örtü
 * harita çizilene dek durur ve yumuşakça kalkar.
 */
export function AppMapView({
  ref,
  decorative: _decorative,
  style,
  onMapReady,
  ...props
}: MapViewProps & {
  ref?: Ref<MapView>;
  /** Süs amaçlı harita (karşılama): Android'de atıf düğmesi gizlenir */
  decorative?: boolean;
}) {
  const scheme = useScheme();
  // Sekmeler açılışta arka planda kurulur: harita ekrana ilk geldiği an (odak) esas alınır, kuruluş anı değil
  const focused = useIsFocused();
  // Örtü yalnızca harita koyu görünümde açıldıysa (görünüm sonradan değişirse harita zaten çizili)
  const [covered, setCovered] = useState(scheme === 'dark');
  const [rendering, setRendering] = useState(false);
  // Ekrandan ayrılınca (ör. açılış örtüsü altında önceden çizilip dönülünce) harita çizilmiş sayılır: örtü bir
  // daha görünmez
  const [wasFocused, setWasFocused] = useState(focused);
  if (focused !== wasFocused) {
    setWasFocused(focused);
    if (!focused && covered) setCovered(false);
  }

  useEffect(() => {
    if (!covered || !focused) return;
    const timer = setTimeout(() => setCovered(false), rendering ? COVER_AFTER_READY_MS : COVER_MAX_MS);
    return () => clearTimeout(timer);
  }, [covered, focused, rendering]);

  return (
    <View style={style}>
      <MapView
        ref={ref}
        {...props}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={scheme}
        onMapReady={(e) => {
          setRendering(true);
          onMapReady?.(e);
        }}
      />
      {covered && <Animated.View exiting={FadeOut.duration(280)} pointerEvents="none" style={styles.cover} />}
    </View>
  );
}

/**
 * Özel görünümlü pin (görünüm `children`). `redraw`: görünüm değişince değişen değer (seçili pin büyür, puan
 * değişir); Android'de pin bit eşlem olarak çizildiği için yeniden çizimi tetikler. iOS'ta gerekmez.
 */
export function PinMarker({ redraw: _redraw, ...props }: MapMarkerProps & { redraw?: string | number | boolean }) {
  return <Marker {...props} />;
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    // Apple Haritalar'ın koyu zeminine en yakın nötr ton
    backgroundColor: palettes.dark.fill,
  },
});
