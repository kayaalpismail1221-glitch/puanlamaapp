import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { WorldMap } from '@/components/world-map';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useVisitedPlaces } from '@/hooks/use-visited-places';
import { isMe } from '@/lib/session';
import { cityDots, visitedSummary } from '@/lib/visited';
import { fitView } from '@/lib/world-projection';

/** Harita kutusunun en-boy oranı */
const ASPECT = 1.6;
/** Tek şehir varsa bile ülke ölçeğinde kalsın (harita birimi) */
const MIN_VIEW_WIDTH = 70;

/**
 * Profilde gönderilerin üstündeki lezzet haritası: kişinin gönderi paylaştığı ve puanladığı
 * şehirler çizim tarzı dünya haritasında nokta olarak. Harita noktalara göre kendiliğinden
 * yakınlaşır (herkes İstanbul'daysa Türkiye, dünyayı gezdiyse dünya).
 * Dokununca (iOS 18+'da yakınlaşarak) ayrıntılı haritaya açılır. Hiç yer yoksa gösterilmez.
 */
export function VisitedMap({ userId, name }: { userId: string; name: string }) {
  const { items } = useVisitedPlaces(userId);
  const [width, setWidth] = useState(0);
  const dots = useMemo(() => cityDots(items), [items]);
  const summary = useMemo(() => visitedSummary(items), [items]);
  const view = useMemo(() => fitView(dots.map((d) => d.point), ASPECT, MIN_VIEW_WIDTH), [dots]);
  const mine = isMe(userId);

  if (!items.length) return null;

  const share = () =>
    Share.share({
      message: mine
        ? `Puanla’da ${summary.cities} şehirde ${summary.places} mekân puanladım. Lezzet haritama göz at 🍽️`
        : `${name} Puanla’da ${summary.cities} şehirde ${summary.places} mekân puanladı 🍽️`,
    });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="title3" color={colors.primary}>
            {mine ? 'Lezzet haritam' : 'Lezzet haritası'}
          </Text>
          <Text variant="subhead" color={colors.textSecondary}>
            {summary.cities} şehir · {summary.places} mekân
          </Text>
        </View>
        <PressableScale onPress={share} hitSlop={hitSlop} accessibilityLabel="Lezzet haritasını paylaş">
          <SymbolView name="square.and.arrow.up" tintColor={colors.primary} size={20} />
        </PressableScale>
      </View>

      <Link href={{ pathname: '/gittigi-yerler/[id]', params: { id: userId } }} asChild>
        <Link.AppleZoom>
          <PressableScale
            scaleTo={0.98}
            style={styles.map}
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            accessibilityRole="button"
            accessibilityLabel="Lezzet haritasını büyüt">
            {width > 0 && <WorldMap view={view} width={width} height={width / ASPECT} dots={dots} />}
          </PressableScale>
        </Link.AppleZoom>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  map: {
    aspectRatio: ASPECT,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.mapWater,
  },
});
