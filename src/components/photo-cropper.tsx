import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from '@/components/symbol';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cropImage, type LocalImage } from '@/api/storage';
import { PressableScale, Text } from '@/components/ui';
import { fixed, hitSlop, radius, spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

/** Akıştaki gönderi fotoğrafının oranı (PhotoCarousel ile aynı): kırpılan fotoğraf akışta birebir böyle görünür */
export const POST_PHOTO_ASPECT = 4 / 5;
const MAX_ZOOM = 4;
const SPRING = { damping: 20, stiffness: 220 };

/** Kırpmanın durumu: yakınlaştırma (1 = çerçeveyi tam kaplar) ve merkezden kayma (ekran noktası) */
export type CropTransform = { scale: number; x: number; y: number };

/** Gönderideki fotoğraf: kırpılmış görsel + yeniden kırpmak için orijinali ve son durumu */
export type CroppedPhoto = {
  image: LocalImage;
  original: LocalImage;
  transform: CropTransform;
};

export type CropItem = { original: LocalImage; transform?: CropTransform };

const IDENTITY: CropTransform = { scale: 1, x: 0, y: 0 };

/**
 * Gönderi fotoğrafı kırpma (Instagram/Beli'deki gibi): siyah tam ekranda 4:5 çerçeve, sıkıştırıp yakınlaştır,
 * sürükleyip konumla (sürüklerken 3×3 ızgara). Birden çok fotoğrafta "İleri", sonda "Bitti": hepsi kesilip döner.
 * Fotoğraf çerçeveyi her zaman kaplar (boşluk kalmaz). Kesme `expo-image-manipulator` ile, orijinal çözünürlükte.
 */
export function PhotoCropper({
  items,
  onDone,
  onCancel,
}: {
  /** Boşsa kapalı */
  items: CropItem[];
  onDone: (photos: CroppedPhoto[]) => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={items.length > 0} animationType="slide" presentationStyle="fullScreen" onRequestClose={onCancel}>
      {items.length > 0 && (
        // Her kırpma oturumu kendi durumuyla baştan kurulur
        <CropSession
          key={items.map((i) => i.original.uri).join('|')}
          items={items}
          onDone={onDone}
          onCancel={onCancel}
        />
      )}
    </Modal>
  );
}

function CropSession({
  items,
  onDone,
  onCancel,
}: {
  items: CropItem[];
  onDone: (photos: CroppedPhoto[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // Tam genişlik; küçük ekranda üst/alt çubuklara yer kalsın diye yükseklikten sınırlanır
  const frameW = Math.min(width, (height - insets.top - insets.bottom - 200) * POST_PHOTO_ASPECT);
  const frameH = frameW / POST_PHOTO_ASPECT;

  const [index, setIndex] = useState(0);
  const [transforms, setTransforms] = useState<CropTransform[]>(() => items.map((i) => i.transform ?? IDENTITY));
  const [busy, setBusy] = useState(false);

  const current = items[index]?.original;
  // Çerçeveyi tam kaplayan taban boyut (yakınlaştırma 1)
  const cover = current ? Math.max(frameW / current.width, frameH / current.height) : 1;
  const baseW = current ? current.width * cover : frameW;
  const baseH = current ? current.height * cover : frameH;

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const grid = useSharedValue(0);
  const bounds = useSharedValue({ baseW, baseH, frameW, frameH });

  // Fotoğraf değişince kayıtlı durumuna dön
  useEffect(() => {
    const tr = transforms[index] ?? IDENTITY;
    bounds.set({ baseW, baseH, frameW, frameH });
    scale.set(tr.scale);
    savedScale.set(tr.scale);
    tx.set(tr.x);
    ty.set(tr.y);
    savedX.set(tr.x);
    savedY.set(tr.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, baseW, baseH, frameW, frameH, transforms.length]);

  const clampX = (x: number, k: number) => {
    'worklet';
    const max = Math.max(0, (bounds.get().baseW * k - bounds.get().frameW) / 2);
    return Math.min(max, Math.max(-max, x));
  };
  const clampY = (y: number, k: number) => {
    'worklet';
    const max = Math.max(0, (bounds.get().baseH * k - bounds.get().frameH) / 2);
    return Math.min(max, Math.max(-max, y));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      grid.set(withTiming(1, { duration: 120 }));
    })
    .onUpdate((e) => {
      const k = Math.min(MAX_ZOOM, Math.max(1, savedScale.get() * e.scale));
      scale.set(k);
      tx.set(clampX(tx.get(), k));
      ty.set(clampY(ty.get(), k));
    })
    .onEnd(() => {
      savedScale.set(scale.get());
      savedX.set(tx.get());
      savedY.set(ty.get());
      grid.set(withTiming(0, { duration: 200 }));
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      grid.set(withTiming(1, { duration: 120 }));
    })
    .onUpdate((e) => {
      tx.set(clampX(savedX.get() + e.translationX, scale.get()));
      ty.set(clampY(savedY.get() + e.translationY, scale.get()));
    })
    .onEnd(() => {
      savedX.set(tx.get());
      savedY.set(ty.get());
      grid.set(withTiming(0, { duration: 200 }));
    });

  // Çift dokunuş: yakınlaştırmayı sıfırla
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.set(withSpring(1, SPRING));
      tx.set(withSpring(0, SPRING));
      ty.set(withSpring(0, SPRING));
      savedScale.set(1);
      savedX.set(0);
      savedY.set(0);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));
  const gridStyle = useAnimatedStyle(() => ({ opacity: grid.get() }));

  /** Şu anki fotoğrafın durumu */
  const snapshot = (): CropTransform => ({
    scale: scale.get(),
    x: tx.get(),
    y: ty.get(),
  });

  const goTo = (next: number) => {
    haptics.select();
    setTransforms((list) => list.map((tr, i) => (i === index ? snapshot() : tr)));
    setIndex(next);
  };

  const finish = async () => {
    const all = transforms.map((tr, i) => (i === index ? snapshot() : tr));
    setBusy(true);
    try {
      const photos = await Promise.all(
        items.map(async ({ original }, i) => {
          const transform = all[i] ?? IDENTITY;
          const image = await cropImage(original, cropRect(original, transform, frameW, frameH));
          return { image, original, transform };
        }),
      );
      haptics.success();
      onDone(photos);
    } catch {
      setBusy(false);
    }
  };

  const last = index === items.length - 1;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <PressableScale onPress={onCancel} hitSlop={hitSlop} disabled={busy}>
          <Text variant="body" color={fixed.white}>
            {t('crop.cancel')}
          </Text>
        </PressableScale>
        <Text variant="headline" color={fixed.white}>
          {items.length > 1 ? t('crop.titleCount', { index: index + 1, count: items.length }) : t('crop.title')}
        </Text>
        <PressableScale onPress={() => (last ? finish() : goTo(index + 1))} hitSlop={hitSlop} disabled={busy}>
          {busy ? (
            <ActivityIndicator color={fixed.white} />
          ) : (
            <Text variant="body" color={fixed.white} style={styles.bold}>
              {last ? t('crop.done') : t('crop.next')}
            </Text>
          )}
        </PressableScale>
      </View>

      <View style={styles.stage}>
        <GestureDetector gesture={gesture}>
          <View style={[styles.frame, { width: frameW, height: frameH }]}>
            {current && (
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    width: baseW,
                    height: baseH,
                    left: (frameW - baseW) / 2,
                    top: (frameH - baseH) / 2,
                  },
                  imageStyle,
                ]}>
                <Image source={{ uri: current.uri }} style={StyleSheet.absoluteFill} contentFit="fill" />
              </Animated.View>
            )}
            {/* Hizalama ızgarası (üçte bir kuralı): yalnızca sürüklerken/yakınlaştırırken */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, gridStyle]}>
              <View style={[styles.gridLine, styles.vertical, { left: frameW / 3 }]} />
              <View style={[styles.gridLine, styles.vertical, { left: (frameW * 2) / 3 }]} />
              <View style={[styles.gridLine, styles.horizontal, { top: frameH / 3 }]} />
              <View style={[styles.gridLine, styles.horizontal, { top: (frameH * 2) / 3 }]} />
            </Animated.View>
          </View>
        </GestureDetector>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.hint}>
          <SymbolView name="hand.pinch" tintColor="rgba(255,255,255,0.7)" size={16} />
          <Text variant="footnote" color="rgba(255,255,255,0.7)">
            {t('crop.hint')}
          </Text>
        </View>
        {items.length > 1 && (
          <View style={styles.thumbs}>
            {items.map((item, i) => (
              <PressableScale
                key={`${item.original.uri}-${i}`}
                onPress={() => i !== index && goTo(i)}
                style={[styles.thumb, i === index && styles.thumbActive]}>
                <Image source={{ uri: item.original.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </PressableScale>
            ))}
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

/** Ekrandaki çerçevenin orijinal görseldeki karşılığı (piksel), görselin içinde kalacak şekilde */
function cropRect(image: LocalImage, tr: CropTransform, frameW: number, frameH: number) {
  const cover = Math.max(frameW / image.width, frameH / image.height);
  const k = cover * tr.scale;
  const width = Math.min(image.width, frameW / k);
  const height = Math.min(image.height, frameH / k);
  const originX = Math.min(image.width - width, Math.max(0, image.width / 2 - tr.x / k - width / 2));
  const originY = Math.min(image.height - height, Math.max(0, image.height / 2 - tr.y / k - height / 2));
  return {
    originX: Math.round(originX),
    originY: Math.round(originY),
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  bold: {
    fontWeight: '700',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    overflow: 'hidden',
    backgroundColor: '#111111',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  vertical: {
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
  },
  horizontal: {
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  bottom: {
    gap: spacing.md,
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  thumbs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thumb: {
    width: 44,
    height: 55,
    borderRadius: radius.button - 4,
    overflow: 'hidden',
    opacity: 0.55,
  },
  thumbActive: {
    opacity: 1,
    borderWidth: 2,
    borderColor: fixed.white,
  },
});
