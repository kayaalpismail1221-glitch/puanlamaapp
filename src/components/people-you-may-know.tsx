import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { Avatar, PressableScale, Text } from '@/components/ui';
import { FollowButton } from '@/components/user-row';
import { colors, hitSlop, spacing } from '@/constants/theme';
import { useDismissSuggestion, usePeopleYouMayKnow } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { openUserProfile } from '@/lib/navigation';
import type { PersonSuggestion } from '@/types';

/** "Seni takip ediyor", "Ayşe ve 2 kişi daha takip ediyor"… */
export function useReasonText() {
  const { t } = useTranslation();
  return (s: PersonSuggestion) => {
    if (s.reason === 'mutual' && s.mutualName) {
      return s.mutualCount > 1
        ? t('people.reasons.mutualMany', { name: s.mutualName, count: s.mutualCount - 1 })
        : t('people.reasons.mutual', { name: s.mutualName });
    }
    return t(`people.reasons.${s.reason === 'mutual' ? 'popular' : s.reason}`);
  };
}

/**
 * Tanıyor olabileceğin kişiler: gerekçesiyle, Takip et ve ✕ (gizle). Takip edilen satırda kalır
 * ("Takip ediliyor"), gizlenen kayarak çıkar ve yerine sıradaki gelir. Öneri yoksa hiçbir şey çizmez.
 */
export function PeopleYouMayKnow({ max = 5 }: { max?: number }) {
  const { t } = useTranslation();
  const query = usePeopleYouMayKnow();
  const list = (query.data ?? []).slice(0, max);
  if (!list.length) return null;

  return (
    <Animated.View entering={FadeIn} style={styles.container}>
      <View style={styles.header}>
        <Text variant="headline">{t('people.title')}</Text>
        <PressableScale onPress={() => router.push('/arkadas-bul')} hitSlop={hitSlop}>
          <Text variant="subhead" color={colors.primary} style={styles.bold}>
            {t('people.seeAll')}
          </Text>
        </PressableScale>
      </View>
      {list.map((s) => (
        <SuggestionRow key={s.user.id} suggestion={s} />
      ))}
    </Animated.View>
  );
}

/** Öneri satırı: profil, gerekçe, Takip et ve ✕ (gizlenince kayarak çıkar) */
export function SuggestionRow({ suggestion: s }: { suggestion: PersonSuggestion }) {
  const { t } = useTranslation();
  const dismiss = useDismissSuggestion();
  const reasonText = useReasonText();
  return (
    <Animated.View exiting={FadeOut.duration(180)} layout={LinearTransition.springify()}>
      <PressableScale scaleTo={0.98} onPress={() => openUserProfile(s.user.id)} style={styles.row}>
        <Avatar uri={s.user.avatarUrl} name={s.user.name} size={44} />
        <View style={styles.info}>
          <Text variant="subhead" style={styles.bold} numberOfLines={1}>
            {s.user.name}
          </Text>
          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
            {reasonText(s)}
          </Text>
        </View>
        <FollowButton userId={s.user.id} />
        <PressableScale
          onPress={() => {
            haptics.tap();
            dismiss(s.user.id);
          }}
          hitSlop={hitSlop}
          accessibilityLabel={t('people.dismiss')}>
          <SymbolView name="xmark" tintColor={colors.textTertiary} size={14} weight="semibold" />
        </PressableScale>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  bold: {
    fontWeight: '600',
  },
});
