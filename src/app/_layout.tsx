import { QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { BackendSetup } from '@/components/backend-setup';
import { ErrorView, LoadingView } from '@/components/ui';
import { colors } from '@/constants/theme';
import { queryClient } from '@/lib/query-client';
import { isBackendConfigured } from '@/lib/supabase';
import { AppStoreProvider, useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();

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
  const { status, prefsLoaded, ready, loadError, onboarded, actions } = useAppStore();

  // Oturum ve kullanıcı verisi belli olana kadar açılış ekranı kalır
  const deciding = status === 'loading' || !prefsLoaded || (status === 'signedIn' && !ready);
  const splashDone = !deciding || !!loadError;

  useEffect(() => {
    if (splashDone) SplashScreen.hideAsync();
  }, [splashDone]);

  if (deciding) {
    if (loadError) return <ErrorView onRetry={actions.refresh} style={{ flex: 1 }} />;
    // Kayıt/giriş sonrası veri yüklenirken (açılış ekranı çoktan kapanmış olabilir)
    return status === 'signedIn' ? <LoadingView style={{ flex: 1 }} /> : null;
  }

  const showOnboarding = status === 'signedOut' || !onboarded;

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
        <Stack.Screen name="mekan-puanla" options={{ presentation: 'modal', title: 'Mekân puanla' }} />
        <Stack.Screen name="arkadas-bul" options={{ presentation: 'modal', title: 'Arkadaş bul' }} />
        <Stack.Screen name="kullanici/[id]" options={{ title: '' }} />
        <Stack.Screen name="listeye-ekle" options={{ presentation: 'modal', title: 'Listeme ekle' }} />
        <Stack.Screen name="gonderi/[id]" options={{ title: 'Gönderi' }} />
        <Stack.Screen name="kaydedilen-gonderiler" options={{ title: 'Kaydedilen gönderiler' }} />
        <Stack.Screen name="konum-sec" options={{ presentation: 'modal', title: 'Konum seç' }} />
        <Stack.Screen name="siralama" options={{ title: 'Liderlik tablosu' }} />
        <Stack.Screen name="baglantilar/[id]" options={{ title: '' }} />
        <Stack.Screen name="gittiklerim/[id]" options={{ title: 'Gittiklerim' }} />
        <Stack.Screen name="gittigi-yerler/[id]" options={{ title: '' }} />
        <Stack.Screen name="profil-duzenle" options={{ presentation: 'modal', title: 'Profili düzenle' }} />
        <Stack.Screen name="ayarlar" options={{ title: 'Ayarlar' }} />
        <Stack.Screen name="okul-sec" options={{ presentation: 'modal', title: 'Okulun' }} />
      </Stack.Protected>

      {/* Puanlama, gönderi ve mekân ekleme hem onboarding'de hem uygulama içinde kullanılır */}
      <Stack.Screen name="gonderi-olustur" options={{ presentation: 'modal', title: 'Gönderi paylaş' }} />
      <Stack.Screen name="mekan-ekle" options={{ presentation: 'modal', title: 'Yeni mekân' }} />
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
  );
}
