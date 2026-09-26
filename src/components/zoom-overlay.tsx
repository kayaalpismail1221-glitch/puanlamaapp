import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { PlaceImage } from '@/components/ui';

/**
 * Instagram tarzı iki parmakla yakınlaştırma için ekranın en üstündeki katman.
 * Fotoğraf sıkıştırılınca aynı görsel, ölçülen yerine bu katmanda çizilir: başlık, alt bar ve diğer kartların
 * üstünde büyür, arka plan kararır. Dokunuşlar asıl fotoğrafta kalır (katman dokunuş almaz); hareketi
 * paylaşılan değerler taşır, fotoğraf bırakılınca yerine yaylanıp katman kapanır (bkz. photo-carousel).
 */

export type ZoomTarget = {
  uri: string;
  placeholder?: string;
  /** Fotoğrafın ekrandaki yeri (sayfa koordinatları) */
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
};

type ZoomValues = {
  scale: SharedValue<number>;
  /** Parmakların başlangıçtan beri kaydığı miktar */
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  /** Büyütmenin merkezi: sıkıştırmanın başladığı nokta, fotoğrafın ortasına göre */
  originX: SharedValue<number>;
  originY: SharedValue<number>;
};

type ZoomApi = ZoomValues & { show: (target: ZoomTarget) => void; hide: () => void };

const ZoomContext = createContext<ZoomApi | null>(null);

export function useZoomOverlay() {
  return useContext(ZoomContext);
}

/** Kök düzende gezinmenin üstüne konur; katman en sonda çizildiği için her şeyin üstündedir */
export function ZoomOverlayProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ZoomTarget | null>(null);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  const api = useMemo<ZoomApi>(
    () => ({ scale, translateX, translateY, originX, originY, show: setTarget, hide: () => setTarget(null) }),
    [scale, translateX, translateY, originX, originY],
  );

  return (
    <ZoomContext.Provider value={api}>
      {children}
      {target && <ZoomLayer target={target} values={api} />}
    </ZoomContext.Provider>
  );
}

function ZoomLayer({ target, values }: { target: ZoomTarget; values: ZoomValues }) {
  const { scale, translateX, translateY, originX, originY } = values;

  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(scale.get(), [1, 2.2], [0, 0.75], 'clamp'),
  }));

  // Büyütme sıkıştırma noktası etrafında: merkeze taşı, büyüt, geri taşı; üstüne parmak kayması
  const image = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.get() + originX.get() },
      { translateY: translateY.get() + originY.get() },
      { scale: scale.get() },
      { translateX: -originX.get() },
      { translateY: -originY.get() },
    ],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      <Animated.View
        style={[
          styles.image,
          { left: target.x, top: target.y, width: target.width, height: target.height, borderRadius: target.radius },
          image,
        ]}>
        <PlaceImage uri={target.uri} placeholder={target.placeholder} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
  image: {
    position: 'absolute',
    overflow: 'hidden',
  },
});
