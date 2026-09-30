import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { SymbolView, type SFSymbol } from '@/components/symbol';
import { colors, radius } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

/**
 * Android üst çubuğu simge düğmesi (Material 3): 48 dp dokunma alanı, yuvarlak dalga (ripple), 24 dp simge.
 */
export function HeaderIconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
  side = 'left',
}: {
  icon: SFSymbol;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /**
   * Çubuğun hangi ucunda: simge kenardan 16 dp içeride dursun diye dokunma alanı kenara taşar. Yan yana
   * düğmelerde yalnızca kenardaki taşar (`inner`).
   */
  side?: 'left' | 'right' | 'inner';
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: colors.border, borderless: true, radius: 24 }}
      style={[styles.button, side === 'left' && styles.left, side === 'right' && styles.right]}>
      <SymbolView name={icon} tintColor={disabled ? colors.textTertiary : colors.primary} size={24} />
    </Pressable>
  );
}

/** Android tam ekran diyaloğunun (modal) kapat düğmesi: Material'daki gibi solda ✕ */
export function ModalCloseButton() {
  const { t } = useTranslation();
  return (
    <HeaderIconButton
      icon="xmark"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityLabel={t('common.close')}
    />
  );
}

/**
 * Fotoğraf üstündeki saydam başlıkta geri düğmesi (Android): yarı saydam yuvarlak zeminde ok, her fotoğrafta
 * okunur. iOS'ta sistem geri düğmesi (iOS 26'da cam) kalır.
 */
export function FloatingBackButton() {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        if (router.canGoBack()) router.back();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      android_ripple={{ color: colors.border, borderless: true, radius: 20 }}
      style={styles.floating}>
      <SymbolView name="arrow.left" tintColor={colors.primary} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floating: {
    width: 40,
    height: 40,
    marginLeft: -4,
    borderRadius: radius.full,
    backgroundColor: colors.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  left: {
    marginLeft: -12,
  },
  right: {
    marginRight: -12,
  },
});
