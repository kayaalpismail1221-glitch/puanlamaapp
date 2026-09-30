import { useNavigationContainerRef } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Appearance, Platform } from 'react-native';

import type { Scheme } from '@/constants/theme';

const android = Platform.OS === 'android';

type NavigationState = ReturnType<ReturnType<typeof useNavigationContainerRef>['getRootState']>;

/**
 * Android'de `colors` renk kaynaklarından (`PlatformColor`) okunur; çizilmiş bir görünüm rengini yalnızca yeniden
 * oluşturulunca yeni görünümden alır. Görünüm (Ayarlar → Görünüm ya da sistem) değişince bu anahtar değişir ve
 * gezinme ağacı yeniden kurulur; açık sekmeler ve ekran yığını olduğu gibi geri yüklenir (kullanıcı yerinde kalır).
 * iOS'ta `DynamicColorIOS` kendiliğinden uyar, anahtar sabit.
 */
export function useAppearanceRemountKey(scheme: Scheme): string {
  const navigation = useNavigationContainerRef();
  const snapshot = useRef<NavigationState | undefined>(undefined);

  // Görünüm olayı React yeniden çizmeden önce gelir: gezinme durumu eski ağaç yerindeyken alınır
  useEffect(() => {
    if (!android) return;
    const subscription = Appearance.addChangeListener(() => {
      snapshot.current = navigation.isReady() ? navigation.getRootState() : undefined;
    });
    return () => subscription.remove();
  }, [navigation]);

  // Yeni ağaç kurulduktan sonra ekranlar geri yüklenir
  useEffect(() => {
    const state = snapshot.current;
    if (!android || !state) return;
    snapshot.current = undefined;
    navigation.resetRoot(state);
  }, [scheme, navigation]);

  return android ? scheme : 'ios';
}
