import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BottomInsetSpacer } from '@/components/bottom-inset';
import { PlaceRow } from '@/components/place-row';
import { PostGrid } from '@/components/post-grid';
import { SegmentedControl } from '@/components/segmented-control';
import { Divider, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { WorldMap } from '@/components/world-map';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useUser } from '@/data/entities';
import { useVisitedPlaces } from '@/hooks/use-visited-places';
import { haptics } from '@/lib/haptics';
import { isMe } from '@/lib/session';
import {
  breakdown,
  cityDots,
  itemsOf,
  visitedSummary,
  type BreakdownKind,
  type BreakdownRow,
  type BreakdownSort,
} from '@/lib/visited';
import { fitView, MIN_MAP_VIEW_WIDTH } from '@/lib/world-projection';

const ASPECT = 1.3;

type Selection = { kind: BreakdownKind; key: string };

/**
 * Lezzet haritasının büyük hâli: üstte şehir · mekân · gönderi sayıları, çizim tarzı harita + şehir / ilçe kırılımı;
 * sağ üstte paylaş (hikâye kartı, kaydet, mesaj, bağlantı). Yüklenirken ayrı iskelet yerine aynı düzen yer tutar:
 * veri gelince hiçbir şey kaymaz.
 * Bir şehir noktasına ya da satıra dokununca oradaki gönderiler çıkar; gönderiye dokununca açılır.
 */
export default function VisitedPlacesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const kinds: { key: BreakdownKind; label: string }[] = [
    { key: 'city', label: t('foodMap.cities') },
    { key: 'district', label: t('foodMap.districts') },
  ];
  const user = useUser(id);
  const mine = isMe(id);
  const { items, loading } = useVisitedPlaces(id);

  const [kind, setKind] = useState<BreakdownKind>('city');
  const [sort, setSort] = useState<BreakdownSort>('count');
  const [selection, setSelection] = useState<Selection | null>(null);

  const dots = useMemo(() => cityDots(items), [items]);
  const summary = useMemo(() => visitedSummary(items), [items]);
  const rows = useMemo(() => breakdown(items, kind, sort), [items, kind, sort]);
  const mapWidth = screenWidth - spacing.lg * 2;
  const view = useMemo(() => fitView(dots.map((d) => d.point), ASPECT, MIN_MAP_VIEW_WIDTH), [dots]);

  const selectedItems = selection ? itemsOf(items, selection.kind, selection.key) : [];
  const selectedPosts = selectedItems.flatMap((i) => i.posts).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const placesWithoutPosts = selectedItems.filter((i) => !i.posts.length);
  const selectedRow = selection && breakdown(items, selection.kind, 'count').find((r) => r.key === selection.key);
  // Haritada vurgulanan şehir
  const highlightedCity = selection?.kind === 'city' ? selection.key : selection?.kind === 'district' ? selection.key.split('/')[0] : null;

  const select = (next: Selection | null) => {
    haptics.select();
    setSelection(next);
  };

  const title = mine ? t('tasteMap.mine') : user ? t('foodMap.titleTheirs', { name: user.name.split(' ')[0] }) : '';

  // Başlık yalnızca değişince verilir (paylaş düğmesi rota tanımında sabit); her dokunuşta başlık çubuğunu
  // yeniden kurmak, yakınlaşma geçişiyle açılan ekranda düğmeleri kaybettiriyordu
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  // Ağır harita çizimi açılış geçişi bitince başlar; geçiş boyunca aynı boyutta sade zemin (takılma olmasın)
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    const unsubscribe = navigation.addListener('transitionEnd' as never, () => setMapReady(true));
    const fallback = setTimeout(() => setMapReady(true), 500);
    return () => {
      unsubscribe();
      clearTimeout(fallback);
    };
  }, [navigation]);

  const pending = loading && !items.length;

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      {/* Sayılar tek satıra sıkışmasın: üç ayrı kutu, büyük rakam ve altında etiket */}
      <View style={styles.summary}>
        <SummaryStat value={pending ? undefined : summary.cities} label={t('foodMap.statCities', { count: summary.cities })} />
        <SummaryStat value={pending ? undefined : summary.places} label={t('foodMap.statPlaces', { count: summary.places })} />
        <SummaryStat value={pending ? undefined : summary.posts} label={t('foodMap.statPosts', { count: summary.posts })} />
      </View>

      <View style={[styles.map, { width: mapWidth, height: mapWidth / ASPECT }]}>
        {mapReady && !pending && (
          <Animated.View entering={FadeIn.duration(220)}>
            <WorldMap
              view={view}
              width={mapWidth}
              height={mapWidth / ASPECT}
              dots={dots}
              selectedKey={highlightedCity}
              onDotPress={(city) =>
                select(selection?.kind === 'city' && selection.key === city ? null : { kind: 'city', key: city })
              }
            />
          </Animated.View>
        )}
      </View>

      {selection && selectedRow ? (
        <Animated.View key={`${selection.kind}:${selection.key}`} entering={FadeIn.duration(200)}>
          <View style={styles.selectionHeader}>
            <View style={styles.flex}>
              <Text variant="title3">{selectedRow.label}</Text>
              <Text variant="footnote" color={colors.textSecondary}>
                {selectedRow.sublabel ? `${selectedRow.sublabel} · ` : ''}
                {t('foodMap.selection', { places: selectedRow.count, posts: selectedPosts.length })}
              </Text>
            </View>
            {selectedRow.average !== undefined && <ScoreBadge score={selectedRow.average} />}
            <PressableScale onPress={() => select(null)} hitSlop={hitSlop} style={styles.close} accessibilityLabel={t('rate.close')}>
              <SymbolView name="xmark" tintColor={colors.primary} size={13} weight="bold" />
            </PressableScale>
          </View>
          {selectedPosts.length > 0 && <PostGrid posts={selectedPosts} emptyText="" />}
          {placesWithoutPosts.length > 0 && (
            <>
              <Text variant="footnote" color={colors.textSecondary} style={styles.subheading}>
                {selectedPosts.length ? t('foodMap.ratedWithoutPost') : t('foodMap.rated')}
              </Text>
              {placesWithoutPosts.map((item) => (
                <PlaceRow
                  key={item.place.id}
                  place={item.place}
                  onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: item.place.id } })}
                  trailing={item.score !== undefined ? <ScoreBadge score={item.score} size="sm" /> : undefined}
                />
              ))}
            </>
          )}
        </Animated.View>
      ) : (
        <>
          <SegmentedControl options={kinds} value={kind} onChange={setKind} style={styles.segment} />
          <View style={styles.listHeader}>
            <Text variant="headline" color={colors.textSecondary}>
              {t(`foodMap.count.${kind}`, { count: rows.length })}
            </Text>
            <PressableScale
              onPress={() => {
                haptics.select();
                setSort(sort === 'count' ? 'score' : 'count');
              }}
              style={styles.sort}
              accessibilityLabel={t('foodMap.changeSort')}>
              <SymbolView name="arrow.up.arrow.down" tintColor={colors.primary} size={13} weight="semibold" />
              <Text variant="footnote" color={colors.primary} style={styles.bold}>
                {sort === 'count' ? t('foodMap.byCount') : t('foodMap.byScore')}
              </Text>
            </PressableScale>
          </View>
          {rows.map((row, i) => (
            <View key={row.key}>
              {i > 0 && <Divider inset={spacing.lg} />}
              <BreakdownItem row={row} label={row.label} onPress={() => select({ kind, key: row.key })} />
            </View>
          ))}
        </>
      )}
      <View style={{ height: spacing.xxl }} />
      <BottomInsetSpacer />
    </ScrollView>
  );
}

/** `value` yoksa (yükleniyor) rakam yeri boş kalır, kutu yerini korur */
function SummaryStat({ value, label }: { value?: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="title2" color={colors.primary} style={styles.statValue}>
        {value ?? ' '}
      </Text>
      <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function BreakdownItem({ row, label, onPress }: { row: BreakdownRow; label: string; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} haptic={false} style={styles.row}>
      <View style={styles.flex}>
        <Text variant="headline">{label}</Text>
        <Text variant="subhead" color={colors.textSecondary}>
          {row.sublabel ? `${row.sublabel} · ` : ''}
          {t('common.placeCount', { count: row.count })}
        </Text>
      </View>
      {row.average !== undefined && <ScoreBadge score={row.average} size="sm" />}
      <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={13} weight="semibold" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  summary: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  statValue: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  map: {
    alignSelf: 'center',
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.mapWater,
  },
  segment: {
    paddingTop: spacing.lg,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sort: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bold: {
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  close: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subheading: {
    fontWeight: '600',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
});
