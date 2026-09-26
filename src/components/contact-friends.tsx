import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { showError } from '@/api/errors';
import { UserRowsSkeleton } from '@/components/skeleton';
import { Button, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { PHONE_VERIFICATION_ENABLED } from '@/constants/features';
import { colors, radius, spacing } from '@/constants/theme';
import { useContactFriends } from '@/hooks/use-contact-friends';
import { shareInvite } from '@/lib/share';
import { useAppSelector } from '@/store/app-store';

/**
 * "Rehberinden bul": numarası doğrulanmışsa rehberdeki Puanla kullanıcılarını listeler (takip düğmeleriyle),
 * değilse önce numarayı doğrulatır. Rehber yalnızca düğmeye basınca okunur.
 * Telefon doğrulaması kapalıyken (SMS sağlayıcısı yok) hiç görünmez.
 */
export function ContactFriends() {
  const { t } = useTranslation();
  const verified = useAppSelector((s) => !!s.profile?.phoneVerified);
  const username = useAppSelector((s) => s.profile?.username);
  const contacts = useContactFriends();
  if (!PHONE_VERIFICATION_ENABLED) return null;

  const scan = () =>
    contacts.scan().then((r) => {
      if (r.error) showError(r.error, t('failures.contactsSync'));
    });

  const data = contacts.data;
  if (data?.status === 'ok' && data.matches.length > 0) {
    return (
      <View style={styles.list}>
        <Text variant="footnote" color={colors.textSecondary} style={[styles.bold, styles.inset]}>
          {t('contacts.found', { count: data.matches.length })}
        </Text>
        {data.matches.map((m) => (
          <UserRow key={m.user.id} user={m.user} subtitle={t('contacts.inContacts', { name: m.contactName })} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.title}>
        <SymbolView name="person.crop.circle.badge.plus" tintColor={colors.primary} size={22} />
        <Text variant="headline" color={colors.primary}>
          {t('contacts.title')}
        </Text>
      </View>
      {contacts.isFetching ? (
        <UserRowsSkeleton count={2} />
      ) : data?.status === 'ok' ? (
        <>
          <Text variant="subhead" color={colors.textSecondary}>
            {t('contacts.none')}
          </Text>
          <Button title={t('contacts.inviteFriends')} variant="secondary" size="sm" onPress={() => shareInvite({ username })} />
        </>
      ) : data?.status === 'denied' ? (
        <>
          <Text variant="subhead" color={colors.textSecondary}>
            {t('contacts.denied')}
          </Text>
          <Button title={t('contacts.openSettings')} variant="secondary" size="sm" onPress={() => Linking.openSettings()} />
          {/* Ayarlar'dan izin verip dönünce yeniden taranır */}
          <Button title={t('contacts.scan')} variant="ghost" size="sm" onPress={scan} />
        </>
      ) : (
        <>
          <Text variant="subhead" color={colors.textSecondary}>
            {t('contacts.text')}
          </Text>
          {verified ? (
            <Button title={t('contacts.scan')} size="sm" onPress={scan} />
          ) : (
            <Button title={t('contacts.verify')} size="sm" onPress={() => router.push('/telefon-dogrula')} />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  list: {
    marginHorizontal: -spacing.lg,
  },
  inset: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  bold: {
    fontWeight: '600',
  },
});
