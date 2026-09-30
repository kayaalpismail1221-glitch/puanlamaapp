import { router, Stack } from 'expo-router';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BottomInsetSpacer } from '@/components/bottom-inset';
import { HeaderIconButton, ModalCloseButton } from '@/components/header-button';
import { TextRowsSkeleton } from '@/components/skeleton';
import { Divider, ErrorView, PressableScale, SearchField, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useAndroidBack } from '@/hooks/use-android-back';
import { useAreas } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import type { FeedArea } from '@/types';

/** Feed bölgesi seç: Yakınımda, bir şehir ya da şehrin bir ilçesi */
export default function PickAreaScreen() {
  const { feedArea, actions } = useAppStore();
  const { t } = useTranslation();
  const areas = useAreas();
  const [city, setCity] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const allCities = useMemo(() => areas.data ?? [], [areas.data]);

  const select = (area: FeedArea) => {
    haptics.success();
    actions.setFeedArea(area);
    router.back();
  };

  const backToCities = () => {
    setCity(null);
    setQuery('');
  };
  // Android: geri tuşu ilçelerden şehirlere döner, modalı kapatmaz
  useAndroidBack(city ? backToCities : null);

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
            headerLeft:
              Platform.OS === 'android'
                ? () => <HeaderIconButton icon="arrow.left" onPress={backToCities} accessibilityLabel={t('area.cities')} />
                : () => (
                    <PressableScale
                      onPress={backToCities}
                      hitSlop={hitSlop}
                      style={styles.back}
                      accessibilityLabel={t('area.cities')}>
                      <SymbolView name="chevron.left" tintColor={colors.primary} size={17} weight="semibold" />
                      <Text variant="body" color={colors.primary}>
                        {t('area.cities')}
                      </Text>
                    </PressableScale>
                  ),
          }}
        />
        <FlatList
          automaticallyAdjustKeyboardInsets
          ListFooterComponent={<BottomInsetSpacer />}
          data={districts}
          keyExtractor={(d) => d.name}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <Divider inset={spacing.lg + 40 + spacing.md} />}
          ListHeaderComponent={
            <Animated.View entering={FadeIn}>
              <View style={styles.search}>
                <SearchField value={query} onChangeText={setQuery} placeholder={t('area.searchDistrict')} />
              </View>
              <AreaRow
                icon="building.2"
                title={t('area.allOf', { city: selectedCity.name })}
                subtitle={t('area.posts', { count: selectedCity.postCount })}
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
              subtitle={t('area.districtRow', { posts: item.postCount, places: item.placeCount })}
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
      <Stack.Screen
        options={{
          title: t('screens.chooseLocation'),
          // İlçelerden dönünce sol düğme modalın kendi kapatma düğmesine döner
          headerLeft: Platform.OS === 'android' ? () => <ModalCloseButton /> : undefined,
        }}
      />
      <FlatList
        automaticallyAdjustKeyboardInsets
          ListFooterComponent={<BottomInsetSpacer />}
        data={cities}
        keyExtractor={(c) => c.name}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 40 + spacing.md} />}
        ListHeaderComponent={
          <>
            <View style={styles.search}>
              <SearchField value={query} onChangeText={setQuery} placeholder={t('area.searchCityOrDistrict')} />
            </View>
            {!q && (
              <>
                <AreaRow
                  icon="location.fill"
                  title={t('feed.near')}
                  subtitle={t('area.nearSubtitle')}
                  active={isActive({ type: 'near' })}
                  onPress={() => select({ type: 'near' })}
                  highlight
                />
                <Text variant="footnote" color={colors.textSecondary} style={styles.sectionLabel}>
                  {t('area.citiesHeader')}
                </Text>
              </>
            )}
          </>
        }
        ListEmptyComponent={
          areas.isPending ? <TextRowsSkeleton /> : areas.isError ? <ErrorView onRetry={() => areas.refetch()} /> : null
        }
        renderItem={({ item }) => (
          <AreaRow
            icon="building.2"
            title={item.name}
            subtitle={t('area.cityRow', { districts: item.districts.length, posts: item.postCount })}
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
