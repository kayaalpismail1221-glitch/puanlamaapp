import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import type { LocalImage } from '@/api/storage';
import { Avatar, PressableScale, Text } from '@/components/ui';
import { ModalCloseButton } from '@/components/header-button';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { schoolById, schoolLabel } from '@/data/schools';
import { toUsername } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** Bio sınırları (veritabanındaki kuralla aynı: `20261019170000_profile_bio`) */
const BIO_MAX = 150;
const BIO_MAX_LINES = 3;
const limitBio = (text: string) => text.split('\n').slice(0, BIO_MAX_LINES).join('\n');

/** Profili düzenle: fotoğraf, ad, kullanıcı adı, okul, bio */
export default function EditProfileScreen() {
  const { profile, actions } = useAppStore();
  const { t } = useTranslation();
  const [name, setName] = useState(profile?.name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
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
      ...(bio.trim() !== (profile.bio ?? '') && { bio: bio.trim() }),
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
    <View style={styles.container}>
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
      {/* Odaklanan alan klavyenin üstüne kayar (iOS'ta sayfa olarak açılan ekranda KeyboardAvoidingView payı
          yanlış hesaplıyor, en alttaki bio klavyenin altında kalıyordu) */}
      <KeyboardAwareScrollView
        bottomOffset={spacing.xl}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic">
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
          {/* Bio: profilde adın altında; sayaç yalnızca sınıra yaklaşınca */}
          <Field label={t('editProfile.bio')} top>
            <TextInput
              value={bio}
              onChangeText={(text) => setBio(limitBio(text))}
              placeholder={t('editProfile.bioPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={BIO_MAX}
              style={[typography.body, styles.input, styles.bioInput]}
            />
            {bio.length > BIO_MAX - 30 && (
              <Text variant="caption" color={bio.length >= BIO_MAX ? colors.warning : colors.textTertiary} style={styles.bioCount}>
                {bio.length}/{BIO_MAX}
              </Text>
            )}
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
      </KeyboardAwareScrollView>
    </View>
  );
}

/** `top`: çok satırlı alan; etiket ilk satırla hizalı kalır */
function Field({ label, children, top }: { label: string; children: React.ReactNode; top?: boolean }) {
  return (
    <View style={[styles.field, top && styles.fieldTop]}>
      <Text variant="body" style={[styles.label, top && styles.labelTop]}>
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
  fieldTop: {
    alignItems: 'flex-start',
  },
  labelTop: {
    paddingTop: spacing.md,
  },
  // Tek satır gibi başlar, yazdıkça 3 satıra kadar uzar
  bioInput: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    textAlignVertical: 'top',
  },
  bioCount: {
    alignSelf: 'flex-end',
    paddingBottom: spacing.sm,
  },
});
