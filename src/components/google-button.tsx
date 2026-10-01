import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { isGoogleSignInAvailable, signInWithGoogle } from '@/api/auth';
import { showError } from '@/api/errors';
import { PressableScale, Text } from '@/components/ui';
import { radius, spacing } from '@/constants/theme';
import { useScheme } from '@/hooks/use-palette';
import { haptics } from '@/lib/haptics';

/**
 * Google ile giriş düğmesi: yalnızca kullanılabildiğinde çizilir (Android + istemci kimliği + Expo Go değil).
 * Başarılı girişte oturum açılır; kök düzen yeni hesabı kuruluma, eskisini sekmelere taşır.
 */
export function GoogleSignInButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (!isGoogleSignInAvailable()) return null;

  const press = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await signInWithGoogle()) haptics.success();
    } catch (error) {
      haptics.warning();
      showError(error, t('failures.googleSignIn'));
    } finally {
      setBusy(false);
    }
  };

  return <GoogleButton onPress={press} loading={busy} style={style} />;
}

/**
 * "Google ile devam et": Google'ın marka kuralına göre (çok renkli G, açıkta beyaz zemin + gri çerçeve,
 * koyuda #131314 zemin, Roboto Medium). Renkler marka sabiti; uygulama paletinden gelmez.
 */
function GoogleButton({
  onPress,
  loading,
  style,
}: {
  onPress: () => void;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const dark = useScheme() === 'dark';
  const ink = dark ? '#E3E3E3' : '#1F1F1F';
  return (
    <PressableScale
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityState={{ busy: !!loading }}
      android_ripple={{ color: dark ? '#FFFFFF1F' : '#1F1F1F1F' }}
      style={[styles.button, dark ? styles.dark : styles.light, style]}>
      {loading ? (
        <ActivityIndicator color={ink} />
      ) : (
        <>
          <GoogleLogo />
          <Text variant="headline" color={ink} style={styles.label}>
            {t('onboarding.continueWithGoogle')}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

/** Google'ın çok renkli "G" logosu (marka kiti, değiştirilmez) */
function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    overflow: 'hidden',
  },
  light: {
    backgroundColor: '#FFFFFF',
    borderColor: '#747775',
  },
  dark: {
    backgroundColor: '#131314',
    borderColor: '#8E918F',
  },
  label: {
    fontFamily: 'sans-serif-medium',
    fontWeight: '500',
  },
});
