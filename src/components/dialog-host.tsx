import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { dialogClosed, subscribeDialogs, type DialogButton, type DialogRequest } from '@/lib/dialog';

/**
 * `lib/dialog` pencerelerinin çizicisi. Kök düzende bir kez durur. iOS'ta `FullWindowOverlay` ile modal ekranların
 * da üstünde açılır. Görünüm: lacivert karartma üstünde alttan gelen, yüzen mat beyaz kart; aşağı kaydırınca ya da
 * arkaya dokununca kapanır (vazgeçme seçeneği varsa).
 */
export function DialogHost() {
  const [state, setState] = useState<{ id: number; request: DialogRequest } | null>(null);
  const counter = useRef(0);

  useEffect(
    () => subscribeDialogs((request) => setState(request ? { id: ++counter.current, request } : null)),
    [],
  );

  if (!state) return null;
  const sheet = <DialogSheet key={state.id} request={state.request} />;

  if (Platform.OS === 'ios') {
    return (
      <FullWindowOverlay>
        {/* Katman ayrı bir pencere gibi davranır: sürükleme hareketleri için kendi kökü gerekir */}
        <GestureHandlerRootView style={StyleSheet.absoluteFill}>{sheet}</GestureHandlerRootView>
      </FullWindowOverlay>
    );
  }
  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={() => {}}>
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>{sheet}</GestureHandlerRootView>
    </Modal>
  );
}

const OPEN_MS = 280;
const CLOSE_MS = 200;
const DISMISS_DRAG = 90;

function DialogSheet({ request }: { request: DialogRequest }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const keyboard = useAnimatedKeyboard();
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(600);
  const closing = useSharedValue(false);
  const [value, setValue] = useState(request.kind === 'prompt' ? (request.defaultValue ?? '') : '');

  useEffect(() => {
    progress.set(withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }));
  }, [progress]);

  const finish = (action?: () => void) => {
    dialogClosed();
    action?.();
  };

  /** Kapanma animasyonu bitince pencereyi kaldırır, sonra seçilen işi çalıştırır (gezinme vb. kart kapandıktan sonra) */
  const close = (action?: () => void) => {
    if (closing.get()) return;
    closing.set(true);
    progress.set(
      withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(finish)(action);
      }),
    );
  };

  // Vazgeçme: menüde ve metin penceresinde her zaman; uyarıda yalnızca "cancel" düğmesi varsa
  const cancelButton = request.kind === 'alert' ? request.buttons.find((b) => b.style === 'cancel') : undefined;
  const dismissible = request.kind !== 'alert' || !!cancelButton;
  const dismiss = () => {
    if (!dismissible) return;
    close(cancelButton?.onPress ? () => cancelButton.onPress?.() : undefined);
  };

  const pan = Gesture.Pan()
    .enabled(dismissible)
    .activeOffsetY(8)
    .onUpdate((e) => {
      // Yukarı çekince az direnç, aşağı serbest
      drag.set(e.translationY > 0 ? e.translationY : e.translationY / 6);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > 900) runOnJS(dismiss)();
      else drag.set(withSpring(0, { damping: 18, stiffness: 220 }));
    });

  const baseBottom = Math.max(insets.bottom, spacing.md);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => {
    // Klavye açıksa (metin penceresi) kart klavyenin üstüne çıkar
    const lift = Math.max(0, keyboard.height.get() - baseBottom + spacing.md);
    return {
      transform: [
        { translateY: interpolate(progress.get(), [0, 1], [height.get() + baseBottom + 40, 0]) + drag.get() - lift },
      ],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[styles.sheet, { bottom: baseBottom }, sheetStyle]}
          onLayout={(e) => height.set(e.nativeEvent.layout.height)}>
          {request.kind === 'menu' && (
            <>
              <Header title={request.title} message={request.message} compact />
              <View style={styles.options}>
                {request.options.map((option) => (
                  <Pressable
                    key={option.label}
                    onPress={() => close(option.onPress)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
                    {option.icon && (
                      <View style={styles.optionIcon}>
                        <SymbolView
                          name={option.icon}
                          tintColor={option.destructive ? colors.danger : colors.primary}
                          size={20}
                        />
                      </View>
                    )}
                    <Text
                      variant="body"
                      color={option.destructive ? colors.danger : colors.text}
                      style={[styles.optionLabel, option.selected && styles.bold]}
                      numberOfLines={1}>
                      {option.label}
                    </Text>
                    {option.selected && (
                      <SymbolView name="checkmark" tintColor={colors.primary} size={16} weight="semibold" />
                    )}
                  </Pressable>
                ))}
              </View>
              <View style={styles.buttons}>
                <SheetButton label={t('common.cancel')} kind="cancel" onPress={() => close()} />
              </View>
            </>
          )}

          {request.kind === 'alert' && (
            <>
              <Header title={request.title} message={request.message} />
              <View style={styles.buttons}>
                {orderButtons(request.buttons).map(({ button, kind }, i) => (
                  <SheetButton
                    key={`${button.text ?? 'ok'}-${i}`}
                    label={button.text ?? t('common.ok')}
                    kind={kind}
                    onPress={() => close(button.onPress ? () => button.onPress?.() : undefined)}
                  />
                ))}
              </View>
            </>
          )}

          {request.kind === 'prompt' && (
            <>
              <Header title={request.title} message={request.message} />
              <View style={styles.inputWrap}>
                <TextInput
                  value={value}
                  onChangeText={setValue}
                  placeholder={request.placeholder}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType={request.keyboardType}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  selectionColor={colors.primary}
                  onSubmitEditing={() => value.trim() && close(() => request.onSubmit(value.trim()))}
                  style={styles.input}
                />
              </View>
              <View style={styles.buttons}>
                <SheetButton
                  label={request.submitLabel ?? t('common.ok')}
                  kind="primary"
                  disabled={!value.trim()}
                  onPress={() => close(() => request.onSubmit(value.trim()))}
                />
                <SheetButton label={t('common.cancel')} kind="cancel" onPress={() => close()} />
              </View>
            </>
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Header({ title, message, compact }: { title?: string; message?: string; compact?: boolean }) {
  if (!title && !message) return <View style={{ height: spacing.md }} />;
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      {!!title && (
        <Text
          variant={compact ? 'subhead' : 'title3'}
          color={compact ? colors.textSecondary : colors.text}
          align="center"
          style={compact && styles.bold}>
          {title}
        </Text>
      )}
      {!!message && (
        <Text variant={compact ? 'footnote' : 'callout'} color={colors.textSecondary} align="center">
          {message}
        </Text>
      )}
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'destructive' | 'cancel';

/**
 * Uyarı düğmeleri alt alta: eylemler önce, vazgeç en altta. Son "default" düğme ana eylemdir (lacivert dolgulu),
 * diğer "default"lar ikincil, silme gibi eylemler kırmızı tonlu.
 */
function orderButtons(buttons: DialogButton[]): { button: DialogButton; kind: ButtonKind }[] {
  const actions = buttons.filter((b) => b.style !== 'cancel');
  const cancel = buttons.filter((b) => b.style === 'cancel');
  const defaults = actions.filter((b) => b.style !== 'destructive');
  const primary = defaults[defaults.length - 1];
  return [
    ...actions.map((button) => ({
      button,
      kind: (button.style === 'destructive' ? 'destructive' : button === primary ? 'primary' : 'secondary') as ButtonKind,
    })),
    ...cancel.map((button) => ({ button, kind: 'cancel' as ButtonKind })),
  ];
}

const BUTTON_STYLES: Record<ButtonKind, { box: ViewStyle; text: string }> = {
  primary: { box: { backgroundColor: colors.primary }, text: colors.onPrimary },
  secondary: { box: { backgroundColor: colors.surface }, text: colors.primary },
  destructive: { box: { backgroundColor: colors.dangerSoft }, text: colors.danger },
  cancel: { box: { backgroundColor: colors.surface }, text: colors.text },
};

function SheetButton({
  label,
  kind,
  onPress,
  disabled,
}: {
  label: string;
  kind: ButtonKind;
  onPress: () => void;
  disabled?: boolean;
}) {
  const look = BUTTON_STYLES[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, look.box, pressed && styles.buttonPressed, disabled && styles.disabled]}>
      <Text variant="headline" color={look.text} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: spacing.sm + 2,
    right: spacing.sm + 2,
    backgroundColor: colors.background,
    borderRadius: 32,
    borderCurve: 'continuous',
    paddingBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
  },
  header: {
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  headerCompact: {
    gap: 2,
    paddingTop: spacing.lg + 2,
    paddingBottom: spacing.sm,
  },
  bold: {
    fontWeight: '600',
  },
  options: {
    paddingHorizontal: spacing.sm,
  },
  option: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.card,
    borderCurve: 'continuous',
  },
  optionIcon: {
    width: 24,
    alignItems: 'center',
  },
  optionLabel: {
    flex: 1,
    fontWeight: '500',
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  buttons: {
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  button: {
    height: 54,
    borderRadius: 18,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
  inputWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    height: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    color: colors.text,
  },
});
