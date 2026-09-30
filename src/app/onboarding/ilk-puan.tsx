import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { OnboardingStep } from '@/components/onboarding-step';
import { PlaceSearchList } from '@/components/place-picker';
import type { Invite } from '@/api/contacts';
import { Avatar, Button, PlaceImage, ScoreBadge, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { usePlace } from '@/data/entities';
import { useUserPosts } from '@/hooks/queries';
import { useMyInvites } from '@/hooks/use-contact-friends';
import { formatScore } from '@/lib/format';
import { placeSubtitle } from '@/lib/place';
import { useAppStore } from '@/store/app-store';

// Puanlayınca doğrudan gönderi ekranı açılır (fotoğraf isteğe bağlı)
const rate = (id: string) => router.push({ pathname: '/degerlendir/[id]', params: { id, sonra: 'gonderi' } });

/** 5. En son gidilen restoranı puanla */
export default function FirstRatingStep() {
  const { scored, scoreOf, userId } = useAppStore();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const myPosts = useUserPosts(userId);
  // Davetle gelen: onboarding davet edenin mekânıyla başlar ("Sen kaç verirdin?")
  const invite = useMyInvites().data?.[0];

  const first = scored[0];
  const firstPlace = usePlace(first?.placeId) ?? undefined;
  const posted = !!firstPlace && !!myPosts.data?.some((p) => p.placeId === firstPlace.id);

  return (
    <OnboardingStep
      title={t('onboarding.firstRateTitle')}
      subtitle={t('onboarding.firstRateSubtitle')}
      footer={
        firstPlace ? (
          <Button title={t('onboarding.next')} onPress={() => router.push('/onboarding/takip')} />
        ) : (
          <Button title={t('onboarding.skip')} variant="ghost" onPress={() => router.push('/onboarding/takip')} />
        )
      }>
      {invite && <InviteCard invite={invite} myScore={scoreOf(invite.place.id)} />}
      {firstPlace && first ? (
        <>
          <Animated.View entering={FadeInDown.springify()} style={styles.rated}>
            <PlaceImage uri={firstPlace.photoUrl} style={styles.ratedImage} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.ratedLabel}>
                <SymbolView name="checkmark.circle.fill" tintColor={colors.primary} size={14} />
                <Text variant="caption" color={colors.primary} style={styles.bold}>
                  {posted ? t('onboarding.firstPostShared') : t('onboarding.firstRateSaved')}
                </Text>
              </View>
              <Text variant="headline" numberOfLines={1}>
                {firstPlace.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary}>
                {placeSubtitle(firstPlace)}
              </Text>
            </View>
            <ScoreBadge score={first.score} />
          </Animated.View>
          <Text variant="subhead" color={colors.textSecondary} style={styles.note}>
            {t('onboarding.firstRateNote')}
          </Text>
          {!posted && (
            <View style={styles.postLink}>
              <Button
                title={t('onboarding.shareAsPost')}
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/gonderi-olustur', params: { placeId: firstPlace.id, akis: 'onboarding' } })
                }
              />
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.search}>
            <SearchField value={query} onChangeText={setQuery} placeholder={t('onboarding.firstRateSearch')} />
          </View>
          <PlaceSearchList
            query={query}
            exclude={(p) => scoreOf(p.id) !== undefined}
            onSelect={(p) => rate(p.id)}
            trailing={() => <SymbolView name="plus.circle" tintColor={colors.primary} size={26} />}
          />
        </>
      )}
    </OnboardingStep>
  );
}

/** Davet eden, mekân ve (puanlayınca) iki puanın karşılaştırması */
function InviteCard({ invite, myScore }: { invite: Invite; myScore?: number }) {
  const { t } = useTranslation();
  const first = invite.inviter.name.split(' ')[0] ?? invite.inviter.name;
  const theirs = invite.inviterScore;
  return (
    <Animated.View entering={FadeInDown.springify()} style={[styles.rated, styles.invite]}>
      <Avatar uri={invite.inviter.avatarUrl} name={invite.inviter.name} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" color={colors.primary} style={styles.bold}>
          {t('onboarding.invitedTitle', { name: first })}
        </Text>
        <Text variant="subhead" numberOfLines={3}>
          {myScore !== undefined && theirs !== undefined
            ? t('onboarding.compare', { mine: formatScore(myScore), name: first, theirs: formatScore(theirs) })
            : theirs !== undefined
              ? t('onboarding.invitedText', { name: first, place: invite.place.name, score: formatScore(theirs) })
              : t('onboarding.invitedTextNoScore', { name: first, place: invite.place.name })}
        </Text>
      </View>
      {myScore === undefined ? (
        <Button title={t('onboarding.rateInvite')} size="sm" onPress={() => rate(invite.place.id)} />
      ) : (
        <ScoreBadge score={myScore} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  invite: {
    marginBottom: spacing.lg,
  },
  search: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  rated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratedImage: {
    width: 64,
    height: 64,
    borderRadius: radius.button,
  },
  ratedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  bold: {
    fontWeight: '600',
  },
  note: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  postLink: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
});
