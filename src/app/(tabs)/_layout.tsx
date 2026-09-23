import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { colors } from '@/constants/theme';

/** Alt bar: iOS'ta sistem sekme çubuğu (native tabs) */
export default function TabsLayout() {
  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={colors.textSecondary}
      labelStyle={{ color: colors.textSecondary }}>
      <NativeTabs.Trigger name="(feed)">
        <NativeTabs.Trigger.Label>Feed</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="harita">
        <NativeTabs.Trigger.Label>Harita</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profilim">
        <NativeTabs.Trigger.Label>Profilim</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
