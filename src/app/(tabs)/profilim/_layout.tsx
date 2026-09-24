import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { colors } from '@/constants/theme';

export default function ProfileLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.primary },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: t('tabs.profile') }} />
    </Stack>
  );
}
