import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { isAcceptablePassword, passwordChecks, passwordStrength } from '@/lib/validation';
import { useAppStore } from '@/store/app-store';

/**
 * 4. Şifre. Güvenlik gereği şifre cihazda saklanmaz;
 * Supabase Auth bağlanınca doğrudan sunucuya gönderilecek.
 */
export default function PasswordStep() {
  const { dispatch } = useAppStore();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [creating, setCreating] = useState(false);

  const strength = passwordStrength(password);
  const checks = passwordChecks(password);
  const valid = isAcceptablePassword(password);

  const create = () => {
    if (!valid) {
      haptics.warning();
      return;
    }
    // TODO(Supabase): signUp({ phone, email, password }) burada çağrılacak; şimdilik kısa bir bekleme
    setCreating(true);
    setTimeout(() => {
      haptics.success();
      setPassword('');
      dispatch({ type: 'signIn' });
      router.replace('/onboarding/ilk-puan');
    }, 700);
  };

  return (
    <OnboardingStep
      title="Bir şifre belirle"
      subtitle="En az 8 karakter; harf ve rakam içersin."
      footer={<Button title="Hesabı oluştur" onPress={create} disabled={!valid} loading={creating} />}>
      <BigInput
        value={password}
        onChangeText={setPassword}
        placeholder="Şifre"
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
            accessibilityLabel={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}>
            <SymbolView name={visible ? 'eye.slash' : 'eye'} tintColor={colors.textSecondary} size={22} />
          </PressableScale>
        }
      />

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
function StrengthBar({ filled, color }: { filled: boolean; color: string }) {
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: withSpring(filled ? 1 : 0, { damping: 18, stiffness: 200 }) }],
  }));
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, fill]} />
    </View>
  );
}

const barColor = (score: number) => (score <= 1 ? colors.danger : score === 2 ? colors.scoreMid : colors.primary);

const styles = StyleSheet.create({
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
