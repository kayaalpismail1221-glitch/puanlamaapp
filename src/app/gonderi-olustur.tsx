import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';

import { PhotoCropper, type CroppedPhoto, type CropItem } from '@/components/photo-cropper';
import { HeaderIconButton } from '@/components/header-button';
import { PlacePicker } from '@/components/place-picker';
import { CompareStep, SentimentChoice, useRankResultText } from '@/components/rank-steps';
import { HighlightPicker, MAX_HIGHLIGHTS, postFieldStyles } from '@/components/post-fields';
import { segmentOf } from '@/constants/segments';
import { ScoringGuide, useScoringGuide } from '@/components/scoring-guide';
import { Avatar, Button, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, fixed, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { createInvites, matchContacts } from '@/api/contacts';
import { showError } from '@/api/errors';
import type { LocalImage } from '@/api/storage';
import { getPlace, getUser, useEntitiesVersion, usePlace, usePrefetchUsers } from '@/data/entities';
import { useCreatePost } from '@/hooks/queries';
import { useAndroidBack } from '@/hooks/use-android-back';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { useRankFlow } from '@/hooks/use-rank-flow';
import i18n from '@/i18n';
import { pickContact, type DeviceContact } from '@/lib/contacts';
import { showAlert } from '@/lib/dialog';
import { haptics } from '@/lib/haptics';
import { placeSubtitle } from '@/lib/place';
import { segmentStanding } from '@/lib/ranking';
import { useAppStore } from '@/store/app-store';
import type { User } from '@/types';

const MAX_PHOTOS = 5;
/** Tek gönderide davet edilebilecek en fazla kişi (sunucuyla aynı) */
const MAX_INVITEES = 10;

type Params = {
  placeId?: string;
  /** 'onboarding': kayıt sonrası ilk gönderi (atlanabilir) */
  akis?: string;
};

/**
 * Gönderi paylaş. Sıra Puanla'nın özünü izler: mekân → puanın (zorunlu, Beli tarzı akış ekranın içinde; sonuç
 * büyük rozetle) → fotoğraf (tek dokunuşla çek/seç) → "Nasıldı?" → "Kimlerle gittin?" (masa döngüsü: etiketlenene
 * "Sen kaç verirdin?" sorulur, Puanla'da olmayana davet gider) → öne çıkanlar. Alanlar "isteğe bağlı" diye
 * etiketlenmez (kullanıcı kararı: görülsün, doldurulsun). Gönderi için puan ve fotoğraf şart; fotoğrafsız yalnızca puan
 * kaydedilir (gönderi açılmaz). Öğün sorulmaz, açıklamaya yazılır.
 * Fiyat ve ne yenildiği bilerek sorulmaz: paylaşım hafif kalsın, kimse hesap vermek zorunda hissetmesin.
 */
export default function CreatePostScreen() {
  const params = useLocalSearchParams<Params>();
  const { following, scored, rankings, actions } = useAppStore();
  const createPost = useCreatePost();
  const onboarding = params.akis === 'onboarding';
  const { t } = useTranslation();

  const footerStyle = useKeyboardFooterStyle();
  const scrollRef = useRef<ScrollView>(null);
  const captionY = useRef(0);

  const [placeId, setPlaceId] = useState(params.placeId);
  const [photos, setPhotos] = useState<CroppedPhoto[]>([]);
  /** Kırpma ekranındaki fotoğraflar; `replace` verilirse o sıradaki fotoğraf yeniden kırpılıyor */
  const [cropping, setCropping] = useState<{ items: CropItem[]; replace?: number }>({ items: [] });
  const [caption, setCaption] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [tagged, setTagged] = useState<string[]>([]);
  /** Rehberden eklenen, Puanla'da olan kişiler (takip edilmese de etiketlenebilir) */
  const [contactFriends, setContactFriends] = useState<string[]>([]);
  /** Rehberden eklenen, Puanla'da olmayanlar: paylaşınca davet edilir (masa döngüsü) */
  const [invitees, setInvitees] = useState<DeviceContact[]>([]);
  /** Daha önce puanlanmış mekânı yeniden puanlıyor mu */
  const [rerating, setRerating] = useState(false);
  const flow = useRankFlow(placeId);
  const resultText = useRankResultText();

  // Etiketlenebilecek arkadaşlar: rehberden eklenenler ve takip edilenler
  usePrefetchUsers(following);
  const version = useEntitiesVersion();
  const friends = useMemo<User[]>(
    () => [...new Set([...contactFriends, ...following])].flatMap((id) => getUser(id) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactFriends, following, version],
  );

  const place = usePlace(placeId);
  const existing = place ? scored.find((e) => e.placeId === place.id) : undefined;
  // Puanlanmamış mekânda (ya da "Değiştir" denince) puanlama akışı ekranın içinde açılır
  const rating = !!place && (!existing || rerating);
  // İlk puanlamada puanlama rehberi bir kez kendiliğinden açılır
  const guide = useScoringGuide({ auto: rating });

  // Android geri tuşu: yazılanlar sorulmadan gitmesin; ekranda seçilen mekândan mekân seçimine dönülür
  const dirty = photos.length > 0 || caption.trim() !== '' || highlights.length > 0 || tagged.length > 0 || invitees.length > 0;
  const backToPicker = !!place && !params.placeId && !dirty;
  const confirmDiscard = () =>
    showAlert(t('compose.discardTitle'), t('compose.discardText'), [
      { text: t('compose.keepEditing'), style: 'cancel' },
      { text: t('compose.discard'), style: 'destructive', onPress: () => router.back() },
    ]);
  // Üstteki ✕: yazılanlar varsa sorar, yoksa kapatır (paylaşım sürerken kapanmaz)
  const close = () => {
    if (createPost.isPending) return;
    if (dirty) confirmDiscard();
    else router.back();
  };
  const header = <Stack.Screen options={{ headerLeft: () => <CloseButton onPress={close} /> }} />;
  useAndroidBack(
    dirty
      ? confirmDiscard
      : backToPicker
        ? () => {
            setPlaceId(undefined);
            setRerating(false);
          }
        : null,
  );

  if (!place) {
    return (
      <>
        {header}
        <PlacePicker title={t('compose.whereDidYouEat')} onSelect={(p) => setPlaceId(p.id)} />
      </>
    );
  }

  const score = rating ? flow.result?.score : existing?.score;
  const standing = existing && !rating ? segmentStanding(rankings, place.id) : undefined;

  const addFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.8,
    });
    // Seçilenler önce kırpma ekranına (akıştaki 4:5 çerçeve)
    if (!result.canceled) setCropping({ items: result.assets.map((a) => ({ original: toLocalImage(a) })) });
  };

  const addFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      // iOS bir kez reddedilince yeniden sormaz: izin yalnızca Ayarlar'dan açılır
      showAlert(t('compose.cameraPermissionTitle'), t('compose.cameraPermissionText'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('compose.openSettings'), onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setCropping({ items: [{ original: toLocalImage(result.assets[0]!) }] });
  };

  /** Sistem kişi seçicisi: Puanla'daysa etiketlenir, değilse paylaşınca davet edilir */
  const addFromContacts = async () => {
    const picked = await pickContact().catch(() => 'unavailable' as const);
    if (!picked) return;
    if (picked === 'unavailable') return showAlert(t('compose.contactsUnavailable'));
    if (picked === 'denied') return showAlert(t('compose.contactsDeniedTitle'), t('compose.contactsDenied'));
    if (picked === 'no_mobile') return showAlert(t('compose.contactNoMobileTitle'), t('compose.contactNoMobile'));
    haptics.select();
    const match = await matchContacts([picked.phone]).then((m) => m[0], () => undefined);
    if (match) {
      setContactFriends((ids) => (ids.includes(match.user.id) ? ids : [match.user.id, ...ids]));
      setTagged((ids) => (ids.includes(match.user.id) ? ids : [...ids, match.user.id]));
      return;
    }
    setInvitees((list) => (list.some((c) => c.phone === picked.phone) ? list : [...list, picked].slice(0, MAX_INVITEES)));
  };

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  // Gönderi fotoğrafla olur (kullanıcı kararı 2026-10-06: yalnızca puan gönderi olarak görünmesin); fotoğrafsız
  // yalnızca puan kaydedilir
  const hasPhoto = photos.length > 0;

  const share = () => {
    if (score === undefined) return;
    if (!hasPhoto) {
      if (!rating || !flow.result) return;
      actions.rank(place.id, flow.result, existing?.note);
      haptics.success();
      router.back();
      return;
    }
    // Yeni puan önce kaydedilir; gönderi puanını sunucudaki sıralamadan alır (bkz. waitForRank)
    if (rating && flow.result) actions.rank(place.id, flow.result, existing?.note);
    createPost.mutate(
      {
        placeId: place.id,
        photos: photos.map((p) => p.image),
        caption: caption.trim() || undefined,
        taggedUserIds: tagged,
        highlights,
      },
      {
        onSuccess: (post) => {
          haptics.success();
          router.back();
          if (invitees.length) {
            // Davet kaydı olmasa da mesaj gönderilebilir; katılınca eşleşme yalnızca kayıtla olur
            createInvites(place.id, invitees.map((c) => c.phone), post.id).catch(() => {});
            router.push({ pathname: '/davet-et', params: { mekan: place.id, kisiler: JSON.stringify(invitees) } });
          } else if (!onboarding) offerStory(post.id);
        },
        onError: (error) => showError(error, t('failures.postShare')),
      },
    );
  };

  const shareTitle = createPost.isPending
    ? photos.length
      ? t('compose.uploading', { percent: Math.round(createPost.progress * 100) })
      : t('compose.sharing')
    : score === undefined
      ? t('compose.rateFirst')
      : hasPhoto
        ? t('common.share')
        : rating
          ? t('compose.saveScore')
          : t('compose.addPhotoToShare');

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: onboarding ? t('screens.firstPost') : t('screens.sharePost') }} />
      {header}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive">
        {onboarding && (
          <Text variant="subhead" color={colors.textSecondary}>
            {t('compose.onboardingHint')}
          </Text>
        )}

        {/* Mekân */}
        <Animated.View entering={FadeIn}>
          <PressableScale
            onPress={() => !params.placeId && setPlaceId(undefined)}
            disabled={!!params.placeId}
            scaleTo={0.98}
            style={styles.placeRow}>
            <PlaceImage uri={place.photoUrl} style={styles.placeImage} />
            <View style={styles.flex}>
              <Text variant="title3" numberOfLines={1}>
                {place.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                {placeSubtitle(place)}
              </Text>
            </View>
            {!params.placeId && (
              <Text variant="subhead" color={colors.primary} style={styles.bold}>
                {t('common.change')}
              </Text>
            )}
          </PressableScale>
        </Animated.View>

        {/* Puanın: gönderinin kalbi */}
        <Animated.View entering={FadeInDown.springify()} layout={LinearTransition} style={styles.scoreCard}>
          <View style={styles.cardHeader}>
            <Text variant="headline">{t('compose.yourScore')}</Text>
            <PressableScale onPress={guide.open} hitSlop={hitSlop} accessibilityLabel={t('scoringGuide.open')}>
              <SymbolView name="questionmark.circle" tintColor={colors.textSecondary} size={20} />
            </PressableScale>
          </View>

          {!rating && existing ? (
            <View style={styles.scoreResult}>
              <ScoreBadge score={existing.score} size="lg" />
              <View style={styles.flex}>
                {standing && (
                  <Text variant="subhead" color={colors.textSecondary}>
                    {standing.total === 1
                      ? t('place.segmentFirst', { segment: t(`segments.${standing.segment}`) })
                      : t('place.segmentStanding', {
                          segment: t(`segments.${standing.segment}`),
                          rank: standing.rank,
                          total: standing.total,
                        })}
                  </Text>
                )}
                <PressableScale
                  onPress={() => {
                    flow.reset();
                    setRerating(true);
                  }}
                  hitSlop={hitSlop}>
                  <Text variant="subhead" color={colors.primary} style={styles.bold}>
                    {t('compose.rerate')}
                  </Text>
                </PressableScale>
              </View>
            </View>
          ) : flow.phase === 'sentiment' ? (
            <View style={styles.rateStep}>
              <Text variant="subhead" color={colors.textSecondary}>
                {t('compose.howWasIt')}
              </Text>
              <SentimentChoice compact onChoose={flow.choose} />
              {existing && (
                <Button title={t('common.cancel')} variant="ghost" size="sm" onPress={() => setRerating(false)} />
              )}
            </View>
          ) : flow.phase === 'compare' ? (
            <CompareStep
              key={`compare-${flow.step}`}
              compact
              place={place}
              other={flow.otherPlaceId ? getPlace(flow.otherPlaceId) : undefined}
              segment={flow.segment}
              step={flow.step}
              total={flow.totalSteps}
              onPick={flow.answer}
              onTie={flow.tie}
            />
          ) : flow.result ? (
            <View style={styles.scoreResult}>
              <Animated.View entering={ZoomIn.springify()}>
                <ScoreBadge score={flow.result.score} size="lg" />
              </Animated.View>
              <View style={styles.flex}>
                <Text variant="subhead" color={colors.textSecondary}>
                  {resultText(flow.result)}
                </Text>
                <PressableScale onPress={flow.undo} hitSlop={hitSlop}>
                  <Text variant="subhead" color={colors.primary} style={styles.bold}>
                    {t('rate.undo')}
                  </Text>
                </PressableScale>
              </View>
            </View>
          ) : null}
        </Animated.View>

        {/* Fotoğraflar: boşken tek dokunuşla çek ya da seç */}
        <View style={styles.section}>
          <SectionTitle
            title={t('compose.photos')}
            hint={photos.length ? t('compose.photosHint', { count: photos.length, max: MAX_PHOTOS }) : undefined}
          />
          {photos.length === 0 ? (
            <View style={styles.photoActions}>
              <PhotoAction icon="camera.fill" label={t('compose.takePhoto')} onPress={addFromCamera} />
              <PhotoAction icon="photo.on.rectangle.angled" label={t('compose.chooseFromLibrary')} onPress={addFromLibrary} />
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {photos.map((photo, i) => (
                <Animated.View
                  key={`${photo.image.uri}-${i}`}
                  entering={FadeIn}
                  layout={LinearTransition}
                  style={[styles.photoTile, i === 0 && styles.coverTile]}>
                  {/* Dokununca yeniden kırp (orijinal üzerinden) */}
                  <PressableScale
                    onPress={() => setCropping({ items: [{ original: photo.original, transform: photo.transform }], replace: i })}
                    scaleTo={0.97}
                    style={StyleSheet.absoluteFill}
                    accessibilityLabel={t('crop.edit')}>
                    <PlaceImage uri={photo.image.uri} style={StyleSheet.absoluteFill} />
                  </PressableScale>
                  {i === 0 && photos.length > 1 && (
                    <View style={styles.coverLabel}>
                      <Text variant="caption" color={fixed.white} style={styles.bold}>
                        {t('compose.cover')}
                      </Text>
                    </View>
                  )}
                  <PressableScale
                    onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                    hitSlop={hitSlop}
                    style={styles.removePhoto}
                    accessibilityLabel={t('compose.removePhoto')}>
                    <SymbolView name="xmark" tintColor={fixed.white} size={11} weight="bold" />
                  </PressableScale>
                </Animated.View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <View style={styles.addColumn}>
                  <PressableScale onPress={addFromCamera} style={styles.addSmall} accessibilityLabel={t('compose.takePhoto')}>
                    <SymbolView name="camera" tintColor={colors.primary} size={20} />
                  </PressableScale>
                  <PressableScale
                    onPress={addFromLibrary}
                    style={styles.addSmall}
                    accessibilityLabel={t('compose.chooseFromLibrary')}>
                    <SymbolView name="photo.on.rectangle" tintColor={colors.primary} size={20} />
                  </PressableScale>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        {/* Nasıldı? */}
        <View
          style={styles.section}
          onLayout={(e) => {
            captionY.current = e.nativeEvent.layout.y;
          }}>
          <SectionTitle title={t('compose.caption')} />
          <TextInput
            value={caption}
            onChangeText={setCaption}
            // Klavye açılıp alan küçülünce yorum kutusu görünür kalsın
            onFocus={() => setTimeout(() => scrollRef.current?.scrollTo({ y: captionY.current - spacing.lg, animated: true }), 250)}
            placeholder={t('compose.captionPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            style={[typography.body, styles.caption]}
          />
        </View>

        {/* Kimlerle gittin? — masa döngüsü */}
        <View style={styles.section}>
          <SectionTitle title={t('compose.withWhom')} />
          <Text variant="footnote" color={colors.textSecondary}>
            {invitees.length ? t('compose.inviteHint') : t('compose.withWhomHint')}
          </Text>
          <View style={postFieldStyles.chips}>
            <PressableScale
              haptic={false}
              onPress={addFromContacts}
              style={[postFieldStyles.chip, styles.friendChip]}
              accessibilityLabel={t('compose.fromContacts')}>
              <SymbolView name="person.crop.circle.badge.plus" tintColor={colors.primary} size={20} />
              <Text variant="subhead" color={colors.primary}>
                {t('compose.fromContacts')}
              </Text>
            </PressableScale>
            {invitees.map((c) => (
              <PressableScale
                key={c.phone}
                haptic={false}
                onPress={() => {
                  haptics.select();
                  setInvitees((list) => list.filter((x) => x.phone !== c.phone));
                }}
                style={[postFieldStyles.chip, styles.friendChip, postFieldStyles.chipActive]}
                accessibilityLabel={t('compose.removeInvitee', { name: c.name })}>
                <SymbolView name="paperplane.fill" tintColor={colors.onPrimary} size={14} />
                <Text variant="subhead" color={colors.onPrimary}>
                  {c.name.split(' ')[0]}
                </Text>
              </PressableScale>
            ))}
            {friends.map((u) => {
              const active = tagged.includes(u.id);
              return (
                <PressableScale
                  key={u.id}
                  haptic={false}
                  onPress={() => {
                    haptics.select();
                    setTagged((ids) => toggle(ids, u.id));
                  }}
                  style={[postFieldStyles.chip, styles.friendChip, active && postFieldStyles.chipActive]}>
                  <Avatar uri={u.avatarUrl} name={u.name} size={24} />
                  <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
                    {u.name.split(' ')[0]}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {/* Öne çıkanlar: açıkta, tek dokunuşla */}
        <View style={styles.section}>
          <SectionTitle title={t('compose.highlights')} hint={t('compose.highlightsHint', { max: MAX_HIGHLIGHTS })} />
          <HighlightPicker value={highlights} onChange={setHighlights} segment={segmentOf(place.cuisine)} />
        </View>
      </ScrollView>

      <Animated.View style={[styles.footer, footerStyle]}>
        {!hasPhoto && score !== undefined && (
          <Text variant="footnote" color={colors.textSecondary} align="center">
            {t('compose.scoreOnlyHint')}
          </Text>
        )}
        <Button
          title={shareTitle}
          onPress={share}
          disabled={score === undefined || (!hasPhoto && !rating) || createPost.isPending}
        />
        {onboarding && !createPost.isPending && (
          <Button title={t('compose.skip')} variant="ghost" onPress={() => router.back()} />
        )}
      </Animated.View>

      <ScoringGuide visible={guide.visible} onClose={guide.close} />
      <PhotoCropper
        items={cropping.items}
        onCancel={() => setCropping({ items: [] })}
        onDone={(cropped) => {
          const at = cropping.replace;
          setPhotos((list) =>
            at !== undefined
              ? list.map((p, i) => (i === at ? cropped[0]! : p))
              : [...list, ...cropped].slice(0, MAX_PHOTOS),
          );
          setCropping({ items: [] });
        }}
      />
    </View>
  );
}

/** Başlıktaki kapat düğmesi: iOS'ta sistemin cam düğmesine giren ✕, Android'de Material'daki gibi solda ✕ */
function CloseButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  if (Platform.OS === 'android') {
    return <HeaderIconButton icon="xmark" onPress={onPress} accessibilityLabel={t('common.close')} />;
  }
  return (
    <PressableScale onPress={onPress} hitSlop={hitSlop} accessibilityRole="button" accessibilityLabel={t('common.close')}>
      <SymbolView name="xmark" tintColor={colors.primary} size={17} weight="semibold" />
    </PressableScale>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="headline">{title}</Text>
      {hint && (
        <Text variant="footnote" color={colors.textTertiary}>
          {hint}
        </Text>
      )}
    </View>
  );
}

function PhotoAction({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={styles.photoAction} accessibilityRole="button">
      <SymbolView name={icon} tintColor={colors.primary} size={26} />
      <Text variant="subhead" color={colors.primary} style={styles.bold}>
        {label}
      </Text>
    </PressableScale>
  );
}

const toLocalImage = (asset: ImagePicker.ImagePickerAsset): LocalImage => ({
  uri: asset.uri,
  width: asset.width,
  height: asset.height,
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  form: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  flex: {
    flex: 1,
    gap: 2,
  },
  bold: {
    fontWeight: '600',
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  placeImage: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
  scoreCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  rateStep: {
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photoAction: {
    flex: 1,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  photoRow: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  photoTile: {
    width: 104,
    height: 130,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  coverTile: {
    width: 132,
    height: 165,
  },
  coverLabel: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.overlay,
  },
  addColumn: {
    gap: spacing.sm,
  },
  addSmall: {
    width: 64,
    height: 64,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  removePhoto: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    minHeight: 96,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingTop: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
  friendChip: {
    paddingLeft: spacing.xs + 2,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});

/** Gönderi paylaşıldıktan sonra Instagram hikâyesi kartını önerir (yayılmanın en doğal anı) */
function offerStory(postId: string) {
  showAlert(i18n.t('story.postPublished'), i18n.t('story.postPublishedText'), [
    { text: i18n.t('story.later'), style: 'cancel' },
    {
      text: i18n.t('story.shareToStory'),
      onPress: () => router.push({ pathname: '/hikaye', params: { gonderi: postId } }),
    },
  ]);
}
