import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/ui';

import { colors, radius } from '@/constants/theme';
import { REGION_BORDERS, REGION_BOX, REGION_LAND, WORLD_BORDERS, WORLD_LAND } from '@/constants/world-map';
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
  /** Nokta boyutu çarpanı (ör. hikâye kartında daha iri) */
  dotScale?: number;
  /** Şehir adı etiketleri (varsayılan açık; sığmayan etiket çizilmez) */
  labels?: boolean;
};

/** Görünüm tamamen ayrıntılı bölgenin içindeyse 1:10m şekiller */
function detailed(view: ViewBox) {
  return (
    view.x >= REGION_BOX.x &&
    view.y >= REGION_BOX.y &&
    view.x + view.width <= REGION_BOX.x + REGION_BOX.width &&
    view.y + view.height <= REGION_BOX.y + REGION_BOX.height
  );
}

/**
 * Kara: altta hafif kaydırılmış gölge (kâğıt kesiği hissi), üstte kâğıt tonunda dolgu ve kıyı çizgisi,
 * en üstte ince ülke sınırları. Şekiller büyük; görünüm değişmedikçe yeniden çizilmez.
 */
const Land = memo(function Land({ region, unit }: { region: boolean; unit: number }) {
  const land = region ? REGION_LAND : WORLD_LAND;
  return (
    <>
      <Path d={land} fill={colors.mapShadow} transform={`translate(0 ${1.6 * unit})`} />
      <Path
        d={land}
        fill={colors.mapLand}
        stroke={colors.mapCoast}
        strokeWidth={0.9}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <Path
        d={region ? REGION_BORDERS : WORLD_BORDERS}
        fill="none"
        stroke={colors.mapBorder}
        strokeWidth={0.8}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
});

type Label = { key: string; text: string; x: number; y: number; width: number };

/**
 * Şehir etiketleri: en çok mekânlı şehirden başlayarak noktanın sağına, sığmazsa soluna, üstüne ya da altına konur;
 * başka bir etiketle çakışan ya da haritadan taşan etiket çizilmez. Ölçüler piksel.
 */
function placeLabels(dots: CityDot[], view: ViewBox, width: number): Label[] {
  const scale = width / view.width;
  const placed: Label[] = [];
  const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
  // Etiketler başka şehrin noktasını da örtmesin
  const dotBoxes = dots.map((d) => {
    const x = (d.point.x - view.x) * scale;
    const y = (d.point.y - view.y) * scale;
    return { x0: x - 9, y0: y - 9, x1: x + 9, y1: y + 9 };
  });
  for (const dot of dots.slice(0, 8)) {
    const px = (dot.point.x - view.x) * scale;
    const py = (dot.point.y - view.y) * scale;
    const text = dot.count > 1 ? `${dot.key} · ${dot.count}` : dot.key;
    const w = text.length * 6.4 + 14;
    const h = 20;
    // Sırayla dene: sağ, sol, üst, alt
    const candidates = [
      { x: px + 10, y: py },
      { x: px - 10 - w, y: py },
      { x: px - w / 2, y: py - 20 },
      { x: px - w / 2, y: py + 20 },
    ];
    for (const c of candidates) {
      const box = { x0: c.x, y0: c.y - h / 2, x1: c.x + w, y1: c.y + h / 2 };
      const fits = box.x0 >= 4 && box.x1 <= width - 4 && box.y0 >= 4 && box.y1 <= view.height * scale - 4;
      const free = [...boxes, ...dotBoxes].every((b) => box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1);
      if (fits && free) {
        boxes.push(box);
        placed.push({ key: dot.key, text, x: c.x, y: c.y, width: w });
        break;
      }
    }
  }
  return placed;
}

/**
 * Çizim tarzı lezzet haritası: kâğıt tonunda kara ve yumuşak deniz; gidilen her şehir bir nokta,
 * mekân sayısıyla büyür; yanlarında şehir adı ve mekân sayısı. Noktalar ve etiketler yakınlaşmadan
 * bağımsız olarak ekranda aynı boyutta kalır. Görünüm Türkiye–Avrupa bölgesindeyse ayrıntılı kıyılar çizilir.
 */
export function WorldMap({ view, width, height, dots, selectedKey, onDotPress, dotScale = 1, labels = true }: Props) {
  // Piksel → harita birimi
  const unit = view.width / width;
  const dotUnit = unit * dotScale;
  const region = detailed(view);
  const placedLabels = useMemo(() => (labels ? placeLabels(dots, view, width) : []), [labels, dots, view, width]);

  return (
    <View style={{ width, height }}>
    <Svg width={width} height={height} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}>
      <Defs>
        <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.mapWater} stopOpacity={0.75} />
          <Stop offset="1" stopColor={colors.mapWater} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#water)" />
      <Land region={region} unit={unit} />

      {dots.map((dot) => {
        const selected = dot.key === selectedKey;
        const fill = colors.primary;
        // Çok mekân olan şehir biraz daha büyük
        const r = (selected ? 8 : 5 + Math.min(3, Math.sqrt(dot.count) / 1.6)) * dotUnit;
        return (
          <G key={dot.key} onPress={onDotPress ? () => onDotPress(dot.key) : undefined}>
            {/* Parmakla vurulması kolay olsun diye görünmez geniş alan */}
            {onDotPress && <Circle cx={dot.point.x} cy={dot.point.y} r={20 * unit} fill="transparent" />}
            <Circle cx={dot.point.x} cy={dot.point.y} r={r * (selected ? 2.2 : 1.9)} fill={fill} opacity={selected ? 0.28 : 0.18} />
            <Circle
              cx={dot.point.x}
              cy={dot.point.y}
              r={r}
              fill={fill}
              stroke={colors.background}
              strokeWidth={2 * dotUnit}
            />
          </G>
        );
      })}

    </Svg>

      {/* Etiketler SVG yazısı yerine uygulamanın yazı tipiyle, haritanın üstünde */}
      {placedLabels.map((label) => (
        <View
          key={label.key}
          pointerEvents="none"
          style={[styles.label, { left: label.x, top: label.y - 10, width: label.width }]}>
          <Text
            variant="caption"
            color={label.key === selectedKey ? colors.primary : colors.text}
            numberOfLines={1}
            style={styles.labelText}>
            {label.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    height: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    boxShadow: '0 1px 3px rgba(15, 30, 61, 0.12)',
  },
  labelText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
