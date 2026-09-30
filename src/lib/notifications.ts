import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from '@/api/notifications';
import { fixed } from '@/constants/theme';
import i18n, { currentLanguage } from '@/i18n';
import { showAlert } from '@/lib/dialog';
import { keys, queryClient } from '@/lib/query-client';

/**
 * Push bildirimleri: izin, cihaz jetonu, bildirime dokununca ilgili ekranı açma.
 * Bildirimleri sunucu gönderir (Expo Push API); burada yalnızca cihaz tarafı var.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';
const ASKED_KEY = 'puanla:push-asked';

if (supported) {
  // Uygulama açıkken gelen bildirim de üstte görünsün
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  });
}

/** Bu cihazın jetonu (çıkışta sunucudan silinir) */
let deviceToken: string | undefined;

/**
 * Android 8+ bildirimleri bir kanal üstünden gösterir; Android 13+ izin penceresi de kanal olmadan çıkmaz.
 * Sunucu `channelId` göndermediği için Expo Push "default" kanalını kullanır.
 */
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: i18n.t('notifications.channelName'),
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: fixed.navy,
    showBadge: true,
  });
}

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function pushPermission(): Promise<PushPermission> {
  if (!supported || !Device.isDevice) return 'unsupported';
  return (await Notifications.getPermissionsAsync()).status as PushPermission;
}

/**
 * İzin varsa (ya da `ask` ile istenip verilirse) cihazı oturumdaki kullanıcıya bağlar.
 * Her açılışta sessizce çağrılır: jeton ve dil değişmiş olabilir.
 */
export async function registerDevice(ask = false): Promise<boolean> {
  if (!supported || !Device.isDevice) return false;
  await ensureAndroidChannel().catch(() => {});
  let { status } = await Notifications.getPermissionsAsync();
  if (status === 'undetermined' && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  deviceToken = data;
  await registerPushToken(data, currentLanguage());
  return true;
}

/** Çıkıştan önce: bu cihaz artık o hesabın bildirimlerini almasın */
export async function unregisterDevice() {
  if (!deviceToken) return;
  await unregisterPushToken(deviceToken).catch(() => {});
  deviceToken = undefined;
  clearBadge();
}

export const clearBadge = () => {
  if (supported) Notifications.setBadgeCountAsync(0).catch(() => {});
};

/**
 * İzin henüz sorulmadıysa önce kısa bir açıklama gösterir (sistem penceresi bir kez çıkar,
 * boşa harcanmasın), kullanıcı isterse sistem iznini ister. Kurulum başına bir kez.
 */
export async function offerPushPermission() {
  if ((await pushPermission()) !== 'undetermined') return;
  if (await AsyncStorage.getItem(ASKED_KEY).catch(() => null)) return;
  AsyncStorage.setItem(ASKED_KEY, '1').catch(() => {});
  showAlert(i18n.t('notifications.askTitle'), i18n.t('notifications.askText'), [
    { text: i18n.t('notifications.notNow'), style: 'cancel' },
    { text: i18n.t('notifications.allow'), onPress: () => registerDevice(true).catch(() => {}) },
  ]);
}

/** Bildirimler ekranından izin: sorulmadıysa sistem penceresi, reddedildiyse iOS ayarları */
export async function enablePush(): Promise<boolean> {
  const status = await pushPermission();
  if (status === 'denied') {
    Linking.openSettings();
    return false;
  }
  return registerDevice(true);
}

const refreshCounts = () => {
  queryClient.invalidateQueries({ queryKey: keys.notifications() });
  queryClient.invalidateQueries({ queryKey: keys.unreadNotifications() });
};

function open(response: Notifications.NotificationResponse | null) {
  const path = response?.notification.request.content.data?.path;
  if (typeof path === 'string' && /^[a-z-]+\/[0-9a-f-]{36}$/.test(path)) router.push(`/${path}` as Href);
}

/**
 * Oturum açık ve kurulum bitmişken: cihazı kaydet, ilk seferde izin öner,
 * bildirime dokununca ilgili ekranı aç, gelen bildirimde sayaçları yenile.
 */
export function usePushNotifications(active: boolean) {
  const { i18n: instance } = useTranslation();
  const language = instance.language;

  useEffect(() => {
    if (!active || !supported) return;
    registerDevice().catch(() => {});
    // Açılış ekranı ve ilk yüklemeler bitsin, sonra sor
    const timer = setTimeout(() => offerPushPermission().catch(() => {}), 2500);
    return () => clearTimeout(timer);
    // Dil değişince jeton yeni dille yeniden kaydedilir (bildirim metinleri o dilde gelsin)
  }, [active, language]);

  useEffect(() => {
    if (!active || !supported) return;
    // Uygulama kapalıyken dokunulan bildirim
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        open(response);
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    });
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      open(response);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    });
    const received = Notifications.addNotificationReceivedListener(refreshCounts);
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [active]);
}
