import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { PlaceRowsSkeleton } from '@/components/skeleton';
import { Button, Divider, ErrorView, SearchField, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useNearbyPlaceSearch } from '@/hooks/queries';
import { requestPlaceChoice } from '@/lib/place-choice';
import type { Place } from '@/types';

type ListProps = {
  query: string;
  onSelect: (place: Place) => void;
  /** Satırın sağındaki öğe; verilmezse ok gösterilir */
  trailing?: (place: Place) => ReactNode;
  /** Sonuçlardan çıkarılacak mekânlar (ör. zaten puanlananlar) */
  exclude?: (place: Place) => boolean;
  header?: React.ReactElement;
};

/** Yeni mekân ekleme; eklenen (ya da "Bunlardan biri mi?" ile seçilen) mekân doğrudan seçilir */
const openAddPlace = (name: string, onSelect: (place: Place) => void) =>
  router.push({ pathname: '/mekan-ekle', params: { ad: name, istek: requestPlaceChoice(onSelect) } });

/**
 * Mekân arama sonuçları. Boş aramada yakındaki mekânlar listelenir.
 * Aranan yer yoksa kullanıcı yeni mekân ekleyebilir.
 */
export function PlaceSearchList({ query, onSelect, trailing, exclude, header }: ListProps) {
  const { t } = useTranslation();
  const search = useNearbyPlaceSearch(query);
  const results = (search.data ?? []).filter((p) => !exclude?.(p));
  const q = query.trim();

  return (
    <FlatList
      data={results}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
      ListEmptyComponent={
        search.isPending ? (
          <PlaceRowsSkeleton />
        ) : search.isError ? (
          <ErrorView onRetry={() => search.refetch()} />
        ) : (
          <View style={styles.empty}>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {q ? t('picker.notFound', { query: q }) : t('picker.noneNearby')}
            </Text>
            <Button title={t('common.addPlace')} icon="plus" variant="secondary" onPress={() => openAddPlace(q, onSelect)} />
          </View>
        )
      }
      ListFooterComponent={
        results.length > 0 && q ? (
          <Button
            title={t('picker.notListed')}
            variant="ghost"
            onPress={() => openAddPlace(q, onSelect)}
            style={styles.footer}
          />
        ) : null
      }
      renderItem={({ item }) => (
        <PlaceRow
          place={item}
          onPress={() => onSelect(item)}
          trailing={
            trailing ? trailing(item) : <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} />
          }
        />
      )}
    />
  );
}

/** Arama kutusuyla birlikte tam ekran mekân seçici */
export function PlacePicker({
  title,
  onSelect,
  initialQuery,
}: {
  title: string;
  onSelect: (place: Place) => void;
  /** Arama kutusunu önceden doldurur (ör. paylaşılan Reels'teki mekân adı); o zaman klavye açılmaz, sonuçlar görünür */
  initialQuery?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery ?? '');
  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text variant="subhead" color={colors.textSecondary}>
          {title}
        </Text>
        <SearchField value={query} onChangeText={setQuery} placeholder={t('picker.searchPlaceholder')} autoFocus={!initialQuery} />
      </View>
      <PlaceSearchList query={query} onSelect={onSelect} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchWrap: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  empty: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    margin: spacing.lg,
  },
});
