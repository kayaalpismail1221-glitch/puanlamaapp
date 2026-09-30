import { useFocusEffect } from 'expo-router';
import type { SFSymbol } from '@/components/symbol';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView } from 'react-native';

import { showError } from '@/api/errors';
import { setMutedKinds } from '@/api/notifications';
import { BottomInsetSpacer } from '@/components/bottom-inset';
import { Toggle } from '@/components/toggle';
import { SettingsGroup, SettingsRow, settingsStyles } from '@/components/settings-list';
import { useMutedNotifications } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { enablePush, pushPermission, type PushPermission } from '@/lib/notifications';
import { keys, queryClient } from '@/lib/query-client';
import { useAppStore } from '@/store/app-store';
import type { NotificationKind } from '@/types';

const KINDS: { kind: NotificationKind; icon: SFSymbol }[] = [
  { kind: 'friend_rated', icon: 'fork.knife' },
  { kind: 'friend_joined', icon: 'person.crop.circle.badge.checkmark' },
  { kind: 'tag', icon: 'person.2.fill' },
  { kind: 'comment', icon: 'bubble.left.fill' },
  { kind: 'reply', icon: 'arrowshape.turn.up.left.fill' },
  { kind: 'comment_like', icon: 'heart.text.square.fill' },
  { kind: 'like', icon: 'heart.fill' },
  { kind: 'follow', icon: 'person.fill.badge.plus' },
];

/** Tercih yazmaları sırayla gider: hızlı art arda dokunuşta eski liste yenisinin üstüne yazılmasın */
let writes: Promise<unknown> = Promise.resolve();
const queueWrite = (write: () => Promise<unknown>, onError: (error: unknown) => void) => {
  writes = writes.then(write).catch(onError);
};

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
    // Önbellekten: iki dokunuş aynı çizimde gelirse ikincisi birincinin değişikliğini görsün
    const previous = queryClient.getQueryData<NotificationKind[]>(keys.mutedNotifications()) ?? muted.data ?? [];
    const next = on ? previous.filter((k) => k !== kind) : [...previous, kind];
    haptics.select();
    queryClient.setQueryData(keys.mutedNotifications(), next);
    queueWrite(
      () => setMutedKinds(userId!, next),
      (error) => {
        // Sunucudaki gerçek durum yeniden okunur (sıradaki yazmalar da olmuş olabilir)
        queryClient.invalidateQueries({ queryKey: keys.mutedNotifications() });
        showError(error, t('failures.notificationSettings'));
      },
    );
  };

  const allowed = permission === 'granted';
  // Tercihler sunucuda saklanır; yalnızca bu telefonda sistem izni kapalıyken (üstte "Kapalı" satırı) düzenlenemez.
  // Push'u desteklemeyen cihazda (emülatör, web) izin satırı yok, tercihler yine düzenlenebilir.
  const editable = allowed || permission === 'unsupported';

  return (
    <ScrollView
      style={settingsStyles.screen}
      contentContainerStyle={settingsStyles.content}
      contentInsetAdjustmentBehavior="automatic">
      {permission !== 'unsupported' && (
        <SettingsGroup footer={allowed ? undefined : t(Platform.OS === 'android' ? 'notifications.systemOffFooterAndroid' : 'notifications.systemOffFooter')}>
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
              <Toggle
                value={!(muted.data ?? []).includes(kind)}
                onValueChange={(on) => toggle(kind, on)}
                disabled={!muted.data || !editable}
              />
            }
          />
        ))}
      </SettingsGroup>
      <BottomInsetSpacer />
    </ScrollView>
  );
}
