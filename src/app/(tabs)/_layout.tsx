import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { usePalette } from '@/hooks/use-palette';
import { androidTabIcon } from '@/lib/tab-icons';

const android = Platform.OS === 'android';

/**
 * Alt bar. iOS: sistem sekme çubuğu (iOS 26'da Liquid Glass), SF Symbols.
 * Android: Material 3 gezinme çubuğu, marka renkleriyle (varsayılanı duvar kâğıdından renk alır): zemin sayfayla
 * aynı, seçili sekmede lacivert tonlu hap ve dolu ikon, etiket kalınlaşır; geri tuşu önce Feed'e döner.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const palette = usePalette();

  const icon = (sf: string, selectedSf: string) =>
    android ? { src: androidTabIcon(sf) } : { sf: { default: sf, selected: selectedSf } };

  return (
    <NativeTabs
      tintColor={palette.primary}
      iconColor={android ? { default: palette.textSecondary, selected: palette.primary } : palette.textSecondary}
      labelStyle={
        android
          ? {
              default: { color: palette.textSecondary, fontSize: 12, fontWeight: '500' },
              selected: { color: palette.primary, fontSize: 12, fontWeight: '700' },
            }
          : { color: palette.textSecondary }
      }
      backgroundColor={android ? palette.background : undefined}
      indicatorColor={palette.navIndicator}
      rippleColor={palette.navIndicator}
      labelVisibilityMode="labeled"
      backBehavior="initialRoute">
      <NativeTabs.Trigger name="(feed)">
        <NativeTabs.Trigger.Label>{t('tabs.feed')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icon('house', 'house.fill')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="ara">
        <NativeTabs.Trigger.Label>{t('tabs.search')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icon('magnifyingglass', 'magnifyingglass')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="harita">
        <NativeTabs.Trigger.Label>{t('tabs.map')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icon('map', 'map.fill')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="listem">
        <NativeTabs.Trigger.Label>{t('tabs.list')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icon('bookmark', 'bookmark.fill')} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profilim">
        <NativeTabs.Trigger.Label>{t('tabs.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon {...icon('person', 'person.fill')} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
