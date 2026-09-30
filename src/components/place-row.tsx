import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { HighlightText } from '@/components/highlight-text';
import { PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import type { Place } from '@/types';
import { placeSubtitle } from '@/lib/place';

type Props = {
  place: Place;
  onPress?: () => void;
  /** Sol başta sıra numarası (profil listesi için) */
  rank?: number;
  /** Sağ tarafta gösterilecek öğe (puan rozeti, ok vb.) */
  trailing?: ReactNode;
  /** Aramada yazılan: adın eşleşen kısmı vurgulanır */
  highlight?: string;
};

export function PlaceRow({ place, onPress, rank, trailing, highlight }: Props) {
  useTranslation(); // dil değişince mutfak adı güncellensin
  return (
    <PressableScale onPress={onPress} scaleTo={0.98} style={styles.row}>
      {rank !== undefined && (
        <Text variant="subhead" color={colors.textSecondary} style={styles.rank}>
          {rank}
        </Text>
      )}
      <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.thumb} />
      <View style={styles.info}>
        <HighlightText variant="headline" numberOfLines={1} text={place.name} query={highlight} />
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {placeSubtitle(place)}
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
