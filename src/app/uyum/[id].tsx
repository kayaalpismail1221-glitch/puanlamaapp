import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PlaceRow } from '@/components/place-row';
import { Bone, PlaceRowsSkeleton, Skeleton } from '@/components/skeleton';
import { DualScore, MATCH_MIN_COMMON, MatchDisc } from '@/components/taste-match';
import { Avatar, Button, ErrorView, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, spacing } from '@/constants/theme';
import { useTasteMatch, useUserProfile } from '@/hooks/queries';
import { tasteMatchSections } from '@/lib/taste-match';
import { shareTasteMatch } from '@/lib/share';
import { useAppSelector } from '@/store/app-store';

/**
 * Damak uyumu ayrıntısı: yüzde, ortak favoriler, en çok ayrışılan yerler ve tüm ortak mekânlar.
 * Başkasının profilindeki uyum satırından açılır.
 */
export default function TasteMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const me = useAppSelector((s) => s.profile);
  const other = useUserProfile(id).data;
  const query = useTasteMatch(id);
  const match = query.data;
  const sections = useMemo(() => (match ? tasteMatchSections(match.places) : undefined), [match]);

  if (query.isPending) return <MatchSkeleton />;
  if (query.isError) return <ErrorView onRetry={() => query.refetch()} style={styles.container} />;
  if (!match || !other || !sections) return <View style={styles.container} />;

  const firstName = other.name.split(' ')[0] || other.username;
  const openPlace = (placeId: string) => router.push({ pathname: '/mekan/[id]', params: { id: placeId } });
  const share = () => match.percent !== undefined && shareTasteMatch(other, match.percent, match.common);

  const renderRows = (rows: typeof match.places) =>
    rows.map((r) => (
      <PlaceRow
        key={r.place.id}
        place={r.place}
        onPress={() => openPlace(r.place.id)}
        trailing={<DualScore mine={r.myScore} theirs={r.theirScore} theirName={firstName} />}
      />
    ));

  return (
    <>
      <Stack.Screen
        options={{
          title: t('match.title'),
          headerRight: () =>
            match.percent === undefined ? null : (
              <PressableScale onPress={share} hitSlop={hitSlop} accessibilityLabel={t('common.share')}>
                <Icon name="square.and.arrow.up" tintColor={colors.primary} size={20} />
              </PressableScale>
            ),
        }}
      />
      <ScrollView style={styles.container} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.hero}>
          <View style={styles.avatars}>
            <Avatar uri={me?.avatarUri} name={me?.name ?? '?'} size={56} />
            <View style={styles.avatarOverlap}>
              <Avatar uri={other.avatarUrl} name={other.name} size={56} />
            </View>
          </View>
          <MatchDisc percent={match.percent} size={96} />
          <Text variant="title3" align="center">
            {match.percent !== undefined ? t('match.heroTitle', { name: firstName }) : t('match.title')}
          </Text>
          <Text variant="subhead" color={colors.textSecondary} align="center">
            {match.percent !== undefined
              ? t('match.heroText', { count: match.common })
              : t('match.needMoreLong', { count: MATCH_MIN_COMMON - match.common, name: firstName })}
          </Text>
          {match.percent !== undefined ? (
            <Button title={t('match.share')} icon="square.and.arrow.up" variant="outline" size="sm" onPress={share} />
          ) : (
            <Button
              title={t('match.seeTheirPlaces', { name: firstName })}
              variant="outline"
              size="sm"
              onPress={() => router.push({ pathname: '/gittiklerim/[id]', params: { id: other.id } })}
            />
          )}
        </View>

        {sections.favorites.length > 0 && (
          <Section title={t('match.favorites')}>{renderRows(sections.favorites)}</Section>
        )}
        {sections.apart.length > 0 && <Section title={t('match.apart')}>{renderRows(sections.apart)}</Section>}
        <Section title={t('match.all', { count: match.common })}>{renderRows(match.places)}</Section>

        <Text variant="footnote" color={colors.textTertiary} style={styles.explain}>
          {t('match.explain')}
        </Text>
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="title3" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function MatchSkeleton() {
  return (
    <View style={styles.container}>
      <Skeleton style={styles.hero}>
        <Bone width={104} height={56} round={28} />
        <Bone width={96} height={96} round />
        <Bone width="55%" height={20} />
        <Bone width="40%" height={14} />
      </Skeleton>
      <PlaceRowsSkeleton count={5} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOverlap: {
    marginLeft: -spacing.md,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: colors.background,
  },
  section: {
    paddingTop: spacing.xl,
  },
  sectionTitle: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  explain: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
