import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { PlaceRow } from '@/components/place-row';
import { Button, Divider, ScoreBadge, SearchField } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { searchPlaces } from '@/data/mock';
import { useAppStore } from '@/store/app-store';

const TARGET = 3;

/** 4. Son 3 deneyimini puanla */
export default function FirstRatingsScreen() {
  const { scored, scoreOf } = useAppStore();
  const [query, setQuery] = useState('');

  // Puanlananlar üstte, sonra arama sonuçları
  const results = useMemo(() => {
    const found = searchPlaces(query);
    const rated = found.filter((p) => scoreOf(p.id) !== undefined);
    const rest = found.filter((p) => scoreOf(p.id) === undefined);
    return [...rated, ...rest];
  }, [query, scoreOf]);

  const count = scored.length;
  const done = count >= TARGET;

  return (
    <OnboardingStep
      step={3}
      title="Son gittiğin yerler"
      subtitle="En son yemek yediğin 3 mekânı bul ve puanla. Sıralaman buradan başlayacak."
      footer={
        <Button
          title={done ? 'Devam' : `Devam (${count}/${TARGET})`}
          disabled={count === 0}
          onPress={() => router.push('/onboarding/arkadaslar')}
        />
      }>
      <View style={styles.search}>
        <SearchField value={query} onChangeText={setQuery} placeholder="Mekân, semt veya mutfak ara" />
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
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  search: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
