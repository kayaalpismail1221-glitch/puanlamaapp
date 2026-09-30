import Constants from 'expo-constants';
import { useEffect, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, type MapMarkerProps, type MapViewProps } from 'react-native-maps';

import { SymbolView } from '@/components/symbol';
import { Text } from '@/components/ui';
import { mapStyleDark, mapStyleLight } from '@/constants/map-style';
import { colors, spacing } from '@/constants/theme';
import { useScheme } from '@/hooks/use-palette';

const android = Platform.OS === 'android';

/**
 * Android'de Google Maps SDK anahtarsız çizilirse uygulama çöker (gri kalmaz). Anahtar build'e girmediyse
 * (EAS'ta `GOOGLE_MAPS_ANDROID_API_KEY`, bkz. app.config.ts) harita yerine sade bir yüzey gösterilir.
 */
export const mapsAvailable = !android || !!Constants.expoConfig?.android?.config?.googleMaps?.apiKey;

/**
 * Uygulamadaki tüm haritalar. iOS'ta Apple Haritalar olduğu gibi. Android'de (Google Maps) sade stil
 * (`constants/map-style`, görünüme göre açık/koyu), Google'ın alt araç çubuğu ve konum düğmesi kapalı
 * (kendi düğmelerimiz var), pine dokununca harita kendiliğinden kaymaz (kartı biz açarız).
 */
export function AppMapView({
  ref,
  decorative,
  ...props
}: MapViewProps & {
  ref?: Ref<MapView>;
  /** Süs amaçlı harita (karşılama): harita yoksa yalnızca zemin, uyarı yazısı yok */
  decorative?: boolean;
}) {
  const scheme = useScheme();
  if (!android) return <MapView ref={ref} {...props} />;
  if (!mapsAvailable) return <MapUnavailable style={props.style} decorative={decorative} />;
  return (
    <MapView
      ref={ref}
      customMapStyle={scheme === 'dark' ? mapStyleDark : mapStyleLight}
      toolbarEnabled={false}
      showsMyLocationButton={false}
      moveOnMarkerPress={false}
      showsIndoors={false}
      {...props}
    />
  );
}

/**
 * Özel görünümlü pin. Android'de Google Maps pini bir kez bit eşleme olarak çizer: sürekli izleme
 * (`tracksViewChanges`) yüzlerce pinde haritayı kasar. Görünüm yalnızca `redraw` değişince kısa bir süre
 * yeniden çizilir (seçili pin büyür, puan değişir). iOS'ta varsayılan davranış.
 */
export function PinMarker({ redraw, ...props }: MapMarkerProps & { redraw?: string | number | boolean }) {
  // Hangi görünümün çizimi tamamlandı; `redraw` farklıysa pin yeniden çiziliyor demektir
  const [drawn, setDrawn] = useState<unknown>(NOT_DRAWN);
  useEffect(() => {
    if (!android) return;
    const timer = setTimeout(() => setDrawn(redraw), 500);
    return () => clearTimeout(timer);
  }, [redraw]);
  return <Marker tracksViewChanges={android ? drawn !== redraw : undefined} {...props} />;
}

const NOT_DRAWN = Symbol('not-drawn');

function MapUnavailable({ style, decorative }: { style: MapViewProps['style']; decorative?: boolean }) {
  const { t } = useTranslation();
  if (decorative) return <View style={[style, styles.unavailable]} pointerEvents="none" />;
  return (
    <View style={[style, styles.unavailable]} pointerEvents="none">
      <SymbolView name="map" tintColor={colors.textTertiary} size={28} />
      <Text variant="footnote" color={colors.textTertiary} align="center">
        {t('map.unavailable')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
});

export { Marker };
