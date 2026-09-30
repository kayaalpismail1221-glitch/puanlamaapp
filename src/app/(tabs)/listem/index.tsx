import { router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, Alert, FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ListStrip } from '@/components/list-card';
import { SavedPlaceCard } from '@/components/saved-place-card';
import { Button, Divider, PlaceImage, PressableScale, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { getPlace, useEntitiesVersion, usePrefetchPlaces } from '@/data/entities';
import { useFriendScores, useSavedLists, useSavedPosts } from '@/hooks/queries';
import { useClipboardHasUrl } from '@/lib/clipboard';
import { formatScore } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { linkSource } from '@/lib/links';
import { useAppStore } from '@/store/app-store';
import type { Place, SaveOrigin, SavedPlace } from '@/types';

type Sort = 'recent' | 'friends' | 'az';

const SORTS: Sort[] = ['recent', 'friends', 'az'];

type Row = { entry: SavedPlace; place: Place };

const addSocial = (paste = false) =>
  router.push({ pathname: '/listeye-ekle', params: { kaynak: 'social', ...(paste && { yapistir: '1' }) } });
const addApp = () => router.push({ pathname: '/listeye-ekle', params: { kaynak: 'app' } });

/**
 * Listem: gitmek istediğin mekânlar.
 * - Sosyal medyadan: Instagram/TikTok'ta görüp bağlantısıyla kaydettiklerin
 * - Kaydettiklerim: uygulama içinde yer imiyle kaydettiğin mekânlar ve gönderiler
 */
export default function SavedListScreen() {
  const { saved, isPostSaved } = useAppStore();
  const { t, i18n } = useTranslation();
  const sortLabel = (s: Sort) => t(`list.sort.${s}`);
  const noLink = t('links.noLink');
  const savedPosts = useSavedPosts();
  const savedLists = useSavedLists().data ?? [];
  const version = useEntitiesVersion();
  usePrefetchPlaces(saved.map((s) => s.placeId));
  const friendScores = useFriendScores(saved.map((s) => s.placeId)).data;
  const friendScoreOf = (placeId: string) => friendScores?.[placeId];
  const [section, setSection] = useState<SaveOrigin>('social');
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('recent');
  const [clipboardHasUrl] = useClipboardHasUrl();

  const allRows = useMemo<Row[]>(
    () =>
      saved.flatMap((entry) => {
        const place = getPlace(entry.placeId);
        return place ? [{ entry, place }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved, version],
  );
  const socialRows = allRows.filter((r) => r.entry.origin === 'social');
  const appRows = allRows.filter((r) => r.entry.origin === 'app');
  const sectionRows = section === 'social' ? socialRows : appRows;
  // Kaydetmesi yeni kaldırılan gönderi listeden hemen düşsün
  const posts = (savedPosts.data ?? []).filter(isPostSaved);

  // Filtre seçenekleri o bölümdeki kayıtlardan çıkar
  const cuisines = useMemo(() => countBy(sectionRows, (r) => r.place.cuisine), [sectionRows]);
  const sources = useMemo(
    () => countBy(socialRows, (r) => (r.entry.link ? linkSource(r.entry.link).label : noLink)),
    [socialRows, noLink],
  );

  const rows = useMemo(() => {
    const filtered = sectionRows.filter(
      (r) =>
        (!cuisine || r.place.cuisine === cuisine) &&
        (section !== 'social' ||
          !source ||
          (r.entry.link ? linkSource(r.entry.link).label : noLink) === source),
    );
    const sorted = [...filtered];
    if (sort === 'az') sorted.sort((a, b) => a.place.name.localeCompare(b.place.name, i18n.language));
    if (sort === 'friends')
      sorted.sort((a, b) => (friendScoreOf(b.place.id)?.average ?? -1) - (friendScoreOf(a.place.id)?.average ?? -1));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionRows, cuisine, source, section, sort, friendScores]);

  const changeSection = (next: SaveOrigin) => {
    if (next === section) return;
    haptics.select();
    setSection(next);
    setCuisine(null);
    setSource(null);
  };

  const chooseSort = () => {
    const keys = SORTS;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: t('list.sort.title'),
          options: [...keys.map((k) => (k === sort ? `✓ ${sortLabel(k)}` : sortLabel(k))), t('common.cancel')],
          cancelButtonIndex: keys.length,
          tintColor: colors.primary,
        },
        (i) => keys[i] && setSort(keys[i]),
      );
    } else {
      Alert.alert(t('list.sort.title'), undefined, keys.map((k) => ({ text: sortLabel(k), onPress: () => setSort(k) })));
    }
  };

  const openAddMenu = () => {
    if (Platform.OS !== 'ios') {
      // Android: sistem diyaloğu (ActionSheetIOS yok)
      Alert.alert(t('screens.addToList'), undefined, [
        { text: t('list.addFromSocial'), onPress: () => addSocial() },
        { text: t('list.searchAndSave'), onPress: addApp },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
      return;
    }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('list.addFromSocial'), t('list.searchAndSave'), t('common.cancel')],
        cancelButtonIndex: 2,
        tintColor: colors.primary,
      },
      (i) => {
        if (i === 0) addSocial();
        if (i === 1) addApp();
      },
    );
  };

  const filtersActive = !!cuisine || !!source;

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <PressableScale
              onPress={() => router.navigate({ pathname: '/harita', params: { filtre: 'want' } })}
              hitSlop={hitSlop}
              accessibilityLabel={t('list.showOnMap')}>
              <SymbolView name="map" tintColor={colors.primary} size={22} />
            </PressableScale>
          ),
          headerRight: () => (
            <PressableScale onPress={openAddMenu} hitSlop={hitSlop} accessibilityLabel={t('screens.addToList')}>
              <SymbolView name="plus" tintColor={colors.primary} size={22} weight="semibold" />
            </PressableScale>
          ),
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.place.id}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 88 + spacing.md} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* Bölüm seçici */}
            <View style={styles.sections}>
              <SectionButton
                icon="camera"
                label={t('list.fromSocial')}
                count={socialRows.length}
                active={section === 'social'}
                onPress={() => changeSection('social')}
              />
              <SectionButton
                icon="bookmark"
                label={t('list.saved')}
                count={appRows.length + posts.length + savedLists.length}
                active={section === 'app'}
                onPress={() => changeSection('app')}
              />
            </View>

            {/* Instagram'dan dönünce: panodaki bağlantıyı tek dokunuşla kaydet */}
            {section === 'social' && clipboardHasUrl && (
              <Animated.View entering={FadeIn}>
                <PressableScale onPress={() => addSocial(true)} style={styles.clipboard}>
                  <View style={styles.clipboardIcon}>
                    <SymbolView name="doc.on.clipboard" tintColor={colors.onPrimary} size={18} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="subhead" color={colors.primary} style={styles.bold}>
                      {t('list.clipboardTitle')}
                    </Text>
                    <Text variant="footnote" color={colors.textSecondary}>
                      {t('list.clipboardText')}
                    </Text>
                  </View>
                  <SymbolView name="chevron.right" tintColor={colors.primary} size={14} weight="semibold" />
                </PressableScale>
              </Animated.View>
            )}

            {/* Kaydedilen listeler şeridi */}
            {section === 'app' && savedLists.length > 0 && (
              <ListStrip title={t('lists.title')} lists={savedLists} showAuthor />
            )}
            {section === 'app' && savedLists.length > 0 && posts.length === 0 && sectionRows.length > 0 && (
              <Text variant="title3" color={colors.primary} style={styles.placesTitle}>
                {t('common.places')}
              </Text>
            )}

            {/* Kaydedilen gönderiler şeridi */}
            {section === 'app' && posts.length > 0 && (
              <View style={styles.postsBlock}>
                <View style={styles.blockHeader}>
                  <Text variant="title3" color={colors.primary}>
                    {t('common.posts')}
                  </Text>
                  <PressableScale onPress={() => router.push('/kaydedilen-gonderiler')} hitSlop={hitSlop} style={styles.seeAll}>
                    <Text variant="subhead" color={colors.primary} style={styles.bold}>
                      {t('common.seeAll')}
                    </Text>
                    <SymbolView name="chevron.right" tintColor={colors.primary} size={12} weight="semibold" />
                  </PressableScale>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.postStrip}>
                  {posts.slice(0, 10).map((p) => {
                    const place = getPlace(p.placeId);
                    return (
                      <PressableScale
                        key={p.id}
                        scaleTo={0.96}
                        onPress={() => router.push({ pathname: '/gonderi/[id]', params: { id: p.id } })}
                        style={styles.postTile}>
                        <PlaceImage uri={p.thumbs[0] ?? place?.thumbUrl} style={StyleSheet.absoluteFill} />
                        <View style={styles.postShade}>
                          <Text variant="caption" color={colors.onPrimary} numberOfLines={1} style={styles.bold}>
                            {place?.name}
                          </Text>
                          {p.score !== undefined && (
                            <Text variant="caption" color={colors.onPrimary}>
                              {formatScore(p.score)}
                            </Text>
                          )}
                        </View>
                      </PressableScale>
                    );
                  })}
                </ScrollView>
                {sectionRows.length > 0 && (
                  <Text variant="title3" color={colors.primary} style={styles.placesTitle}>
                    {t('common.places')}
                  </Text>
                )}
              </View>
            )}

            {/* Filtreler ve sıralama */}
            {sectionRows.length > 1 && (
              <View style={styles.filters}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {section === 'social' &&
                    sources.length > 1 &&
                    sources.map(([label, n]) => (
                      <FilterChip
                        key={`s-${label}`}
                        label={`${label} ${n}`}
                        active={source === label}
                        onPress={() => setSource(source === label ? null : label)}
                      />
                    ))}
                  {cuisines.map(([label, n]) => (
                    <FilterChip
                      key={`c-${label}`}
                      label={`${cuisineLabel(label)} ${n}`}
                      active={cuisine === label}
                      onPress={() => setCuisine(cuisine === label ? null : label)}
                    />
                  ))}
                </ScrollView>
                <View style={styles.sortRow}>
                  <Text variant="footnote" color={colors.textSecondary}>
                    {t('common.placeCount', { count: rows.length })}
                  </Text>
                  <PressableScale onPress={chooseSort} hitSlop={hitSlop} style={styles.sortButton}>
                    <SymbolView name="arrow.up.arrow.down" tintColor={colors.primary} size={13} />
                    <Text variant="footnote" color={colors.primary} style={styles.bold}>
                      {sortLabel(sort)}
                    </Text>
                  </PressableScale>
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          filtersActive ? (
            <View style={styles.empty}>
              <Text variant="subhead" color={colors.textSecondary} align="center">
                {t('list.noFilterMatch')}
              </Text>
              <Button
                title={t('list.clearFilter')}
                variant="secondary"
                onPress={() => {
                  setCuisine(null);
                  setSource(null);
                }}
              />
            </View>
          ) : section === 'social' ? (
            <SocialEmpty />
          ) : posts.length === 0 && savedLists.length === 0 ? (
            <AppEmpty />
          ) : null
        }
        renderItem={({ item }) => (
          <SavedPlaceCard entry={item.entry} place={item.place} friends={friendScoreOf(item.place.id)} />
        )}
        ListFooterComponent={
          rows.length > 0 ? (
            <Text variant="caption" color={colors.textTertiary} align="center" style={styles.hint}>
              {t('list.swipeHint')}
            </Text>
          ) : null
        }
      />
    </>
  );
}

function countBy<T>(items: T[], key: (item: T) => string): [string, number][] {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function SectionButton({
  icon,
  label,
  count,
  active,
  onPress,
}: {
  icon: SFSymbol;
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale haptic={false} onPress={onPress} style={[styles.section, active && styles.sectionActive]}>
      <SymbolView name={icon} tintColor={active ? colors.onPrimary : colors.primary} size={16} />
      <Text variant="subhead" color={active ? colors.onPrimary : colors.primary} style={styles.bold} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.count, active && styles.countActive]}>
        <Text variant="caption" color={active ? colors.primary : colors.textSecondary} style={styles.bold}>
          {count}
        </Text>
      </View>
    </PressableScale>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      haptic={false}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={[styles.chip, active && styles.chipActive]}>
      <Text variant="footnote" color={active ? colors.onPrimary : colors.text} style={styles.bold}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** Sosyal medya bölümü boşken: 3 adımda nasıl kaydedilir */
function SocialEmpty() {
  const { t } = useTranslation();
  const steps: { icon: SFSymbol; text: string }[] = [
    { icon: 'camera', text: t('list.socialStep1') },
    { icon: 'link', text: t('list.socialStep2') },
    { icon: 'bookmark.fill', text: t('list.socialStep3') },
  ];
  return (
    <View style={styles.empty}>
      <Text variant="title3" align="center">
        {t('list.socialEmptyTitle')}
      </Text>
      <View style={styles.steps}>
        {steps.map((s, i) => (
          <View key={s.text} style={styles.step}>
            <View style={styles.stepIcon}>
              <SymbolView name={s.icon} tintColor={colors.primary} size={18} />
            </View>
            <Text variant="subhead" style={{ flex: 1 }}>
              <Text variant="subhead" style={styles.bold}>
                {i + 1}.{' '}
              </Text>
              {s.text}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.emptyActions}>
        <Button title={t('list.addFromSocial')} icon="plus" onPress={() => addSocial()} />
        {/* iOS: gri dolgulu ikincil düğme; Android: Material'daki çerçeveli (outlined) düğme */}
        <Button
          title={t('list.searchAndSave')}
          icon="magnifyingglass"
          variant={Platform.OS === 'ios' ? 'secondary' : 'outline'}
          onPress={addApp}
        />
      </View>
    </View>
  );
}

/** Uygulama içi kayıtlar boşken */
function AppEmpty() {
  const { t } = useTranslation();
  return (
    <View style={styles.empty}>
      <SymbolView name="bookmark" tintColor={colors.textTertiary} size={40} />
      <Text variant="title3" align="center">
        {t('list.appEmptyTitle')}
      </Text>
      <Text variant="subhead" color={colors.textSecondary} align="center">
        {t('list.appEmptyText')}
      </Text>
      <Button title={t('list.searchPlaces')} icon="magnifyingglass" onPress={() => router.navigate('/ara')} style={styles.emptyButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  bold: {
    fontWeight: '600',
  },
  sections: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  section: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  sectionActive: {
    backgroundColor: colors.primary,
  },
  count: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countActive: {
    backgroundColor: colors.onPrimary,
  },
  clipboard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  clipboardIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postsBlock: {
    gap: spacing.md,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  postStrip: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  postTile: {
    width: 120,
    height: 150,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  postShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    backgroundColor: colors.overlay,
  },
  placesTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  filters: {
    gap: spacing.sm,
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
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
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
  },
  steps: {
    alignSelf: 'stretch',
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  hint: {
    padding: spacing.xl,
  },
});
