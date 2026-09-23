import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlaceRow } from '@/components/place-row';
import { Button, Divider, PlaceImage, PressableScale, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { placeById, searchPlaces } from '@/data/mock';
import { haptics } from '@/lib/haptics';
import { linkSource, normalizeUrl } from '@/lib/links';
import { useAppStore } from '@/store/app-store';

/**
 * "Listeme ekle": gitmek istediğin mekânı, gördüğün yerin bağlantısı ve notla kaydet.
 * Önce mekân seçilir, sonra bağlantı + not girilir.
 */
export default function AddToListScreen() {
  const params = useLocalSearchParams<{ placeId?: string }>();
  const { saved, dispatch } = useAppStore();
  const insets = useSafeAreaInsets();

  const [placeId, setPlaceId] = useState(params.placeId);
  const existing = saved.find((s) => s.placeId === placeId);
  const [link, setLink] = useState(existing?.link ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [query, setQuery] = useState('');
  const [clipboardHasUrl, setClipboardHasUrl] = useState(false);

  // Panoda bağlantı var mı? (Bu kontrol iOS'ta yapıştırma izni sormaz.)
  useEffect(() => {
    Clipboard.hasUrlAsync().then(setClipboardHasUrl).catch(() => {});
  }, []);

  const pasteLink = async () => {
    const text = (await Clipboard.getUrlAsync()) ?? (await Clipboard.getStringAsync());
    if (text) {
      haptics.tap();
      setLink(text.trim());
      setClipboardHasUrl(false);
    }
  };

  const place = placeId ? placeById(placeId) : undefined;

  // 1. adım: mekân seç
  if (!place) {
    return (
      <View style={styles.container}>
        <View style={styles.searchWrap}>
          <Text variant="subhead" color={colors.textSecondary}>
            Hangi mekânı gördün?
          </Text>
          <SearchField value={query} onChangeText={setQuery} placeholder="Mekân, semt veya mutfak ara" autoFocus />
        </View>
        <FlatList
          data={searchPlaces(query)}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ItemSeparatorComponent={() => <Divider inset={spacing.lg + 52 + spacing.md} />}
          ListEmptyComponent={
            <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
              Bulamadık. Mekân veritabanı bağlanınca her yer aranabilecek.
            </Text>
          }
          renderItem={({ item }) => (
            <PlaceRow
              place={item}
              onPress={() => {
                const prev = saved.find((s) => s.placeId === item.id);
                setLink((l) => l || prev?.link || '');
                setNote((n) => n || prev?.note || '');
                setPlaceId(item.id);
              }}
              trailing={<SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} />}
            />
          )}
        />
      </View>
    );
  }

  const save = () => {
    haptics.success();
    dispatch({
      type: 'savePlace',
      entry: {
        placeId: place.id,
        link: normalizeUrl(link) || undefined,
        note: note.trim() || undefined,
        savedAt: existing?.savedAt ?? new Date().toISOString(),
      },
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
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeIn}>
          <PressableScale
            onPress={() => setPlaceId(undefined)}
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

        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Nerede gördün?
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
              placeholder="Instagram, TikTok bağlantısı…"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              textContentType="URL"
              style={[typography.body, styles.linkInput]}
            />
            {!link && (
              <PressableScale onPress={pasteLink} style={styles.pasteButton}>
                <Text variant="footnote" color={colors.primary} style={styles.bold}>
                  Yapıştır
                </Text>
              </PressableScale>
            )}
          </View>
          {source && (
            <Text variant="caption" color={colors.textSecondary}>
              Kaynak: {source.label}
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <Text variant="footnote" color={colors.textSecondary}>
            Not
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Ör. Mantısı övülüyordu, hafta sonu dene"
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
  searchWrap: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  empty: {
    padding: spacing.xl,
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
