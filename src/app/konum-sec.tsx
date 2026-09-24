import { router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Divider, ErrorView, LoadingView, PressableScale, SearchField, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useAreas } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import type { FeedArea } from '@/types';

/** Feed bölgesi seç: Yakınımda, bir şehir ya da şehrin bir ilçesi */
export default function PickAreaScreen() {
  const { feedArea, actions } = useAppStore();
  const areas = useAreas();
  const [city, setCity] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const allCities = useMemo(() => areas.data ?? [], [areas.data]);

  const select = (area: FeedArea) => {
    haptics.success();
    actions.setFeedArea(area);
    router.back();
  };

  const q = query.trim().toLocaleLowerCase('tr');
  const selectedCity = allCities.find((c) => c.name === city);

  const isActive = (area: FeedArea) =>
    area.type === feedArea.type &&
    (area.type === 'near' ||
      (feedArea.type === 'area' && feedArea.city === area.city && feedArea.district === area.district));

  // İlçe listesi
  if (selectedCity) {
    const districts = selectedCity.districts.filter((d) => d.name.toLocaleLowerCase('tr').includes(q));
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: selectedCity.name,
            headerLeft: () => (
              <PressableScale
                onPress={() => {
                  setCity(null);
                  setQuery('');
                }}
                hitSlop={hitSlop}
                style={styles.back}
                accessibilityLabel="Şehirler">
                <SymbolView name="chevron.left" tintColor={colors.primary} size={17} weight="semibold" />
                <Text variant="body" color={colors.primary}>
                  Şehirler
                </Text>
              </PressableScale>
            ),
          }}
        />
        <FlatList
          data={districts}
          keyExtractor={(d) => d.name}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <Divider inset={spacing.lg + 40 + spacing.md} />}
          ListHeaderComponent={
            <Animated.View entering={FadeIn}>
              <View style={styles.search}>
                <SearchField value={query} onChangeText={setQuery} placeholder="İlçe ara" />
              </View>
              <AreaRow
                icon="building.2"
                title={`Tüm ${selectedCity.name}`}
                subtitle={`${selectedCity.postCount} gönderi`}
                active={isActive({ type: 'area', city: selectedCity.name })}
                onPress={() => select({ type: 'area', city: selectedCity.name })}
              />
              <Divider inset={spacing.lg + 40 + spacing.md} />
            </Animated.View>
          }
          renderItem={({ item }) => (
            <AreaRow
              icon="mappin.and.ellipse"
              title={item.name}
              subtitle={`${item.postCount} gönderi · ${item.placeCount} mekân`}
              active={isActive({ type: 'area', city: selectedCity.name, district: item.name })}
              onPress={() => select({ type: 'area', city: selectedCity.name, district: item.name })}
            />
          )}
        />
      </View>
    );
  }

  // Şehir listesi
  const cities = allCities.filter(
    (c) =>
      c.name.toLocaleLowerCase('tr').includes(q) ||
      c.districts.some((d) => d.name.toLocaleLowerCase('tr').includes(q)),
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Konum seç', headerLeft: undefined }} />
      <FlatList
        data={cities}
        keyExtractor={(c) => c.name}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 40 + spacing.md} />}
        ListHeaderComponent={
          <>
            <View style={styles.search}>
              <SearchField value={query} onChangeText={setQuery} placeholder="Şehir veya ilçe ara" />
            </View>
            {!q && (
              <>
                <AreaRow
                  icon="location.fill"
                  title="Yakınımda"
                  subtitle="Bulunduğun yerin çevresindeki popüler gönderiler"
                  active={isActive({ type: 'near' })}
                  onPress={() => select({ type: 'near' })}
                  highlight
                />
                <Text variant="footnote" color={colors.textSecondary} style={styles.sectionLabel}>
                  ŞEHİRLER
                </Text>
              </>
            )}
          </>
        }
        ListEmptyComponent={
          areas.isPending ? <LoadingView /> : areas.isError ? <ErrorView onRetry={() => areas.refetch()} /> : null
        }
        renderItem={({ item }) => (
          <AreaRow
            icon="building.2"
            title={item.name}
            subtitle={`${item.districts.length} ilçe · ${item.postCount} gönderi`}
            active={feedArea.type === 'area' && feedArea.city === item.name}
            chevron
            onPress={() => {
              haptics.select();
              setCity(item.name);
              setQuery('');
            }}
          />
        )}
      />
    </View>
  );
}

function AreaRow({
  icon,
  title,
  subtitle,
  active,
  chevron,
  highlight,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  subtitle: string;
  active: boolean;
  chevron?: boolean;
  highlight?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} haptic={false} style={styles.row}>
      <View style={[styles.icon, highlight && styles.iconHighlight]}>
        <SymbolView name={icon} tintColor={highlight ? colors.onPrimary : colors.primary} size={18} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {active && <SymbolView name="checkmark" tintColor={colors.primary} size={16} weight="bold" />}
      {chevron && <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} />}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  search: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionLabel: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconHighlight: {
    backgroundColor: colors.primary,
  },
});
