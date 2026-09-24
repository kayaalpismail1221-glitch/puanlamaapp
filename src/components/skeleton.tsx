import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type DimensionValue, ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '@/constants/theme';

/**
 * Yükleniyor iskeletleri: içerik gelmeden önce ekranın gerçek düzeni gri bloklarla gösterilir,
 * veri gelince yerini birebir aynı ölçüdeki satırlara bırakır (zıplama olmaz).
 * Bir iskeletin tüm parçaları birlikte, yumuşakça nefes alır; "Hareketi azalt" açıksa sabit durur.
 */
export function Skeleton({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [opacity, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[animated, style]}
      pointerEvents="none"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}>
      {children}
    </Animated.View>
  );
}

/** Tek bir gri blok */
export function Bone({
  width = '100%',
  height = 14,
  round,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  /** Tam yuvarlak (avatar) ya da verilen köşe yarıçapı */
  round?: boolean | number;
  style?: ViewStyle;
}) {
  const borderRadius = round === true ? radius.full : typeof round === 'number' ? round : 6;
  return <View style={[{ width, height, borderRadius, backgroundColor: colors.surface }, style]} />;
}

/** Satırlara az da olsa farklı uzunluk vermek için (hepsi aynı olunca yapay duruyor) */
const widths: DimensionValue[] = ['62%', '48%', '71%', '55%', '66%', '44%'];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/* ---------- Listeler ---------- */

/** Kişi satırları (UserRow ile aynı ölçü: 44'lük avatar, sağda takip butonu) */
export function UserRowsSkeleton({ count = 6, rank, action = true }: { count?: number; rank?: boolean; action?: boolean }) {
  return (
    <Skeleton>
      {range(count).map((i) => (
        <View key={i} style={styles.row}>
          {rank && <Bone width={20} height={14} />}
          <Bone width={44} height={44} round />
          <View style={styles.lines}>
            <Bone width={widths[i % widths.length]} height={16} />
            <Bone width="34%" height={12} />
          </View>
          {action && <Bone width={84} height={36} round={radius.button} />}
        </View>
      ))}
    </Skeleton>
  );
}

/** Mekân satırları (PlaceRow ile aynı ölçü: 52'lik küçük görsel, sağda puan rozeti) */
export function PlaceRowsSkeleton({ count = 6, thumb = 52 }: { count?: number; thumb?: number }) {
  return (
    <Skeleton>
      {range(count).map((i) => (
        <View key={i} style={styles.row}>
          <Bone width={thumb} height={thumb} round={radius.button} />
          <View style={styles.lines}>
            <Bone width={widths[i % widths.length]} height={16} />
            <Bone width="40%" height={12} />
          </View>
          <Bone width={36} height={36} round />
        </View>
      ))}
    </Skeleton>
  );
}

/** Yalnızca metin satırları (şehir/ilçe listesi gibi) */
export function TextRowsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Skeleton>
      {range(count).map((i) => (
        <View key={i} style={[styles.row, styles.textRow]}>
          <Bone width={24} height={24} round />
          <Bone width={widths[i % widths.length]} height={16} />
        </View>
      ))}
    </Skeleton>
  );
}

/** Yorumlar */
export function CommentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Skeleton>
      {range(count).map((i) => (
        <View key={i} style={[styles.row, styles.top]}>
          <Bone width={32} height={32} round />
          <View style={styles.lines}>
            <Bone width="30%" height={13} />
            <Bone width={widths[(i + 2) % widths.length]} height={13} />
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

/* ---------- Gönderiler ---------- */

/** Feed kartları (PostCard ile aynı düzen: başlık, 4:5 fotoğraf, eylemler, yorum) */
export function PostCardsSkeleton({ count = 2 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const photoWidth = width - spacing.lg * 2;
  return (
    <Skeleton>
      {range(count).map((i) => (
        <View key={i} style={styles.card}>
          <View style={styles.cardHeader}>
            <Bone width={40} height={40} round />
            <View style={styles.lines}>
              <Bone width="45%" height={15} />
              <Bone width="30%" height={12} />
            </View>
            <Bone width={36} height={36} round />
          </View>
          <Bone width={photoWidth} height={photoWidth * 1.25} round={radius.card} style={styles.inset} />
          <View style={[styles.cardHeader, styles.actions]}>
            <Bone width={48} height={20} />
            <Bone width={48} height={20} />
            <Bone width={24} height={20} />
          </View>
          <View style={[styles.lines, styles.inset]}>
            <Bone width="88%" height={13} />
            <Bone width="60%" height={13} />
          </View>
        </View>
      ))}
    </Skeleton>
  );
}

/** 3 sütunlu gönderi ızgarası (PostGrid ile aynı hücre ölçüsü) */
export function PostGridSkeleton({ count = 9 }: { count?: number }) {
  const { width } = useWindowDimensions();
  const size = Math.floor((width - 2 * 2) / 3);
  return (
    <Skeleton style={styles.grid}>
      {range(count).map((i) => (
        <Bone key={i} width={size} height={size * 1.25} round={0} />
      ))}
    </Skeleton>
  );
}

/* ---------- Tam ekranlar ---------- */

/** Tam ekran iskelet zemini; başlık çubuğunun altından başlar (asıl ekranın ScrollView'i gibi) */
export function SkeletonScreen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" scrollEnabled={false}>
      {children}
    </ScrollView>
  );
}

/** Başka birinin profili: kimlik, sayaçlar, butonlar ve gönderi ızgarası */
export function ProfileSkeleton() {
  return (
    <SkeletonScreen>
      <Skeleton style={styles.profile}>
        <Bone width={96} height={96} round />
        <Bone width={160} height={22} />
        <Bone width={120} height={14} />
        <View style={styles.stats}>
          {range(3).map((i) => (
            <View key={i} style={styles.stat}>
              <Bone width={36} height={20} />
              <Bone width={56} height={12} />
            </View>
          ))}
        </View>
        <View style={styles.buttons}>
          <Bone width="48%" height={44} round={radius.button} />
          <Bone width="48%" height={44} round={radius.button} />
        </View>
      </Skeleton>
      <PostGridSkeleton count={6} />
    </SkeletonScreen>
  );
}

/** Mekân sayfası: büyük görsel (başlığın altına uzanır), ad, bilgi satırları ve gönderi ızgarası */
export function PlaceDetailSkeleton() {
  return (
    <View style={styles.screen}>
      <Skeleton>
        <Bone height={320} round={0} />
        <View style={styles.body}>
          <Bone width="70%" height={28} />
          <Bone width="45%" height={14} />
          <View style={styles.buttons}>
            <Bone width="48%" height={44} round={radius.button} />
            <Bone width="48%" height={44} round={radius.button} />
          </View>
          <Bone width="35%" height={18} style={styles.section} />
        </View>
      </Skeleton>
      <PostGridSkeleton count={6} />
    </View>
  );
}

/** Harita + mekân listesi (gittiği yerler) */
export function MapListSkeleton({ mapHeight }: { mapHeight: number }) {
  return (
    <SkeletonScreen>
      <Skeleton style={styles.body}>
        <Bone width="60%" height={14} />
        <Bone height={mapHeight} round={radius.card} />
      </Skeleton>
      <PlaceRowsSkeleton count={4} />
    </SkeletonScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  textRow: {
    paddingVertical: spacing.md + 2,
  },
  top: {
    alignItems: 'flex-start',
  },
  lines: {
    flex: 1,
    gap: spacing.sm,
  },
  card: {
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  actions: {
    gap: spacing.xl,
  },
  inset: {
    marginHorizontal: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  profile: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  stat: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: spacing.lg,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
  },
});
