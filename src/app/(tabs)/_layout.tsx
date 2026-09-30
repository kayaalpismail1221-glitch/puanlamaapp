import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { colors } from '@/constants/theme';

/**
 * Alt bar: sistemin kendi sekme çubuğu (native tabs). iOS'ta UITabBar (iOS 26'da Liquid Glass),
 * Android'de Material 3 gezinme çubuğu: seçili sekmede açık lacivert gösterge, ikonlar Material (`md`).
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const android = Platform.OS === 'android';
  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={android ? { default: colors.textSecondary, selected: colors.primary } : colors.textSecondary}
      labelStyle={
        android
          ? { default: { color: colors.textSecondary }, selected: { color: colors.primary, fontWeight: '600' } }
          : { color: colors.textSecondary }
      }
      backgroundColor={android ? colors.background : undefined}
      indicatorColor={colors.primarySoft}
      rippleColor={colors.ripple}
      labelVisibilityMode="labeled">
      <NativeTabs.Trigger name="(feed)">
        <NativeTabs.Trigger.Label>{t('tabs.feed')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="ara">
        <NativeTabs.Trigger.Label>{t('tabs.search')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="harita">
        <NativeTabs.Trigger.Label>{t('tabs.map')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="listem">
        <NativeTabs.Trigger.Label>{t('tabs.list')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'bookmark', selected: 'bookmark.fill' }} md="bookmark" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profilim">
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
