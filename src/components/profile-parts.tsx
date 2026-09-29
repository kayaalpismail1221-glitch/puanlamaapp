import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Avatar, PressableScale, Text } from '@/components/ui';
import { colors, fonts, hitSlop, radius, spacing } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { useLeaderboard, useUserRank } from '@/hooks/queries';
import i18n from '@/i18n';
import { showAlert, showPrompt } from '@/lib/dialog';
import { monthYear } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import type { Badge } from '@/lib/insights';

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
  const { t } = useTranslation();
  return (
    <View style={styles.identity}>
      <PressableScale
        onPress={onAvatarPress}
        disabled={!onAvatarPress}
        haptic={false}
        accessibilityRole={onAvatarPress ? 'button' : undefined}>
        <Avatar uri={avatarUri} name={name} size={96} />
      </PressableScale>
      <Text variant="title2" color={colors.primary} style={styles.name}>
        {name}
      </Text>
      <Text variant="subhead" color={colors.textSecondary}>
        @{username}
        {joinedAt ? t('profile.memberSince', { date: monthYear(joinedAt) }) : ''}
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
  const { t } = useTranslation();
  const school = schoolById(schoolId);
  const board = useLeaderboard('school', 'all', schoolId);
  const entry = board.data?.find((e) => e.userId === userId);

  if (!school) {
    if (!editable) return null;
    return (
      <PressableScale onPress={() => router.push('/okul-sec')} style={styles.addSchool}>
        <SymbolView name="plus" tintColor={colors.primary} size={12} weight="bold" />
        <Text variant="subhead" color={colors.primary} style={styles.bold}>
          {t('profile.addSchool')}
        </Text>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/siralama', params: { okul: school.id, vurgula: userId } })}
      style={styles.school}
      accessibilityLabel={t('profile.schoolLeaderboard', { school: school.name })}>
      <SymbolView name="graduationcap.fill" tintColor={colors.primary} size={14} />
      <Text variant="subhead" style={styles.bold} numberOfLines={1}>
        {schoolLabel(school)}
      </Text>
      {entry && entry.xp > 0 && (
        <Text variant="subhead" color={colors.textSecondary}>
          {t('profile.rankAtSchool', { rank: entry.rank })}
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

/** Profilde yan yana iki kutu: Puanla sıralaması (dokununca lig) ve haftalık seri */
export function RankStreakCards({ userId, streak }: { userId: string; streak: number }) {
  const { t } = useTranslation();
  const rank = useUserRank(userId).data;
  return (
    <View style={styles.tiles}>
      <StatTile
        icon="trophy.fill"
        iconColor={colors.primary}
        label={t('follow.rank')}
        // İlk değerlendirme paylaşılana kadar sıralama kilitli
        value={rank ? `#${rank}` : undefined}
        onPress={() => router.push({ pathname: '/siralama', params: { vurgula: userId } })}
      />
      <StatTile
        icon="flame.fill"
        iconColor={streak > 0 ? colors.warning : colors.textTertiary}
        label={t('me.streakLabel')}
        value={t('me.weeks', { count: streak })}
      />
    </View>
  );
}

function StatTile({
  icon,
  iconColor,
  label,
  value,
  onPress,
}: {
  icon: SFSymbol;
  iconColor: string;
  label: string;
  /** Yoksa kilit simgesi */
  value?: string;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.97}
      style={styles.tile}
      accessibilityRole={onPress ? 'button' : undefined}>
      <SymbolView name={icon} tintColor={iconColor} size={24} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {value}
          </Text>
        ) : (
          <SymbolView name="lock.fill" tintColor={colors.textSecondary} size={16} style={styles.tileLock} />
        )}
      </View>
    </PressableScale>
  );
}

/* ---------- Yıllık hedef ---------- */

export const GOAL_PRESETS = [20, 50, 100];

/** Yılın bitmesine kalan gün (hedef kartı ve hedef sayfası) */
export const daysLeftInYear = (year: number, now: number) =>
  Math.max(0, Math.ceil((new Date(year + 1, 0, 1).getTime() - now) / 86_400_000));

/** Özel hedef: 1–1000 arası sayı sorar */
export function askGoal(year: number, onChange: (goal: number) => void) {
  showPrompt({
    title: i18n.t('profile.goalTitle', { year }),
    message: i18n.t('profile.goalQuestion'),
    placeholder: '30',
    keyboardType: 'number-pad',
    submitLabel: i18n.t('common.save'),
    onSubmit: (text) => {
      const n = Number.parseInt(text, 10);
      if (n > 0 && n <= 1000) {
        haptics.success();
        onChange(n);
      }
    },
  });
}

/** Hedefi değiştir ya da kaldır */
export function editGoal(year: number, goal: number, onChange: (goal: number | undefined) => void) {
  showAlert(i18n.t('profile.goalTitle', { year }), i18n.t('common.placeCount', { count: goal }), [
    { text: i18n.t('profile.goalChange'), onPress: () => askGoal(year, onChange) },
    { text: i18n.t('profile.goalRemove'), style: 'destructive', onPress: () => onChange(undefined) },
    { text: i18n.t('common.cancel'), style: 'cancel' },
  ]);
}

/**
 * Profildeki yıllık hedef kartı. Hedef yoksa hazır seçenekler; varsa ilerleme. Dokununca hedef sayfası
 * (arkadaşların hedefleriyle birlikte) açılır.
 */
export function GoalCard({
  goal,
  done,
  onChange,
}: {
  goal?: number;
  done: number;
  onChange: (goal: number | undefined) => void;
}) {
  const { t } = useTranslation();
  const [now] = useState(Date.now);
  const year = new Date(now).getFullYear();
  const progress = goal ? Math.min(done / goal, 1) : 0;
  const openChallenge = () => router.push('/hedef');

  const friendsLink = (
    <PressableScale onPress={openChallenge} haptic={false} hitSlop={hitSlop} style={styles.goalLink}>
      <Text variant="subhead" color={colors.primary} style={styles.bold}>
        {t('challenge.friendsLink')}
      </Text>
      <SymbolView name="chevron.right" tintColor={colors.primary} size={12} weight="bold" />
    </PressableScale>
  );

  if (!goal) {
    return (
      <View style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="headline">{t('profile.goalSet', { year })}</Text>
            <Text variant="subhead" color={colors.textSecondary}>
              {t('profile.goalQuestion')}
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
          <PressableScale onPress={() => askGoal(year, onChange)} style={styles.goalChip}>
            <Text variant="subhead" style={styles.bold}>
              {t('profile.goalCustom')}
            </Text>
          </PressableScale>
        </View>
        <View style={[styles.goalFooter, styles.goalFooterEnd]}>{friendsLink}</View>
      </View>
    );
  }

  return (
    <PressableScale scaleTo={0.99} onPress={openChallenge} onLongPress={() => editGoal(year, goal, onChange)} style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="headline">{t('profile.goalTitle', { year })}</Text>
          <Text variant="subhead" color={colors.textSecondary}>
            {done >= goal ? t('profile.goalReached') : t('profile.goalRemaining', { count: goal - done })}
          </Text>
        </View>
        <Text variant="title2" color={colors.primary} style={styles.goalValue}>
          {done}/{goal}
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View layout={LinearTransition.springify()} style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.goalFooter}>
        <Text variant="subhead" color={colors.textSecondary}>
          {t('challenge.daysLeft', { count: daysLeftInYear(year, now) })}
        </Text>
        {friendsLink}
      </View>
    </PressableScale>
  );
}

/* ---------- Rozetler ---------- */

/** Şimdilik profilde gösterilmiyor (kullanıcı kararı 2026-09-29); geri açmak için profile `computeBadges` ile eklenir */

export function BadgeStrip({ badges }: { badges: Badge[] }) {
  const { t } = useTranslation();
  const earned = badges.filter((b) => b.earned).length;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="title3">{t('profile.badges')}</Text>
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
              showAlert(
                t(`badges.${b.id}.title`),
                b.earned
                  ? t('profile.badgeEarned', { description: t(`badges.${b.id}.description`) })
                  : t('profile.badgeProgress', {
                      description: t(`badges.${b.id}.description`),
                      progress: b.progress,
                      target: b.target,
                    }),
              )
            }
            style={[styles.badge, !b.earned && styles.badgeLocked]}>
            <View style={[styles.badgeIcon, b.earned && styles.badgeIconEarned]}>
              <SymbolView name={b.icon} tintColor={b.earned ? colors.onPrimary : colors.textTertiary} size={22} />
            </View>
            <Text variant="caption" align="center" numberOfLines={2} style={styles.badgeTitle}>
              {t(`badges.${b.id}.title`)}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
  tiles: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  tile: {
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
  tileValue: {
    fontFamily: fonts.rounded,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  tileLock: {
    width: 16,
    height: 25,
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
  goalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  goalFooterEnd: {
    justifyContent: 'flex-end',
  },
  goalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
