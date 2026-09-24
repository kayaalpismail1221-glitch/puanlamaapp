import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { largeTitleStackOptions } from '@/constants/navigation';

export default function FeedLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={largeTitleStackOptions}>
      <Stack.Screen name="index" options={{ title: t('tabs.feed') }} />
    </Stack>
  );
}
