import { Stack } from 'expo-router';

import { largeTitleStackOptions } from '@/constants/navigation';

export default function SavedListLayout() {
  return (
    <Stack screenOptions={largeTitleStackOptions}>
      <Stack.Screen name="index" options={{ title: 'Listem' }} />
    </Stack>
  );
}
