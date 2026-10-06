import { Host, HStack, Text } from '@expo/ui/swift-ui';
import {
  animation,
  Animation,
  blur,
  font,
  foregroundStyle,
  frame,
  offset,
  opacity,
  scaleEffect,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

import { LAUNCH, LAUNCH_EXIT_TOTAL, TAGLINE, type LaunchPhase } from '@/constants/launch';

const CHARS = [...TAGLINE];
const sec = (ms: number) => ms / 1000;

type Props = { phase: LaunchPhase; reduceMotion: boolean; color: string };

/**
 * Açılış sloganı, iOS: harfler SwiftUI'da çizilir. Gerçek Gauss bulanıklığı ve yay hareketi yerel olarak, ekran
 * tazeleme hızında (ProMotion'da 120 Hz) çalışır. Her harf kendi gecikmesiyle bulanık/silik/aşağıdan nete gelir;
 * satırın harf aralığı aynı anda açıktan normale toparlanır. Çıkışta harfler bulanıklaşıp dağılırken satır
 * hafifçe büyür. Kapsayıcısını doldurur, satırı ortalar. Diğer platformlar: launch-text.tsx
 */
export function LaunchText({ phase, reduceMotion, color }: Props) {
  const shown = phase === 'shown';
  const gone = phase === 'gone';
  // `animation(_, value)` değer değişince çalışır: her evre ayrı bir değer
  const step = gone ? 2 : shown ? 1 : 0;
  const move = !reduceMotion;

  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <HStack
        spacing={move && phase === 'hidden' ? LAUNCH.trackingFrom : 0}
        alignment="firstTextBaseline"
        modifiers={[
          scaleEffect(move && gone ? 1.06 : 1),
          frame({ maxWidth: 10000, maxHeight: 10000 }),
          animation(
            gone
              ? Animation.easeIn({ duration: sec(LAUNCH_EXIT_TOTAL) })
              : Animation.easeOut({ duration: sec(LAUNCH.tracking) }),
            step,
          ),
        ]}>
        {CHARS.map((char, i) => (
          <Text
            key={`${i}-${char}`}
            modifiers={[
              font({ size: 31, weight: 'semibold', design: 'serif' }),
              foregroundStyle(color),
              blur(shown ? 0 : gone ? 8 : 12),
              opacity(shown ? 1 : 0),
              offset({ y: !move || shown ? 0 : gone ? -6 : 10 }),
              animation(
                gone
                  ? Animation.easeIn({ duration: sec(LAUNCH.charOut) }).delay(sec(i * LAUNCH.outStagger))
                  : Animation.spring({ duration: sec(LAUNCH.charIn), bounce: 0 }).delay(sec(i * LAUNCH.stagger)),
                step,
              ),
            ]}>
            {char}
          </Text>
        ))}
      </HStack>
    </Host>
  );
}
