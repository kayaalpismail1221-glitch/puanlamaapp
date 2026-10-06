import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { emailRegistered } from '@/api/auth';
import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { isValidEmail } from '@/lib/validation';
import { useAppStore } from '@/store/app-store';

/**
 * 2. E-posta. Hatalar açılır pencere değil, alanın altında kırmızı yazı (kullanıcı isteği 2026-10-02): biçim yanlışsa
 * ya da adres zaten kayıtlıysa "Devam" çalışmaz; kayıtlıysa giriş ekranına kısayol.
 */
export default function EmailStep() {
  const { draft, actions } = useAppStore();
  const { t } = useTranslation();
  const [email, setEmail] = useState(draft.email ?? '');
  const [touched, setTouched] = useState(false);
  const [checking, setChecking] = useState(false);
  const normalized = email.trim().toLowerCase();
  const valid = isValidEmail(email);
  const registered = useEmailRegistered(valid ? normalized : '');

  const next = async () => {
    if (!valid) {
      setTouched(true);
      haptics.warning();
      return;
    }
    if (registered.value === true || checking) {
      haptics.warning();
      return;
    }
    // Yazar yazmaz "Devam"a basıldıysa kontrol henüz bitmemiş olabilir: bekle
    if (registered.value === undefined) {
      setChecking(true);
      const taken = await registered.check();
      setChecking(false);
      if (taken) {
        haptics.warning();
        return;
      }
    }
    actions.updateDraft({ email: normalized });
    router.push('/onboarding/ad');
  };

  const taken = registered.value === true;
  const error = touched && !valid ? t('onboarding.emailInvalid') : taken ? t('onboarding.emailTaken') : undefined;

  return (
    <OnboardingStep
      title={t('onboarding.emailTitle')}
      subtitle={t('onboarding.emailSubtitle')}
      footer={
        <Button title={t('onboarding.next')} onPress={next} disabled={!email.trim() || taken} loading={checking} />
      }>
      <BigInput
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          if (touched) setTouched(false);
        }}
        placeholder={t('onboarding.emailPlaceholder')}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={next}
        style={{ fontSize: 24 }}
        valid={valid && registered.value === false}
        error={error}
      />
      {taken && (
        <Animated.View entering={FadeIn.duration(200)}>
          <PressableScale
            onPress={() => router.replace({ pathname: '/onboarding/giris', params: { email: normalized } })}
            haptic={false}
            style={styles.signIn}>
            <Text variant="subhead" color={colors.primary} style={styles.bold}>
              {t('onboarding.signInInstead')}
            </Text>
          </PressableScale>
        </Animated.View>
      )}
    </OnboardingStep>
  );
}

/**
 * Yazılan e-posta kayıtlı mı: yazmayı bırakınca sorulur. `value` yalnızca şu anki adres içindir (yanıtı gelmeden
 * adres değişirse `undefined`); `check` beklemeden hemen sorar. Sunucuya ulaşılamazsa kayıtlı sayılmaz, engellenmez
 * (kayıt isteği yine söyler, şifre adımında alanın altında).
 */
function useEmailRegistered(email: string) {
  const debounced = useDebounced(email, 400);
  const [result, setResult] = useState<{ email: string; taken: boolean }>();

  useEffect(() => {
    if (!debounced) return;
    let active = true;
    emailRegistered(debounced).then((taken) => {
      if (active) setResult({ email: debounced, taken: taken ?? false });
    });
    return () => {
      active = false;
    };
  }, [debounced]);

  return {
    value: email && result?.email === email ? result.taken : undefined,
    check: async () => {
      const taken = (await emailRegistered(email)) ?? false;
      setResult({ email, taken });
      return taken;
    },
  };
}

const styles = StyleSheet.create({
  signIn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
});
