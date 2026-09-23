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
      {/* Giriş yapıldıktan sonra geri dönülmesin */}
      <Stack.Screen name="profil" options={{ headerBackVisible: false, gestureEnabled: false }} />
    </Stack>
  );
}
