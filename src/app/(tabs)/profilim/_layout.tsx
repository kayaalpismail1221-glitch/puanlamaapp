import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.primary },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: 'Profilim' }} />
    </Stack>
  );
}
