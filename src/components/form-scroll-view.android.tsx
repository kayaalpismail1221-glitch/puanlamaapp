import type { ComponentProps, Ref } from 'react';
import type { ScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { spacing } from '@/constants/theme';

/**
 * Android: uygulama kenardan kenara (edge-to-edge) çizildiği ve klavyeyi `KeyboardProvider` yönettiği için pencere
 * klavyeyle küçülmez. Bu kaydırma alanı odaklanan metin alanını klavyenin üstüne taşır ve altta klavye kadar boşluk
 * bırakır. iOS: form-scroll-view.tsx
 */
export function FormScrollView({ ref, ...props }: ComponentProps<typeof KeyboardAwareScrollView> & { ref?: Ref<ScrollView> }) {
  return <KeyboardAwareScrollView ref={ref as never} bottomOffset={spacing.xl} {...props} />;
}
