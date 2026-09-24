import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Button, Divider, ErrorView, SearchField, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useNearbyPlaceSearch } from '@/hooks/queries';
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

const openAddPlace = (name: string) => router.push({ pathname: '/mekan-ekle', params: { ad: name } });

/**
 * Mekân arama sonuçları. Boş aramada yakındaki mekânlar listelenir.
 * Aranan yer yoksa kullanıcı yeni mekân ekleyebilir.
 */
export function PlaceSearchList({ query, onSelect, trailing, exclude, header }: ListProps) {
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
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : search.isError ? (
          <ErrorView onRetry={() => search.refetch()} />
        ) : (
          <View style={styles.empty}>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {q ? `“${q}” bulunamadı.` : 'Yakında henüz kayıtlı mekân yok.'}
            </Text>
            <Button title="Yeni mekân ekle" icon="plus" variant="secondary" onPress={() => openAddPlace(q)} />
          </View>
        )
      }
      ListFooterComponent={
        results.length > 0 && q ? (
          <Button
            title="Aradığın yer yok mu? Ekle"
            variant="ghost"
            onPress={() => openAddPlace(q)}
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
export function PlacePicker({ title, onSelect }: { title: string; onSelect: (place: Place) => void }) {
  const [query, setQuery] = useState('');
  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <Text variant="subhead" color={colors.textSecondary}>
          {title}
        </Text>
        <SearchField value={query} onChangeText={setQuery} placeholder="Mekân, semt veya mutfak ara" autoFocus />
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
  loading: {
    padding: spacing.xxl,
  },
  empty: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    margin: spacing.lg,
  },
});
