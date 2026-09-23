import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Divider, SearchField, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { searchPlaces } from '@/data/mock';
import type { Place } from '@/types';

/** Mekân arayıp seçme listesi */
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
      <FlatList
        data={searchPlaces(query)}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
        ListEmptyComponent={
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            Bulamadık. Mekân veritabanı bağlanınca her yer aranabilecek.
          </Text>
        }
        renderItem={({ item }) => (
          <PlaceRow
            place={item}
            onPress={() => onSelect(item)}
            trailing={<SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} />}
          />
        )}
      />
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
  },
});
