import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { usernameAvailable } from '@/api/auth';
import { useDebounced } from '@/hooks/queries';
import { toUsername } from '@/lib/format';
import { useAppStore } from '@/store/app-store';

/**
 * 2. Ad ve soyad. Kullanıcı adı addan otomatik türetilir; kullanıcı isterse burada değiştirebilir
 * (zorunlu değil). Alınmışsa sistem sonuna sayı ekler (`unique_username`).
 */
export default function NameStep() {
  const { draft, actions } = useAppStore();
  const { t } = useTranslation();
  const [first, ...rest] = (draft.name ?? '').split(' ');
  const [firstName, setFirstName] = useState(first ?? '');
  const [lastName, setLastName] = useState(rest.join(' '));
  const lastRef = useRef<TextInput>(null);
  // null: addan otomatik; metin: kullanıcının seçtiği
  const [customUsername, setCustomUsername] = useState<string | null>(
    draft.username && draft.username !== toUsername((draft.name ?? '').replace(' ', '')) ? draft.username : null,
  );

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const editing = customUsername !== null;
  const username = customUsername ?? toUsername(`${firstName}${lastName}`);
  const usernameValid = username.length >= 3;
  const valid = firstName.trim().length >= 2 && lastName.trim().length >= 2 && (!editing || usernameValid);
  const available = useUsernameAvailability(username);

  const next = () => {
    if (!valid) return;
    actions.updateDraft({ name: fullName, username });
    router.push('/onboarding/sifre');
  };

  return (
    <OnboardingStep
      title={t('onboarding.nameTitle')}
      subtitle={t('onboarding.nameSubtitle')}
      footer={<Button title={t('onboarding.next')} onPress={next} disabled={!valid} />}>
      <View style={styles.fields}>
        <BigInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t('onboarding.firstName')}
          valid={firstName.trim().length >= 2}
          textContentType="givenName"
          autoComplete="given-name"
          autoCapitalize="words"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => lastRef.current?.focus()}
        />
        <BigInput
          ref={lastRef}
          value={lastName}
          onChangeText={setLastName}
          placeholder={t('onboarding.lastName')}
          valid={lastName.trim().length >= 2}
          textContentType="familyName"
          autoComplete="family-name"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={next}
        />
        {editing ? (
          <Animated.View entering={FadeIn} style={styles.preview}>
            <Text variant="footnote" color={colors.textSecondary}>
              {t('onboarding.usernameLabel')}
            </Text>
            <View style={styles.usernameField}>
              <Text variant="body" color={colors.textSecondary}>
                @
              </Text>
              <TextInput
                value={customUsername}
                onChangeText={(text) => setCustomUsername(toUsername(text))}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={24}
                returnKeyType="done"
                onSubmitEditing={next}
                style={[typography.body, styles.usernameInput]}
                accessibilityLabel={t('onboarding.usernameLabel')}
              />
            </View>
            <Text variant="footnote" color={usernameValid ? colors.textSecondary : colors.danger}>
              {usernameValid && available === false ? t('onboarding.usernameTaken').trim() : t('onboarding.usernameRules')}
            </Text>
            <PressableScale onPress={() => setCustomUsername(null)} haptic={false} hitSlop={8}>
              <Text variant="footnote" color={colors.primary} style={styles.bold}>
                {t('onboarding.usernameAuto')}
              </Text>
            </PressableScale>
          </Animated.View>
        ) : (
          username.length >= 3 && (
            <Animated.View entering={FadeIn} style={styles.preview}>
              <Text variant="footnote" color={colors.textSecondary}>
                <Trans
                  i18nKey="onboarding.usernamePreview"
                  values={{ username }}
                  components={{ name: <Text variant="footnote" color={colors.primary} style={styles.bold} /> }}
                />
                {available === false && t('onboarding.usernameTaken')}
              </Text>
              <PressableScale onPress={() => setCustomUsername(username)} haptic={false} hitSlop={8}>
                <Text variant="footnote" color={colors.primary} style={styles.bold}>
                  {t('onboarding.usernameChange')}
                </Text>
              </PressableScale>
            </Animated.View>
          )
        )}
      </View>
    </OnboardingStep>
  );
}

/** Kullanıcı adının boşta olup olmadığı (bilinmiyorsa undefined) */
function useUsernameAvailability(username: string) {
  const debounced = useDebounced(username, 400);
  const [result, setResult] = useState<{ name: string; ok: boolean }>();
  useEffect(() => {
    if (debounced.length < 3) return;
    let active = true;
    usernameAvailable(debounced)
      .then((ok) => active && setResult({ name: debounced, ok }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [debounced]);
  return result?.name === username ? result.ok : undefined;
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.xl,
  },
  preview: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  usernameField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'stretch',
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
  },
  bold: {
    fontWeight: '600',
  },
});
