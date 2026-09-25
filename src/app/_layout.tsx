import { QueryClientProvider } from '@tanstack/react-query';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { BackendSetup } from '@/components/backend-setup';
import { LaunchSkeleton } from '@/components/skeleton';
import { ErrorView } from '@/components/ui';
import { colors } from '@/constants/theme';
import { useLanguageLoaded } from '@/i18n';
import { usePushNotifications } from '@/lib/notifications';
import { queryClient } from '@/lib/query-client';
import { isBackendConfigured } from '@/lib/supabase';
import { AppStoreProvider, useAppActions, useAppSelector } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();

/** "Paylaş → Puanla" uzantısı yerel kod ister: Expo Go'da ve web'de kapalı */
const shareIntentDisabled =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
  },
};

function RootNavigator() {
  // Kök gezgin yalnızca açılış/oturum durumunu dinler; beğeni, takip gibi değişiklikler tüm Stack'i yeniden çizmesin
  const status = useAppSelector((s) => s.status);
  const prefsLoaded = useAppSelector((s) => s.prefsLoaded);
  const ready = useAppSelector((s) => s.ready);
  const loadError = useAppSelector((s) => s.loadError);
  const onboarded = useAppSelector((s) => !!s.profile?.onboardedAt);
  const actions = useAppActions();
  const { t } = useTranslation();
  const languageLoaded = useLanguageLoaded();

  // Açılış görseli yalnızca oturum, tercihler ve dil okunana kadar kalır (anlık, cihazdan);
  // kullanıcı verisi sunucudan beklenirken Feed iskeleti gösterilir
  const booting = status === 'loading' || !prefsLoaded || !languageLoaded;
  const loadingData = status === 'signedIn' && !ready;
  const deciding = booting || loadingData;
  const splashDone = !booting || !!loadError;
  const showOnboarding = status === 'signedOut' || !onboarded;
  usePushNotifications(!deciding && !showOnboarding);

  useEffect(() => {
    if (splashDone) SplashScreen.hideAsync();
  }, [splashDone]);

  if (deciding) {
    if (loadError) return <ErrorView onRetry={actions.refresh} style={{ flex: 1 }} />;
    return loadingData ? <LaunchSkeleton /> : null;
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={showOnboarding}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!showOnboarding}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="mekan/[id]" options={{ title: '', headerTransparent: true }} />
        <Stack.Screen name="mekan-puanla" options={{ presentation: 'modal', title: t('screens.ratePlace') }} />
        <Stack.Screen name="arkadas-bul" options={{ presentation: 'modal', title: t('screens.findFriends') }} />
        <Stack.Screen name="kullanici/[id]" options={{ title: '' }} />
        <Stack.Screen name="listeye-ekle" options={{ presentation: 'modal', title: t('screens.addToList') }} />
        <Stack.Screen name="gonderi/[id]" options={{ title: t('screens.post') }} />
        <Stack.Screen name="kaydedilen-gonderiler" options={{ title: t('screens.savedPosts') }} />
        <Stack.Screen name="konum-sec" options={{ presentation: 'modal', title: t('screens.chooseLocation') }} />
        <Stack.Screen name="siralama" options={{ title: t('screens.leaderboard') }} />
        <Stack.Screen name="baglantilar/[id]" options={{ title: '' }} />
        <Stack.Screen name="gittiklerim/[id]" options={{ title: t('screens.beenTo') }} />
        <Stack.Screen name="gittigi-yerler/[id]" options={{ title: '' }} />
        <Stack.Screen name="profil-duzenle" options={{ presentation: 'modal', title: t('screens.editProfile') }} />
        <Stack.Screen name="ayarlar" options={{ title: t('screens.settings') }} />
        <Stack.Screen name="dil" options={{ title: t('screens.language') }} />
        <Stack.Screen name="engellenenler" options={{ title: t('screens.blocked') }} />
        <Stack.Screen name="oneriler" options={{ title: t('screens.recs') }} />
        <Stack.Screen name="gonderi-duzenle" options={{ presentation: 'modal', title: t('screens.editPost') }} />
        <Stack.Screen name="harita-paylas/[id]" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="paylasim-al" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="yol-tarifi/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="bildirimler" options={{ title: t('screens.notifications') }} />
        <Stack.Screen name="bildirim-ayarlari" options={{ title: t('screens.notificationSettings') }} />
        <Stack.Screen name="telefon-dogrula" options={{ presentation: 'modal', headerTransparent: true, title: '' }} />
        <Stack.Screen name="hikaye" options={{ presentation: 'modal', title: t('screens.story') }} />
        <Stack.Screen name="okul-sec" options={{ presentation: 'modal', title: t('screens.school') }} />
        <Stack.Screen
          name="profil-fotografi"
          options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
        />
      </Stack.Protected>

      {/* Puanlama, gönderi ve mekân ekleme hem onboarding'de hem uygulama içinde kullanılır */}
      <Stack.Screen name="gonderi-olustur" options={{ presentation: 'modal', title: t('screens.sharePost') }} />
      <Stack.Screen name="mekan-ekle" options={{ presentation: 'modal', title: t('screens.newPlace') }} />
      <Stack.Screen name="davet-et" options={{ presentation: 'modal', title: t('screens.invite') }} />
      <Stack.Screen name="yasal/[belge]" options={{ presentation: 'modal', title: '' }} />
      <Stack.Screen
        name="degerlendir/[id]"
        options={{ presentation: 'modal', headerShown: false, gestureEnabled: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (!isBackendConfigured) SplashScreen.hideAsync();
  }, []);

  if (!isBackendConfigured) return <BackendSetup />;

  return (
    <ShareIntentProvider options={{ disabled: shareIntentDisabled, resetOnBackground: true }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <ThemeProvider value={navigationTheme}>
            <QueryClientProvider client={queryClient}>
              <AppStoreProvider>
                <StatusBar style="dark" />
                <RootNavigator />
              </AppStoreProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}
