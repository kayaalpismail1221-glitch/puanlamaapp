import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, PlaceImage, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { PLACES } from '@/data/mock';

/** 1. Karşılama ekranı */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const collage = PLACES.filter((p) => p.photoUrl).slice(0, 6);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.collage}>
        {collage.map((p, i) => (
          <Animated.View
            key={p.id}
            entering={FadeInDown.delay(80 * i).springify()}
            style={[styles.tile, i % 2 === 1 && { marginTop: spacing.xxl }]}>
            <PlaceImage uri={p.photoUrl} style={StyleSheet.absoluteFill} />
          </Animated.View>
        ))}
      </View>

      <Animated.View
        entering={FadeInDown.delay(500).springify()}
        style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Text variant="largeTitle" color={colors.primary}>
          Nerede yesek?
        </Text>
        <Text variant="body" color={colors.textSecondary}>
          Gittiğin mekânları puanla, kendi sıralamanı oluştur ve arkadaşlarının gerçekten nerede
          yediğini gör.
        </Text>
        <Button
          title="Başlayalım"
          onPress={() => router.push('/onboarding/giris')}
          style={{ marginTop: spacing.lg }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  collage: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  tile: {
    width: '31%',
    aspectRatio: 0.75,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  bottom: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
});
