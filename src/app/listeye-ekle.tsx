import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlacePicker } from '@/components/place-picker';
import { Button, PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { usePlace } from '@/data/entities';
import { readClipboardLink, useClipboardHasUrl } from '@/lib/clipboard';
import { haptics } from '@/lib/haptics';
import { linkSource, normalizeUrl } from '@/lib/links';
import { useAppStore } from '@/store/app-store';
import type { SaveOrigin } from '@/types';

type Params = {
  placeId?: string;
  /** 'social': Instagram/TikTok'ta görülen, 'app': uygulama içinden */
  kaynak?: SaveOrigin;
  /** '1' ise açılışta panodaki bağlantı yapıştırılır */
  yapistir?: string;
};

/**
 * Listeme ekle. Önce mekân seçilir, sonra (sosyal medya kaydıysa) gönderi bağlantısı ve not girilir.
 */
export default function AddToListScreen() {
  const params = useLocalSearchParams<Params>();
  const { saved, actions } = useAppStore();
  const insets = useSafeAreaInsets();

  const [placeId, setPlaceId] = useState(params.placeId);
  const existing = saved.find((s) => s.placeId === placeId);
  const origin: SaveOrigin = params.kaynak ?? existing?.origin ?? 'social';
  const isSocial = origin === 'social';

  const [link, setLink] = useState(existing?.link ?? '');
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

  const title = isSocial ? 'Sosyal medyadan kaydet' : 'Mekân kaydet';
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
              {linkSource(link).label} bağlantısı eklendi
            </Text>
          </View>
        ) : null}
        <PlacePicker
          title={isSocial ? 'Gönderide hangi mekân vardı?' : 'Hangi mekânı kaydetmek istiyorsun?'}
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeIn}>
          <PressableScale
            onPress={() => !params.placeId && setPlaceId(undefined)}
            disabled={!!params.placeId}
            scaleTo={0.98}
            style={styles.placeCard}
            accessibilityLabel="Mekânı değiştir">
            <PlaceImage uri={place.photoUrl} style={styles.placeImage} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="headline" numberOfLines={1}>
                {place.name}
              </Text>
              <Text variant="footnote" color={colors.textSecondary}>
                {place.cuisine} · {place.neighborhood}
              </Text>
            </View>
            {!params.placeId && (
              <Text variant="subhead" color={colors.primary} style={styles.bold}>
                Değiştir
              </Text>
            )}
          </PressableScale>
        </Animated.View>

        {isSocial && (
          <View style={styles.field}>
            <Text variant="footnote" color={colors.textSecondary}>
              Gönderi bağlantısı
            </Text>
            {clipboardHasUrl && !link && (
              <PressableScale onPress={pasteLink} style={styles.pasteBanner}>
                <SymbolView name="doc.on.clipboard" tintColor={colors.primary} size={18} />
                <Text variant="subhead" color={colors.primary} style={styles.bold}>
                  Panodaki bağlantıyı yapıştır
                </Text>
              </PressableScale>
            )}
            <View style={styles.linkRow}>
              {source && <SymbolView name={source.icon} tintColor={colors.primary} size={18} />}
              <TextInput
                value={link}
                onChangeText={setLink}
                placeholder="instagram.com/p/…"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                textContentType="URL"
                style={[typography.body, styles.linkInput]}
              />
              {link ? (
                <PressableScale onPress={() => setLink('')} accessibilityLabel="Bağlantıyı temizle">
                  <SymbolView name="xmark.circle.fill" tintColor={colors.textTertiary} size={18} />
                </PressableScale>
              ) : (
                <PressableScale onPress={pasteLink} style={styles.pasteButton}>
                  <Text variant="footnote" color={colors.primary} style={styles.bold}>
                    Yapıştır
                  </Text>
                </PressableScale>
              )}
            </View>
            <Text variant="caption" color={colors.textSecondary}>
              {source ? `Kaynak: ${source.label}` : 'İsteğe bağlı. Instagram’da “Bağlantıyı kopyala” de, buraya yapıştır.'}
            </Text>
          </View>
        )}

        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Not
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={isSocial ? 'Ör. Mantısı övülüyordu, hafta sonu dene' : 'Ör. Doğum günü için güzel olabilir'}
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={200}
            style={[typography.body, styles.note]}
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title={existing ? 'Güncelle' : 'Listeme kaydet'} icon="bookmark.fill" onPress={save} />
      </View>
    </KeyboardAvoidingView>
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
