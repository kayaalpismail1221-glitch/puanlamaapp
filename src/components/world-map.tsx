import { memo } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { colors } from '@/constants/theme';
import { WORLD_PATH } from '@/constants/world-map';
import type { CityDot } from '@/lib/visited';
import type { ViewBox } from '@/lib/world-projection';

type Props = {
  /** Haritanın görünen bölgesi (harita birimi) */
  view: ViewBox;
  /** Piksel boyutu; en-boy oranı `view` ile aynı olmalı */
  width: number;
  height: number;
  dots: CityDot[];
  selectedKey?: string | null;
  /** Verilirse noktalar dokunulabilir olur */
  onDotPress?: (key: string) => void;
};

/** Ülke şekilleri tek path; görünüm değişmedikçe yeniden çizilmez */
const Land = memo(function Land() {
  return (
    <Path
      d={WORLD_PATH}
      fill={colors.mapLand}
      stroke={colors.mapBorder}
      strokeWidth={0.6}
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  );
});

/**
 * Çizim tarzı dünya haritası ve şehir noktaları (lezzet haritası).
 * Noktalar yakınlaşmadan bağımsız olarak ekranda aynı boyutta kalır.
 */
export function WorldMap({ view, width, height, dots, selectedKey, onDotPress }: Props) {
  // Piksel → harita birimi
  const unit = view.width / width;

  return (
    <Svg width={width} height={height} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}>
      <Land />
      {dots.map((dot) => {
        const selected = dot.key === selectedKey;
        // Çok mekân olan şehir biraz daha büyük
        const r = (selected ? 7 : 4.5 + Math.min(2.5, Math.sqrt(dot.count) / 2)) * unit;
        return (
          <G key={dot.key} onPress={onDotPress ? () => onDotPress(dot.key) : undefined}>
            {/* Parmakla vurulması kolay olsun diye görünmez geniş alan */}
            {onDotPress && <Circle cx={dot.point.x} cy={dot.point.y} r={18 * unit} fill="transparent" />}
            {selected && <Circle cx={dot.point.x} cy={dot.point.y} r={r * 1.9} fill={colors.primary} opacity={0.18} />}
            <Circle
              cx={dot.point.x}
              cy={dot.point.y}
              r={r}
              fill={colors.primary}
              stroke={colors.background}
              strokeWidth={1.5 * unit}
            />
          </G>
        );
      })}
    </Svg>
  );
}
