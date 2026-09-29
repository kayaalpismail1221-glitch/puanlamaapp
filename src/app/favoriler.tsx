import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { FavoriteTile } from '@/components/favorite-places';
import { Button, Divider, PlaceImage, PressableScale, ScoreBadge, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { getPlace, useEntitiesVersion } from '@/data/entities';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { showAlert } from '@/lib/dialog';
import { FAVORITES_MAX, resolveFavorites, toggleFavorite } from '@/lib/favorites';
import { trFold } from '@/lib/fold';
import { haptics } from '@/lib/haptics';
import type { ScoredPlace } from '@/lib/insights';
import { placeSubtitle } from '@/lib/place';
import { useAppStore, useScored } from '@/store/app-store';

/**
 * Favori 4'ü seçme: üstte dört yuva (dokununca çıkar), altta puanladıkların (yüksekten düşüğe).
 * Sıra seçim sırasıdır. Kaydedince hikâyede paylaşma önerilir.
 */
export default function FavoritesScreen() {
  const { t } = useTranslation();
  const { profile, actions } = useAppStore();
  const scored = useScored();
  const version = useEntitiesVersion();
  const footerStyle = useKeyboardFooterStyle();

  const candidates = useMemo<ScoredPlace[]>(
    () =>
      scored.flatMap((e) => {
        const place = getPlace(e.placeId);
        return place ? [{ place, score: e.score }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scored, version],
  );

  // Puanı silinmiş eski seçimler düşer; yuva boşalır
  const initial = useMemo(
    () => resolveFavorites(profile?.favoritePlaces ?? [], scored, getPlace).map((f) => f.place.id),
    // Yalnızca açılıştaki seçim
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [ids, setIds] = useState<string[]>(initial);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const picked = useMemo(() => resolveFavorites(ids, scored, getPlace), [ids, scored]);
  const visible = useMemo(() => {
    const q = trFold(query.trim());
    return q ? candidates.filter((c) => trFold(c.place.name).includes(q)) : candidates;
  }, [candidates, query]);
  // Kayıttakinden farklıysa (puanı silinmiş eski seçimin düşmesi de değişikliktir)
  const changed = ids.join() !== (profile?.favoritePlaces ?? []).join();

  const toggle = (placeId: string) => {
    const next = toggleFavorite(ids, placeId);
    if (!next) {
      haptics.warning();
      showAlert(t('favorites.full', { max: FAVORITES_MAX }));
      return;
    }
    haptics.select();
    setIds(next);
  };

  const save = async () => {
    setSaving(true);
    const ok = await actions.updateProfile({ favoritePlaces: ids });
    setSaving(false);
    if (!ok) return;
    haptics.success();
    if (!ids.length) {
      router.back();
      return;
    }
    // Viral döngü: seçim hazırken hikâyede paylaşma
    showAlert(t('favorites.savedTitle'), t('favorites.savedText'), [
      { text: t('story.later'), style: 'cancel', onPress: () => router.back() },
      {
        text: t('story.shareToStory'),
        onPress: () => router.replace({ pathname: '/hikaye', params: { tur: 'favorites' } }),
      },
    ]);
  };

  if (candidates.length === 0) {
    return (
      <View style={[styles.container, styles.empty]}>
        <SymbolView name="star.square.on.square" tintColor={colors.textTertiary} size={40} />
        <Text variant="headline" align="center">
          {t('favorites.noRanked')}
        </Text>
        <Button title={t('favorites.ratePlace')} icon="plus" onPress={() => router.replace('/mekan-puanla')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={visible}
        keyExtractor={(c) => c.place.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 24 + spacing.md} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="footnote" color={colors.textSecondary} style={styles.intro}>
              {t('favorites.intro')}
            </Text>
            <View style={styles.slots}>
              {Array.from({ length: FAVORITES_MAX }, (_, i) => {
                const item = picked[i];
                return item ? (
                  <FavoriteTile key={item.place.id} item={item} rank={i + 1} onPress={() => toggle(item.place.id)} />
                ) : (
                  <View key={`empty-${i}`} style={styles.slot}>
                    <View style={styles.emptySlot}>
                      <Text variant="title3" color={colors.textTertiary}>
                        {i + 1}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
            {picked.length > 0 && (
              <Text variant="caption" color={colors.textTertiary} style={styles.intro}>
                {t('favorites.tapToRemove')}
              </Text>
            )}
            <View style={styles.search}>
              <SearchField value={query} onChangeText={setQuery} placeholder={t('favorites.search')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.noMatch}>
            {t('favorites.noMatch')}
          </Text>
        }
        renderItem={({ item }) => {
          const position = ids.indexOf(item.place.id);
          return <CandidateRow item={item} position={position} onPress={() => toggle(item.place.id)} />;
        }}
      />
      <Animated.View style={[styles.footer, footerStyle]}>
        <Button title={t('favorites.save')} onPress={save} disabled={!changed} loading={saving} />
      </Animated.View>
    </View>
  );
}

/** Seçiliyse sıra numarası, değilse boş daire */
function CandidateRow({ item, position, onPress }: { item: ScoredPlace; position: number; onPress: () => void }) {
  const { place, score } = item;
  const selected = position >= 0;
  return (
    <PressableScale
      onPress={onPress}
      haptic={false}
      scaleTo={0.98}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}>
      {selected ? (
        <View style={styles.number}>
          <Text variant="footnote" color={colors.onPrimary} style={styles.bold}>
            {position + 1}
          </Text>
        </View>
      ) : (
        <SymbolView name="circle" tintColor={colors.textTertiary} size={24} />
      )}
      <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.thumb} />
      <View style={styles.info}>
        <Text variant="headline" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {placeSubtitle(place)}
        </Text>
      </View>
      <ScoreBadge score={score} size="sm" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xxl,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  intro: {
    paddingHorizontal: spacing.lg,
  },
  slots: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  slot: {
    flex: 1,
  },
  emptySlot: {
    aspectRatio: 3 / 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  search: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  noMatch: {
    padding: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  number: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  bold: {
    fontWeight: '700',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
