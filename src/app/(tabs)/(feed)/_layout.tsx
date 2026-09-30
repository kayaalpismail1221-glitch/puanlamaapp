import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useLargeTitleStackOptions } from '@/constants/navigation';

export default function FeedLayout() {
  const { t } = useTranslation();
  const screenOptions = useLargeTitleStackOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: t('tabs.feed') }} />
    </Stack>
  );
}
