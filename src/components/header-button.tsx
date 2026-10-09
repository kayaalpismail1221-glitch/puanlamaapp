import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, type ColorValue } from 'react-native';

import { SymbolView, type SFSymbol } from '@/components/symbol';
import { PressableScale } from '@/components/ui';
import { colors, hitSlop, radius } from '@/constants/theme';
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
  badge,
}: {
  icon: SFSymbol;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /** Simgenin sağ üstüne oturan rozet (ör. okunmamış bildirim sayısı) */
  badge?: ReactNode;
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
      {badge}
    </Pressable>
  );
}

/**
 * Başlık çubuğunun sağındaki simge eylemi, platformun diliyle: iOS'ta sistemin cam düğmesine giren simge
 * (yay animasyonu), Android'de Material 3 düğmesi (48 dp, dalga, 24 dp simge).
 */
export function HeaderAction({
  icon,
  onPress,
  accessibilityLabel,
  iosSize = 22,
  tintColor = colors.primary,
}: {
  icon: SFSymbol;
  onPress: () => void;
  accessibilityLabel: string;
  /** iOS'taki simge boyutu (ekranlar arasında tutarlı kalsın diye mevcut değerler korunur) */
  iosSize?: number;
  tintColor?: ColorValue;
}) {
  if (Platform.OS === 'android') {
    return <HeaderIconButton icon={icon} onPress={onPress} accessibilityLabel={accessibilityLabel} side="right" />;
  }
  return (
    <PressableScale onPress={onPress} hitSlop={hitSlop} accessibilityLabel={accessibilityLabel}>
      <SymbolView name={icon} tintColor={tintColor} size={iosSize} />
    </PressableScale>
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
 * iOS sayfasının (sheet) kapat düğmesi: sağ üstte ✕ (kullanıcı alışkanlığı; aşağı çekmeyi bilmeyen de kapatabilsin).
 * `onPress` verilmezse geri gider. Android'de modal kendi sol ✕'ini kullanır (`ModalCloseButton`).
 */
export function SheetCloseButton({ onPress }: { onPress?: () => void }) {
  const { t } = useTranslation();
  return (
    <PressableScale
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}>
      <SymbolView name="xmark" tintColor={colors.primary} size={17} weight="semibold" />
    </PressableScale>
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
        else router.replace('/');
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
