import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
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
import { placeById, USERS } from '@/data/mock';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';
import { ME } from '@/types';

const MAX_PHOTOS = 5;

/** Gönderi paylaş: mekân + fotoğraflar + yorum + birlikte gidilen arkadaşlar */
export default function CreatePostScreen() {
  const params = useLocalSearchParams<{ placeId?: string }>();
  const { following, scoreOf, dispatch } = useAppStore();
  const insets = useSafeAreaInsets();

  const [placeId, setPlaceId] = useState(params.placeId);
  const [photos, setPhotos] = useState<string[]>([]);
  const [caption, setCaption] = useState('');
  const [tagged, setTagged] = useState<string[]>([]);

  // Takip edilenler başta; etiketlenecek arkadaş listesi
  const friends = useMemo(
    () => [...USERS].sort((a, b) => Number(following.includes(b.id)) - Number(following.includes(a.id))),
    [following],
  );

  const place = placeId ? placeById(placeId) : undefined;
  if (!place) {
    return <PlacePicker title="Nerede yedin?" onSelect={(p) => setPlaceId(p.id)} />;
  }

  const score = scoreOf(place.id);
  const canShare = photos.length > 0 || caption.trim().length > 0;

  const addFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photos.length,
      quality: 0.8,
    });
    if (!result.canceled) setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)].slice(0, MAX_PHOTOS));
  };

  const addFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kamera izni gerekli', 'Ayarlar’dan kamera iznini açabilirsin.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setPhotos((p) => [...p, result.assets[0]!.uri].slice(0, MAX_PHOTOS));
  };

  const addPhoto = () => {
    if (Platform.OS !== 'ios') return addFromLibrary();
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Fotoğraf çek', 'Galeriden seç', 'Vazgeç'], cancelButtonIndex: 2, tintColor: colors.primary },
      (i) => {
        if (i === 0) addFromCamera();
        if (i === 1) addFromLibrary();
      },
    );
  };

  const toggleTag = (userId: string) => {
    haptics.select();
    setTagged((t) => (t.includes(userId) ? t.filter((id) => id !== userId) : [...t, userId]));
  };

  const share = () => {
    haptics.success();
    dispatch({
      type: 'createPost',
      post: {
        id: `g-${Date.now()}`,
        userId: ME,
        placeId: place.id,
        photos,
        caption: caption.trim() || undefined,
        taggedUserIds: tagged,
        score,
        createdAt: new Date().toISOString(),
        likeCount: 0,
      },
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
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
              onPress={() => router.push({ pathname: '/degerlendir/[id]', params: { id: place.id, from: 'gonderi' } })}
              style={styles.rateButton}>
              <Text variant="footnote" color={colors.onPrimary} style={styles.bold}>
                Puanla
              </Text>
            </PressableScale>
          )}
        </Animated.View>

        {/* Fotoğraflar */}
        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Fotoğraflar ({photos.length}/{MAX_PHOTOS})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
            {photos.map((uri, i) => (
              <Animated.View key={`${uri}-${i}`} entering={FadeIn} layout={LinearTransition} style={styles.photoTile}>
                <PlaceImage uri={uri} style={StyleSheet.absoluteFill} />
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
              <PressableScale onPress={addPhoto} style={[styles.photoTile, styles.addPhoto]} accessibilityLabel="Fotoğraf ekle">
                <SymbolView name="camera" tintColor={colors.primary} size={24} />
                <Text variant="caption" color={colors.primary}>
                  Ekle
                </Text>
              </PressableScale>
            )}
          </ScrollView>
        </View>

        {/* Yorum */}
        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Yorumun
          </Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            placeholder="Ne yedin, nasıldı? Tavsiyen ne?"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={500}
            style={[typography.body, styles.caption]}
          />
        </View>

        {/* Arkadaş etiketle */}
        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Kimlerle gittin?
          </Text>
          <View style={styles.chips}>
            {friends.map((u) => {
              const active = tagged.includes(u.id);
              return (
                <PressableScale
                  key={u.id}
                  haptic={false}
                  onPress={() => toggleTag(u.id)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Avatar uri={u.avatarUrl} name={u.name} size={24} />
                  <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
                    {u.name.split(' ')[0]}
                  </Text>
                  {active && <SymbolView name="checkmark" tintColor={colors.onPrimary} size={12} weight="bold" />}
                </PressableScale>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title="Paylaş" icon="paperplane.fill" onPress={share} disabled={!canShare} />
      </View>
    </KeyboardAvoidingView>
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
  bold: {
    fontWeight: '600',
  },
  field: {
    gap: spacing.sm,
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
    minHeight: 112,
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
    paddingLeft: spacing.xs + 2,
    paddingRight: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
