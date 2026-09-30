import { QueryClientProvider } from '@tanstack/react-query';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, usePathname, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Fragment, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { BackendSetup } from '@/components/backend-setup';
import { DialogHost } from '@/components/dialog-host';
import { LaunchSkeleton } from '@/components/skeleton';
import { ErrorView } from '@/components/ui';
import { FoodMapShareButton } from '@/components/food-map-header';
import { FloatingBackButton } from '@/components/header-button';
import { SYMBOL_FONTS } from '@/components/symbol';
import { ZoomOverlayProvider } from '@/components/zoom-overlay';
import { modal, platformStackOptions } from '@/constants/navigation';
import { type Palette, type Scheme } from '@/constants/theme';
import { useAppearanceRemountKey } from '@/hooks/use-appearance-remount';
import { usePalette, useScheme } from '@/hooks/use-palette';
import { useShareIntentRedirect } from '@/hooks/use-share-intent-redirect';
import { useLanguageLoaded } from '@/i18n';
import { useAppearanceLoaded } from '@/lib/appearance';
import { usePushNotifications } from '@/lib/notifications';
import { isSamePath, takeLink } from '@/lib/pending-link';
import { queryClient } from '@/lib/query-client';
import { useTabIconsReady } from '@/lib/tab-icons';
import { isBackendConfigured } from '@/lib/supabase';
import { AppStoreProvider, useAppActions, useAppSelector } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();

/**
 * Uygulama kapalıyken açılan bağlantıda (`puanla://mekan/…`, bildirim, paylaşım uzantısı) sekmeler yığının altında
 * durur: geri düğmesi ve alt çubuk çalışır, ekran çıkmaza düşmez.
 */
export const unstable_settings = { anchor: '(tabs)' };

/** "Paylaş → Puanla" uzantısı yerel kod ister: Expo Go'da ve web'de kapalı */
const shareIntentDisabled =
  Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** Gezinme teması düz renk ister (başlık ve geçiş renkleri JS'te işlenir) */
const navigationTheme = (scheme: Scheme, palette: Palette) => {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.border,
    },
  };
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
  const appearanceLoaded = useAppearanceLoaded();
  const palette = usePalette();
  // Android ve web ikon yazı tipleri (components/symbol); iOS'ta boş, hemen hazır
  const [symbolsLoaded, symbolsError] = useFonts(SYMBOL_FONTS);
  const tabIconsReady = useTabIconsReady();

  // Açılış görseli yalnızca oturum, tercihler, dil ve ikonlar hazır olana kadar kalır (anlık, cihazdan);
  // kullanıcı verisi sunucudan beklenirken Feed iskeleti gösterilir
  const booting =
    status === 'loading' ||
    !prefsLoaded ||
    !languageLoaded ||
    !appearanceLoaded ||
    !(symbolsLoaded || symbolsError) ||
    !tabIconsReady;
  const loadingData = status === 'signedIn' && !ready;
  const deciding = booting || loadingData;
  const splashDone = !booting || !!loadError;
  const showOnboarding = status === 'signedOut' || !onboarded;
  usePushNotifications(!deciding && !showOnboarding);
  useShareIntentRedirect(!deciding && !showOnboarding);
  usePendingLink(!deciding && !showOnboarding);

  useEffect(() => {
    if (splashDone) SplashScreen.hideAsync();
  }, [splashDone]);

  if (deciding) {
    // Önbellek yokken veri yüklenemezse: tekrar dene ya da oturumu kapat (ör. profil satırı yoksa çıkış tek yol)
    if (loadError)
      return (
        <ErrorView
          onRetry={actions.refresh}
          action={{ title: t('settings.logout'), onPress: actions.signOut }}
          style={{ flex: 1 }}
        />
      );
    return loadingData ? <LaunchSkeleton /> : null;
  }

  return (
    <Stack
      screenOptions={{
        ...platformStackOptions(palette),
        headerTintColor: palette.primary,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: palette.background },
      }}>
      <Stack.Protected guard={showOnboarding}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!showOnboarding}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="mekan/[id]"
          options={{
            title: '',
            headerTransparent: true,
            // Android üst çubuğunun zemin rengi (platformStackOptions) saydamlığı ezmesin
            headerStyle: { backgroundColor: 'transparent' },
            // Android: geri oku fotoğraf üstünde okunsun diye yüzen yuvarlak düğme
            ...(Platform.OS === 'android' && { headerLeft: () => <FloatingBackButton /> }),
          }}
        />
        <Stack.Screen name="mekan-puanla" options={{ ...modal, title: t('screens.ratePlace') }} />
        <Stack.Screen name="arkadas-bul" options={{ ...modal, title: t('screens.findFriends') }} />
        <Stack.Screen name="kullanici/[id]" options={{ title: '' }} />
        <Stack.Screen name="listeye-ekle" options={{ ...modal, title: t('screens.addToList') }} />
        <Stack.Screen name="gonderi/[id]" options={{ title: t('screens.post') }} />
        <Stack.Screen name="kaydedilen-gonderiler" options={{ title: t('screens.savedPosts') }} />
        <Stack.Screen name="konum-sec" options={{ ...modal, title: t('screens.chooseLocation') }} />
        <Stack.Screen name="siralama" options={{ title: t('screens.leaderboard') }} />
        <Stack.Screen name="hedef" options={{ title: t('screens.yearGoal') }} />
        <Stack.Screen name="baglantilar/[id]" options={{ title: '' }} />
        <Stack.Screen name="gittiklerim/[id]" options={{ title: t('screens.beenTo') }} />
        <Stack.Screen
          name="gittigi-yerler/[id]"
          options={({ route }) => ({
            title: '',
            headerRight: () => <FoodMapShareButton userId={(route.params as { id: string }).id} />,
          })}
        />
        <Stack.Screen name="profil-duzenle" options={{ ...modal, title: t('screens.editProfile') }} />
        <Stack.Screen name="ayarlar" options={{ title: t('screens.settings') }} />
        <Stack.Screen name="dil" options={{ title: t('screens.language') }} />
        <Stack.Screen name="gorunum" options={{ title: t('screens.appearance') }} />
        <Stack.Screen name="puanlama" options={{ ...modal, title: t('screens.scoring') }} />
        <Stack.Screen name="engellenenler" options={{ title: t('screens.blocked') }} />
        <Stack.Screen name="oneriler" options={{ title: t('screens.recs') }} />
        <Stack.Screen name="bolge" options={{ title: '' }} />
        <Stack.Screen name="uyum/[id]" options={{ title: t('match.title') }} />
        <Stack.Screen name="liste/[id]" options={{ title: '' }} />
        <Stack.Screen name="gonderi-duzenle" options={{ ...modal, title: t('screens.editPost') }} />
        <Stack.Screen name="harita-paylas/[id]" options={{ ...modal, headerShown: false }} />
        <Stack.Screen name="paylasim-al" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="yol-tarifi/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="bildirimler" options={{ title: t('screens.notifications') }} />
        <Stack.Screen name="bildirim-ayarlari" options={{ title: t('screens.notificationSettings') }} />
        <Stack.Screen
          name="telefon-dogrula"
          options={{ ...modal, headerTransparent: true, headerStyle: { backgroundColor: 'transparent' }, title: '' }}
        />
        <Stack.Screen name="hikaye" options={{ ...modal, title: t('screens.story') }} />
        <Stack.Screen name="favoriler" options={{ ...modal, title: t('screens.favorites') }} />
        <Stack.Screen name="liste-duzenle" options={{ ...modal, title: t('screens.newList') }} />
        <Stack.Screen name="okul-sec" options={{ ...modal, title: t('screens.school') }} />
        <Stack.Screen
          name="profil-fotografi"
          options={{ presentation: 'transparentModal', animation: 'fade', headerShown: false }}
        />
      </Stack.Protected>

      {/* Puanlama, gönderi ve mekân ekleme hem onboarding'de hem uygulama içinde kullanılır; oturum ister */}
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="gonderi-olustur" options={{ ...modal, title: t('screens.sharePost') }} />
        <Stack.Screen name="mekan-ekle" options={{ ...modal, title: t('screens.newPlace') }} />
        <Stack.Screen name="mekan-duzelt/[id]" options={{ ...modal, title: t('screens.fixPlace') }} />
        <Stack.Screen name="davet-et" options={{ ...modal, title: t('screens.invite') }} />
        <Stack.Screen
          name="degerlendir/[id]"
          options={{ ...modal, headerShown: false, gestureEnabled: false }}
        />
      </Stack.Protected>
      <Stack.Screen name="yasal/[belge]" options={{ ...modal, title: '' }} />
      <Stack.Screen name="+not-found" options={{ title: '' }} />
    </Stack>
  );
}

/**
 * Kurulum bitmeden gelen bağlantı kurulumdan sonra açılır (`lib/pending-link`). Uygulama hazırken gelen bağlantıyı
 * gezgin zaten açmıştır: yol şu anki ekranla aynıysa yalnızca silinir.
 */
function usePendingLink(ready: boolean) {
  const pathname = usePathname();
  useEffect(() => {
    if (!ready) return;
    const link = takeLink();
    if (!link || isSamePath(link, pathname)) return;
    // Korunan rotalar bu çizimde kaydolur; yönlendirme bir kare sonra (iptal edilmez: bağlantı zaten alındı)
    requestAnimationFrame(() => router.push(link as Href));
  }, [ready, pathname]);
}

export default function RootLayout() {
  const scheme = useScheme();
  const palette = usePalette();
  const theme = useMemo(() => navigationTheme(scheme, palette), [scheme, palette]);
  // Android: görünüm değişince ekranlar yeni renk kaynaklarıyla yeniden kurulur (veri ve oturum yerinde kalır)
  const appearanceKey = useAppearanceRemountKey(scheme);

  useEffect(() => {
    if (!isBackendConfigured) SplashScreen.hideAsync();
  }, []);

  // Kök pencere zemini (modal açılırken ve klavye geçişlerinde görünen alan)
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(palette.background).catch(() => {});
  }, [palette.background]);

  if (!isBackendConfigured) return <BackendSetup />;

  return (
    <ShareIntentProvider options={{ disabled: shareIntentDisabled, resetOnBackground: true }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <ThemeProvider value={theme}>
            <QueryClientProvider client={queryClient}>
              <AppStoreProvider>
                <StatusBar style="auto" />
                <Fragment key={appearanceKey}>
                  {/* Yakınlaştırılan fotoğraf gezinmenin (başlık, alt bar) üstünde çizilir */}
                  <ZoomOverlayProvider>
                    <RootNavigator />
                  </ZoomOverlayProvider>
                  {/* Menü ve uyarı pencereleri (lib/dialog): modal ekranların da üstünde */}
                  <DialogHost />
                </Fragment>
              </AppStoreProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ShareIntentProvider>
  );
}
