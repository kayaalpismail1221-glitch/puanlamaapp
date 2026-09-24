import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { priceLabel } from '@/lib/format';
import type { Place } from '@/types';

type Props = {
  place: Place;
  onPress?: () => void;
  /** Sol başta sıra numarası (profil listesi için) */
  rank?: number;
  /** Sağ tarafta gösterilecek öğe (puan rozeti, ok vb.) */
  trailing?: ReactNode;
};

export function PlaceRow({ place, onPress, rank, trailing }: Props) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.row}>
      {rank !== undefined && (
        <Text variant="subhead" color={colors.textSecondary} style={styles.rank}>
          {rank}
        </Text>
      )}
      <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.thumb} />
      <View style={styles.info}>
        <Text variant="headline" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {place.cuisine} · {place.neighborhood} · {priceLabel(place.priceLevel)}
        </Text>
      </View>
      {trailing}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  rank: {
    width: 24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.button,
  },
  info: {
    flex: 1,
    gap: 2,
  },
});
