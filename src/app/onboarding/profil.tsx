import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { Avatar, Button, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { toUsername } from '@/lib/format';
import { useAppStore } from '@/store/app-store';

/** 3. Kullanıcı adı ve profil fotoğrafı */
export default function ProfileSetupScreen() {
  const { dispatch, profile } = useAppStore();
  const [name, setName] = useState(profile?.name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [avatarUri, setAvatarUri] = useState(profile?.avatarUri);

  const valid = name.trim().length >= 2 && username.length >= 3;

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled) setAvatarUri(result.assets[0]?.uri);
  };

  const next = () => {
    dispatch({ type: 'setProfile', profile: { name: name.trim(), username, avatarUri } });
    router.push('/onboarding/ilk-puanlar');
  };

  return (
    <OnboardingStep
      step={2}
      title="Seni tanıyalım"
      subtitle="Arkadaşların seni bu isimle bulacak."
      footer={<Button title="Devam" onPress={next} disabled={!valid} />}>
      <View style={styles.body}>
        <PressableScale onPress={pickPhoto} style={styles.avatarWrap} accessibilityLabel="Profil fotoğrafı seç">
          <Avatar uri={avatarUri} name={name || '?'} size={112} />
          <View style={styles.cameraBadge}>
            <SymbolView name="camera.fill" tintColor={colors.onPrimary} size={16} />
          </View>
        </PressableScale>

        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Ad soyad
          </Text>
          <TextInput
            value={name}
            onChangeText={(t) => {
              setName(t);
              // Kullanıcı adı elle değiştirilmediyse addan türet
              if (!username || username === toUsername(name)) setUsername(toUsername(t));
            }}
            placeholder="Ör. Ayşe Yılmaz"
            placeholderTextColor={colors.textTertiary}
            textContentType="name"
            style={[typography.body, styles.input]}
          />
        </View>

        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Kullanıcı adı
          </Text>
          <View style={styles.usernameRow}>
            <Text variant="body" color={colors.textSecondary}>
              @
            </Text>
            <TextInput
              value={username}
              onChangeText={(t) => setUsername(toUsername(t))}
              placeholder="kullaniciadi"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              style={[typography.body, styles.usernameInput]}
            />
          </View>
        </View>
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  avatarWrap: {
    alignSelf: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: spacing.sm,
  },
  input: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    color: colors.text,
  },
  usernameRow: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  usernameInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
  },
});
