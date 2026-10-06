import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import {
  LAUNCH,
  LAUNCH_EXIT_TOTAL,
  LAUNCH_REVEAL_TOTAL,
  TAGLINE,
  type LaunchPhase,
} from '@/constants/launch';
import { fonts } from '@/constants/theme';

type Props = { phase: LaunchPhase; reduceMotion: boolean; color: string };

/** Kelimeler ve her harfin slogandaki sırası (boşluklar dahil; dalga ve harf aralığı bu sıraya göre) */
const WORDS = TAGLINE.split(' ').reduce<{ chars: { char: string; index: number }[] }[]>((words, word) => {
  const start = words.reduce((n, w) => n + w.chars.length + 1, 0);
  words.push({ chars: [...word].map((char, i) => ({ char, index: start + i })) });
  return words;
}, []);
const MID = (TAGLINE.length - 1) / 2;

/** Bir harfin kendi penceresindeki ilerlemesi (0–1): `elapsed` ms, harf `delay` ms sonra başlar, `duration` sürer */
function progressIn(elapsed: number, delay: number, duration: number) {
  'worklet';
  return Math.min(Math.max((elapsed - delay) / duration, 0), 1);
}
const easeOut = (x: number) => {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
};
const easeIn = (x: number) => {
  'worklet';
  return x * x;
};

function Char({
  char,
  index,
  reveal,
  exit,
  move,
  color,
}: {
  char: string;
  index: number;
  reveal: SharedValue<number>;
  exit: SharedValue<number>;
  move: boolean;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const inP = easeOut(progressIn(reveal.value * LAUNCH_REVEAL_TOTAL, index * LAUNCH.stagger, LAUNCH.charIn));
    const outP = easeIn(progressIn(exit.value * LAUNCH_EXIT_TOTAL, index * LAUNCH.outStagger, LAUNCH.charOut));
    // Harf aralığı: harfler ortadan dışa açık başlar, satır boyunca toparlanır
    const spread = 1 - easeOut(progressIn(reveal.value * LAUNCH_REVEAL_TOTAL, 0, LAUNCH.tracking));
    return {
      opacity: inP * (1 - outP),
      transform: move
        ? [
            { translateX: (index - MID) * LAUNCH.trackingFrom * spread },
            { translateY: (1 - inP) * 10 - outP * 6 },
          ]
        : [],
    };
  });
  return <Animated.Text style={[styles.char, { color }, style]}>{char}</Animated.Text>;
}

/**
 * Açılış sloganı, Android ve web: harfler Reanimated ile UI iş parçacığında soldan sağa silik/aşağıdan belirir,
 * harf aralığı açıktan toparlanır; çıkışta dağılırken satır hafifçe büyür. Kapsayıcısını doldurur, satırı ortalar.
 * iOS: launch-text.ios.tsx (SwiftUI, gerçek bulanıklıkla).
 */
export function LaunchText({ phase, reduceMotion, color }: Props) {
  const reveal = useSharedValue(0);
  const exit = useSharedValue(0);
  const move = !reduceMotion;

  useEffect(() => {
    if (phase !== 'hidden')
      reveal.value = withTiming(1, { duration: LAUNCH_REVEAL_TOTAL, easing: Easing.linear });
    if (phase === 'gone') exit.value = withTiming(1, { duration: LAUNCH_EXIT_TOTAL, easing: Easing.linear });
  }, [phase, reveal, exit]);

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ scale: move ? 1 + 0.06 * easeIn(exit.value) : 1 }],
  }));

  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.View style={[styles.line, lineStyle]}>
        {WORDS.map((word) => (
          <View key={word.chars[0].index} style={styles.word}>
            {word.chars.map(({ char, index }) => (
              <Char key={index} char={char} index={index} reveal={reveal} exit={exit} move={move} color={color} />
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  word: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  char: {
    fontFamily: fonts.serif,
    fontSize: 31,
    fontWeight: '600',
  },
});
