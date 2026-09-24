import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PlaceRow } from '@/components/place-row';
import { PostGrid } from '@/components/post-grid';
import { SegmentedControl } from '@/components/segmented-control';
import { Divider, LoadingView, PressableScale, ScoreBadge, Text } from '@/components/ui';
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
import { fitView } from '@/lib/world-projection';

const ASPECT = 1.3;
const MIN_VIEW_WIDTH = 70;

const KINDS: { key: BreakdownKind; label: string }[] = [
  { key: 'cuisine', label: 'Mutfaklar' },
  { key: 'city', label: 'Şehirler' },
  { key: 'district', label: 'İlçeler' },
];

const KIND_NOUN: Record<BreakdownKind, string> = { cuisine: 'mutfak', city: 'şehir', district: 'ilçe' };

type Selection = { kind: BreakdownKind; key: string };

/**
 * Lezzet haritasının büyük hâli: çizim tarzı harita + mutfak / şehir / ilçe kırılımı.
 * Bir şehir noktasına ya da satıra dokununca oradaki gönderiler çıkar; gönderiye dokununca açılır.
 */
export default function VisitedPlacesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: screenWidth } = useWindowDimensions();
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
  const view = useMemo(() => fitView(dots.map((d) => d.point), ASPECT, MIN_VIEW_WIDTH), [dots]);

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

  const title = mine ? 'Lezzet haritam' : user ? `${user.name.split(' ')[0]} · lezzet haritası` : '';

  if (loading && !items.length) return <LoadingView style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title }} />

      <Text variant="subhead" color={colors.textSecondary} style={styles.summary}>
        {summary.cities} şehir · {summary.places} mekân · {summary.posts} gönderi
      </Text>

      <View style={[styles.map, { width: mapWidth, height: mapWidth / ASPECT }]}>
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
      </View>

      {selection && selectedRow ? (
        <Animated.View key={`${selection.kind}:${selection.key}`} entering={FadeIn.duration(200)}>
          <View style={styles.selectionHeader}>
            <View style={styles.flex}>
              <Text variant="title3">{selectedRow.label}</Text>
              <Text variant="footnote" color={colors.textSecondary}>
                {selectedRow.sublabel ? `${selectedRow.sublabel} · ` : ''}
                {selectedRow.count} mekân · {selectedPosts.length} gönderi
              </Text>
            </View>
            {selectedRow.average !== undefined && <ScoreBadge score={selectedRow.average} />}
            <PressableScale onPress={() => select(null)} hitSlop={hitSlop} style={styles.close} accessibilityLabel="Kapat">
              <SymbolView name="xmark" tintColor={colors.primary} size={13} weight="bold" />
            </PressableScale>
          </View>
          {selectedPosts.length > 0 && <PostGrid posts={selectedPosts} emptyText="" />}
          {placesWithoutPosts.length > 0 && (
            <>
              <Text variant="footnote" color={colors.textSecondary} style={styles.subheading}>
                {selectedPosts.length ? 'GÖNDERİ PAYLAŞMADAN PUANLADIKLARI' : 'PUANLADIKLARI'}
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
          <SegmentedControl options={KINDS} value={kind} onChange={setKind} style={styles.segment} />
          <View style={styles.listHeader}>
            <Text variant="headline" color={colors.textSecondary}>
              {rows.length} {KIND_NOUN[kind]}
            </Text>
            <PressableScale
              onPress={() => {
                haptics.select();
                setSort(sort === 'count' ? 'score' : 'count');
              }}
              style={styles.sort}
              accessibilityLabel="Sıralamayı değiştir">
              <SymbolView name="arrow.up.arrow.down" tintColor={colors.primary} size={13} weight="semibold" />
              <Text variant="footnote" color={colors.primary} style={styles.bold}>
                {sort === 'count' ? 'Sayıya göre' : 'Puana göre'}
              </Text>
            </PressableScale>
          </View>
          {rows.map((row, i) => (
            <View key={row.key}>
              {i > 0 && <Divider inset={spacing.lg} />}
              <BreakdownItem row={row} onPress={() => select({ kind, key: row.key })} />
            </View>
          ))}
        </>
      )}
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

function BreakdownItem({ row, onPress }: { row: BreakdownRow; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} haptic={false} style={styles.row}>
      <View style={styles.flex}>
        <Text variant="headline">{row.label}</Text>
        <Text variant="subhead" color={colors.textSecondary}>
          {row.sublabel ? `${row.sublabel} · ` : ''}
          {row.count} mekân
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
