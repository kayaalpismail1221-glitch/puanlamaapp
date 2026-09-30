import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { usePalette } from '@/hooks/use-palette';

export default function ProfileLayout() {
  const { t } = useTranslation();
  const palette = usePalette();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: palette.primary,
        headerTitleStyle: { color: palette.primary },
        contentStyle: { backgroundColor: palette.background },
      }}>
      <Stack.Screen name="index" options={{ title: t('tabs.profile') }} />
    </Stack>
  );
}
