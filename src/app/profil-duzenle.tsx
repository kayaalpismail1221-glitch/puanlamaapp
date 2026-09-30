import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import type { LocalImage } from '@/api/storage';
import { Avatar, PressableScale, Text } from '@/components/ui';
import { FormScrollView } from '@/components/form-scroll-view';
import { ModalCloseButton } from '@/components/header-button';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { toUsername } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** Profili düzenle: fotoğraf, ad, kullanıcı adı, okul */
export default function EditProfileScreen() {
  const { profile, actions } = useAppStore();
  const { t } = useTranslation();
  const [name, setName] = useState(profile?.name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [avatar, setAvatar] = useState<LocalImage>();
  const [saving, setSaving] = useState(false);
  const avatarUri = avatar?.uri ?? profile?.avatarUri;
  const school = schoolById(profile?.schoolId);

  const valid = name.trim().length >= 2 && username.length >= 3;

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) setAvatar({ uri: asset.uri, width: asset.width, height: asset.height });
  };

  const save = async () => {
    if (!valid || saving || !profile) return;
    setSaving(true);
    const patch = {
      ...(name.trim() !== profile.name && { name: name.trim() }),
      ...(username !== profile.username && { username }),
    };
    // Hata olursa kullanıcıya gösterilir ve ekran açık kalır
    const ok =
      (Object.keys(patch).length === 0 || (await actions.updateProfile(patch))) &&
      (!avatar || (await actions.updateAvatar(avatar)));
    setSaving(false);
    if (ok) {
      haptics.success();
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          // iOS: "Vazgeç" metni; Android: Material tam ekran diyaloğundaki gibi ✕
          headerLeft:
            Platform.OS === 'ios'
              ? () => (
                  <PressableScale onPress={() => router.back()} hitSlop={hitSlop}>
                    <Text variant="body" color={colors.primary}>
                      {t('common.cancel')}
                    </Text>
                  </PressableScale>
                )
              : () => <ModalCloseButton />,
          headerRight: () =>
            saving ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <PressableScale onPress={save} disabled={!valid} hitSlop={hitSlop}>
                <Text variant="headline" color={valid ? colors.primary : colors.textTertiary}>
                  {t('common.save')}
                </Text>
              </PressableScale>
            ),
        }}
      />
      <FormScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <PressableScale onPress={pickPhoto} style={styles.avatar} accessibilityLabel={t('editProfile.changePhotoLabel')}>
          <Avatar uri={avatarUri} name={name || '?'} size={104} />
          <Text variant="subhead" color={colors.primary} style={styles.bold}>
            {t('editProfile.changePhoto')}
          </Text>
        </PressableScale>

        <View style={styles.group}>
          <Field label={t('editProfile.fullName')}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('editProfile.namePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              textContentType="name"
              style={[typography.body, styles.input]}
            />
          </Field>
          <View style={styles.separator} />
          <Field label={t('editProfile.username')}>
            <View style={styles.usernameRow}>
              <Text variant="body" color={colors.textSecondary}>
                @
              </Text>
              <TextInput
                value={username}
                onChangeText={(text) => setUsername(toUsername(text))}
                placeholder={t('editProfile.usernamePlaceholder')}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[typography.body, styles.input]}
              />
              {username.length >= 3 && <SymbolView name="checkmark.circle.fill" tintColor={colors.primary} size={18} />}
            </View>
          </Field>
          <View style={styles.separator} />
          <PressableScale onPress={() => router.push('/okul-sec')} scaleTo={0.99}>
            <Field label={t('editProfile.school')}>
              <View style={styles.usernameRow}>
                <Text variant="body" color={school ? colors.text : colors.textTertiary} style={styles.schoolValue} numberOfLines={1}>
                  {school ? schoolLabel(school) : t('editProfile.addSchool')}
                </Text>
                <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={13} weight="semibold" />
              </View>
            </Field>
          </PressableScale>
        </View>
        <Text variant="footnote" color={colors.textSecondary} style={styles.hint}>
          {t('editProfile.usernameHint')}
        </Text>
      </FormScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="body" style={styles.label}>
        {label}
      </Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.grouped,
  },
  form: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  avatar: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  group: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  label: {
    width: 120,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  schoolValue: {
    flex: 1,
    paddingVertical: spacing.md,
  },
  hint: {
    paddingHorizontal: spacing.lg,
  },
});
