import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';

/** Bu kadar aşağı çekilince (ya da hızlıca fırlatılınca) kapanır */
const DISMISS_DISTANCE = 120;

/**
 * Profil fotoğrafı büyük hâliyle: bulanık zeminde ortalanmış yuvarlak fotoğraf.
 * Herhangi bir yere dokununca ya da aşağı kaydırınca kapanır.
 */
export default function ProfilePhotoScreen() {
  const { uri, name } = useLocalSearchParams<{ uri: string; name?: string }>();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const size = Math.min(width - spacing.xxl * 2, 360);
  const offset = useSharedValue(0);

  const close = () => router.back();

  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onUpdate((e) => {
      offset.value = e.translationY;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > DISMISS_DISTANCE || Math.abs(e.velocityY) > 900) {
        runOnJS(close)();
      } else {
        offset.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: offset.value },
      { scale: interpolate(Math.abs(offset.value), [0, 300], [1, 0.85], 'clamp') },
    ],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(offset.value), [0, 300], [1, 0.3], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.container}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <BlurView intensity={60} tint="systemThickMaterial" style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Pressable
          style={styles.center}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}>
          <Animated.View entering={ZoomIn.springify().damping(16).stiffness(180)} style={[styles.photoWrap, photoStyle]}>
            <Image
              source={{ uri }}
              style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface }}
              contentFit="cover"
              transition={150}
              accessibilityLabel={name ? t('profile.photoOf', { name }) : undefined}
            />
            {name ? (
              <Text variant="headline" color={colors.primary} align="center">
                {name}
              </Text>
            ) : null}
          </Animated.View>
        </Pressable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoWrap: {
    alignItems: 'center',
    gap: spacing.lg,
  },
});
