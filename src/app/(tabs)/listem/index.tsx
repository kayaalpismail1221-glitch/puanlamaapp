import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Linking, Platform, StyleSheet, View } from 'react-native';

import { PostGrid } from '@/components/post-grid';
import { SegmentTabs } from '@/components/segment-tabs';
import { Button, Divider, PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing } from '@/constants/theme';
import { placeById } from '@/data/mock';
import { timeAgo } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { linkSource } from '@/lib/links';
import { useAppStore } from '@/store/app-store';
import type { Place, SavedPlace } from '@/types';

type Tab = 'places' | 'posts';

const TABS = [
  { key: 'places', label: 'Mekânlar' },
  { key: 'posts', label: 'Gönderiler' },
] as const;

/** Gitmek istediğin mekânlar (Instagram'da, TikTok'ta gördüklerin) ve kaydettiğin gönderiler */
export default function SavedListScreen() {
  const { saved, savedPosts, postById } = useAppStore();
  const [tab, setTab] = useState<Tab>('places');
  const rows = saved.flatMap((s) => {
    const place = placeById(s.placeId);
    return place ? [{ entry: s, place }] : [];
  });
  const posts = savedPosts.flatMap((id) => postById(id) ?? []).reverse();

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PressableScale onPress={() => router.push('/listeye-ekle')} hitSlop={hitSlop} accessibilityLabel="Listeme ekle">
              <SymbolView name="plus" tintColor={colors.primary} size={22} weight="semibold" />
            </PressableScale>
          ),
        }}
      />
      <FlatList
        data={tab === 'places' ? rows : []}
        keyExtractor={(r) => r.place.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={tab === 'places' && rows.length === 0 && styles.emptyContainer}
        ItemSeparatorComponent={() => <Divider inset={spacing.lg} />}
        ListHeaderComponent={
          <>
            <SegmentTabs tabs={TABS} value={tab} onChange={setTab} />
            {tab === 'places' && rows.length > 0 && (
              <Text variant="footnote" color={colors.textSecondary} style={styles.count}>
                {rows.length} mekân kaydettin
              </Text>
            )}
            {tab === 'posts' && (
              <View style={{ paddingTop: 2 }}>
                <PostGrid
                  posts={posts}
                  emptyText="Feed’de beğendiğin gönderileri yer imi ile kaydet, burada toplansın."
                />
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          tab === 'posts' ? null : (
          <View style={styles.empty}>
            <SymbolView name="bookmark" tintColor={colors.textTertiary} size={44} />
            <Text variant="title3" align="center">
              Gitmek istediklerin burada
            </Text>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              Instagram’da ya da TikTok’ta bir mekân mı gördün? Gönderinin bağlantısını kopyala,
              buraya gel ve + ile kaydet.
            </Text>
            <Button title="Mekân kaydet" icon="plus" onPress={() => router.push('/listeye-ekle')} style={styles.emptyButton} />
          </View>
          )
        }
        renderItem={({ item }) => <SavedRow entry={item.entry} place={item.place} />}
      />
    </>
  );
}

function SavedRow({ entry, place }: { entry: SavedPlace; place: Place }) {
  const { dispatch } = useAppStore();
  const source = entry.link ? linkSource(entry.link) : null;

  const openLink = () => {
    if (entry.link) Linking.openURL(entry.link).catch(() => Alert.alert('Bağlantı açılamadı'));
  };

  const remove = () => {
    haptics.warning();
    dispatch({ type: 'unsavePlace', placeId: place.id });
  };

  const showActions = () => {
    const actions = [
      { label: 'Gittim, puanla', run: () => router.push({ pathname: '/degerlendir/[id]', params: { id: place.id } }) },
      ...(entry.link ? [{ label: `${source?.label ?? 'Bağlantı'} gönderisini aç`, run: openLink }] : []),
      { label: 'Düzenle', run: () => router.push({ pathname: '/listeye-ekle', params: { placeId: place.id } }) },
      { label: 'Listemden çıkar', run: remove, destructive: true },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: place.name,
          options: [...actions.map((a) => a.label), 'Vazgeç'],
          destructiveButtonIndex: actions.findIndex((a) => a.destructive),
          cancelButtonIndex: actions.length,
          tintColor: colors.primary,
        },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert(place.name, undefined, [
        ...actions.map((a) => ({ text: a.label, onPress: a.run, style: a.destructive ? ('destructive' as const) : undefined })),
        { text: 'Vazgeç', style: 'cancel' },
      ]);
    }
  };

  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
      onLongPress={showActions}
      style={styles.row}>
      <PlaceImage uri={place.photoUrl} style={styles.image} />
      <View style={styles.info}>
        <Text variant="headline" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {place.cuisine} · {place.neighborhood} · {timeAgo(entry.savedAt)}
        </Text>
        {entry.note && (
          <Text variant="subhead" numberOfLines={2} style={styles.note}>
            {entry.note}
          </Text>
        )}
        {source && (
          <PressableScale onPress={openLink} hitSlop={hitSlop} style={styles.sourceChip}>
            <SymbolView name={source.icon} tintColor={colors.primary} size={13} />
            <Text variant="caption" color={colors.primary}>
              {source.label}
            </Text>
          </PressableScale>
        )}
      </View>
      <PressableScale onPress={showActions} hitSlop={hitSlop} accessibilityLabel="Seçenekler" style={styles.more}>
        <SymbolView name="ellipsis" tintColor={colors.textSecondary} size={18} />
      </PressableScale>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  count: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: radius.button,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  note: {
    marginTop: spacing.xs,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  more: {
    paddingTop: spacing.xs,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
  emptyButton: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
});
