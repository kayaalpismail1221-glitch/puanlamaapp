import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Bone, Skeleton } from '@/components/skeleton';
import { PlaceImage, PressableScale, Text } from '@/components/ui';
import { colors, fonts, hitSlop, radius, spacing } from '@/constants/theme';
import { useUserLists } from '@/hooks/queries';
import type { PlaceList } from '@/types';

const CARD_WIDTH = 200;
const COVER_HEIGHT = 124;

export const openList = (id: string) => router.push({ pathname: '/liste/[id]', params: { id } });
export const newList = () => router.push('/liste-duzenle');

/** Kapak: en iyi 3 mekânın fotoğrafı (bir büyük + iki küçük); fotoğraf yoksa gri zemin */
export function ListCover({ covers, height = COVER_HEIGHT }: { covers: string[]; height?: number }) {
  const [first, second, third] = covers;
  return (
    <View style={[styles.cover, { height }]}>
      <PlaceImage uri={first} style={styles.coverMain} />
      {second && (
        <View style={styles.coverSide}>
          <PlaceImage uri={second} style={styles.coverSmall} />
          <PlaceImage uri={third} style={styles.coverSmall} />
        </View>
      )}
    </View>
  );
}

/** Yatay şeritteki liste kartı */
export function ListCard({ list, showAuthor }: { list: PlaceList; showAuthor?: boolean }) {
  const { t } = useTranslation();
  const meta = [
    t('lists.placeCount', { count: list.placeCount }),
    showAuthor ? `@${list.author.username}` : list.saveCount > 0 ? t('lists.saves', { count: list.saveCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PressableScale onPress={() => openList(list.id)} scaleTo={0.97} style={styles.card} accessibilityRole="button">
      <ListCover covers={list.covers} />
      <Text style={styles.title} numberOfLines={2}>
        {list.title}
      </Text>
      <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
        {meta}
      </Text>
    </PressableScale>
  );
}

function NewListCard() {
  const { t } = useTranslation();
  return (
    <PressableScale onPress={newList} scaleTo={0.97} style={styles.card} accessibilityRole="button">
      <View style={[styles.cover, styles.newCover]}>
        <View style={styles.plus}>
          <SymbolView name="plus" tintColor={colors.onPrimary} size={18} weight="bold" />
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {t('lists.newList')}
      </Text>
      <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
        {t('lists.newListHint')}
      </Text>
    </PressableScale>
  );
}

/** Başlık + yatay kart şeridi (profil ve Listem ortak) */
export function ListStrip({
  title,
  lists,
  showAuthor,
  withNew,
  onSeeAll,
}: {
  title: string;
  lists: PlaceList[];
  showAuthor?: boolean;
  withNew?: boolean;
  onSeeAll?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text variant="title3">{title}</Text>
        {onSeeAll && (
          <PressableScale onPress={onSeeAll} hitSlop={hitSlop}>
            <Text variant="subhead" color={colors.primary} style={styles.bold}>
              {t('common.seeAll')}
            </Text>
          </PressableScale>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {withNew && <NewListCard />}
        {lists.map((l) => (
          <ListCard key={l.id} list={l} showAuthor={showAuthor} />
        ))}
      </ScrollView>
    </View>
  );
}

export function ListStripSkeleton() {
  return (
    <Skeleton style={styles.block}>
      <Bone width={96} height={20} style={styles.skeletonTitle} />
      <View style={styles.strip}>
        {[0, 1].map((i) => (
          <View key={i} style={styles.card}>
            <Bone width={CARD_WIDTH} height={COVER_HEIGHT} round={radius.card} />
            <Bone width="80%" height={16} />
            <Bone width="50%" height={12} />
          </View>
        ))}
      </View>
    </Skeleton>
  );
}

/**
 * Profildeki listeler: kendi profilinde "Yeni liste" kartıyla her zaman görünür,
 * başkasının profilinde yalnızca listesi varsa.
 */
export function ProfileLists({ userId, mine }: { userId: string; mine?: boolean }) {
  const { t } = useTranslation();
  const query = useUserLists(userId);
  if (query.isPending) return <ListStripSkeleton />;
  const lists = query.data ?? [];
  if (!mine && lists.length === 0) return null;
  return <ListStrip title={mine ? t('lists.mine') : t('lists.title')} lists={lists} withNew={mine} />;
}

const styles = StyleSheet.create({
  block: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  skeletonTitle: {
    marginHorizontal: spacing.lg,
  },
  strip: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: CARD_WIDTH,
    gap: spacing.xs,
  },
  cover: {
    flexDirection: 'row',
    gap: 2,
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  coverMain: {
    flex: 2,
    height: '100%',
  },
  coverSide: {
    flex: 1,
    gap: 2,
  },
  coverSmall: {
    flex: 1,
    width: '100%',
  },
  newCover: {
    height: COVER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.background,
  },
  plus: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.text,
  },
  bold: {
    fontWeight: '600',
  },
});
