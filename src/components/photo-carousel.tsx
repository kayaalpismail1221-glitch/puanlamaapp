import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SymbolView } from 'expo-symbols';

import { PlaceImage, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  photos: string[];
  /** Çift dokunuş: beğen */
  onDoubleTap?: () => void;
  /** Tek dokunuş */
  onPress?: () => void;
  aspectRatio?: number;
};

/** Kaydırmalı fotoğraf galerisi; çift dokununca ortada kalp animasyonu */
export function PhotoCarousel({ photos, onDoubleTap, onPress, aspectRatio = 4 / 5 }: Props) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const heart = useSharedValue(0);

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

  return (
    <GestureDetector gesture={Gesture.Exclusive(doubleTap, singleTap)}>
      <View style={styles.container} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <FlatList
            data={photos}
            keyExtractor={(uri, i) => `${i}-${uri}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <PlaceImage uri={item} style={{ width, height }} />}
          />
        )}

        <Animated.View pointerEvents="none" style={[styles.heart, heartStyle]}>
          <SymbolView name="heart.fill" tintColor={colors.onPrimary} size={88} />
        </Animated.View>

        {photos.length > 1 && (
          <>
            <View style={styles.counter}>
              <Text variant="caption" color={colors.onPrimary}>
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
      </View>
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
    shadowColor: colors.primary,
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
    backgroundColor: colors.onPrimary,
    opacity: 0.5,
  },
  dotActive: {
    opacity: 1,
  },
});
