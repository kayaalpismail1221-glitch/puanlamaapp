import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, Alert, Linking, Platform, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import type { FriendScore } from '@/api/content';
import { PlaceImage, PressableScale, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, hitSlop, onScoreColor, radius, scoreColor, spacing } from '@/constants/theme';
import { formatScore, timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { linkSource } from '@/lib/links';
import { useAppStore } from '@/store/app-store';
import type { Place, SavedPlace } from '@/types';

const ACTION_WIDTH = 80;

/**
 * Listem kartı: sola kaydır → Gittim / Sil. Uzun bas veya … → tüm seçenekler.
 * `friends`: takip edilenlerin bu mekâna verdiği ortalama puan (liste tek sorguda çeker).
 */
export function SavedPlaceCard({ entry, place, friends }: { entry: SavedPlace; place: Place; friends?: FriendScore }) {
  const { actions } = useAppStore();
  const { t } = useTranslation();
  const swipeRef = useRef<SwipeableMethods>(null);
  const source = entry.link ? linkSource(entry.link) : null;

  const openPlace = () => router.push({ pathname: '/mekan/[id]', params: { id: place.id } });
  const rate = () => {
    swipeRef.current?.close();
    router.push({ pathname: '/degerlendir/[id]', params: { id: place.id } });
  };
  const openLink = () => {
    if (entry.link) Linking.openURL(entry.link).catch(() => Alert.alert(t('failures.linkOpen')));
  };
  const edit = () =>
    router.push({ pathname: '/listeye-ekle', params: { placeId: place.id, kaynak: entry.origin } });
  const remove = () => {
    haptics.warning();
    actions.unsavePlace(place.id);
  };

  const showActions = () => {
    haptics.tap();
    const actions: { label: string; run: () => void; destructive?: boolean }[] = [
      { label: t('saved.beenRate'), run: rate },
      ...(source ? [{ label: t('place.openSource', { source: source.label }), run: openLink }] : []),
      { label: entry.origin === 'social' ? t('saved.editLinkNote') : t('saved.editNote'), run: edit },
      { label: t('common.removeFromList'), run: remove, destructive: true },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: place.name,
          options: [...actions.map((a) => a.label), t('common.cancel')],
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
          cancelButtonIndex: actions.length,
          tintColor: colors.primary,
        },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert(place.name, undefined, [
        ...actions.map((a) => ({ text: a.label, onPress: a.run, style: a.destructive ? ('destructive' as const) : undefined })),
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
  };

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableWillOpen={() => haptics.select()}
      renderRightActions={() => (
        <View style={styles.actions}>
          <SwipeAction icon="checkmark.circle.fill" label={t('saved.been')} color={colors.primary} onPress={rate} />
          <SwipeAction icon="trash.fill" label={t('common.delete')} color={colors.danger} onPress={remove} />
        </View>
      )}>
      <PressableScale scaleTo={0.98} haptic={false} onPress={openPlace} onLongPress={showActions} style={styles.card}>
        <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.image} />

        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text variant="headline" numberOfLines={1} style={{ flex: 1 }}>
              {place.name}
            </Text>
            <PressableScale onPress={showActions} haptic={false} hitSlop={hitSlop} accessibilityLabel={t('moderation.options')}>
              <SymbolView name="ellipsis" tintColor={colors.textSecondary} size={16} />
            </PressableScale>
          </View>

          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
            {cuisineLabel(place.cuisine)} · {place.neighborhood}
          </Text>

          {entry.note && (
            <Text variant="subhead" numberOfLines={2} style={styles.note}>
              “{entry.note}”
            </Text>
          )}

          <View style={styles.meta}>
            {source && (
              <PressableScale onPress={openLink} haptic={false} hitSlop={hitSlop} style={styles.chip}>
                <SymbolView name={source.icon} tintColor={colors.primary} size={12} />
                <Text variant="caption" color={colors.primary}>
                  {source.label}
                </Text>
                <SymbolView name="arrow.up.right" tintColor={colors.primary} size={9} weight="bold" />
              </PressableScale>
            )}
            {friends && (
              <View style={[styles.chip, { backgroundColor: scoreColor(friends.average) }]}>
                <SymbolView name="person.2.fill" tintColor={onScoreColor(friends.average)} size={11} />
                <Text variant="caption" color={onScoreColor(friends.average)} style={{ fontVariant: ['tabular-nums'] }}>
                  {formatScore(friends.average)}
                </Text>
              </View>
            )}
            <Text variant="caption" color={colors.textTertiary}>
              {timeAgo(entry.savedAt)}
            </Text>
          </View>
        </View>
      </PressableScale>
    </ReanimatedSwipeable>
  );
}

function SwipeAction({
  icon,
  label,
  color,
  onPress,
}: {
  icon: SFSymbol;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} style={[styles.action, { backgroundColor: color }]} accessibilityLabel={label}>
      <SymbolView name={icon} tintColor={colors.onPrimary} size={22} />
      <Text variant="caption" color={colors.onPrimary}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  image: {
    width: 88,
    height: 88,
    borderRadius: radius.button,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  note: {
    marginTop: spacing.xs,
    color: colors.text,
    fontStyle: 'italic',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 22,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  actions: {
    flexDirection: 'row',
  },
  action: {
    width: ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
