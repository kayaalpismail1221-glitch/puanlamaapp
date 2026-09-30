import { Link, router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Text } from '@/components/ui';
import { WorldMap } from '@/components/world-map';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useVisitedPlaces } from '@/hooks/use-visited-places';
import { isMe } from '@/lib/session';
import { cityDots, visitedSummary } from '@/lib/visited';
import { fitView, MIN_MAP_VIEW_WIDTH } from '@/lib/world-projection';

/** Harita kutusunun en-boy oranı */
const ASPECT = 1.6;

/**
 * Profilde gönderilerin üstündeki lezzet haritası: kişinin gönderi paylaştığı ve puanladığı
 * şehirler çizim tarzı dünya haritasında nokta olarak. Harita noktalara göre kendiliğinden
 * yakınlaşır (herkes İstanbul'daysa Türkiye, dünyayı gezdiyse dünya).
 * Dokununca (iOS 18+'da yakınlaşarak) ayrıntılı haritaya açılır. Hiç yer yoksa gösterilmez.
 */
export function VisitedMap({ userId, name }: { userId: string; name: string }) {
  const { t } = useTranslation();
  const { items } = useVisitedPlaces(userId);
  const [width, setWidth] = useState(0);
  const dots = useMemo(() => cityDots(items), [items]);
  const summary = useMemo(() => visitedSummary(items), [items]);
  const view = useMemo(() => fitView(dots.map((d) => d.point), ASPECT, MIN_MAP_VIEW_WIDTH), [dots]);
  const mine = isMe(userId);

  if (!items.length) return null;

  const share = () => router.push({ pathname: '/harita-paylas/[id]', params: { id: userId } });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text variant="title3" color={colors.primary}>
            {mine ? t('tasteMap.mine') : t('tasteMap.theirs')}
          </Text>
          <Text variant="subhead" color={colors.textSecondary}>
            {t('tasteMap.summary', { cities: summary.cities, places: summary.places })}
          </Text>
        </View>
        <PressableScale onPress={share} hitSlop={hitSlop} accessibilityLabel={t('tasteMap.share')}>
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
            accessibilityLabel={t('tasteMap.expand')}>
            {width > 0 && <WorldMap view={view} width={width} height={width / ASPECT} dots={dots} />}
            <View style={styles.expand} pointerEvents="none">
              <SymbolView name="arrow.up.left.and.arrow.down.right" tintColor={colors.primary} size={12} weight="semibold" />
            </View>
          </PressableScale>
        </Link.AppleZoom>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
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
  expand: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.floating,
  },
});
