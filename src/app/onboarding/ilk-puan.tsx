import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { OnboardingStep } from '@/components/onboarding-step';
import { PlaceSearchList } from '@/components/place-picker';
import { Button, PlaceImage, ScoreBadge, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { usePlace } from '@/data/entities';
import { useUserPosts } from '@/hooks/queries';
import { useAppStore } from '@/store/app-store';

// Puanlayınca doğrudan gönderi ekranı açılır (fotoğraf isteğe bağlı)
const rate = (id: string) => router.push({ pathname: '/degerlendir/[id]', params: { id, sonra: 'gonderi' } });

/** 5. En son gidilen restoranı puanla */
export default function FirstRatingStep() {
  const { scored, scoreOf, userId } = useAppStore();
  const [query, setQuery] = useState('');
  const myPosts = useUserPosts(userId);

  const first = scored[0];
  const firstPlace = usePlace(first?.placeId) ?? undefined;
  const posted = !!firstPlace && !!myPosts.data?.some((p) => p.placeId === firstPlace.id);

  return (
    <OnboardingStep
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
                  {posted ? 'İlk gönderin paylaşıldı' : 'İlk puanın kaydedildi'}
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
          {!posted && (
            <View style={styles.postLink}>
              <Button
                title="Gönderi olarak paylaş"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/gonderi-olustur', params: { placeId: firstPlace.id, akis: 'onboarding' } })
                }
              />
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.search}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Restoran, semt veya mutfak ara" />
          </View>
          <PlaceSearchList
            query={query}
            exclude={(p) => scoreOf(p.id) !== undefined}
            onSelect={(p) => rate(p.id)}
            trailing={() => <SymbolView name="plus.circle" tintColor={colors.primary} size={26} />}
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
  postLink: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
});
