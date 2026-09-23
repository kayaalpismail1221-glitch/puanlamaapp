import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { PlaceRow } from '@/components/place-row';
import { Divider, ScoreBadge, SearchField } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { searchPlaces } from '@/data/mock';
import { useAppStore } from '@/store/app-store';

/** Puanlamak için mekân arama */
export default function SearchScreen() {
  const { scoreOf } = useAppStore();
  const [query, setQuery] = useState('');
  const results = searchPlaces(query);

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Mekân, semt veya mutfak ara" autoFocus />
      </View>
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
        renderItem={({ item }) => {
          const score = scoreOf(item.id);
          return (
            <PlaceRow
              place={item}
              onPress={() => router.push({ pathname: '/degerlendir/[id]', params: { id: item.id } })}
              trailing={
                score !== undefined ? (
                  <ScoreBadge score={score} size="sm" />
                ) : (
                  <SymbolView name="plus.circle" tintColor={colors.primary} size={26} />
                )
              }
            />
          );
        }}
      />
    </View>
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
});
