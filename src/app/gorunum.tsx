import { useTranslation } from 'react-i18next';
import { Platform, ScrollView } from 'react-native';

import { SettingsGroup, SettingsRow, settingsStyles } from '@/components/settings-list';
import {
  APPEARANCES,
  setAppearancePreference,
  useAppearancePreference,
  type AppearancePreference,
} from '@/lib/appearance';
import { haptics } from '@/lib/haptics';

/**
 * Görünüm seçimi: cihazı izle ya da açık/koyu sabitle.
 * Seçim anında uygulanır; renkler yeniden çizim beklemeden değişir.
 */
export default function AppearanceScreen() {
  const { t } = useTranslation();
  const preference = useAppearancePreference();

  const choose = (next: AppearancePreference) => {
    if (next === preference) return;
    haptics.select();
    setAppearancePreference(next);
  };

  return (
    <ScrollView
      style={settingsStyles.screen}
      contentContainerStyle={settingsStyles.content}
      contentInsetAdjustmentBehavior="automatic">
      <SettingsGroup footer={t(Platform.OS === 'android' ? 'appearance.footerAndroid' : 'appearance.footer')}>
        {APPEARANCES.map((option, i) => (
          <SettingsRow
            key={option}
            label={t(`appearance.options.${option}`)}
            checked={preference === option}
            onPress={() => choose(option)}
            last={i === APPEARANCES.length - 1}
          />
        ))}
      </SettingsGroup>
    </ScrollView>
  );
}
