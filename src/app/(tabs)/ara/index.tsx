import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Button, Divider, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useNearbyPlaceSearch, useSearchUsers, useSuggestedUsers } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import type { Place, User } from '@/types';

type Scope = 'all' | 'places' | 'people';

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'places', label: 'Mekânlar' },
  { key: 'people', label: 'Kişiler' },
];

type Section =
  | { key: 'people'; title: string; data: User[] }
  | { key: 'places'; title: string; data: Place[] };

/** Hem mekân hem kişi araması */
export default function SearchTab() {
  const { following, scoreOf, isSaved, actions } = useAppStore();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const searching = query.trim().length > 0;

  // Arama boşken: takip etmediğin kişiler ve yakındaki mekânlar öneri olarak
  const userSearch = useSearchUsers(query);
  const suggested = useSuggestedUsers();
  const placeSearch = useNearbyPlaceSearch(query);
  const loading = placeSearch.isPending || (searching && userSearch.isPending);

  const sections = useMemo<Section[]>(() => {
    const people = searching
      ? (userSearch.data ?? [])
      : (suggested.data ?? []).filter((u) => !following.includes(u.id));
    const places = placeSearch.data ?? [];
    const result: Section[] = [];
    if (scope !== 'places' && people.length) {
      result.push({
        key: 'people',
        title: searching ? 'Kişiler' : 'Tanıyor olabileceğin kişiler',
        data: scope === 'all' && !searching ? people.slice(0, 3) : people,
      });
    }
    if (scope !== 'people' && places.length) {
      result.push({ key: 'places', title: searching ? 'Mekânlar' : 'Keşfet', data: places });
    }
    return result;
  }, [scope, searching, following, userSearch.data, suggested.data, placeSearch.data]);

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: 'Mekân, semt veya kişi ara',
            autoCapitalize: 'none',
            hideWhenScrolling: false,
            cancelButtonText: 'Vazgeç',
            onChangeText: (e) => setQuery(e.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
          },
        }}
      />
      <SectionList<User | Place, Section>
        sections={sections}
        keyExtractor={(item) => item.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.scopes}>
            {SCOPES.map((s) => {
              const active = s.key === scope;
              return (
                <PressableScale
                  key={s.key}
                  haptic={false}
                  onPress={() => {
                    haptics.select();
                    setScope(s.key);
                  }}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text variant="subhead" color={active ? colors.onPrimary : colors.primary} style={styles.chipText}>
                    {s.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="title3" color={colors.primary} style={styles.sectionTitle}>
            {section.title}
          </Text>
        )}
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.empty} />
          ) : (
            <View style={styles.empty}>
              <SymbolView name="magnifyingglass" tintColor={colors.textTertiary} size={40} />
              <Text variant="subhead" color={colors.textSecondary} align="center">
                {searching ? `“${query.trim()}” için sonuç bulunamadı.` : 'Burada henüz keşfedilecek bir şey yok.'}
              </Text>
              {scope !== 'people' && (
                <Button
                  title="Yeni mekân ekle"
                  icon="plus"
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/mekan-ekle', params: { ad: query.trim() } })}
                />
              )}
            </View>
          )
        }
        renderItem={({ item, section }) => {
          if (section.key === 'people') return <UserRow user={item as User} />;
          const place = item as Place;
          const score = scoreOf(place.id);
          const saved = isSaved(place.id);
          return (
            <PlaceRow
              place={place}
              onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
              trailing={
                score !== undefined ? (
                  <ScoreBadge score={score} size="sm" />
                ) : (
                  <PressableScale
                    hitSlop={hitSlop}
                    onPress={() => actions.toggleSaved(place.id)}
                    accessibilityLabel={saved ? 'Listemden çıkar' : 'Listeme kaydet'}>
                    <SymbolView
                      name={saved ? 'bookmark.fill' : 'bookmark'}
                      tintColor={colors.primary}
                      size={22}
                    />
                  </PressableScale>
                )
              }
            />
          );
        }}
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
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
});
