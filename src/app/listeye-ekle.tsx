import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PlacePicker } from '@/components/place-picker';
import { Button, PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { usePlace } from '@/data/entities';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { readClipboardLink, useClipboardHasUrl } from '@/lib/clipboard';
import { haptics } from '@/lib/haptics';
import { linkSource, normalizeUrl } from '@/lib/links';
import { placeSubtitle } from '@/lib/place';
import { useAppStore } from '@/store/app-store';
import type { SaveOrigin } from '@/types';

type Params = {
  placeId?: string;
  /** 'social': Instagram/TikTok'ta görülen, 'app': uygulama içinden */
  kaynak?: SaveOrigin;
  /** '1' ise açılışta panodaki bağlantı yapıştırılır */
  yapistir?: string;
  /** "Paylaş → Puanla" ile gelen bağlantı */
  baglanti?: string;
  /** Mekân aramasına ön doldurma (paylaşımdaki 📍 mekân adı) */
  ara?: string;
};

/**
 * Listeme ekle. Önce mekân seçilir, sonra (sosyal medya kaydıysa) gönderi bağlantısı ve not girilir.
 */
export default function AddToListScreen() {
  const params = useLocalSearchParams<Params>();
  const { saved, actions } = useAppStore();
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();

  const [placeId, setPlaceId] = useState(params.placeId);
  const existing = saved.find((s) => s.placeId === placeId);
  const origin: SaveOrigin = params.kaynak ?? existing?.origin ?? 'social';
  const isSocial = origin === 'social';

  const [link, setLink] = useState(existing?.link ?? params.baglanti ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [clipboardHasUrl, setClipboardHasUrl] = useClipboardHasUrl();

  const pasteLink = async () => {
    const text = await readClipboardLink();
    if (text) {
      haptics.tap();
      setLink(text);
      setClipboardHasUrl(false);
    }
  };

  // Listem'deki "Panodaki bağlantıyı kaydet" kısayolundan gelindiyse hemen yapıştır
  const autoPaste = params.yapistir === '1';
  useEffect(() => {
    if (!autoPaste) return;
    readClipboardLink().then((text) => {
      if (text) setLink(text);
    });
  }, [autoPaste]);

  const title = isSocial ? t('addToList.fromSocialTitle') : t('addToList.savePlaceTitle');
  const place = usePlace(placeId);

  // 1. adım: mekân seç
  if (!place) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        {isSocial && link ? (
          <View style={styles.pickedLink}>
            <SymbolView name={linkSource(link).icon} tintColor={colors.primary} size={16} />
            <Text variant="footnote" color={colors.primary} numberOfLines={1} style={{ flex: 1 }}>
              {t('addToList.linkAdded', { source: linkSource(link).label })}
            </Text>
          </View>
        ) : null}
        <PlacePicker
          title={isSocial ? t('addToList.whichPlaceSocial') : t('addToList.whichPlace')}
          initialQuery={params.ara}
          onSelect={(item) => {
            const prev = saved.find((s) => s.placeId === item.id);
            setLink((l) => l || prev?.link || '');
            setNote((n) => n || prev?.note || '');
            setPlaceId(item.id);
          }}
        />
      </>
    );
  }

  const save = () => {
    haptics.success();
    const cleanLink = normalizeUrl(link) || undefined;
    actions.savePlace({
      placeId: place.id,
      // Bağlantı eklendiyse kayıt sosyal medya bölümüne gider
      origin: isSocial || cleanLink ? 'social' : 'app',
      link: cleanLink,
      note: note.trim() || undefined,
      savedAt: existing?.savedAt ?? new Date().toISOString(),
    });
    router.back();
  };

  const source = link.trim() ? linkSource(link) : null;

  // 2. adım: bağlantı ve not
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeIn}>
          <PressableScale
            onPress={() => !params.placeId && setPlaceId(undefined)}
            disabled={!!params.placeId}
            scaleTo={0.98}
            style={styles.placeCard}
            accessibilityLabel={t('addToList.changePlace')}>
            <PlaceImage uri={place.photoUrl} style={styles.placeImage} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" numberOfLines={1}>
                {place.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary}>
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

        {isSocial && (
          <View style={styles.field}>
            <Text variant="footnote" color={colors.textSecondary}>
              {t('addToList.postLink')}
            </Text>
            {clipboardHasUrl && !link && (
              <PressableScale onPress={pasteLink} style={styles.pasteBanner}>
                <SymbolView name="doc.on.clipboard" tintColor={colors.primary} size={18} />
                <Text variant="subhead" color={colors.primary} style={styles.bold}>
                  {t('addToList.pasteFromClipboard')}
                </Text>
              </PressableScale>
            )}
            <View style={styles.linkRow}>
              {source && <SymbolView name={source.icon} tintColor={colors.primary} size={18} />}
              <TextInput
                value={link}
                onChangeText={setLink}
                placeholder={t('addToList.linkPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                style={[typography.body, styles.linkInput]}
              />
              {link ? (
                <PressableScale onPress={() => setLink('')} accessibilityLabel={t('addToList.clearLink')}>
                  <SymbolView name="xmark.circle.fill" tintColor={colors.textTertiary} size={18} />
                </PressableScale>
              ) : (
                <PressableScale onPress={pasteLink} style={styles.pasteButton}>
                  <Text variant="footnote" color={colors.primary} style={styles.bold}>
                    {t('addToList.paste')}
                  </Text>
                </PressableScale>
              )}
            </View>
            <Text variant="caption" color={colors.textSecondary}>
              {source ? t('addToList.source', { source: source.label }) : t('addToList.linkHint')}
            </Text>
          </View>
        )}

        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            {t('addToList.note')}
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={isSocial ? t('addToList.notePlaceholderSocial') : t('addToList.notePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={200}
            style={[typography.body, styles.note]}
          />
        </View>
      </ScrollView>

      <Animated.View style={[styles.footer, footerStyle]}>
        <Button title={existing ? t('addToList.update') : t('common.saveToList')} icon="bookmark.fill" onPress={save} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pickedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
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
  placeImage: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
  bold: {
    fontWeight: '600',
  },
  field: {
    gap: spacing.sm,
  },
  pasteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  linkInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
  },
  pasteButton: {
    paddingHorizontal: spacing.md,
    height: 32,
    borderRadius: radius.button,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  note: {
    minHeight: 96,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingTop: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
