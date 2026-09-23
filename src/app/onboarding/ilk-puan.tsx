import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { OnboardingStep } from '@/components/onboarding-step';
import { PlaceRow } from '@/components/place-row';
import { Button, Divider, PlaceImage, ScoreBadge, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { placeById, searchPlaces } from '@/data/mock';
import { useAppStore } from '@/store/app-store';

const rate = (id: string) => router.push({ pathname: '/degerlendir/[id]', params: { id } });

/** 5. En son gidilen restoranı puanla */
export default function FirstRatingStep() {
  const { scored, scoreOf } = useAppStore();
  const [query, setQuery] = useState('');

  const first = scored[0];
  const firstPlace = first ? placeById(first.placeId) : undefined;
  const results = useMemo(() => searchPlaces(query).filter((p) => scoreOf(p.id) === undefined), [query, scoreOf]);

  return (
    <OnboardingStep
      step={5}
      icon="fork.knife"
      title="En son nerede yedin?"
      subtitle="Gittiğin son restoranı bul ve puanla. Sıralaman buradan başlıyor."
      footer={<Button title="Devam" disabled={!firstPlace} onPress={() => router.push('/onboarding/takip')} />}>
      {firstPlace && first ? (
        <>
          <Animated.View entering={FadeInDown.springify()} style={styles.rated}>
            <PlaceImage uri={firstPlace.photoUrl} style={styles.ratedImage} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.ratedLabel}>
                <SymbolView name="checkmark.circle.fill" tintColor={colors.primary} size={14} />
                <Text variant="caption" color={colors.primary} style={styles.bold}>
                  İlk puanın kaydedildi
                </Text>
              </View>
              <Text variant="headline" numberOfLines={1}>
                {firstPlace.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary}>
                {firstPlace.cuisine} · {firstPlace.neighborhood}
              </Text>
            </View>
            <ScoreBadge score={first.score} />
          </Animated.View>
          <Text variant="subhead" color={colors.textSecondary} style={styles.note}>
            Harika! Bundan sonra gittiğin her yeri puanladıkça Puanla onları senin için sıralayacak.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.search}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Restoran, semt veya mutfak ara" />
          </View>
          <FlatList
            data={results}
            keyExtractor={(p) => p.id}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
            renderItem={({ item }) => (
              <PlaceRow
                place={item}
                onPress={() => rate(item.id)}
                trailing={<SymbolView name="plus.circle" tintColor={colors.primary} size={26} />}
              />
            )}
          />
        </>
      )}
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  search: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  rated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratedImage: {
    width: 64,
    height: 64,
    borderRadius: radius.button,
  },
  ratedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bold: {
    fontWeight: '600',
  },
  note: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
});
