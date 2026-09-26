import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { AreaTopItem } from '@/api/content';
import { AreaRow, openArea } from '@/components/area-row';
import { PlaceRow } from '@/components/place-row';
import { PlaceRowsSkeleton, UserRowsSkeleton } from '@/components/skeleton';
import { Button, Divider, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import {
  useAreaTopPlaces,
  useNearbyPlaceSearch,
  useSearchAreas,
  useSearchUsers,
  useSuggestedUsers,
} from '@/hooks/queries';
import { currentLanguage } from '@/i18n';
import { trFold } from '@/lib/fold';
import { haptics } from '@/lib/haptics';
import { requestPlaceChoice } from '@/lib/place-choice';
import { turkishPossessive } from '@/lib/possessive';
import { useAppActions, useAppSelector, useScoreOf } from '@/store/app-store';
import type { AreaHit, Place, User } from '@/types';

type Scope = 'all' | 'places' | 'people';

const SCOPES: Scope[] = ['all', 'places', 'people'];

/** Semt tam yazılınca Keşfet'te gösterilen en iyi mekân sayısı (tamamı bölge ekranında) */
const AREA_PREVIEW = 5;

type Section =
  | { key: 'areas'; title: string; data: AreaHit[]; loading: boolean }
  | { key: 'areaTop'; title: string; data: AreaTopItem[]; loading: boolean; area: AreaHit }
  | { key: 'places'; title: string; data: Place[]; loading: boolean }
  | { key: 'people'; title: string; data: User[]; loading: boolean };

type Item = Section['data'][number];

const itemKey = (item: Item) =>
  'placeCount' in item
    ? `area:${item.kind}:${item.city}:${item.district}:${item.name}`
    : 'place' in item
      ? `top:${item.place.id}`
      : item.id;

/**
 * Keşfet: mekân, kişi ve semt/ilçe araması. Yazdıkça her harfte sonuçlar daralır (önceki sonuç yenisi gelene
 * kadar ekranda kalır, eşleşen kısım vurgulanır). Semt ya da ilçe tam yazılınca oranın en yüksek puanlıları
 * doğrudan listelenir; tümü bölge ekranında. Arama boşken tanıyor olabileceğin kişiler ve yakındaki mekânlar.
 */
export default function SearchTab() {
  // Sekme açık kaldığı için tüm mağazayı değil yalnızca kullanılan alanları dinler
  const following = useAppSelector((s) => s.following);
  const savedPlaces = useAppSelector((s) => s.saved);
  const scoreOf = useScoreOf();
  const actions = useAppActions();
  const savedIds = useMemo(() => new Set(savedPlaces.map((s) => s.placeId)), [savedPlaces]);
  const { t } = useTranslation();
  const scopeLabel = (s: Scope) => (s === 'all' ? t('common.all') : s === 'places' ? t('common.places') : t('common.people'));
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const trimmed = query.trim();
  const searching = trimmed.length > 0;

  const userSearch = useSearchUsers(query);
  const suggested = useSuggestedUsers();
  const placeSearch = useNearbyPlaceSearch(query);
  const areaSearch = useSearchAreas(searching && scope !== 'people' ? query : '');
  const areas = useMemo(
    () => (searching && trimmed.length >= 2 ? (areaSearch.data ?? []) : []),
    [searching, trimmed, areaSearch.data],
  );
  // Yazılan bir semtin/ilçenin tam adıysa oranın en iyileri doğrudan gösterilir
  const focusArea = areas[0] && trFold(areas[0].name) === trFold(trimmed) ? areas[0] : undefined;
  const areaTop = useAreaTopPlaces(focusArea);
  const loading = placeSearch.isPending || (searching && userSearch.isPending);

  const sections = useMemo<Section[]>(() => {
    const people = searching
      ? (userSearch.data ?? [])
      : (suggested.data ?? []).filter((u) => !following.includes(u.id));
    const places = placeSearch.data ?? [];
    const result: Section[] = [];
    if (scope !== 'people' && areas.length) {
      result.push({
        key: 'areas',
        title: t('search.areas'),
        data: scope === 'places' ? areas : areas.slice(0, 3),
        loading: areaSearch.isFetching,
      });
    }
    const top = (areaTop.data?.pages[0] ?? []).filter((i) => i.average !== undefined).slice(0, AREA_PREVIEW);
    if (scope !== 'people' && focusArea && top.length) {
      result.push({
        key: 'areaTop',
        title: t('search.areaTop', {
          area: currentLanguage() === 'tr' ? turkishPossessive(focusArea.name) : focusArea.name,
        }),
        data: top,
        loading: areaTop.isFetching,
        area: focusArea,
      });
    }
    if (scope !== 'people' && places.length) {
      result.push({
        key: 'places',
        title: searching ? t('common.places') : t('search.discover'),
        data: places,
        loading: searching && placeSearch.isFetching,
      });
    }
    if (scope !== 'places' && people.length) {
      result.push({
        key: 'people',
        title: searching ? t('common.people') : t('search.peopleYouMayKnow'),
        data: scope === 'all' && !searching ? people.slice(0, 3) : people,
        loading: searching && userSearch.isFetching,
      });
    }
    // Aramada önce bölge, sonra mekân ve kişi; arama boşken kişi önerileri üstte, mekânlar altta
    const order: Section['key'][] = searching ? ['areas', 'areaTop', 'places', 'people'] : ['people', 'places'];
    return result.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  }, [
    scope,
    searching,
    following,
    areas,
    focusArea,
    areaSearch.isFetching,
    areaTop.data,
    areaTop.isFetching,
    userSearch.data,
    userSearch.isFetching,
    suggested.data,
    placeSearch.data,
    placeSearch.isFetching,
    t,
  ]);

  const renderPlace = (place: Place) => {
    const score = scoreOf(place.id);
    const saved = savedIds.has(place.id);
    return (
      <PlaceRow
        place={place}
        highlight={trimmed}
        onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
        trailing={
          score !== undefined ? (
            <ScoreBadge score={score} size="sm" />
          ) : (
            <PressableScale
              hitSlop={hitSlop}
              onPress={() => actions.toggleSaved(place.id)}
              accessibilityLabel={saved ? t('common.removeFromList') : t('common.saveToList')}>
              <SymbolView name={saved ? 'bookmark.fill' : 'bookmark'} tintColor={colors.primary} size={22} />
            </PressableScale>
          )
        }
      />
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: t('search.placeholder'),
            autoCapitalize: 'none',
            hideWhenScrolling: false,
            cancelButtonText: t('common.cancel'),
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />
      <SectionList<Item, Section>
        sections={sections}
        keyExtractor={itemKey}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.scopes}>
            {SCOPES.map((s) => {
              const active = s === scope;
              return (
                <PressableScale
                  key={s}
                  haptic={false}
                  onPress={() => {
                    haptics.select();
                    setScope(s);
                  }}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text variant="subhead" color={active ? colors.onPrimary : colors.primary} style={styles.chipText}>
                    {scopeLabel(s)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text variant="title3" color={colors.primary} style={styles.sectionTitle} numberOfLines={1}>
              {section.title}
            </Text>
            {/* Yeni harfin sonuçları gelirken eski sonuçlar kalır; küçük bir gösterge yeterli */}
            {section.loading && <ActivityIndicator size="small" color={colors.textTertiary} />}
          </View>
        )}
        renderSectionFooter={({ section }) =>
          section.key === 'areaTop' ? (
            <PressableScale onPress={() => openArea(section.area)} style={styles.seeAll} haptic={false}>
              <Text variant="subhead" color={colors.primary} style={styles.chipText}>
                {t('search.seeAll')}
              </Text>
              <SymbolView name="chevron.right" tintColor={colors.primary} size={12} weight="semibold" />
            </PressableScale>
          ) : null
        }
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
        ListEmptyComponent={
          loading ? (
            scope === 'people' ? <UserRowsSkeleton /> : <PlaceRowsSkeleton />
          ) : (
            <View style={styles.empty}>
              <SymbolView name="magnifyingglass" tintColor={colors.textTertiary} size={40} />
              <Text variant="subhead" color={colors.textSecondary} align="center">
                {searching ? t('search.noResults', { query: trimmed }) : t('search.nothingYet')}
              </Text>
              {scope !== 'people' && (
                <Button
                  title={t('common.addPlace')}
                  icon="plus"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/mekan-ekle',
                      params: {
                        ad: trimmed,
                        istek: requestPlaceChoice((p) => router.push({ pathname: '/mekan/[id]', params: { id: p.id } })),
                      },
                    })
                  }
                />
              )}
            </View>
          )
        }
        renderItem={({ item, section, index }) => (
          // Yeni eşleşen satır yumuşakça belirir; yazmaya devam ettikçe kalan satırlar yerinde durur
          <Animated.View entering={FadeIn.duration(140)}>
            {section.key === 'areas' ? (
              <AreaRow area={item as AreaHit} highlight={trimmed} />
            ) : section.key === 'areaTop' ? (
              <PlaceRow
                place={(item as AreaTopItem).place}
                rank={index + 1}
                onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: (item as AreaTopItem).place.id } })}
                trailing={<ScoreBadge score={(item as AreaTopItem).average!} size="sm" />}
              />
            ) : section.key === 'people' ? (
              <UserRow user={item as User} highlight={searching ? trimmed : undefined} />
            ) : (
              renderPlace(item as Place)
            )}
          </Animated.View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scopes: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  chip: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    flexShrink: 1,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
});
