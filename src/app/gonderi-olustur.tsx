import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlacePicker } from '@/components/place-picker';
import { Avatar, Button, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { showError } from '@/api/errors';
import type { LocalImage } from '@/api/storage';
import { getUser, useEntitiesVersion, usePlace, usePrefetchUsers } from '@/data/entities';
import { useCreatePost, usePlaceDetails } from '@/hooks/queries';
import { haptics } from '@/lib/haptics';
import { HIGHLIGHTS, MEALS, PRICE_BUCKETS } from '@/lib/post-meta';
import { useAppStore } from '@/store/app-store';
import type { Meal, PriceBucket, User } from '@/types';

const MAX_PHOTOS = 5;
const MAX_DISHES = 5;
const MAX_HIGHLIGHTS = 3;

type Params = {
  placeId?: string;
  /** 'onboarding': kayıt sonrası ilk gönderi (atlanabilir) */
  akis?: string;
};

/**
 * Gönderi paylaş: mekân + puan + (isteğe bağlı) fotoğraf ve yorum
 * + işe yarar bilgiler: kişi başı hesap, öğün, ne yenildi, öne çıkanlar, kimlerle gidildi.
 */
export default function CreatePostScreen() {
  const params = useLocalSearchParams<Params>();
  const { following, scoreOf } = useAppStore();
  const createPost = useCreatePost();
  const insets = useSafeAreaInsets();
  const onboarding = params.akis === 'onboarding';

  const [placeId, setPlaceId] = useState(params.placeId);
  const [photos, setPhotos] = useState<LocalImage[]>([]);
  const [caption, setCaption] = useState('');
  const [price, setPrice] = useState<PriceBucket>();
  const [meal, setMeal] = useState<Meal>();
  const [dishes, setDishes] = useState<string[]>([]);
  const [dishInput, setDishInput] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [tagged, setTagged] = useState<string[]>([]);

  // Etiketlenebilecek arkadaşlar: takip edilenler
  usePrefetchUsers(following);
  const version = useEntitiesVersion();
  const friends = useMemo<User[]>(
    () => following.flatMap((id) => getUser(id) ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [following, version],
  );

  // Bu mekân için başkalarının yazdığı yemekler öneri olarak
  const details = usePlaceDetails(placeId);
  const dishSuggestions = useMemo(
    () =>
      (details.data?.summary.dishes ?? [])
        .map((d) => d.name)
        .filter((d) => !dishes.some((x) => x.toLocaleLowerCase('tr') === d.toLocaleLowerCase('tr'))),
    [details.data, dishes],
  );

  const place = usePlace(placeId);
  if (!place) {
    return <PlacePicker title="Nerede yedin?" onSelect={(p) => setPlaceId(p.id)} />;
  }

  const score = scoreOf(place.id);

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
      Alert.alert('Kamera izni gerekli', 'Ayarlar’dan kamera iznini açabilirsin.');
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
        options: ['Fotoğraf çek', 'Galeriden seç', 'Vazgeç'],
        cancelButtonIndex: 2,
        tintColor: colors.primary,
      },
      (i) => {
        if (i === 0) addFromCamera();
        if (i === 1) addFromLibrary();
      },
    );
  };

  const addDish = (name: string) => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean || dishes.length >= MAX_DISHES) return;
    if (dishes.some((d) => d.toLocaleLowerCase('tr') === clean.toLocaleLowerCase('tr'))) return;
    haptics.select();
    setDishes((d) => [...d, clean]);
    setDishInput('');
  };

  const toggle = <T,>(list: T[], item: T, max = Infinity) =>
    list.includes(item) ? list.filter((x) => x !== item) : list.length < max ? [...list, item] : list;

  const share = () => {
    const pendingDish = dishInput.trim();
    createPost.mutate(
      {
        placeId: place.id,
        photos,
        caption: caption.trim() || undefined,
        taggedUserIds: tagged,
        pricePerPerson: price,
        meal,
        dishes: pendingDish && dishes.length < MAX_DISHES ? [...dishes, pendingDish] : dishes,
        highlights,
      },
      {
        onSuccess: () => {
          haptics.success();
          router.back();
        },
        onError: (error) => showError(error, 'Gönderi paylaşılamadı'),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}>
      <Stack.Screen options={{ title: onboarding ? 'İlk gönderin' : 'Gönderi paylaş' }} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {onboarding && (
          <Text variant="subhead" color={colors.textSecondary}>
            Fotoğraf zorunlu değil. Birkaç bilgi eklersen arkadaşların için çok daha faydalı olur.
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
                {params.placeId ? `${place.cuisine} · ${place.neighborhood}` : 'Değiştirmek için dokun'}
              </Text>
            </View>
          </PressableScale>
          {score !== undefined ? (
            <ScoreBadge score={score} />
          ) : (
            <PressableScale
              onPress={() =>
                router.push({
                  pathname: '/degerlendir/[id]',
                  params: { id: place.id, from: 'gonderi' },
                })
              }
              style={styles.rateButton}>
              <Text variant="footnote" color={colors.onPrimary} style={styles.bold}>
                Puanla
              </Text>
            </PressableScale>
          )}
        </Animated.View>

        <Section title="Fotoğraflar" hint={`İsteğe bağlı · ${photos.length}/${MAX_PHOTOS}`}>
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
                  accessibilityLabel="Fotoğrafı kaldır">
                  <SymbolView name="xmark" tintColor={colors.onPrimary} size={11} weight="bold" />
                </PressableScale>
              </Animated.View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <PressableScale
                onPress={addPhoto}
                style={[styles.photoTile, styles.addPhoto]}
                accessibilityLabel="Fotoğraf ekle">
                <SymbolView name="camera" tintColor={colors.primary} size={24} />
                <Text variant="caption" color={colors.primary}>
                  Ekle
                </Text>
              </PressableScale>
            )}
          </ScrollView>
        </Section>

        <Section title="Yorumun" hint="İsteğe bağlı">
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Nasıldı? Neyi tavsiye edersin?"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            style={[typography.body, styles.caption]}
          />
        </Section>

        <Section title="Kişi başı ne tuttu?">
          <View style={styles.chips}>
            {PRICE_BUCKETS.map((b) => (
              <Chip
                key={b.key}
                label={b.label}
                active={price === b.key}
                onPress={() => setPrice(price === b.key ? undefined : b.key)}
              />
            ))}
          </View>
        </Section>

        <Section title="Hangi öğün?">
          <View style={styles.mealRow}>
            {MEALS.map((m) => {
              const active = meal === m.key;
              return (
                <PressableScale
                  key={m.key}
                  haptic={false}
                  onPress={() => {
                    haptics.select();
                    setMeal(active ? undefined : m.key);
                  }}
                  style={[styles.meal, active && styles.chipActive]}>
                  <SymbolView name={m.icon} tintColor={active ? colors.onPrimary : colors.primary} size={20} />
                  <Text variant="caption" color={active ? colors.onPrimary : colors.text} style={styles.bold}>
                    {m.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Section>

        <Section title="Ne yedin?" hint={`${dishes.length}/${MAX_DISHES}`}>
          {dishes.length > 0 && (
            <View style={styles.chips}>
              {dishes.map((d) => (
                <Animated.View key={d} entering={FadeIn} layout={LinearTransition}>
                  <PressableScale
                    onPress={() => setDishes((x) => x.filter((y) => y !== d))}
                    style={[styles.chip, styles.chipActive, styles.dishChip]}>
                    <Text variant="subhead" color={colors.onPrimary}>
                      {d}
                    </Text>
                    <SymbolView name="xmark" tintColor={colors.onPrimary} size={10} weight="bold" />
                  </PressableScale>
                </Animated.View>
              ))}
            </View>
          )}
          {dishes.length < MAX_DISHES && (
            <View style={styles.dishInputRow}>
              <TextInput
                value={dishInput}
                onChangeText={setDishInput}
                onSubmitEditing={() => addDish(dishInput)}
                placeholder="Ör. İskender, künefe…"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="done"
                blurOnSubmit={false}
                style={[typography.body, styles.dishInput]}
              />
              {dishInput.trim() ? (
                <PressableScale onPress={() => addDish(dishInput)} hitSlop={hitSlop} accessibilityLabel="Yemeği ekle">
                  <SymbolView name="plus.circle.fill" tintColor={colors.primary} size={24} />
                </PressableScale>
              ) : null}
            </View>
          )}
          {dishSuggestions.length > 0 && dishes.length < MAX_DISHES && (
            <View style={styles.chips}>
              {dishSuggestions.map((d) => (
                <Chip key={d} label={`+ ${d}`} active={false} onPress={() => addDish(d)} />
              ))}
            </View>
          )}
        </Section>

        <Section title="Öne çıkanlar" hint={`En fazla ${MAX_HIGHLIGHTS}`}>
          <View style={styles.chips}>
            {HIGHLIGHTS.map((h) => (
              <Chip
                key={h}
                label={h}
                active={highlights.includes(h)}
                onPress={() => setHighlights((x) => toggle(x, h, MAX_HIGHLIGHTS))}
              />
            ))}
          </View>
        </Section>

        {friends.length > 0 && (
          <Section title="Kimlerle gittin?">
            <View style={styles.chips}>
              {friends.map((u) => {
                const active = tagged.includes(u.id);
                return (
                  <PressableScale
                    key={u.id}
                    haptic={false}
                    onPress={() => {
                      haptics.select();
                      setTagged((t) => toggle(t, u.id));
                    }}
                    style={[styles.chip, styles.friendChip, active && styles.chipActive]}>
                    <Avatar uri={u.avatarUrl} name={u.name} size={24} />
                    <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
                      {u.name.split(' ')[0]}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </Section>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button
          title={
            createPost.isPending
              ? photos.length
                ? `Yükleniyor… %${Math.round(createPost.progress * 100)}`
                : 'Paylaşılıyor…'
              : 'Paylaş'
          }
          onPress={share}
          disabled={(score === undefined && !photos.length && !caption.trim()) || createPost.isPending}
        />
        {onboarding && !createPost.isPending && (
          <Button title="Şimdilik atla" variant="ghost" onPress={() => router.back()} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const toLocalImage = (asset: ImagePicker.ImagePickerAsset): LocalImage => ({
  uri: asset.uri,
  width: asset.width,
  height: asset.height,
});

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="headline">{title}</Text>
        {hint && (
          <Text variant="footnote" color={colors.textSecondary}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <PressableScale
      haptic={false}
      onPress={() => {
        haptics.select();
        onPress();
      }}
      style={[styles.chip, active && styles.chipActive]}>
      <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
        {label}
      </Text>
    </PressableScale>
  );
}

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
  rateButton: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    justifyContent: 'center',
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  dishChip: {
    paddingRight: spacing.md,
  },
  friendChip: {
    paddingLeft: spacing.xs + 2,
  },
  mealRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  meal: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  dishInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  dishInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
