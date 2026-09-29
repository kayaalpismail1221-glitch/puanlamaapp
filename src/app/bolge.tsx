import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { PlaceRowsSkeleton } from '@/components/skeleton';
import { Divider, ErrorView, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { SEGMENT_ICONS, SEGMENTS } from '@/constants/segments';
import { colors, radius, spacing } from '@/constants/theme';
import { useAreaTopPlaces } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import type { AreaHit, Segment } from '@/types';

type Params = { tur: AreaHit['kind']; ad: string; sehir: string; ilce?: string };

/**
 * Bir bölgenin (şehir, ilçe, mahalle) en yüksek puanlı mekânları: Puanla puanına göre sıralı, segmentle
 * (restoran, sokak lezzeti…) süzülebilir. Keşfet'te semt aranınca açılır.
 */
export default function AreaScreen() {
  const { tur, ad, sehir, ilce } = useLocalSearchParams<Params>();
  const { t } = useTranslation();
  const [segment, setSegment] = useState<Segment | undefined>();
  const area = useMemo<AreaHit>(
    () => ({ kind: tur ?? 'district', name: ad ?? '', city: sehir ?? '', district: ilce || undefined, placeCount: 0 }),
    [tur, ad, sehir, ilce],
  );
  const query = useAreaTopPlaces(area, segment);
  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);

  const choose = (next: Segment | undefined) => {
    haptics.select();
    setSegment(next);
  };

  // "İlçe · İstanbul", "Mahalle · Kadıköy", "Şehir"
  const where = [
    t(`region.kinds.${area.kind}`),
    area.kind === 'neighborhood' ? area.district : area.kind === 'district' ? area.city : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Stack.Screen options={{ title: area.name }} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.place.id}
        contentInsetAdjustmentBehavior="automatic"
        onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <View>
            <View style={styles.intro}>
              <Text variant="footnote" color={colors.textSecondary}>
                {where}
              </Text>
              <Text variant="title3">{t('region.subtitle')}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              <Chip label={t('region.all')} active={!segment} onPress={() => choose(undefined)} />
              {SEGMENTS.map((s) => (
                <Chip
                  key={s}
                  label={t(`segments.${s}`)}
                  icon={SEGMENT_ICONS[s]}
                  active={segment === s}
                  onPress={() => choose(s)}
                />
              ))}
            </ScrollView>
            {query.isFetching && !query.isFetchingNextPage && query.isPlaceholderData && (
              <ActivityIndicator color={colors.primary} style={styles.refetching} />
            )}
          </View>
        }
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 24 + spacing.md + 52 + spacing.md} />}
        renderItem={({ item, index }) => (
          <PlaceRow
            place={item.place}
            rank={index + 1}
            onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: item.place.id } })}
            trailing={
              item.average !== undefined ? (
                <View style={styles.score}>
                  <ScoreBadge score={item.average} size="sm" />
                  <Text variant="caption" color={colors.textTertiary}>
                    {t('region.ratings', { count: item.count })}
                  </Text>
                </View>
              ) : (
                <Text variant="caption" color={colors.textTertiary}>
                  {t('region.noScore')}
                </Text>
              )
            }
          />
        )}
        ListEmptyComponent={
          query.isPending ? (
            <PlaceRowsSkeleton />
          ) : query.isError ? (
            <ErrorView onRetry={() => query.refetch()} />
          ) : (
            <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
              {t('region.empty')}
            </Text>
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator color={colors.primary} style={styles.more} />
          ) : items.length ? (
            <Text variant="caption" color={colors.textTertiary} style={styles.hint}>
              {t('region.hint')}
            </Text>
          ) : null
        }
      />
    </>
  );
}

function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: React.ComponentProps<typeof SymbolView>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale haptic={false} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      {icon && <SymbolView name={icon} tintColor={active ? colors.onPrimary : colors.primary} size={13} />}
      <Text variant="subhead" color={active ? colors.onPrimary : colors.primary} style={styles.chipText}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 2,
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontWeight: '600',
  },
  refetching: {
    marginBottom: spacing.sm,
  },
  score: {
    alignItems: 'center',
    gap: 2,
  },
  empty: {
    padding: spacing.xxl,
  },
  more: {
    marginVertical: spacing.lg,
  },
  hint: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    textAlign: 'center',
  },
});
