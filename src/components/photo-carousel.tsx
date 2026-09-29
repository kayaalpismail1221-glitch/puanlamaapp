import { useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SymbolView } from '@/components/symbol';

import { PlaceImage, Text } from '@/components/ui';
import { useZoomOverlay } from '@/components/zoom-overlay';
import { colors, fixed, radius, spacing } from '@/constants/theme';

/** Yakınlaştırma sınırı ve bırakınca yerine dönüş yayı */
const MAX_ZOOM = 4;
const RELEASE = { damping: 22, stiffness: 260, mass: 0.9 };

type Props = {
  photos: string[];
  /** Küçük boy kopyalar (aynı sırada): tam boy yüklenene kadar anında gösterilir */
  thumbs?: string[];
  /** Çift dokunuş: beğen */
  onDoubleTap?: () => void;
  /** Tek dokunuş */
  onPress?: () => void;
  aspectRatio?: number;
};

/**
 * Kaydırmalı fotoğraf galerisi; çift dokununca ortada kalp animasyonu. İki parmakla sıkıştırınca fotoğraf
 * Instagram'daki gibi her şeyin üstünde büyür ve parmakları izler, bırakınca yerine yaylanır (zoom-overlay).
 * Genişlik ekrandan bilinir (feed ve gönderi detayında yatay boşluk `spacing.lg`): ölçmeyi beklemeden
 * ilk karede doğru boyutta çizilir, kaydırırken zıplamaz.
 */
export function PhotoCarousel({ photos, thumbs, onDoubleTap, onPress, aspectRatio = 4 / 5 }: Props) {
  const width = useWindowDimensions().width - spacing.lg * 2;
  const [index, setIndex] = useState(0);
  const heart = useSharedValue(0);
  const zoom = useZoomOverlay();
  const frameRef = useAnimatedRef<Animated.View>();
  // Bu galeride yakınlaştırma sürüyor mu; başladığı yer ve ilk sıkıştırma noktası
  const zooming = useSharedValue(false);
  const start = useSharedValue({ x: 0, y: 0, focalX: 0, focalY: 0 });

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heart.get() > 0 ? 1 : 0,
    transform: [{ scale: heart.get() }],
  }));

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      heart.set(
        withSequence(withSpring(1.1, { duration: 250 }), withDelay(350, withTiming(0, { duration: 200 }))),
      );
      if (onDoubleTap) scheduleOnRN(onDoubleTap);
    });

  const singleTap = Gesture.Tap().onEnd(() => {
    if (onPress) scheduleOnRN(onPress);
  });

  const height = width / aspectRatio;
  const current = { uri: photos[index] ?? photos[0], placeholder: thumbs?.[index] };

  const pinch = Gesture.Pinch()
    .enabled(!!zoom)
    // Hareket geri çağrıları render'da değil, dokunuşta UI iş parçacığında çalışır; ref'i ölçmek güvenli
    // eslint-disable-next-line react-hooks/refs
    .onStart((e) => {
      const frame = measure(frameRef);
      if (!zoom || !frame) return;
      start.set({ x: frame.pageX, y: frame.pageY, focalX: e.focalX, focalY: e.focalY });
      zoom.originX.set(e.focalX - frame.width / 2);
      zoom.originY.set(e.focalY - frame.height / 2);
      zoom.scale.set(1);
      zoom.translateX.set(0);
      zoom.translateY.set(0);
      zooming.set(true);
      scheduleOnRN(zoom.show, {
        uri: current.uri!,
        placeholder: current.placeholder,
        x: frame.pageX,
        y: frame.pageY,
        width: frame.width,
        height: frame.height,
        radius: radius.card,
      });
    })
    .onUpdate((e) => {
      if (!zoom || !zooming.get()) return;
      zoom.scale.set(Math.min(Math.max(e.scale, 1), MAX_ZOOM));
      zoom.translateX.set(e.focalX - start.get().focalX);
      zoom.translateY.set(e.focalY - start.get().focalY);
    })
    // eslint-disable-next-line react-hooks/refs
    .onFinalize(() => {
      if (!zoom || !zooming.get()) return;
      // Bu sırada liste kaydıysa fotoğrafın yeni yerine döner
      const frame = measure(frameRef);
      const dx = frame ? frame.pageX - start.get().x : 0;
      const dy = frame ? frame.pageY - start.get().y : 0;
      zoom.scale.set(withSpring(1, RELEASE));
      zoom.translateX.set(withSpring(dx, RELEASE));
      zoom.translateY.set(
        withSpring(dy, RELEASE, () => {
          zooming.set(false);
          scheduleOnRN(zoom.hide);
        }),
      );
    });

  // Katman çizilene kadar asıl fotoğraf görünür kalır; büyüyünce gizlenir, yerine dönünce geri gelir
  const frameStyle = useAnimatedStyle(() => ({
    opacity: zoom && zooming.get() && (zoom.scale.get() > 1.01 || zoom.translateX.get() !== 0) ? 0 : 1,
  }));

  return (
    <GestureDetector gesture={Gesture.Race(pinch, Gesture.Exclusive(doubleTap, singleTap))}>
      <Animated.View ref={frameRef} style={[styles.container, { height }, frameStyle]}>
        <FlatList
          data={photos}
          keyExtractor={(uri, i) => `${i}-${uri}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialNumToRender={1}
          windowSize={3}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item, index: i }) => (
            <PlaceImage uri={item} placeholder={thumbs?.[i]} style={{ width, height }} />
          )}
        />

        <Animated.View pointerEvents="none" style={[styles.heart, heartStyle]}>
          <SymbolView name="heart.fill" tintColor={fixed.white} size={88} />
        </Animated.View>

        {photos.length > 1 && (
          <>
            <View style={styles.counter}>
              <Text variant="caption" color={fixed.white}>
                {index + 1}/{photos.length}
              </Text>
            </View>
            <View style={styles.dots} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          </>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  heart: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: fixed.navy,
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  counter: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.overlay,
  },
  dots: {
    position: 'absolute',
    bottom: spacing.md,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: fixed.white,
    opacity: 0.5,
  },
  dotActive: {
    opacity: 1,
  },
});
