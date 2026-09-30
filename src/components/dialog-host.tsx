import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { closeDialog, useDialog, type Dialog, type MenuOption } from '@/lib/dialogs';
import { haptics } from '@/lib/haptics';

/**
 * Android ve web: `lib/dialogs.ts` ile açılan menü (Material alt sayfası) ve metin sorma diyaloğu.
 * Kök düzende bir kez çizilir. iOS'ta sistem menüleri kullanıldığından orada hiç açılmaz.
 * Geri tuşu ve karartılmış zemine dokunmak pencereyi kapatır.
 */
export function DialogHost() {
  const dialog = useDialog();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={!!dialog}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => closeDialog()}>
      <Pressable style={styles.backdrop} onPress={() => closeDialog()} accessibilityRole="button" />
      {dialog?.kind === 'menu' && <MenuSheet key={dialog.id} dialog={dialog} bottom={insets.bottom} />}
      {dialog?.kind === 'prompt' && <PromptDialog key={dialog.id} dialog={dialog} top={insets.top} />}
    </Modal>
  );
}

function MenuSheet({ dialog, bottom }: { dialog: Extract<Dialog, { kind: 'menu' }>; bottom: number }) {
  const select = (option: MenuOption) => {
    haptics.select();
    closeDialog(option.onPress);
  };
  return (
    <Animated.View
      entering={SlideInDown.springify().damping(20)}
      style={[styles.sheet, { paddingBottom: bottom + spacing.sm }]}>
      <View style={styles.handle} />
      {dialog.title && (
        <Text variant="subhead" color={colors.textSecondary} style={styles.sheetTitle} numberOfLines={2}>
          {dialog.title}
        </Text>
      )}
      {dialog.options.map((option, i) => {
        const tint = option.destructive ? colors.danger : colors.text;
        return (
          <Pressable
            key={i}
            onPress={() => select(option)}
            android_ripple={{ color: colors.ripple }}
            style={styles.row}
            accessibilityRole="button"
            accessibilityState={{ selected: !!option.selected }}>
            {option.icon && <Icon name={option.icon} size={22} tintColor={option.destructive ? colors.danger : colors.textSecondary} />}
            <Text variant="body" color={tint} style={styles.rowLabel} numberOfLines={1}>
              {option.label}
            </Text>
            {option.selected && <Icon name="checkmark" size={20} tintColor={colors.primary} />}
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

function PromptDialog({ dialog, top }: { dialog: Extract<Dialog, { kind: 'prompt' }>; top: number }) {
  const { t } = useTranslation();
  const [text, setText] = useState(dialog.defaultValue ?? '');
  const input = useRef<TextInput>(null);
  const submit = () => closeDialog(() => dialog.onSubmit(text));

  // Modal penceresi açılırken `autoFocus` klavyeyi açmıyor (Android); pencere yerleşince odaklanılır
  useEffect(() => {
    const timer = setTimeout(() => input.current?.focus(), 250);
    return () => clearTimeout(timer);
  }, []);
  return (
    // Klavye ekranın altını kapladığından diyalog üst yarıda durur
    <View style={[styles.promptWrap, { paddingTop: top + spacing.xxl * 3 }]} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(150)} style={styles.prompt}>
        <Text variant="title3">{dialog.title}</Text>
        {dialog.message && (
          <Text variant="subhead" color={colors.textSecondary}>
            {dialog.message}
          </Text>
        )}
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          placeholder={dialog.placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={dialog.keyboardType}
          selectTextOnFocus
          onSubmitEditing={submit}
          returnKeyType="done"
          cursorColor={colors.primary}
          selectionColor={colors.primarySoft}
          style={styles.input}
        />
        <View style={styles.promptButtons}>
          <Pressable onPress={() => closeDialog()} android_ripple={{ color: colors.ripple }} style={styles.textButton}>
            <Text variant="subhead" color={colors.primary} style={styles.bold}>
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable onPress={submit} android_ripple={{ color: colors.ripple }} style={styles.textButton}>
            <Text variant="subhead" color={colors.primary} style={styles.bold}>
              {t('common.ok')}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: spacing.sm,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  rowLabel: {
    flex: 1,
  },
  promptWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  prompt: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.background,
    borderRadius: radius.sheet,
    padding: spacing.xl,
    gap: spacing.md,
  },
  input: {
    ...typography.body,
    color: colors.text,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: spacing.sm,
  },
  promptButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  textButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  bold: {
    fontWeight: '600',
  },
});
