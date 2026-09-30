import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { showError } from '@/api/errors';
import { Icon } from '@/components/icon';
import { ListCover, newList } from '@/components/list-card';
import { Bone, PlaceRowsSkeleton, Skeleton } from '@/components/skeleton';
import { Avatar, Button, Divider, ErrorView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, fonts, hitSlop, radius, scoreInk, spacing } from '@/constants/theme';
import { useDeleteList, useListDetails, useToggleListSaved } from '@/hooks/queries';
import { formatScore } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { confirmBlock, openReportMenu, showMenu } from '@/lib/moderation';
import { openUserProfile } from '@/lib/navigation';
import { queryClient } from '@/lib/query-client';
import { isMe } from '@/lib/session';
import { shareList } from '@/lib/share';
import { useAppActions, useScoreOf } from '@/store/app-store';
import type { PlaceListItem } from '@/types';

/**
 * Paylaşılabilir liste: sahibinin güncel puanına göre sıralı mekânlar ve notları.
 * Başkasının listesinde: Listeyi kaydet + her mekânda senin puanın (puanladıysan).
 * Kendi listende: paylaş, bağlantıyı kopyala, hikâye kartı, düzenle, sil.
 */
export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const query = useListDetails(id);
  const toggleSaved = useToggleListSaved();
  const deleteList = useDeleteList();
  const actions = useAppActions();
  const scoreOf = useScoreOf();

  const details = query.data;
  if (query.isPending) return <ListSkeleton />;
  if (query.isError) return <ErrorView onRetry={() => query.refetch()} style={styles.container} />;
  if (!details) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text color={colors.textSecondary}>{t('lists.notFound')}</Text>
      </View>
    );
  }

  const { list, items } = details;
  const mine = isMe(list.author.id);
  const share = () => shareList(list);

  const openStory = () => router.push({ pathname: '/hikaye', params: { liste: list.id } });
  const edit = () => router.push({ pathname: '/liste-duzenle', params: { id: list.id } });
  const confirmDelete = () =>
    Alert.alert(t('lists.deleteTitle'), t('lists.deleteText', { title: list.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          deleteList.mutate(list.id, {
            onSuccess: () => {
              haptics.success();
              router.back();
            },
            onError: (error) => showError(error, t('failures.listDelete')),
          }),
      },
    ]);

  const openMenu = () =>
    showMenu(
      undefined,
      mine
        ? [
            { label: t('lists.storyCard'), icon: 'rectangle.portrait.on.rectangle.portrait', onPress: openStory },
            { label: t('lists.edit'), icon: 'pencil', onPress: edit },
            { label: t('lists.deleteTitle'), icon: 'trash', destructive: true, onPress: confirmDelete },
          ]
        : [
            { label: t('lists.storyCard'), icon: 'rectangle.portrait.on.rectangle.portrait', onPress: openStory },
            { label: t('moderation.report'), icon: 'flag', destructive: true, onPress: () => openReportMenu({ listId: list.id }) },
            {
              label: t('moderation.blockUser', { name: list.author.name.split(' ')[0] }),
              icon: 'nosign',
              destructive: true,
              onPress: () =>
                confirmBlock(list.author, () => {
                  queryClient.invalidateQueries();
                  actions.refresh();
                  router.back();
                }),
            },
          ],
    );

  const toggleSave = () => {
    haptics.select();
    toggleSaved.mutate({ listId: list.id, saved: !list.savedByMe });
  };

  const stats = [
    t('lists.placeCount', { count: list.placeCount }),
    list.saveCount > 0 ? t('lists.saves', { count: list.saveCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <PressableScale onPress={share} hitSlop={hitSlop} accessibilityLabel={t('common.share')}>
                <Icon name="square.and.arrow.up" tintColor={colors.primary} size={20} />
              </PressableScale>
              <PressableScale onPress={openMenu} hitSlop={hitSlop} accessibilityLabel={t('moderation.options')}>
                <Icon name="ellipsis.circle" tintColor={colors.primary} size={22} />
              </PressableScale>
            </View>
          ),
        }}
      />
      <FlatList
        style={styles.container}
        data={items}
        keyExtractor={(item) => item.place.id}
        contentInsetAdjustmentBehavior="automatic"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 28 + 56 + spacing.md * 2} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {list.covers.length > 0 && <ListCover covers={list.covers} height={180} />}
            <Text style={styles.title}>{list.title}</Text>
            {!!list.description && (
              <Text variant="callout" color={colors.textSecondary}>
                {list.description}
              </Text>
            )}
            <PressableScale onPress={() => openUserProfile(list.author.id)} haptic={false} style={styles.author}>
              <Avatar uri={list.author.avatarUrl} name={list.author.name} size={28} />
              <Text variant="subhead" style={styles.bold} numberOfLines={1}>
                {list.author.name}
              </Text>
              <Text variant="subhead" color={colors.textSecondary} numberOfLines={1} style={styles.flexShrink}>
                · {stats}
              </Text>
            </PressableScale>
            <View style={styles.buttons}>
              {mine ? (
                <>
                  <Button title={t('common.share')} icon="square.and.arrow.up" onPress={share} style={styles.flex} />
                  <Button title={t('lists.edit')} variant="outline" onPress={edit} style={styles.flex} />
                </>
              ) : (
                <>
                  <Button
                    title={list.savedByMe ? t('lists.saved') : t('lists.save')}
                    icon={list.savedByMe ? 'bookmark.fill' : 'bookmark'}
                    variant={list.savedByMe ? 'outline' : 'primary'}
                    onPress={toggleSave}
                    style={styles.flex}
                  />
                  <Button title={t('common.share')} variant="outline" onPress={share} style={styles.flex} />
                </>
              )}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <ItemRow item={item} rank={index + 1} myScore={mine ? undefined : scoreOf(item.place.id)} />
        )}
        ListFooterComponent={
          mine ? (
            <View style={styles.footer} />
          ) : (
            <View style={[styles.footer, styles.makeOwn]}>
              <Text variant="headline" align="center">
                {t('lists.makeYourOwn')}
              </Text>
              <Text variant="subhead" color={colors.textSecondary} align="center">
                {t('lists.makeYourOwnText')}
              </Text>
              <Button title={t('lists.newList')} icon="plus" variant="secondary" size="sm" onPress={() => newList()} />
            </View>
          )
        }
      />
    </>
  );
}

/** Sıra numarası, mekân, sahibin notu; sağda sahibin puanı, altında senin puanın */
function ItemRow({ item, rank, myScore }: { item: PlaceListItem; rank: number; myScore?: number }) {
  const { t } = useTranslation();
  const { place } = item;
  return (
    <PressableScale
      onPress={() => router.push({ pathname: '/mekan/[id]', params: { id: place.id } })}
      scaleTo={0.98}
      style={styles.row}>
      <Text style={styles.rank}>{rank}</Text>
      <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.thumb} />
      <View style={styles.info}>
        <Text variant="headline" numberOfLines={1}>
          {place.name}
        </Text>
        <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
          {[cuisineLabel(place.cuisine), place.neighborhood || place.district].filter(Boolean).join(' · ')}
        </Text>
        {!!item.note && (
          <Text variant="subhead" style={styles.note}>
            “{item.note}”
          </Text>
        )}
        {myScore !== undefined && (
          <Text variant="footnote" color={colors.textSecondary}>
            {t('post.you')}{' '}
            <Text variant="footnote" color={scoreInk(myScore)} style={styles.bold}>
              {formatScore(myScore)}
            </Text>
          </Text>
        )}
      </View>
      {item.score !== undefined ? (
        <ScoreBadge score={item.score} />
      ) : (
        <Text variant="caption" color={colors.textTertiary}>
          {t('lists.unrated')}
        </Text>
      )}
    </PressableScale>
  );
}

function ListSkeleton() {
  return (
    <View style={styles.container}>
      <Skeleton style={styles.header}>
        <Bone height={180} round={radius.card} />
        <Bone width="70%" height={28} />
        <Bone width="45%" height={14} />
        <Bone height={48} round={radius.button} />
      </Skeleton>
      <PlaceRowsSkeleton count={5} thumb={56} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  header: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  bold: {
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  rank: {
    width: 28,
    textAlign: 'center',
    fontFamily: fonts.serif,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  note: {
    marginTop: 2,
    fontStyle: 'italic',
    color: colors.text,
  },
  footer: {
    height: spacing.xxl,
  },
  makeOwn: {
    height: undefined,
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl,
    padding: spacing.xl,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
});
