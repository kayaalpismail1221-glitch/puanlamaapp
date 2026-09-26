import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionSheetIOS,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { PlacePicker } from '@/components/place-picker';
import { CompareStep, SentimentChoice, useRankResultText } from '@/components/rank-steps';
import { FormSection as Section, HighlightPicker, MAX_HIGHLIGHTS, MealPicker, postFieldStyles } from '@/components/post-fields';
import { Avatar, Button, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { createInvites, matchContacts } from '@/api/contacts';
import { showError } from '@/api/errors';
import type { LocalImage } from '@/api/storage';
import { getPlace, getUser, useEntitiesVersion, usePlace, usePrefetchUsers } from '@/data/entities';
import { useCreatePost } from '@/hooks/queries';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { useRankFlow } from '@/hooks/use-rank-flow';
import i18n from '@/i18n';
import { pickContact, type DeviceContact } from '@/lib/contacts';
import { haptics } from '@/lib/haptics';
import { placeSubtitle } from '@/lib/place';
import { useAppStore } from '@/store/app-store';
import type { Meal, User } from '@/types';

const MAX_PHOTOS = 5;
/** Tek gönderide davet edilebilecek en fazla kişi (sunucuyla aynı) */
const MAX_INVITEES = 10;

type Params = {
  placeId?: string;
  /** 'onboarding': kayıt sonrası ilk gönderi (atlanabilir) */
  akis?: string;
};

/**
 * Gönderi paylaş: mekân + puan (Beli tarzı akış ekranın içinde; zorunlu) + (isteğe bağlı) fotoğraf ve yorum
 * + isteğe bağlı bilgiler: öğün, öne çıkanlar, kimlerle gidildi.
 * Fiyat ve ne yenildiği bilerek sorulmaz: paylaşım hafif kalsın, kimse hesap vermek zorunda hissetmesin.
 */
export default function CreatePostScreen() {
  const params = useLocalSearchParams<Params>();
  const { following, scored, actions } = useAppStore();
  const createPost = useCreatePost();
  const onboarding = params.akis === 'onboarding';
  const { t } = useTranslation();

  const footerStyle = useKeyboardFooterStyle();
  const scrollRef = useRef<ScrollView>(null);
  const captionY = useRef(0);

  const [placeId, setPlaceId] = useState(params.placeId);
  const [photos, setPhotos] = useState<LocalImage[]>([]);
  const [caption, setCaption] = useState('');
  const [meal, setMeal] = useState<Meal>();
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
  if (!place) {
    return <PlacePicker title={t('compose.whereDidYouEat')} onSelect={(p) => setPlaceId(p.id)} />;
  }

  const existing = scored.find((e) => e.placeId === place.id);
  // Puanlanmamış mekânda (ya da "Değiştir" denince) puanlama akışı ekranın içinde açılır
  const rating = !existing || rerating;
  const score = rating ? flow.result?.score : existing.score;

  const addFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.8,
    });
    if (!result.canceled) setPhotos((p) => [...p, ...result.assets.map(toLocalImage)].slice(0, MAX_PHOTOS));
  };

  const addFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('compose.cameraPermissionTitle'), t('compose.cameraPermissionText'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) setPhotos((p) => [...p, toLocalImage(result.assets[0]!)].slice(0, MAX_PHOTOS));
  };

  const addPhoto = () => {
    if (Platform.OS !== 'ios') return addFromLibrary();
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('compose.takePhoto'), t('compose.chooseFromLibrary'), t('common.cancel')],
        cancelButtonIndex: 2,
        tintColor: colors.primary,
      },
      (i) => {
        if (i === 0) addFromCamera();
        if (i === 1) addFromLibrary();
      },
    );
  };

  /** Sistem kişi seçicisi: Puanla'daysa etiketlenir, değilse paylaşınca davet edilir */
  const addFromContacts = async () => {
    const picked = await pickContact().catch(() => 'unavailable' as const);
    if (!picked) return;
    if (picked === 'unavailable') return Alert.alert(t('compose.contactsUnavailable'));
    if (picked === 'denied') return Alert.alert(t('compose.contactsDeniedTitle'), t('compose.contactsDenied'));
    if (picked === 'no_mobile') return Alert.alert(t('compose.contactNoMobileTitle'), t('compose.contactNoMobile'));
    haptics.select();
    const match = await matchContacts([picked.phone]).then((m) => m[0], () => undefined);
    if (match) {
      setContactFriends((ids) => (ids.includes(match.user.id) ? ids : [match.user.id, ...ids]));
      setTagged((ids) => (ids.includes(match.user.id) ? ids : [...ids, match.user.id]));
      return;
    }
    setInvitees((list) => (list.some((c) => c.phone === picked.phone) ? list : [...list, picked].slice(0, MAX_INVITEES)));
  };

  const toggle = <T,>(list: T[], item: T, max = Infinity) =>
    list.includes(item) ? list.filter((x) => x !== item) : list.length < max ? [...list, item] : list;

  const share = () => {
    if (score === undefined) return;
    // Yeni puan önce kaydedilir; gönderi puanını sunucudaki sıralamadan alır (bkz. waitForRank)
    if (rating && flow.result) actions.rank(place.id, flow.result.sentiment, flow.result.index, existing?.note);
    createPost.mutate(
      {
        placeId: place.id,
        photos,
        caption: caption.trim() || undefined,
        taggedUserIds: tagged,
        meal,
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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: onboarding ? t('screens.firstPost') : t('screens.sharePost') }} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {onboarding && (
          <Text variant="subhead" color={colors.textSecondary}>
            {t('compose.onboardingHint')}
          </Text>
        )}

        {/* Mekân ve puan */}
        <Animated.View entering={FadeIn} style={styles.placeCard}>
          <PressableScale
            onPress={() => !params.placeId && setPlaceId(undefined)}
            disabled={!!params.placeId}
            scaleTo={0.98}
            style={styles.placeInfo}>
            <PlaceImage uri={place.photoUrl} style={styles.placeImage} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" numberOfLines={1}>
                {place.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary}>
                {params.placeId ? placeSubtitle(place) : t('compose.tapToChange')}
              </Text>
            </View>
          </PressableScale>
        </Animated.View>

        <Section title={t('compose.yourScore')}>
          {!rating ? (
            <View style={styles.scoreRow}>
              <ScoreBadge score={existing.score} />
              <Text variant="subhead" color={colors.textSecondary} style={styles.flex}>
                {t('place.yourRank', { rank: existing.rank })}
              </Text>
              <PressableScale
                onPress={() => {
                  flow.reset();
                  setRerating(true);
                }}
                hitSlop={hitSlop}>
                <Text variant="subhead" color={colors.primary} style={styles.bold}>
                  {t('common.change')}
                </Text>
              </PressableScale>
            </View>
          ) : flow.phase === 'sentiment' ? (
            <View style={styles.rateStep}>
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
              step={flow.step}
              total={flow.totalSteps}
              onPick={flow.answer}
              onSkip={flow.skip}
            />
          ) : flow.result ? (
            <Animated.View entering={FadeIn} style={styles.scoreRow}>
              <ScoreBadge score={flow.result.score} />
              <Text variant="subhead" color={colors.textSecondary} style={styles.flex}>
                {resultText(flow.result)}
              </Text>
              <PressableScale onPress={flow.undo} hitSlop={hitSlop}>
                <Text variant="subhead" color={colors.primary} style={styles.bold}>
                  {t('rate.undo')}
                </Text>
              </PressableScale>
            </Animated.View>
          ) : null}
        </Section>

        <Section title={t('compose.photos')} hint={t('compose.photosHint', { count: photos.length, max: MAX_PHOTOS })}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            {photos.map((photo, i) => (
              <Animated.View
                key={`${photo.uri}-${i}`}
                entering={FadeIn}
                layout={LinearTransition}
                style={styles.photoTile}>
                <PlaceImage uri={photo.uri} style={StyleSheet.absoluteFill} />
                <PressableScale
                  onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                  hitSlop={hitSlop}
                  style={styles.removePhoto}
                  accessibilityLabel={t('compose.removePhoto')}>
                  <SymbolView name="xmark" tintColor={colors.onPrimary} size={11} weight="bold" />
                </PressableScale>
              </Animated.View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <PressableScale
                onPress={addPhoto}
                style={[styles.photoTile, styles.addPhoto]}
                accessibilityLabel={t('compose.addPhoto')}>
                <SymbolView name="camera" tintColor={colors.primary} size={24} />
                <Text variant="caption" color={colors.primary}>
                  {t('compose.add')}
                </Text>
              </PressableScale>
            )}
          </ScrollView>
        </Section>

        <Section
          title={t('compose.caption')}
          hint={t('common.optional')}
          onLayout={(y) => {
            captionY.current = y;
          }}>
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
        </Section>


        <Section title={t('compose.meal')}>
          <MealPicker value={meal} onChange={setMeal} />
        </Section>

        <Section title={t('compose.highlights')} hint={t('compose.highlightsHint', { max: MAX_HIGHLIGHTS })}>
          <HighlightPicker value={highlights} onChange={setHighlights} />
        </Section>

        <Section title={t('compose.withWhom')} hint={invitees.length ? t('compose.inviteHint') : undefined}>
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
        </Section>
      </ScrollView>

      <Animated.View style={[styles.footer, footerStyle]}>
        <Button
          title={
            createPost.isPending
              ? photos.length
                ? t('compose.uploading', { percent: Math.round(createPost.progress * 100) })
                : t('compose.sharing')
              : t('common.share')
          }
          onPress={share}
          disabled={score === undefined || createPost.isPending}
        />
        {onboarding && !createPost.isPending && (
          <Button title={t('compose.skip')} variant="ghost" onPress={() => router.back()} />
        )}
      </Animated.View>
    </View>
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
  },
  bold: {
    fontWeight: '600',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rateStep: {
    gap: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  placeImage: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
  photoRow: {
    gap: spacing.sm,
  },
  photoTile: {
    width: 96,
    height: 120,
    borderRadius: radius.button,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  addPhoto: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
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
  },
});

/** Gönderi paylaşıldıktan sonra Instagram hikâyesi kartını önerir (yayılmanın en doğal anı) */
function offerStory(postId: string) {
  Alert.alert(i18n.t('story.postPublished'), i18n.t('story.postPublishedText'), [
    { text: i18n.t('story.later'), style: 'cancel' },
    {
      text: i18n.t('story.shareToStory'),
      onPress: () => router.push({ pathname: '/hikaye', params: { gonderi: postId } }),
    },
  ]);
}
