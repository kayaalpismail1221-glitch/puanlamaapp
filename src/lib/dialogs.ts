import { useSyncExternalStore } from 'react';
import { ActionSheetIOS, Alert, Platform, type KeyboardTypeOptions } from 'react-native';

import type { AppSymbol } from '@/constants/icons';
import { colors } from '@/constants/theme';
import i18n from '@/i18n';

/**
 * Seçenek menüsü ve metin sorma penceresi, platformun kendi diliyle:
 * iOS'ta sistem ActionSheet'i ve Alert.prompt; Android ve web'de Material alt sayfası ve diyaloğu
 * (`components/dialog-host.tsx`, kök düzende). Android'in Alert'i en fazla 3 düğme gösterdiği ve
 * Alert.prompt olmadığı için bu ayrım gerekli.
 */

export type MenuOption = {
  label: string;
  /** Yalnızca Android/web alt sayfasında görünür */
  icon?: AppSymbol;
  destructive?: boolean;
  /** Seçili seçenek (ör. sıralama): iOS'ta ✓ önekiyle, Android'de sağda onay işaretiyle */
  selected?: boolean;
  onPress: () => void;
};

export type PromptOptions = {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  onSubmit: (text: string) => void;
};

export type Dialog =
  | { id: number; kind: 'menu'; title?: string; options: MenuOption[] }
  | ({ id: number; kind: 'prompt' } & PromptOptions);

/* ---------- Android/web pencere durumu (dialog-host dinler) ---------- */

let current: Dialog | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

const emit = (dialog: Dialog | null) => {
  current = dialog;
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Açık pencere (yoksa null) */
export const useDialog = () => useSyncExternalStore(subscribe, () => current, () => null);

/** Pencereyi kapatır; `then` pencere kapandıktan sonra çalışır (yeni bir menü ya da uyarı açabilir) */
export function closeDialog(then?: () => void) {
  emit(null);
  if (then) requestAnimationFrame(then);
}

/* ---------- Genel API ---------- */

/** Seçenek menüsü: iOS'ta sistem menüsü, diğerlerinde alt sayfa */
export function showMenu(title: string | undefined, options: MenuOption[]) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => (o.selected ? `✓ ${o.label}` : o.label)), i18n.t('common.cancel')],
        destructiveButtonIndex: options.flatMap((o, i) => (o.destructive ? [i] : [])),
        cancelButtonIndex: options.length,
        tintColor: colors.primary,
      },
      (i) => options[i]?.onPress(),
    );
    return;
  }
  emit({ id: nextId++, kind: 'menu', title, options });
}

/** Tek satırlık metin sorar: iOS'ta Alert.prompt, diğerlerinde Material diyalog */
export function showPrompt(options: PromptOptions) {
  if (Platform.OS === 'ios') {
    Alert.prompt(
      options.title,
      options.message,
      (text) => options.onSubmit(text ?? ''),
      'plain-text',
      options.defaultValue ?? '',
      options.keyboardType,
    );
    return;
  }
  emit({ id: nextId++, kind: 'prompt', ...options });
}
