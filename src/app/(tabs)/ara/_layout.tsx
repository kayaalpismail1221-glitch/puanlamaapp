import { Stack } from 'expo-router';

import { largeTitleStackOptions } from '@/constants/navigation';

export default function SearchLayout() {
  return (
    <Stack screenOptions={largeTitleStackOptions}>
      <Stack.Screen name="index" options={{ title: 'Ara' }} />
    </Stack>
  );
}
