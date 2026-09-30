import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { logShare } from '@/api/growth';
import { GlassSurface } from '@/components/glass-surface';
import { MapStoryCard, STORY_MAP_ASPECT, type StoryAuthor } from '@/components/story-cards';
import { PressableScale, Text } from '@/components/ui';
import { colors, fixed, gradients, hitSlop, radius, scoreColor, spacing } from '@/constants/theme';
import { useUser } from '@/data/entities';
import { useVisitedPlaces } from '@/hooks/use-visited-places';
import { showAlert } from '@/lib/dialog';
import { haptics } from '@/lib/haptics';
import { isMe } from '@/lib/session';
import { shareProfile } from '@/lib/share';
import { STORY_SIZE } from '@/lib/story';
import { exportCard, messageImage, saveImage, shareImage } from '@/lib/story-export';
import { cityDots, visitedSummary } from '@/lib/visited';
import { fitView, MIN_MAP_VIEW_WIDTH } from '@/lib/world-projection';
import { useAppStore } from '@/store/app-store';

type Action = 'share' | 'save' | 'message' | 'link';

const ACTIONS: { key: Action; icon: SFSymbol }[] = [
  { key: 'share', icon: 'square.and.arrow.up' },
  { key: 'save', icon: 'square.and.arrow.down' },
  { key: 'message', icon: 'message.fill' },
  { key: 'link', icon: 'link' },
];

/**
 * Lezzet haritası paylaşımı: kartın önizlemesi ve altta paylaşım yolları. Kart "{Ad}'ın lezzet haritası",
 * şehir ve mekân sayısı ile haritayı gösterir; 1080×1920 görsel olarak gider.
 */
export default function ShareTasteMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  // Android'de "Mesajlar" (iMessage) yerine SMS: "Mesaj"
  const actionLabel = (key: Action) =>
    key === 'message' && Platform.OS === 'android' ? t('mapShare.messageAndroid') : t(`mapShare.actions.${key}`);
  const insets = useSafeAreaInsets();
  const { profile } = useAppStore();
  const mine = isMe(id);
  const other = useUser(mine ? undefined : id);
  const { items, loading } = useVisitedPlaces(id);

  const author: StoryAuthor | null = mine
    ? profile && { name: profile.name, username: profile.username, avatarUri: profile.avatarUri }
    : other
      ? { name: other.name, username: other.username, avatarUri: other.avatarUrl }
      : null;

  const card = useMemo(() => {
    const dots = cityDots(items);
    return {
      dots,
      view: fitView(
        dots.map((d) => d.point),
        STORY_MAP_ASPECT,
        MIN_MAP_VIEW_WIDTH,
      ),
      summary: visitedSummary(items),
    };
  }, [items]);

  // Profil fotoğrafı yüklenmeden görüntü alınmasın
  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const onImageSettled = useCallback(
    (uri: string) => setSettled((prev) => (prev.has(uri) ? prev : new Set(prev).add(uri))),
    [],
  );
  const ready = !!author && (!author.avatarUri || settled.has(author.avatarUri));

  const [box, setBox] = useState({ width: 0, height: 0 });
  const scale = box.width ? Math.min(box.width / STORY_SIZE.width, box.height / STORY_SIZE.height) : 0;

  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [saved, setSaved] = useState(false);

  const run = async (action: Action) => {
    if (!author || busy) return;
    if (action === 'link') {
      shareProfile({ id, username: author.username });
      return;
    }
    setBusy(action);
    try {
      const uri = await exportCard(cardRef);
      if (action === 'share') {
        await shareImage(uri, t('mapShare.title'));
        logShare('map', { target: id });
      }
      if (action === 'save') {
        if (await saveImage(uri)) {
          haptics.success();
          setSaved(true);
          logShare('map', { target: id, channel: 'save', completed: true });
        } else showAlert(t(Platform.OS === 'android' ? 'mapShare.savePermissionAndroid' : 'mapShare.savePermission'));
      }
      if (action === 'message') {
        if (await messageImage(uri, t('mapShare.messageBody'))) logShare('map', { target: id, channel: 'messages' });
        else showAlert(t(Platform.OS === 'android' ? 'mapShare.messageUnavailableAndroid' : 'mapShare.messageUnavailable'));
      }
    } catch (error) {
      if (__DEV__) console.warn('[puanla] harita paylaşımı', error);
      showAlert(t('story.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={gradients.share} locations={gradients.shareStops} style={StyleSheet.absoluteFill} />

      <PressableScale
        onPress={() => router.back()}
        hitSlop={hitSlop}
        style={[styles.close, { top: insets.top + spacing.sm }]}
        accessibilityLabel={t('rate.close')}>
        <GlassSurface interactive style={styles.closeGlass}>
          <SymbolView name="xmark" tintColor={fixed.white} size={16} weight="semibold" />
        </GlassSurface>
      </PressableScale>

      <View style={[styles.stage, { marginTop: insets.top + 56 }]} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        {loading || !author ? (
          <ActivityIndicator color={fixed.white} />
        ) : (
          scale > 0 && (
            <View style={[styles.preview, { width: STORY_SIZE.width * scale, height: STORY_SIZE.height * scale }]}>
              <View style={styles.clip}>
                {/* Ölçek üst görünümde; görüntüsü alınan kart kendi boyutunda kalır */}
                <View style={[styles.scaler, { transform: [{ scale }] }]}>
                  <MapStoryCard ref={cardRef} author={author} onImageSettled={onImageSettled} {...card} />
                </View>
              </View>
            </View>
          )
        )}
      </View>

      <Animated.View entering={FadeInDown.springify().damping(18)} style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Text variant="headline" align="center">
          {t('mapShare.title')}
        </Text>
        <View style={styles.actions}>
          {ACTIONS.map(({ key, icon }) => {
            const done = key === 'save' && saved;
            return (
              <PressableScale
                key={key}
                onPress={() => run(key)}
                disabled={!ready || !!busy}
                style={styles.action}
                accessibilityRole="button"
                accessibilityLabel={actionLabel(key)}>
                <View style={[styles.actionIcon, done && styles.actionDone]}>
                  {busy === key ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <SymbolView name={done ? 'checkmark' : icon} tintColor={done ? fixed.white : colors.onPrimary} size={22} weight="semibold" />
                  )}
                </View>
                <Text variant="caption" color={colors.text} numberOfLines={1}>
                  {done ? t('mapShare.saved') : actionLabel(key)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        <Text variant="footnote" color={colors.textSecondary} align="center">
          {t('mapShare.hint')}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: fixed.navy,
  },
  close: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 1,
  },
  closeGlass: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    borderRadius: 22,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
  },
  clip: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  scaler: {
    width: STORY_SIZE.width,
    height: STORY_SIZE.height,
    transformOrigin: 'top left',
  },
  sheet: {
    gap: spacing.lg,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.card,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  action: {
    width: 72,
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  actionDone: {
    backgroundColor: scoreColor(10),
  },
});
