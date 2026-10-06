import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { useFavoritePlaces } from '@/hooks/use-favorite-places';
import { currentLanguage } from '@/i18n';
import { FAVORITES_MAX } from '@/lib/favorites';
import type { ScoredPlace } from '@/lib/insights';
import { possessive } from '@/lib/possessive';

const openEditor = () => router.push('/favoriler');
const shareStory = () => router.push({ pathname: '/hikaye', params: { tur: 'favorites' } });
const openPlace = (id: string) => router.push({ pathname: '/mekan/[id]', params: { id } });

/**
 * Profildeki Favori 4 (Letterboxd'daki "Favorite Films" gibi): yan yana dört afiş.
 * Kendi profilinde boş yuvalar "+" ile seçime götürür; başkasının profilinde seçim yoksa hiç görünmez.
 */
export function FavoritePlaces({ userId, name, mine }: { userId: string; name: string; mine?: boolean }) {
  const { t } = useTranslation();
  const { items, loading } = useFavoritePlaces(userId);
  if (loading || (!mine && items.length === 0)) return null;

  const firstName = name.split(' ')[0] || name;
  const empty = FAVORITES_MAX - items.length;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text variant="title3">
          {mine ? t('favorites.mine') : t('favorites.theirs', { name: possessive(firstName, currentLanguage()) })}
        </Text>
        {mine && items.length > 0 && (
          <View style={styles.actions}>
            <PressableScale onPress={openEditor} hitSlop={hitSlop}>
              <Text variant="subhead" color={colors.primary} style={styles.bold}>
                {t('favorites.edit')}
              </Text>
            </PressableScale>
            <PressableScale onPress={shareStory} hitSlop={hitSlop} accessibilityLabel={t('favorites.share')}>
              <SymbolView name="square.and.arrow.up" tintColor={colors.primary} size={18} weight="semibold" />
            </PressableScale>
          </View>
        )}
      </View>
      <View style={styles.row}>
        {items.map((item, i) => (
          <FavoriteTile key={item.place.id} item={item} rank={i + 1} onLongPress={mine ? openEditor : undefined} />
        ))}
        {mine &&
          Array.from({ length: empty }, (_, i) => (
            <PressableScale
              key={`empty-${i}`}
              onPress={openEditor}
              scaleTo={0.96}
              style={styles.slot}
              accessibilityRole="button"
              accessibilityLabel={t('favorites.add')}>
              <View style={[styles.poster, styles.emptyPoster]}>
                <SymbolView name="plus" tintColor={colors.textTertiary} size={20} weight="semibold" />
              </View>
            </PressableScale>
          ))}
        {/* Başkasının profilinde 4'ten az favori: afişler büyümesin, 4'lü düzendeki boyutta sola dizilsin */}
        {!mine && Array.from({ length: empty }, (_, i) => <View key={`spacer-${i}`} style={styles.slot} />)}
      </View>
      {mine && items.length === 0 && (
        <Text variant="footnote" color={colors.textSecondary} style={styles.hint}>
          {t('favorites.emptyHint')}
        </Text>
      )}
    </View>
  );
}

/** Afiş: fotoğraf, köşede puan, altında ad */
export function FavoriteTile({
  item,
  rank,
  onPress,
  onLongPress,
}: {
  item: ScoredPlace;
  rank: number;
  /** Verilmezse mekân açılır */
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const { place, score } = item;
  return (
    <PressableScale
      onPress={onPress ?? (() => openPlace(place.id))}
      onLongPress={onLongPress}
      scaleTo={0.96}
      style={styles.slot}
      accessibilityRole="button"
      accessibilityLabel={`${rank}. ${place.name}`}>
      <View style={styles.poster}>
        <PlaceImage uri={place.photoUrl} placeholder={place.thumbUrl} style={StyleSheet.absoluteFill} />
        <View style={styles.badge}>
          <ScoreBadge score={score} size="sm" />
        </View>
      </View>
      <Text variant="caption" numberOfLines={2} style={styles.name}>
        {place.name}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  slot: {
    flex: 1,
    gap: spacing.xs,
  },
  poster: {
    aspectRatio: 3 / 4,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  emptyPoster: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  badge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
  },
  name: {
    fontWeight: '600',
  },
  hint: {
    paddingHorizontal: spacing.lg,
  },
});
