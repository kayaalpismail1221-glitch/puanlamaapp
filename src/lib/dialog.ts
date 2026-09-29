import type { SFSymbol } from '@/components/symbol';
import type { KeyboardTypeOptions } from 'react-native';

/**
 * Uygulamanın kendi menü ve uyarı pencereleri (sistem action sheet / Alert yerine).
 * iOS 26'da sistem pencereleri cam görünümlü ve arkası sızdığı için okunaksız; bunlar mat beyaz, marka renkli
 * ve modal ekranların da üstünde açılır. Çizim: `components/dialog-host.tsx` (kök düzende bir kez).
 * Aynı anda tek pencere görünür; yenisi gelirse öncekinin kapanmasını bekler (ör. şikâyet → "Teşekkürler").
 */

export type MenuOption = {
  label: string;
  onPress: () => void;
  icon?: SFSymbol;
  destructive?: boolean;
  /** Seçili seçenek (ör. sıralama): sağında onay işareti */
  selected?: boolean;
};

/** React Native `Alert` ile aynı biçim: geçiş kolay olsun diye */
export type DialogButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type PromptOptions = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  keyboardType?: KeyboardTypeOptions;
  submitLabel?: string;
  onSubmit: (value: string) => void;
};

export type DialogRequest =
  | { kind: 'menu'; title?: string; message?: string; options: MenuOption[] }
  | { kind: 'alert'; title: string; message?: string; buttons: DialogButton[] }
  | ({ kind: 'prompt' } & PromptOptions);

type Listener = (request: DialogRequest | null) => void;

let listener: Listener | null = null;
let current: DialogRequest | null = null;
const queue: DialogRequest[] = [];

function present(request: DialogRequest) {
  if (current || !listener) {
    queue.push(request);
    return;
  }
  current = request;
  listener(request);
}

/** Pencere kapanma animasyonu bitince çizici çağırır; sıradaki varsa açılır */
export function dialogClosed() {
  current = null;
  const next = queue.shift();
  if (next) present(next);
  else listener?.(null);
}

/** Yalnızca DialogHost kullanır */
export function subscribeDialogs(fn: Listener) {
  listener = fn;
  const next = queue.shift();
  if (next) present(next);
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Seçenek menüsü ("…" menüleri, fotoğraf ekleme, sıralama). Vazgeç her zaman eklenir. */
export function showMenu(title: string | undefined, options: MenuOption[], message?: string) {
  present({ kind: 'menu', title, message, options });
}

/** `Alert.alert` yerine: aynı parametreler. Düğme verilmezse tek "Tamam" gösterilir. */
export function showAlert(title: string, message?: string, buttons?: DialogButton[]) {
  present({ kind: 'alert', title, message, buttons: buttons?.length ? buttons : [{ style: 'default' }] });
}

/** `Alert.prompt` yerine: tek satır metin isteyen pencere */
export function showPrompt(options: PromptOptions) {
  present({ kind: 'prompt', ...options });
}
