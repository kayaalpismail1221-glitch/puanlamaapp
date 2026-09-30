import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { showError } from '@/api/errors';
import { Icon } from '@/components/icon';
import { SettingsGroup, SettingsRow, settingsStyles } from '@/components/settings-list';
import { Avatar, PressableScale, Text } from '@/components/ui';
import { SUPPORT_EMAIL } from '@/constants/app';
import { colors, spacing } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { useLanguagePreference } from '@/i18n';
import { areaLabel } from '@/lib/feed';
import { haptics } from '@/lib/haptics';
import { PHONE_VERIFICATION_ENABLED } from '@/constants/features';
import { shareInvite } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

const openLegal = (belge: 'kosullar' | 'gizlilik') => router.push({ pathname: '/yasal/[belge]', params: { belge } });

/** Ayarlar: iOS gruplu liste düzeni */
export default function SettingsScreen() {
  const { profile, email, feedArea, hapticsEnabled, actions } = useAppStore();
  const { t } = useTranslation();
  const languagePreference = useLanguagePreference();
  const school = schoolById(profile?.schoolId);
  const [deleting, setDeleting] = useState(false);

  const languageValue =
    languagePreference === 'system' ? t('language.system') : t(`language.names.${languagePreference}`);

  const contact = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('settings.mailSubject'))}`;
    Linking.openURL(url).catch(() => Alert.alert(t('settings.contact'), t('settings.noMailApp', { email: SUPPORT_EMAIL })));
  };

  const logout = () =>
    Alert.alert(t('settings.logout'), t('settings.logoutText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.logout'), style: 'destructive', onPress: () => actions.signOut() },
    ]);

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      await actions.deleteAccount();
    } catch (error) {
      setDeleting(false);
      showError(error, t('failures.accountDelete'));
    }
  };

  // Geri alınamaz: iki kez onay
  const confirmDelete = () =>
    Alert.alert(t('settings.deleteTitle'), t('settings.deleteText'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.continue'),
        style: 'destructive',
        onPress: () =>
          Alert.alert(t('settings.sure'), t('settings.sureText'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('settings.deleteMine'), style: 'destructive', onPress: deleteAccount },
          ]),
      },
    ]);

  return (
    <ScrollView
      style={settingsStyles.screen}
      contentContainerStyle={settingsStyles.content}
      contentInsetAdjustmentBehavior="automatic">
      {/* Hesap kartı */}
      <SettingsGroup>
        <PressableScale onPress={() => router.push('/profil-duzenle')} scaleTo={0.99} style={styles.account}>
          <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">{profile?.name}</Text>
            <Text variant="subhead" color={colors.textSecondary}>
              @{profile?.username} · {t('settings.editProfile')}
            </Text>
          </View>
          <Icon name="chevron.right" tintColor={colors.textTertiary} size={14} weight="semibold" />
        </PressableScale>
      </SettingsGroup>

      <SettingsGroup title={t('settings.profile')}>
        <SettingsRow
          icon="graduationcap.fill"
          label={t('settings.school')}
          value={school ? schoolLabel(school) : t('settings.add')}
          onPress={() => router.push('/okul-sec')}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.preferences')}>
        <SettingsRow icon="bell.fill" label={t('settings.notifications')} onPress={() => router.push('/bildirim-ayarlari')} />
        <SettingsRow icon="globe" label={t('settings.language')} value={languageValue} onPress={() => router.push('/dil')} />
        <SettingsRow
          icon="location.fill"
          label={t('settings.feedArea')}
          value={areaLabel(feedArea)}
          onPress={() => router.push('/konum-sec')}
        />
        <SettingsRow
          icon="iphone.radiowaves.left.and.right"
          label={t('settings.haptics')}
          accessory={
            <Switch
              value={hapticsEnabled}
              onValueChange={(v) => {
                actions.setHapticsEnabled(v);
                if (v) haptics.success();
              }}
              trackColor={{ true: colors.primary }}
            />
          }
        />
        <SettingsRow icon="gear" label={t('settings.permissions')} onPress={() => Linking.openSettings()} last />
      </SettingsGroup>

      <SettingsGroup title={t('settings.community')}>
        <SettingsRow icon="person.badge.plus" label={t('settings.findFriends')} onPress={() => router.push('/arkadas-bul')} />
        <SettingsRow icon="trophy" label={t('settings.leaderboard')} onPress={() => router.push('/siralama')} />
        <SettingsRow
          icon="square.and.arrow.up"
          label={t('settings.invite')}
          onPress={shareInvite}
          last
        />
      </SettingsGroup>

      {PHONE_VERIFICATION_ENABLED && (
        <SettingsGroup footer={t('settings.discoverableFooter')}>
          <SettingsRow
            icon="person.crop.circle.badge.checkmark"
            label={t('settings.discoverable')}
            accessory={
              <Switch
                value={profile?.discoverable !== false}
                onValueChange={actions.setDiscoverable}
                trackColor={{ true: colors.primary }}
              />
            }
            last
          />
        </SettingsGroup>
      )}

      <SettingsGroup title={t('settings.privacySafety')}>
        <SettingsRow icon="hand.raised.fill" label={t('settings.blocked')} onPress={() => router.push('/engellenenler')} />
        <SettingsRow icon="checkmark.shield.fill" label={t('settings.guidelines')} onPress={() => openLegal('kosullar')} last />
      </SettingsGroup>


      <SettingsGroup title={t('settings.support')}>
        <SettingsRow icon="envelope.fill" label={t('settings.contact')} value={SUPPORT_EMAIL} onPress={contact} />
        <SettingsRow icon="doc.text.fill" label={t('settings.terms')} onPress={() => openLegal('kosullar')} />
        <SettingsRow icon="lock.fill" label={t('settings.privacy')} onPress={() => openLegal('gizlilik')} />
        {/* ODbL lisansı gereği mekân verisinin kaynağı belirtilir */}
        <SettingsRow
          icon="map"
          label={t('settings.placeData')}
          value="© OpenStreetMap"
          onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
          last
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.account')}>
        {email && <SettingsRow icon="at" label={t('settings.email')} value={email} />}
        <SettingsRow
          icon="info.circle"
          label={t('settings.version')}
          value={Constants.expoConfig?.version ?? '1.0.0'}
          last
        />
      </SettingsGroup>

      <SettingsGroup>
        <PressableScale onPress={logout} scaleTo={0.99} style={styles.action}>
          <Text variant="body" color={colors.danger}>
            {t('settings.logout')}
          </Text>
        </PressableScale>
      </SettingsGroup>

      <SettingsGroup>
        <PressableScale onPress={confirmDelete} disabled={deleting} scaleTo={0.99} style={styles.action}>
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text variant="body" color={colors.danger}>
              {t('settings.deleteAccount')}
            </Text>
          )}
        </PressableScale>
      </SettingsGroup>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  action: {
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
  },
});
