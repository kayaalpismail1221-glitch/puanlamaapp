import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Avatar, PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { useLeaderboard } from '@/hooks/use-leaderboard';
import { formatScore, monthYear } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import type { Badge, ScoredPlace, TasteSlice } from '@/lib/insights';

/* ---------- Kimlik: avatar, kullanıcı adı, üyelik ---------- */

export function ProfileIdentity({
  name,
  username,
  avatarUri,
  joinedAt,
  onAvatarPress,
}: {
  name: string;
  username: string;
  avatarUri?: string;
  joinedAt?: string;
  onAvatarPress?: () => void;
}) {
  return (
    <View style={styles.identity}>
      <PressableScale onPress={onAvatarPress} disabled={!onAvatarPress} haptic={false}>
        <Avatar uri={avatarUri} name={name} size={96} />
      </PressableScale>
      <Text variant="title2" color={colors.primary} style={styles.name}>
        {name}
      </Text>
      <Text variant="subhead" color={colors.textSecondary}>
        @{username}
        {joinedAt ? ` · Üyelik: ${monthYear(joinedAt)}` : ''}
      </Text>
    </View>
  );
}

/* ---------- Okul rozeti ---------- */

/**
 * Profildeki okul: "🎓 Boğaziçi · Okulunda #2". Dokununca okulun liderlik tablosu açılır.
 * Kendi profilinde okul yoksa "+ Okul ekle" bağlantısı gösterilir.
 */
export function SchoolChip({ userId, schoolId, editable }: { userId: string; schoolId?: string; editable?: boolean }) {
  const school = schoolById(schoolId);
  const board = useLeaderboard('school', 'all', schoolId);
  const entry = board.find((e) => e.userId === userId);

  if (!school) {
    if (!editable) return null;
    return (
      <PressableScale onPress={() => router.push('/okul-sec')} style={styles.addSchool}>
        <SymbolView name="plus" tintColor={colors.primary} size={12} weight="bold" />
        <Text variant="subhead" color={colors.primary} style={styles.bold}>
          Okul ekle
        </Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/siralama', params: { okul: school.id, vurgula: userId } })}
      style={styles.school}
      accessibilityLabel={`${school.name} liderlik tablosu`}>
      <SymbolView name="graduationcap.fill" tintColor={colors.primary} size={14} />
      <Text variant="subhead" style={styles.bold} numberOfLines={1}>
        {schoolLabel(school)}
      </Text>
      {entry && entry.reviews > 0 && (
        <Text variant="subhead" color={colors.textSecondary}>
          · Okulunda #{entry.rank}
        </Text>
      )}
      <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={11} weight="semibold" />
    </PressableScale>
  );
}

/* ---------- Beli tarzı liste satırı ---------- */

export function MenuRow({
  icon,
  title,
  subtitle,
  count,
  locked,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  subtitle?: string;
  count?: number;
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.99} style={styles.menuRow} accessibilityRole="button">
      <SymbolView name={icon} tintColor={colors.text} size={22} style={styles.menuIcon} />
      <View style={{ flex: 1 }}>
        <Text variant="headline">{title}</Text>
        {subtitle && (
          <Text variant="footnote" color={colors.textSecondary}>
            {subtitle}
          </Text>
        )}
      </View>
      {locked ? (
        <SymbolView name="lock.fill" tintColor={colors.textTertiary} size={16} />
      ) : (
        <>
          {count !== undefined && (
            <Text variant="headline" style={styles.menuCount}>
              {count}
            </Text>
          )}
          <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} weight="semibold" />
        </>
      )}
    </PressableScale>
  );
}

/* ---------- Bilgi kartı (Sıralama, Seri) ---------- */

export function StatCard({
  icon,
  title,
  value,
  locked,
  onPress,
}: {
  icon: SFSymbol;
  title: string;
  value?: string;
  locked?: boolean;
  onPress?: () => void;
}) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.97} style={styles.statCard}>
      <SymbolView name={icon} tintColor={colors.primary} size={24} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="footnote" color={colors.textSecondary}>
          {title}
        </Text>
        {locked ? (
          <SymbolView name="lock.fill" tintColor={colors.textSecondary} size={15} style={styles.cardLock} />
        ) : (
          <Text variant="headline" color={colors.primary} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
    </PressableScale>
  );
}

/* ---------- Yıllık hedef ---------- */

const GOAL_PRESETS = [20, 50, 100];

export function GoalCard({
  goal,
  done,
  onChange,
}: {
  goal?: number;
  done: number;
  onChange: (goal: number | undefined) => void;
}) {
  const year = new Date().getFullYear();
  const progress = goal ? Math.min(done / goal, 1) : 0;

  const custom = () => {
    const apply = (text?: string) => {
      const n = Number.parseInt(text ?? '', 10);
      if (n > 0 && n <= 1000) {
        haptics.success();
        onChange(n);
      }
    };
    if (Platform.OS === 'ios') {
      Alert.prompt(`${year} hedefin`, 'Bu yıl kaç yeni mekân denemek istiyorsun?', apply, 'plain-text', '', 'number-pad');
    } else apply('30');
  };

  if (!goal) {
    return (
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="headline">{year} hedefini belirle</Text>
            <Text variant="subhead" color={colors.textSecondary}>
              Bu yıl kaç yeni mekân denemek istiyorsun?
            </Text>
          </View>
          <SymbolView name="trophy.fill" tintColor={colors.primary} size={36} />
        </View>
        <View style={styles.goalChips}>
          {GOAL_PRESETS.map((n) => (
            <PressableScale
              key={n}
              onPress={() => {
                haptics.success();
                onChange(n);
              }}
              haptic={false}
              style={styles.goalChip}>
              <Text variant="subhead" style={styles.bold}>
                {n}
              </Text>
            </PressableScale>
          ))}
          <PressableScale onPress={custom} style={styles.goalChip}>
            <Text variant="subhead" style={styles.bold}>
              Özel
            </Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  return (
    <PressableScale
      scaleTo={0.99}
      onPress={() =>
        Alert.alert(`${year} hedefin`, `${goal} mekân`, [
          { text: 'Hedefi değiştir', onPress: custom },
          { text: 'Hedefi kaldır', style: 'destructive', onPress: () => onChange(undefined) },
          { text: 'Vazgeç', style: 'cancel' },
        ])
      }
      style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="headline">{year} hedefin</Text>
          <Text variant="subhead" color={colors.textSecondary}>
            {done >= goal ? 'Hedefine ulaştın! 🎉' : `${goal - done} mekân kaldı`}
          </Text>
        </View>
        <Text variant="title2" color={colors.primary} style={styles.goalValue}>
          {done}/{goal}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View layout={LinearTransition.springify()} style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </PressableScale>
  );
}

/* ---------- Top 3 vitrini ---------- */

export function TopThree({ items, title }: { items: ScoredPlace[]; title: string }) {
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <Text variant="title3" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.topRow}>
        {items.slice(0, 3).map(({ place, score }, i) => (
          <PressableScale
            key={place.id}
            scaleTo={0.96}
            onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
            style={styles.topCard}>
            <PlaceImage uri={place.photoUrl} style={StyleSheet.absoluteFill} />
            <View style={styles.topShade} />
            <View style={styles.topRank}>
              <Text variant="caption" color={colors.primary} style={styles.heavy}>
                {i + 1}
              </Text>
            </View>
            <View style={styles.topInfo}>
              <Text variant="footnote" color={colors.onPrimary} numberOfLines={2} style={styles.heavy}>
                {place.name}
              </Text>
              <Text variant="caption" color={colors.onPrimary}>
                {formatScore(score)} · {place.district}
              </Text>
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

/* ---------- Damak zevki ---------- */

export function TasteCard({ slices, title }: { slices: TasteSlice[]; title: string }) {
  if (!slices.length) return null;
  return (
    <View style={styles.section}>
      <Text variant="title3" style={styles.sectionTitle}>
        {title}
      </Text>
      <View style={styles.tasteCard}>
        {slices.map((s) => (
          <View key={s.cuisine} style={styles.tasteRow}>
            <View style={styles.tasteLabel}>
              <Text variant="subhead" style={styles.bold} numberOfLines={1}>
                {s.cuisine}
              </Text>
              <Text variant="caption" color={colors.textSecondary}>
                {s.count} mekân · ort. {formatScore(s.average)}
              </Text>
            </View>
            <View style={styles.tasteTrack}>
              <Animated.View
                layout={LinearTransition.springify()}
                style={[styles.tasteFill, { width: `${Math.max(s.share * 100, 6)}%` }]}
              />
            </View>
            <Text variant="footnote" color={colors.primary} style={styles.tastePct}>
              %{Math.round(s.share * 100)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ---------- Rozetler ---------- */

export function BadgeStrip({ badges }: { badges: Badge[] }) {
  const earned = badges.filter((b) => b.earned).length;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title3">Rozetler</Text>
        <Text variant="subhead" color={colors.textSecondary}>
          {earned}/{badges.length}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgeRow}>
        {badges.map((b) => (
          <PressableScale
            key={b.id}
            scaleTo={0.95}
            onPress={() =>
              Alert.alert(
                b.title,
                b.earned ? `${b.description}. Kazandın! 🎉` : `${b.description}.\nİlerleme: ${b.progress}/${b.target}`,
              )
            }
            style={[styles.badge, !b.earned && styles.badgeLocked]}>
            <View style={[styles.badgeIcon, b.earned && styles.badgeIconEarned]}>
              <SymbolView name={b.icon} tintColor={b.earned ? colors.onPrimary : colors.textTertiary} size={22} />
            </View>
            <Text variant="caption" align="center" numberOfLines={2} style={styles.badgeTitle}>
              {b.title}
            </Text>
            {!b.earned && (
              <View style={styles.badgeTrack}>
                <View style={[styles.badgeFill, { width: `${(b.progress / b.target) * 100}%` }]} />
              </View>
            )}
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: spacing.xl,
  },
  school: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    maxWidth: '90%',
  },
  addSchool: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  heavy: {
    fontWeight: '700',
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  topCard: {
    flex: 1,
    aspectRatio: 0.78,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  topShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  topRank: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topInfo: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    gap: 2,
  },
  tasteCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  tasteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  tasteLabel: {
    width: 118,
  },
  tasteTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  tasteFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  tastePct: {
    width: 40,
    textAlign: 'right',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  badgeRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  badge: {
    width: 96,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeLocked: {
    backgroundColor: colors.surface,
    borderColor: colors.surface,
  },
  badgeIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIconEarned: {
    backgroundColor: colors.primary,
  },
  badgeTitle: {
    minHeight: 30,
  },
  badgeTrack: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  badgeFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  name: {
    marginTop: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.background,
  },
  menuIcon: {
    width: 26,
    height: 26,
  },
  menuCount: {
    fontVariant: ['tabular-nums'],
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  cardLock: {
    width: 15,
    height: 22,
  },
  goalCard: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  goalChips: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  goalChip: {
    flex: 1,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalValue: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
});
