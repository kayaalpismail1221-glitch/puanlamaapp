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
import { PHONE_VERIFICATION_ENABLED } from '@/constants/features';
import { colors, radius, spacing } from '@/constants/theme';
import { usePlace } from '@/data/entities';
import { useUserPosts } from '@/hooks/queries';
import { useMyInvites } from '@/hooks/use-contact-friends';
import { formatScore } from '@/lib/format';
import { useUserLocation } from '@/lib/location';
import { placeSubtitle } from '@/lib/place';
import { useAppSelector, useAppStore } from '@/store/app-store';

// Puanlayınca doğrudan gönderi ekranı açılır (fotoğraf isteğe bağlı)
const rate = (id: string) => router.push({ pathname: '/degerlendir/[id]', params: { id, sonra: 'gonderi' } });

/** 5. En son gidilen restoranı puanla */
export default function FirstRatingStep() {
  const { scored, scoreOf, userId } = useAppStore();
  // SMS doğrulaması açıksa numarası doğrulanmamış herkese telefon adımı isteğe bağlı sorulur
  const askPhone = useAppSelector((s) => PHONE_VERIFICATION_ENABLED && !s.profile?.phoneVerified);
  const { t } = useTranslation();
  const next = () => router.push(askPhone ? '/onboarding/telefon' : '/onboarding/takip');
  const [query, setQuery] = useState('');
  const myPosts = useUserPosts(userId);
  // Davetle gelen: onboarding davet edenin mekânıyla başlar ("Sen kaç verirdin?")
  const invite = useMyInvites().data?.[0];

  const first = scored[0];
  const firstPlace = usePlace(first?.placeId) ?? undefined;
  // Konum izni ilk kez burada, ne işe yaradığı söylenerek istenir: liste yakındaki mekânlarla dolar ve
  // feed'e geçince açıklamasız sistem penceresi çıkmaz. Sormadan önce yalnızca durumu okur.
  const location = useUserLocation(!firstPlace, false);
  const posted = !!firstPlace && !!myPosts.data?.some((p) => p.placeId === firstPlace.id);

  return (
    <OnboardingStep
      title={t('onboarding.firstRateTitle')}
      subtitle={t('onboarding.firstRateSubtitle')}
      footer={
        firstPlace ? (
          <Button title={t('onboarding.next')} onPress={next} />
        ) : (
          <Button title={t('onboarding.skip')} variant="ghost" onPress={next} />
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
            header={location.status === 'undetermined' ? <LocationCard onAllow={location.retry} /> : undefined}
            exclude={(p) => scoreOf(p.id) !== undefined}
            onSelect={(p) => rate(p.id)}
            trailing={() => <SymbolView name="plus.circle" tintColor={colors.primary} size={26} />}
          />
        </>
      )}
    </OnboardingStep>
  );
}

/** Konum izni sorulmadıysa listenin başında: neden istendiği + izin düğmesi */
function LocationCard({ onAllow }: { onAllow: () => void }) {
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.locationCard}>
      <View style={styles.locationIcon}>
        <SymbolView name="location.fill" tintColor={colors.onPrimary} size={16} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="headline">{t('onboarding.locationTitle')}</Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {t('onboarding.locationText')}
        </Text>
        <View style={styles.locationAction}>
          <Button title={t('onboarding.locationAllow')} size="sm" onPress={onAllow} />
        </View>
      </View>
    </Animated.View>
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
  locationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  locationIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationAction: {
    flexDirection: 'row',
    paddingTop: spacing.sm,
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
