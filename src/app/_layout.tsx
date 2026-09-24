import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { colors } from '@/constants/theme';
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
  const { hydrated, onboarded } = useAppStore();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={onboarded}>
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
        <Stack.Screen name="profil-duzenle" options={{ presentation: 'modal', title: 'Profili düzenle' }} />
        <Stack.Screen name="ayarlar" options={{ title: 'Ayarlar' }} />
        <Stack.Screen name="okul-sec" options={{ presentation: 'modal', title: 'Okulun' }} />
      </Stack.Protected>

      {/* Puanlama ve gönderi akışı hem onboarding'de hem uygulama içinde kullanılır */}
      <Stack.Screen name="gonderi-olustur" options={{ presentation: 'modal', title: 'Gönderi paylaş' }} />
      <Stack.Screen
        name="degerlendir/[id]"
        options={{ presentation: 'modal', headerShown: false, gestureEnabled: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider value={navigationTheme}>
          <AppStoreProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </AppStoreProvider>
        </ThemeProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
