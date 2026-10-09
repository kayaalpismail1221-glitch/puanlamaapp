import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { daysLeftInYear } from '@/components/profile-parts';
import {
  FavoritesStoryCard,
  GoalStoryCard,
  ListStoryCard,
  MapStoryCard,
  MatchStoryCard,
  PostStoryCard,
  RecapStoryCard,
  STORY_BACKGROUND,
  STORY_MAP_ASPECT,
  TopFiveCard,
  type StoryAuthor,
} from '@/components/story-cards';
import { logShare } from '@/api/growth';
import { Button, ErrorView, LoadingView, Text } from '@/components/ui';
import { inviteLink } from '@/constants/app';
import { colors, radius, spacing } from '@/constants/theme';
import { getPlace, useEntitiesVersion, useEntityRetry, usePlace, usePost } from '@/data/entities';
import { useListDetails, useTasteMatch, useUserPosts, useUserProfile } from '@/hooks/queries';
import { useFavoritePlaces } from '@/hooks/use-favorite-places';
import { useVisitedPlaces } from '@/hooks/use-visited-places';
import { showAlert } from '@/lib/dialog';
import { haptics } from '@/lib/haptics';
import { isMe } from '@/lib/session';
import type { ScoredPlace } from '@/lib/insights';
import { placesThisYear } from '@/lib/stats';
import { tasteMatchSections } from '@/lib/taste-match';
import {
  monthRecap,
  recapMonth,
  STORY_EXPORT,
  STORY_SIZE,
  type DatedPlace,
  type GoalProgress,
  type StoryKind,
} from '@/lib/story';
import { cityDots, visitedSummary } from '@/lib/visited';
import { fitView, MIN_MAP_VIEW_WIDTH } from '@/lib/world-projection';
import { useAppStore } from '@/store/app-store';

type Params = { tur?: StoryKind; gonderi?: string; liste?: string; uyum?: string };

/**
 * Instagram hikâyesi kartı oluşturma: kartı seç, önizle, 1080×1920 görsel olarak paylaş.
 * `gonderi` verilirse yalnızca o gönderinin kartı, `liste` verilirse o listenin kartı, `uyum` (kullanıcı id)
 * verilirse onunla damak uyumu kartı;
 * yoksa profil kartları (Favori 4, En iyi 5, Lezzet haritası, Bu ay).
 * Paylaşım sistem menüsüyle yapılır; Instagram orada "Hikâye" seçeneğini sunar.
 */
export default function StoryScreen() {
  const params = useLocalSearchParams<Params>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, userId, scored } = useAppStore();
  const me = userId ?? '';
  const version = useEntitiesVersion();

  const post = usePost(params.gonderi);
  const postPlace = usePlace(post ? post.placeId : undefined);
  const retryPost = useEntityRetry('post', params.gonderi);
  const retryPostPlace = useEntityRetry('place', post ? post.placeId : undefined);
  const posts = useUserPosts(me);
  const listQuery = useListDetails(params.liste);
  const listDetails = listQuery.data;
  const visited = useVisitedPlaces(me);
  const favorites = useFavoritePlaces(me).items;
  const matchQuery = useTasteMatch(params.uyum);
  const match = matchQuery.data;
  const matchUser = useUserProfile(params.uyum);
  const other = matchUser.data;
  const matchFavorites = useMemo(() => (match ? tasteMatchSections(match.places).favorites : []), [match]);

  const author: StoryAuthor = {
    name: profile?.name ?? '',
    username: profile?.username ?? '',
    avatarUri: profile?.avatarUri,
  };

  /* ---------- Kart verileri ---------- */

  const dated = useMemo<DatedPlace[]>(
    () =>
      scored.flatMap((e) => {
        const place = getPlace(e.placeId);
        return place ? [{ place, score: e.score, ratedAt: e.ratedAt }] : [];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scored, version],
  );
  const top = useMemo<ScoredPlace[]>(() => {
    const sizes = new Map<string, number>();
    for (const e of scored) sizes.set(e.segment, (sizes.get(e.segment) ?? 0) + 1);
    const segmentSize = (placeId: string) => sizes.get(scored.find((e) => e.placeId === placeId)?.segment ?? '') ?? 0;
    return [...dated].sort((a, b) => b.score - a.score || segmentSize(b.place.id) - segmentSize(a.place.id));
  }, [dated, scored]);

  const map = useMemo(() => {
    const dots = cityDots(visited.items);
    return {
      dots,
      view: fitView(
        dots.map((d) => d.point),
        STORY_MAP_ASPECT,
        MIN_MAP_VIEW_WIDTH,
      ),
      summary: visitedSummary(visited.items),
    };
  }, [visited.items]);

  const recap = useMemo(() => {
    const period = recapMonth(dated.map((d) => d.ratedAt));
    return period ? monthRecap(dated, (posts.data ?? []).map((p) => p.createdAt), period) : null;
  }, [dated, posts.data]);

  // Yıllık mekân hedefi (hedef sayfasındaki sayının aynısı: bu yıl puanlanan mekânlar)
  const [now] = useState(Date.now);
  const goal = profile?.yearGoal;
  const goalProgress = useMemo<GoalProgress | null>(() => {
    if (!goal) return null;
    const year = new Date(now).getFullYear();
    return { year, goal, done: placesThisYear(scored), daysLeft: daysLeftInYear(year, now) };
  }, [goal, scored, now]);

  const kinds = useMemo<StoryKind[]>(() => {
    // Silinmiş gönderide boş önizleme yerine "Bu gönderi artık yok"
    if (params.gonderi) return post && postPlace ? ['post'] : [];
    if (params.liste) return listDetails ? ['list'] : [];
    if (params.uyum) return match?.percent !== undefined && other ? ['match'] : [];
    return [
      ...(favorites.length ? (['favorites'] as const) : []),
      ...(top.length ? (['top5'] as const) : []),
      ...(visited.items.length ? (['map'] as const) : []),
      ...(recap ? (['recap'] as const) : []),
      ...(goalProgress ? (['goal'] as const) : []),
    ];
  }, [params.gonderi, post, postPlace, params.liste, listDetails, params.uyum, match, other, favorites.length, top.length, visited.items.length, recap, goalProgress]);

  const [picked, setPicked] = useState<StoryKind | undefined>(params.tur);
  const kind = picked && kinds.includes(picked) ? picked : kinds[0];

  /* ---------- Görsellerin yüklenmesini bekle ---------- */

  const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
  const onImageSettled = useCallback(
    (uri: string) => setSettled((prev) => (prev.has(uri) ? prev : new Set(prev).add(uri))),
    [],
  );
  // Liste kartında altta listenin sahibi (başkasının listesi de paylaşılabilir)
  const listAuthor: StoryAuthor | undefined =
    kind === 'list' && listDetails && !isMe(listDetails.list.author.id)
      ? {
          name: listDetails.list.author.name,
          username: listDetails.list.author.username,
          avatarUri: listDetails.list.author.avatarUrl,
          hint: t('story.followHintOther'),
        }
      : undefined;
  // Hedef ve uyum kartlarında imza izleyiciyi de çağırır (hedef koy, uyumuna bak)
  const cardAuthor =
    listAuthor ??
    (kind === 'goal'
      ? { ...author, hint: t('story.goalHint') }
      : kind === 'match'
        ? { ...author, hint: t('story.matchHint') }
        : author);
  const expected = [
    cardAuthor.avatarUri,
    kind === 'post' ? post?.photos[0] : undefined,
    ...(kind === 'favorites' ? favorites.map((f) => f.place.photoUrl) : []),
    kind === 'match' ? other?.avatarUrl : undefined,
  ].filter((u): u is string => !!u);
  const imagesReady = expected.every((u) => settled.has(u));

  /* ---------- Önizleme ölçeği ---------- */

  const [box, setBox] = useState({ width: 0, height: 0 });
  const scale = box.width ? Math.min(box.width / STORY_SIZE.width, box.height / STORY_SIZE.height) : 0;

  /* ---------- Paylaş ---------- */

  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const share = async () => {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        showAlert(t('story.unavailable'));
        return;
      }
      const uri = await captureRef(cardRef, {
        format: 'png',
        width: STORY_EXPORT.width,
        height: STORY_EXPORT.height,
        result: 'tmpfile',
      });
      haptics.success();
      const link = inviteLink(profile?.username);
      if (link) {
        await Clipboard.setStringAsync(link).catch(() => {});
        setLinkCopied(true);
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('story.share') });
      // Menü sonucu bildirmez: paylaşılan kartın türü kaydedilir
      logShare('story', { target: kind });
    } catch (error) {
      if (__DEV__) console.warn('[puanla] hikâye kartı', error);
      showAlert(t('story.failed'));
    } finally {
      setBusy(false);
    }
  };

  /* ---------- Çizim ---------- */

  const loading = params.gonderi
    ? post === undefined || (post && postPlace === undefined)
    : params.liste
      ? listQuery.isPending
      : params.uyum
        ? matchQuery.isPending || matchUser.isPending
        : visited.loading;
  const matchFailed = !!params.uyum && (matchQuery.isError || matchUser.isError);
  const retry = params.gonderi
    ? (retryPost ?? retryPostPlace)
    : params.liste && listQuery.isError
      ? () => listQuery.refetch()
      : matchFailed
        ? () => {
            matchQuery.refetch();
            matchUser.refetch();
          }
        : null;
  if (loading || (params.liste && listQuery.isError) || matchFailed) {
    return retry ? <ErrorView onRetry={retry} style={styles.container} /> : <LoadingView style={styles.container} />;
  }

  if (!kind) {
    return (
      <View style={[styles.container, styles.empty]}>
        <Text variant="headline" align="center">
          {t('story.emptyTitle')}
        </Text>
        <Text variant="subhead" color={colors.textSecondary} align="center">
          {params.gonderi
            ? t('story.postGone')
            : params.liste
              ? t('story.listGone')
              : params.uyum
                ? t('story.matchGone')
                : t('story.emptyText')}
        </Text>
      </View>
    );
  }

  const common = { ref: cardRef, author: cardAuthor, onImageSettled };
  const card =
    kind === 'post' && post && postPlace ? (
      <PostStoryCard {...common} post={post} place={postPlace} />
    ) : kind === 'favorites' ? (
      <FavoritesStoryCard {...common} items={favorites} />
    ) : kind === 'top5' ? (
      <TopFiveCard {...common} items={top} />
    ) : kind === 'map' ? (
      <MapStoryCard {...common} {...map} />
    ) : kind === 'list' && listDetails ? (
      <ListStoryCard {...common} list={listDetails.list} items={listDetails.items} />
    ) : kind === 'recap' && recap ? (
      <RecapStoryCard {...common} recap={recap} />
    ) : kind === 'goal' && goalProgress ? (
      <GoalStoryCard {...common} progress={goalProgress} />
    ) : kind === 'match' && match?.percent !== undefined && other ? (
      <MatchStoryCard
        {...common}
        me={author}
        other={{ name: other.name, username: other.username, avatarUri: other.avatarUrl }}
        percent={match.percent}
        common={match.common}
        favorites={matchFavorites}
      />
    ) : null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + spacing.md }]}>
      {kinds.length > 1 && (
        <SegmentedControl
          options={kinds.map((k) => ({ key: k, label: t(`story.kinds.${k}`) }))}
          value={kind}
          onChange={setPicked}
          style={styles.segments}
        />
      )}

      <View style={styles.stage} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        {scale > 0 && (
          <View
            style={[
              styles.preview,
              { width: STORY_SIZE.width * scale, height: STORY_SIZE.height * scale },
            ]}>
            <View style={styles.clip}>
              {/* Ölçek üst görünümde; görüntüsü alınan kart kendi boyutunda kalır */}
              <View style={[styles.scaler, { transform: [{ scale }] }]}>{card}</View>
            </View>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Button
          title={t('story.share')}
          icon="square.and.arrow.up"
          onPress={share}
          loading={busy}
          disabled={!imagesReady}
        />
        <Text variant="footnote" color={colors.textSecondary} align="center">
          {linkCopied ? t('story.linkCopied') : t('story.hint')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
  },
  segments: {
    paddingTop: spacing.md,
  },
  stage: {
    flex: 1,
    margin: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    borderRadius: radius.card,
    backgroundColor: STORY_BACKGROUND,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.28)',
  },
  clip: {
    flex: 1,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  scaler: {
    width: STORY_SIZE.width,
    height: STORY_SIZE.height,
    transformOrigin: 'top left',
  },
  actions: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
