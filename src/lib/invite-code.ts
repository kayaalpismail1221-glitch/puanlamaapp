import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import { inviterFromReferrer, normalizeInviteCode } from '@/lib/invite-referrer';
import type { User } from '@/types';

/**
 * Telefondan bağımsız davet: davet bağlantısı davet edenin kullanıcı adını taşır, bağlantıyla katılan kişi ona
 * kendiliğinden bağlanır (`set_inviter`: "Seni kim davet etti?" ile aynı kayıt ve XP; bir kez, ilk 30 gün,
 * davet eden önce katılmış olmalı). Kod iki yoldan gelir:
 * - Android: Google Play bağlantısındaki `referrer` (`lib/invite-referrer` → `playInviteUrl`); Play yüklemeden sonra uygulamaya aktarır,
 *   ilk açılışta bir kez okunur (`checkInstallReferrer`).
 * - Uygulama yüklüyse `expeat://davet/<kullanıcı adı>` ya da `https://expeat.app/davet/<kullanıcı adı>` evrensel
 *   bağlantısı (`+native-intent`; evrensel bağlantı alan adı ve `associatedDomains`'li derlemeyle çalışır).
 * iOS mağazası kaynak aktarmaz: alan adı + web sayfası gelene kadar orada mesajdaki "@kullanıcı adı yaz" ipucu kalır.
 * Kod kayıttan önce gelebilir: cihazda saklanır, oturum açılınca uygulanır (`applyPendingInviter`).
 */

const PENDING_KEY = 'puanla:pending-inviter';
const REFERRER_CHECKED_KEY = 'puanla:install-referrer-checked';

const listeners = new Set<() => void>();

/** Bağlantıdan gelen kodu saklar; oturum açıksa hemen uygulanır */
export async function rememberInviter(code: string | undefined) {
  const username = normalizeInviteCode(code);
  if (!username) return;
  await AsyncStorage.setItem(PENDING_KEY, username).catch(() => {});
  listeners.forEach((listener) => listener());
}

export function onInviterRemembered(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Android: Play yükleme kaynağını ilk açılışta bir kez okur (kaynak 90 gün saklanır, her açılışta sorulmaz) */
export async function checkInstallReferrer() {
  if (Platform.OS !== 'android') return;
  try {
    if (await AsyncStorage.getItem(REFERRER_CHECKED_KEY)) return;
    const referrer = await Application.getInstallReferrerAsync();
    await AsyncStorage.setItem(REFERRER_CHECKED_KEY, '1');
    await rememberInviter(inviterFromReferrer(referrer));
  } catch {
    // Play Hizmetleri yok ya da yanıt vermedi: bir sonraki açılışta yeniden denenir
  }
}

/**
 * Saklanan kodu oturumdaki hesaba uygular; davet edeni döner. Kalıcı ret (zaten kayıtlı, 30 gün geçti, kullanıcı
 * yok, davet eden daha yeni) kodu siler; ağ hatasında kod kalır, sonra yeniden denenir.
 */
export async function applyPendingInviter(): Promise<User | undefined> {
  const username = await AsyncStorage.getItem(PENDING_KEY).catch(() => null);
  if (!username) return undefined;
  try {
    // Geç yükleme: `+native-intent` bu modülü açılışta içe aktarır, API katmanı orada gerekmez
    const { setInviter } = await import('@/api/content');
    const inviter = await setInviter(username);
    await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    return inviter;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P0001' || code === 'P0002') await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    return undefined;
  }
}
