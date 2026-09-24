import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { SettingsGroup, SettingsRow, settingsStyles } from '@/components/settings-list';
import { LANGUAGES, setLanguagePreference, systemLanguage, useLanguagePreference, type LanguagePreference } from '@/i18n';
import { haptics } from '@/lib/haptics';

/**
 * Dil seçimi: cihaz dilini izle ya da Türkçe/İngilizce sabitle.
 * Seçim anında uygulanır; tüm ekranlar yeni dilde yeniden çizilir.
 */
export default function LanguageScreen() {
  const { t } = useTranslation();
  const preference = useLanguagePreference();

  const choose = (next: LanguagePreference) => {
    if (next === preference) return;
    haptics.select();
    setLanguagePreference(next);
  };

  return (
    <ScrollView
      style={settingsStyles.screen}
      contentContainerStyle={settingsStyles.content}
      contentInsetAdjustmentBehavior="automatic">
      <SettingsGroup>
        <SettingsRow
          label={t('language.system')}
          value={t('language.systemHint', { language: t(`language.names.${systemLanguage()}`) })}
          checked={preference === 'system'}
          onPress={() => choose('system')}
          last
        />
      </SettingsGroup>

      <SettingsGroup footer={t('language.footer')}>
        {LANGUAGES.map((lang, i) => (
          <SettingsRow
            key={lang}
            label={t(`language.names.${lang}`)}
            checked={preference === lang}
            onPress={() => choose(lang)}
            last={i === LANGUAGES.length - 1}
          />
        ))}
      </SettingsGroup>
    </ScrollView>
  );
}
