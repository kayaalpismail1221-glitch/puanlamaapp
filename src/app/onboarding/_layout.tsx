import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: '',
        headerTransparent: true,
        headerTintColor: colors.primary,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="telefon" />
      <Stack.Screen name="eposta" />
      <Stack.Screen name="ad" />
      <Stack.Screen name="sifre" />
      {/* Hesap oluşturulduktan sonra kayıt adımlarına geri dönülmesin */}
      <Stack.Screen name="ilk-puan" options={{ headerBackVisible: false, gestureEnabled: false }} />
      <Stack.Screen name="takip" />
    </Stack>
  );
}
