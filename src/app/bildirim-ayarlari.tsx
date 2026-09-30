import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Switch } from 'react-native';

import { showError } from '@/api/errors';
import { setMutedKinds } from '@/api/notifications';
import { SettingsGroup, SettingsRow, settingsStyles } from '@/components/settings-list';
import type { AppSymbol } from '@/constants/icons';
import { colors } from '@/constants/theme';
import { useMutedNotifications } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { enablePush, pushPermission, type PushPermission } from '@/lib/notifications';
import { keys, queryClient } from '@/lib/query-client';
import { useAppStore } from '@/store/app-store';
import type { NotificationKind } from '@/types';

const KINDS: { kind: NotificationKind; icon: AppSymbol }[] = [
  { kind: 'friend_rated', icon: 'fork.knife' },
  { kind: 'friend_joined', icon: 'person.crop.circle.badge.checkmark' },
  { kind: 'tag', icon: 'person.2.fill' },
  { kind: 'comment', icon: 'bubble.left.fill' },
  { kind: 'like', icon: 'heart.fill' },
  { kind: 'follow', icon: 'person.fill.badge.plus' },
];

/**
 * Bildirim tercihleri: sistem izni ve tür başına push. Kapatılan tür uygulama içi
 * bildirim merkezinde görünmeye devam eder, yalnızca telefona bildirim gelmez.
 */
export default function NotificationSettingsScreen() {
  const { t } = useTranslation();
  const { userId } = useAppStore();
  const muted = useMutedNotifications();
  const [permission, setPermission] = useState<PushPermission>('granted');

  useFocusEffect(
    useCallback(() => {
      pushPermission().then(setPermission);
    }, []),
  );

  const toggle = (kind: NotificationKind, on: boolean) => {
    const previous = muted.data ?? [];
    const next = on ? previous.filter((k) => k !== kind) : [...previous, kind];
    haptics.select();
    queryClient.setQueryData(keys.mutedNotifications(), next);
    setMutedKinds(userId!, next).catch((error) => {
      queryClient.setQueryData(keys.mutedNotifications(), previous);
      showError(error, t('failures.notificationSettings'));
    });
  };

  const allowed = permission === 'granted';

  return (
    <ScrollView
      style={settingsStyles.screen}
      contentContainerStyle={settingsStyles.content}
      contentInsetAdjustmentBehavior="automatic">
      {permission !== 'unsupported' && (
        <SettingsGroup footer={allowed ? undefined : t('notifications.systemOffFooter')}>
          <SettingsRow
            icon="bell.badge.fill"
            label={t('notifications.system')}
            value={allowed ? t('notifications.on') : t('notifications.off')}
            onPress={
              allowed
                ? undefined
                : async () => {
                    await enablePush().catch(() => false);
                    setPermission(await pushPermission());
                  }
            }
            last
          />
        </SettingsGroup>
      )}

      <SettingsGroup title={t('notifications.pushTitle')} footer={t('notifications.pushFooter')}>
        {KINDS.map(({ kind, icon }, i) => (
          <SettingsRow
            key={kind}
            icon={icon}
            label={t(`notifications.kinds.${kind}`)}
            last={i === KINDS.length - 1}
            accessory={
              <Switch
                value={!(muted.data ?? []).includes(kind)}
                onValueChange={(on) => toggle(kind, on)}
                disabled={!muted.data || !allowed}
                trackColor={{ true: colors.primary }}
              />
            }
          />
        ))}
      </SettingsGroup>
    </ScrollView>
  );
}
