import { router } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type ColorValue } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { signUp } from '@/api/auth';
import { toUserMessage } from '@/api/errors';
import { LegalConsent } from '@/components/legal-consent';
import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { isAcceptablePassword, passwordChecks, passwordStrength } from '@/lib/validation';
import { useAppStore } from '@/store/app-store';

/**
 * 4. Şifre ve hesabın açılması. Şifre cihazda saklanmaz; doğrudan Supabase Auth'a gider.
 * E-posta doğrulaması açıksa koda, değilse doğrudan ilk puana geçilir
 * (oturum açılınca kök düzen yönlendirir).
 */
export default function PasswordStep() {
  const { draft } = useAppStore();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  // Klavyedeki "Git" ile düğmeye art arda basılırsa ikinci kayıt isteği gitmesin (durum henüz güncellenmemiş olabilir)
  const inFlight = useRef(false);
  // Son kayıt denemesinin hatası; şifre değişince silinir. E-posta kayıtlıysa "Hesabı oluştur" çalışmaz
  const [failure, setFailure] = useState<{ text: string; registered: boolean } | null>(null);

  const strength = passwordStrength(password);
  const checks = passwordChecks(password);
  const valid = isAcceptablePassword(password);

  const create = async () => {
    if (!valid || inFlight.current || failure?.registered) {
      haptics.warning();
      return;
    }
    const email = draft.email;
    if (!email) {
      router.replace('/onboarding/eposta');
      return;
    }
    inFlight.current = true;
    setFailure(null);
    setCreating(true);
    try {
      const { needsVerification } = await signUp({ ...draft, email }, password);
      haptics.success();
      setPassword('');
      if (needsVerification) router.push({ pathname: '/onboarding/dogrula', params: { email } });
    } catch (error) {
      haptics.warning();
      // Hata açılır pencere değil, alanın altında (pencere klavyenin altında kalıyordu); kayıtlı e-postada giriş kısayolu
      setFailure(
        /already registered/i.test((error as Error).message ?? '')
          ? { text: t('onboarding.emailTaken'), registered: true }
          : { text: toUserMessage(error), registered: false },
      );
    } finally {
      inFlight.current = false;
      setCreating(false);
    }
  };

  return (
    <OnboardingStep
      title={t('onboarding.passwordTitle')}
      subtitle={t('onboarding.passwordSubtitle')}
      footer={
        <>
          <Button
            title={t('onboarding.createAccount')}
            onPress={create}
            disabled={!valid || !!failure?.registered}
            loading={creating}
          />
          {/* Kullanım koşulları (topluluk kuralları dahil) hesap oluşturulurken açıkça kabul edilir */}
          <LegalConsent variant="signup" />
        </>
      }>
      <BigInput
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (failure && !failure.registered) setFailure(null);
        }}
        error={failure?.text}
        placeholder={t('onboarding.password')}
        secureTextEntry={!visible}
        textContentType="newPassword"
        autoComplete="new-password"
        passwordRules="minlength: 8; required: lower; required: upper; required: digit;"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={create}
        accessory={
          <PressableScale
            onPress={() => setVisible((v) => !v)}
            hitSlop={hitSlop}
            accessibilityLabel={visible ? t('onboarding.hidePassword') : t('onboarding.showPassword')}>
            <SymbolView name={visible ? 'eye.slash' : 'eye'} tintColor={colors.textSecondary} size={22} />
          </PressableScale>
        }
      />

      {failure?.registered && (
        <PressableScale
          onPress={() => router.replace({ pathname: '/onboarding/giris', params: { email: draft.email } })}
          haptic={false}
          style={styles.signIn}>
          <Text variant="subhead" color={colors.primary} style={styles.bold}>
            {t('onboarding.signInInstead')}
          </Text>
        </PressableScale>
      )}

      <View style={styles.meter}>
        <View style={styles.bars}>
          {[1, 2, 3, 4].map((i) => (
            <StrengthBar key={i} filled={i <= strength.score} color={barColor(strength.score)} />
          ))}
        </View>
        <Text variant="footnote" color={colors.textSecondary} style={styles.strength}>
          {strength.label}
        </Text>
      </View>

      <View style={styles.checks}>
        {checks.map((c) => (
          <View key={c.label} style={styles.check}>
            <SymbolView
              name={c.ok ? 'checkmark.circle.fill' : 'circle'}
              tintColor={c.ok ? colors.primary : colors.textTertiary}
              size={18}
            />
            <Text variant="subhead" color={c.ok ? colors.text : colors.textSecondary}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>
    </OnboardingStep>
  );
}

/** Güç çubuğu parçası: dolunca soldan yaylı şekilde dolar */
function StrengthBar({ filled, color }: { filled: boolean; color: ColorValue }) {
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: withSpring(filled ? 1 : 0, { damping: 18, stiffness: 200 }) }],
  }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, fill]} />
    </View>
  );
}

const barColor = (score: number) => (score <= 1 ? colors.danger : score === 2 ? colors.warning : colors.primary);

const styles = StyleSheet.create({
  signIn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  meter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    transformOrigin: 'left',
  },
  strength: {
    width: 72,
    textAlign: 'right',
    fontWeight: '600',
  },
  checks: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  check: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
