import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

export default function FeedLayout() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerLargeTitleShadowVisible: false,
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerLargeTitleStyle: { color: colors.primary },
        headerTitleStyle: { color: colors.primary },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: 'Feed' }} />
    </Stack>
  );
}
