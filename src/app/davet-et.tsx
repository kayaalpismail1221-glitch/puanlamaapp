import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomInsetSpacer } from '@/components/bottom-inset';
import { Avatar, Button, ErrorView, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useEntityRetry, usePlace } from '@/data/entities';
import { inviteText, sendInvite, type DeviceContact } from '@/lib/contacts';
import { haptics } from '@/lib/haptics';
import { normalizePhone } from '@/lib/validation';
import { useAppSelector, useScoreOf } from '@/store/app-store';

type Params = {
  mekan: string;
  /** JSON: DeviceContact[] (gönderide rehberden eklenen, Puanla'da olmayanlar) */
  kisiler: string;
};

function parseContacts(raw: string | undefined): DeviceContact[] {
  try {
    const list = JSON.parse(raw ?? '[]') as DeviceContact[];
    return list.flatMap((c) => {
      const phone = typeof c.phone === 'string' ? normalizePhone(c.phone) : undefined;
      return phone ? [{ name: String(c.name ?? phone), phone }] : [];
    });
  } catch {
    return [];
  }
}

/**
 * Masa döngüsü: gönderi paylaşıldıktan sonra masadaki, Puanla'da olmayan kişilere
 * "İsmail Çiya için 8,7 verdi. Sen kaç verirdin?" mesajı doğrudan kişiye (WhatsApp ya da SMS) gider.
 * Kişi katılınca numarasıyla eşleşir; davet edene haber verilir ve onboarding'i bu mekânla başlar.
 */
export default function InviteScreen() {
  const params = useLocalSearchParams<Params>();
  const { t } = useTranslation();
  const place = usePlace(params.mekan);
  const retryPlace = useEntityRetry('place', params.mekan);
  const myName = useAppSelector((s) => s.profile?.name ?? '');
  const myUsername = useAppSelector((s) => s.profile?.username);
  const scoreOf = useScoreOf();
  const contacts = useMemo(() => parseContacts(params.kisiler), [params.kisiler]);
  const [sent, setSent] = useState<string[]>([]);

  const text = place
    ? inviteText({ inviterName: myName, inviterUsername: myUsername, placeName: place.name, score: scoreOf(place.id) })
    : '';

  const send = async (contact: DeviceContact, via: 'whatsapp' | 'sms') => {
    haptics.tap();
    await sendInvite(contact.phone, text, via);
    setSent((list) => (list.includes(contact.phone) ? list : [...list, contact.phone]));
  };

  // Mekân gelmeden mesaj yazılamaz: düğmeler sonsuza dek pasif kalmasın
  if (place === null || (place === undefined && retryPlace)) {
    return (
      <ErrorView
        message={place === null ? t('place.notFound') : undefined}
        onRetry={retryPlace ?? undefined}
        style={styles.container}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
        <View style={styles.header}>
          <Text variant="title2" color={colors.primary}>
            {t('invite.title')}
          </Text>
          <Text variant="subhead" color={colors.textSecondary}>
            {t('invite.subtitle', { count: contacts.length })}
          </Text>
        </View>

        {!!text && (
          <View style={styles.preview}>
            <Text variant="subhead">{text}</Text>
          </View>
        )}

        {contacts.map((c) => {
          const done = sent.includes(c.phone);
          return (
            <View key={c.phone} style={styles.row}>
              <Avatar name={c.name} size={44} />
              <View style={styles.info}>
                <Text variant="headline" numberOfLines={1}>
                  {c.name}
                </Text>
                {done && (
                  <View style={styles.sent}>
                    <SymbolView name="checkmark.circle.fill" tintColor={colors.primary} size={13} />
                    <Text variant="caption" color={colors.primary}>
                      {t('invite.sent')}
                    </Text>
                  </View>
                )}
              </View>
              <PressableScale
                onPress={() => send(c, 'sms')}
                style={styles.secondary}
                accessibilityLabel={t('invite.sms')}
                disabled={!text}>
                <SymbolView name="message.fill" tintColor={colors.primary} size={16} />
              </PressableScale>
              <Button title={t('invite.whatsapp')} size="sm" onPress={() => send(c, 'whatsapp')} disabled={!text} />
            </View>
          );
        })}
        <BottomInsetSpacer />
      </ScrollView>
      <View style={styles.footer}>
        <Button title={t('invite.done')} variant={sent.length ? 'primary' : 'ghost'} onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  preview: {
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  secondary: {
    width: 36,
    height: 36,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
