/**
 * Web için react-native-maps yer tutucusu (yalnızca tarayıcıda geliştirme/deneme).
 * iOS'ta gerçek Apple Haritalar kullanılır; bu dosya iOS paketine girmez (bkz. metro.config.js).
 */
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type MapProps = { style?: StyleProp<ViewStyle>; children?: ReactNode };

const MapView = forwardRef(function MapView({ style }: MapProps, ref) {
  const { t } = useTranslation();
  useImperativeHandle(ref, () => ({ animateToRegion: () => {}, fitToCoordinates: () => {}, animateCamera: () => {} }));
  return (
    <View style={[styles.map, style]}>
      <Text style={styles.text}>{t('map.mapPlaceholder')}</Text>
    </View>
  );
});

export function Marker(_: { children?: ReactNode }) {
  return null;
}

export function Polyline(_: object) {
  return null;
}

export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };

const styles = StyleSheet.create({
  map: { backgroundColor: '#E8ECF2', alignItems: 'center', justifyContent: 'center' },
  text: { color: '#6B7280', fontSize: 12 },
});

export default MapView;
