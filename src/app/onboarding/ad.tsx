import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BigInput, OnboardingStep } from '@/components/onboarding-step';
import { Button, Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { toUsername } from '@/lib/format';
import { useAppStore } from '@/store/app-store';

/** 3. Ad ve soyad (kullanıcı adı buradan türetilir, sonra ayarlardan değiştirilebilir) */
export default function NameStep() {
  const { profile, dispatch } = useAppStore();
  const [first, ...rest] = (profile?.name ?? '').split(' ');
  const [firstName, setFirstName] = useState(first ?? '');
  const [lastName, setLastName] = useState(rest.join(' '));
  const lastRef = useRef<TextInput>(null);

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const username = toUsername(`${firstName}${lastName}`);
  const valid = firstName.trim().length >= 2 && lastName.trim().length >= 2;

  const next = () => {
    if (!valid) return;
    dispatch({ type: 'updateProfile', patch: { name: fullName, username } });
    router.push('/onboarding/sifre');
  };

  return (
    <OnboardingStep
      step={3}
      title="Adın ne?"
      subtitle="Arkadaşların seni bu isimle görecek."
      footer={<Button title="Devam" onPress={next} disabled={!valid} />}>
      <View style={styles.fields}>
        <BigInput
          value={firstName}
          onChangeText={setFirstName}
          placeholder="Ad"
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
          placeholder="Soyad"
          textContentType="familyName"
          autoComplete="family-name"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={next}
        />
        {username.length >= 3 && (
          <Animated.View entering={FadeIn} style={styles.preview}>
            <Text variant="footnote" color={colors.textSecondary}>
              Kullanıcı adın: <Text variant="footnote" color={colors.primary} style={styles.bold}>@{username}</Text>
            </Text>
          </Animated.View>
        )}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.xl,
  },
  preview: {
    paddingHorizontal: spacing.xl,
  },
  bold: {
    fontWeight: '600',
  },
});
