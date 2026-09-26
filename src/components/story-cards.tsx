import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { WorldMap } from '@/components/world-map';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, fonts, gradients, onScoreColor, scoreColor } from '@/constants/theme';
import { currentLanguage, currentLocale } from '@/i18n';
import { formatScore, initials, monthYear } from '@/lib/format';
import { possessive } from '@/lib/possessive';
import type { ScoredPlace, TasteSlice } from '@/lib/insights';
import { STORY_SIZE, type MonthRecap } from '@/lib/story';
import type { CityDot, VisitedSummary } from '@/lib/visited';
import type { ViewBox } from '@/lib/world-projection';
import type { Place, PlaceList, PlaceListItem, Post } from '@/types';

/**
 * Instagram hikâyesi kartları (9:16). 540×960 mantıksal boyutta çizilir, dışa aktarımda
 * 1080×1920 olur. Instagram üst ~%13 ve alt ~%18'i kendi arayüzüyle kapattığı için
 * içerik bu güvenli alanın içinde kalır.
 *
 * Görsel içeren kartlar her görsel yüklendiğinde (ya da yüklenemediğinde) `onImageSettled`
 * çağırır; ekran tüm görseller hazır olmadan görüntü almaz.
 */

/** Kartın altındaki kişi; `hint` verilmezse "Puanla'da beni takip et" (başkasının listesinde "Puanla'da takip et") */
export type StoryAuthor = { name: string; username: string; avatarUri?: string; hint?: string };

type Common = { author: StoryAuthor; onImageSettled?: (uri: string) => void };

const PAD = 40;
const SAFE_TOP = 112;
const SAFE_BOTTOM = 150;
const INK = colors.onPrimary;
const INK_SOFT = 'rgba(255,255,255,0.64)';
const INK_FAINT = 'rgba(255,255,255,0.12)';

/** Kartın görüntüsü alınan kök görünüm (ref buraya bağlanır) */
const Frame = forwardRef<View, { children: ReactNode; background?: ReactNode }>(function Frame(
  { children, background },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={styles.frame}>
      {background}
      <View style={styles.content}>{children}</View>
    </View>
  );
});

/** Serif "puanla" yazısı ve puan yeşili nokta (uygulama ikonundaki gibi) */
function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <Text style={styles.wordmarkText}>puanla</Text>
      <View style={styles.wordmarkDot} />
    </View>
  );
}

function Kicker({ children }: { children: string }) {
  return <Text style={styles.kicker}>{children.toLocaleUpperCase(currentLocale())}</Text>;
}

function ScoreDisc({ score, size }: { score: number; size: number }) {
  return (
    <View style={[styles.disc, { width: size, height: size, backgroundColor: scoreColor(score) }]}>
      <Text style={[styles.discText, { color: onScoreColor(score), fontSize: size * 0.36 }]}>{formatScore(score)}</Text>
    </View>
  );
}

/** Alt imza: kim paylaştı ve Puanla'da nasıl bulunur */
function Footer({ author, onImageSettled }: Common) {
  const { t } = useTranslation();
  const uri = author.avatarUri;
  return (
    <View style={styles.footer}>
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.avatar}
          onLoad={() => onImageSettled?.(uri)}
          onError={() => onImageSettled?.(uri)}
        />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{initials(author.name)}</Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text style={styles.footerName} numberOfLines={1}>
          @{author.username}
        </Text>
        <Text style={styles.footerHint} numberOfLines={1}>
          {author.hint ?? t('story.followHint')}
        </Text>
      </View>
    </View>
  );
}

const placeLine = (place: Place) =>
  [cuisineLabel(place.cuisine), place.neighborhood || place.district].filter(Boolean).join(' · ');

/* ---------- Favori 5 ---------- */

export const TopFiveCard = forwardRef<View, Common & { items: ScoredPlace[] }>(function TopFiveCard(
  { items, ...common },
  ref,
) {
  const { t } = useTranslation();
  const top = items.slice(0, 5);
  return (
    <Frame ref={ref}>
      <Wordmark />
      <View style={styles.titleBlock}>
        <Kicker>{t('story.top5Kicker')}</Kicker>
        <Text style={styles.title}>{t('story.top5Title', { count: top.length })}</Text>
      </View>
      <View style={styles.list}>
        {top.map(({ place, score }, i) => (
          <View key={place.id} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={styles.flex}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {place.name}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {placeLine(place)}
              </Text>
            </View>
            <ScoreDisc score={score} size={60} />
          </View>
        ))}
      </View>
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

/* ---------- Liste ---------- */

const LIST_STORY_ROWS = 5;

/** Paylaşılabilir liste: "Zeynep'in listesi", başlık, ilk 5 mekân puanlarıyla, kalanların sayısı */
export const ListStoryCard = forwardRef<View, Common & { list: PlaceList; items: PlaceListItem[] }>(function ListStoryCard(
  { list, items, ...common },
  ref,
) {
  const { t } = useTranslation();
  const firstName = list.author.name.split(' ')[0] || list.author.username;
  const shown = items.slice(0, LIST_STORY_ROWS);
  const more = items.length - shown.length;
  return (
    <Frame ref={ref}>
      <Wordmark />
      <View style={styles.titleBlock}>
        <Kicker>{t('story.listKicker', { name: possessive(firstName, currentLanguage()) })}</Kicker>
        <Text style={[styles.title, styles.listTitle]} numberOfLines={3}>
          {list.title}
        </Text>
      </View>
      <View style={styles.list}>
        {shown.map(({ place, score }, i) => (
          <View key={place.id} style={[styles.row, i > 0 && styles.rowBorder]}>
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={styles.flex}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {place.name}
              </Text>
              <Text style={styles.rowSub} numberOfLines={1}>
                {placeLine(place)}
              </Text>
            </View>
            {score !== undefined && <ScoreDisc score={score} size={56} />}
          </View>
        ))}
      </View>
      {more > 0 && <Text style={styles.more}>{t('story.listMore', { count: more })}</Text>}
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

/* ---------- Tek gönderi ---------- */

export const PostStoryCard = forwardRef<View, Common & { post: Post; place: Place }>(function PostStoryCard(
  { post, place, ...common },
  ref,
) {
  const photo = post.photos[0];
  return (
    <Frame
      ref={ref}
      background={
        photo ? (
          <>
            <Image
              source={{ uri: photo }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              onLoad={() => common.onImageSettled?.(photo)}
              onError={() => common.onImageSettled?.(photo)}
            />
            <LinearGradient
              colors={['rgba(15,30,61,0.55)', 'rgba(15,30,61,0)', 'rgba(15,30,61,0.2)', 'rgba(15,30,61,0.94)']}
              locations={[0, 0.22, 0.5, 0.8]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : undefined
      }>
      <Wordmark />
      <View style={styles.spacer} />
      {post.score !== undefined && <ScoreDisc score={post.score} size={112} />}
      <Text style={[styles.title, styles.postTitle]} numberOfLines={3}>
        {place.name}
      </Text>
      <Text style={styles.postSub} numberOfLines={1}>
        {placeLine(place)}
      </Text>
      {!!post.caption && (
        <Text style={styles.caption} numberOfLines={3}>
          “{post.caption}”
        </Text>
      )}
      <View style={styles.postFooter}>
        <Footer {...common} />
      </View>
    </Frame>
  );
});

/* ---------- Lezzet haritası ---------- */

/** Kartın iç genişliği: kenar boşluğu + kart dolgusu */
const MAP_CARD_PAD = 22;
const MAP_WIDTH = STORY_SIZE.width - PAD * 2 - MAP_CARD_PAD * 2;
export const STORY_MAP_ASPECT = 1.15;

/**
 * Lezzet haritası paylaşımı: degrade zeminde beyaz kart. "İsmail'in lezzet haritası", şehir ve mekân sayısı,
 * gidilen şehirler haritada, en çok gidilen mutfaklar; altta kim paylaştı.
 */
export const MapStoryCard = forwardRef<
  View,
  Common & { dots: CityDot[]; view: ViewBox; summary: VisitedSummary; taste: TasteSlice[] }
>(function MapStoryCard({ dots, view, summary, taste, ...common }, ref) {
  const { t } = useTranslation();
  const firstName = common.author.name.split(' ')[0] || common.author.username;
  return (
    <Frame
      ref={ref}
      background={<LinearGradient colors={gradients.share} locations={gradients.shareStops} style={StyleSheet.absoluteFill} />}>
      <View style={styles.spacer} />
      <View style={styles.mapCard}>
        <View style={styles.mapCardHeader}>
          <View style={styles.flex}>
            <Text style={styles.mapCardTitle} numberOfLines={2}>
              {t('story.mapCardTitle', { name: possessive(firstName, currentLanguage()) })}
            </Text>
            <Text style={styles.mapCardStats}>
              {t('story.mapCities', { count: summary.cities })} · {t('story.mapPlaces', { count: summary.places })}
            </Text>
          </View>
          <InkWordmark />
        </View>
        <View style={styles.map}>
          <WorldMap view={view} width={MAP_WIDTH} height={MAP_WIDTH / STORY_MAP_ASPECT} dots={dots} dotScale={1.4} />
        </View>
        {taste.length > 0 && (
          <View style={styles.chips}>
            {taste.slice(0, 3).map((s) => (
              <View key={s.cuisine} style={styles.mapChip}>
                <Text style={styles.mapChipText}>
                  {cuisineLabel(s.cuisine)} · %{Math.round(s.share * 100)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

/** Beyaz kartın üstünde lacivert "puanla" yazısı */
function InkWordmark() {
  return (
    <View style={styles.wordmark}>
      <Text style={[styles.wordmarkText, styles.inkWordmark]}>puanla</Text>
      <View style={[styles.wordmarkDot, styles.inkWordmarkDot]} />
    </View>
  );
}

/* ---------- Aylık özet ---------- */

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.tileValue, accent ? { color: accent } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export const RecapStoryCard = forwardRef<View, Common & { recap: MonthRecap }>(function RecapStoryCard(
  { recap, ...common },
  ref,
) {
  const { t } = useTranslation();
  return (
    <Frame ref={ref}>
      <Wordmark />
      <View style={styles.titleBlock}>
        <Kicker>{t('story.recapKicker', { month: monthYear(recap.month) })}</Kicker>
        <View style={styles.bigRow}>
          <Text style={styles.bigNumber}>{recap.places}</Text>
          <Text style={styles.bigLabel}>{t('story.recapPlaces', { count: recap.places })}</Text>
        </View>
      </View>
      <View style={styles.tiles}>
        <Tile
          label={t('story.recapCuisine')}
          value={recap.topCuisine ? cuisineLabel(recap.topCuisine.cuisine) : '–'}
        />
        <Tile
          label={t('story.recapAverage')}
          value={formatScore(recap.average)}
          accent={scoreColor(recap.average)}
        />
        <Tile label={t('story.recapDistricts')} value={String(recap.districts)} />
        <Tile label={t('story.recapPosts')} value={String(recap.posts)} />
      </View>
      {recap.best && (
        <View style={styles.best}>
          <View style={styles.flex}>
            <Text style={styles.tileLabel}>{t('story.recapBest')}</Text>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {recap.best.place.name}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {placeLine(recap.best.place)}
            </Text>
          </View>
          <ScoreDisc score={recap.best.score} size={64} />
        </View>
      )}
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

const styles = StyleSheet.create({
  frame: {
    width: STORY_SIZE.width,
    height: STORY_SIZE.height,
    backgroundColor: colors.primary,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: PAD,
    paddingTop: SAFE_TOP,
    paddingBottom: SAFE_BOTTOM,
  },
  flex: {
    flex: 1,
  },
  spacer: {
    flex: 1,
  },
  wordmark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    alignSelf: 'flex-start',
    gap: 3,
  },
  wordmarkText: {
    fontFamily: fonts.serif,
    fontSize: 30,
    fontWeight: '700',
    color: INK,
    letterSpacing: -0.5,
  },
  wordmarkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
    backgroundColor: scoreColor(9),
  },
  titleBlock: {
    marginTop: 40,
    gap: 10,
  },
  kicker: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: INK_SOFT,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '700',
    color: INK,
    letterSpacing: -0.5,
  },
  list: {
    marginTop: 32,
  },
  listTitle: {
    fontSize: 40,
    lineHeight: 46,
  },
  more: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: '600',
    color: INK_SOFT,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 16,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderTopColor: INK_FAINT,
  },
  rank: {
    width: 30,
    fontFamily: fonts.serif,
    fontSize: 36,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    fontVariant: ['tabular-nums'],
  },
  rowTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: INK,
  },
  rowSub: {
    marginTop: 3,
    fontSize: 16,
    color: INK_SOFT,
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  discText: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  postTitle: {
    marginTop: 20,
    fontSize: 50,
    lineHeight: 56,
  },
  postSub: {
    marginTop: 8,
    fontSize: 19,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
  },
  caption: {
    marginTop: 16,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 21,
    lineHeight: 29,
    color: INK,
  },
  postFooter: {
    marginTop: 28,
  },
  map: {
    width: MAP_WIDTH,
    aspectRatio: STORY_MAP_ASPECT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.mapWater,
  },
  mapCard: {
    padding: MAP_CARD_PAD,
    gap: 16,
    borderRadius: 30,
    backgroundColor: colors.background,
    boxShadow: '0 18px 48px rgba(5, 12, 30, 0.35)',
  },
  mapCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mapCardTitle: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: -0.3,
  },
  mapCardStats: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  mapChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  mapChipText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  inkWordmark: {
    fontSize: 22,
    color: colors.primary,
  },
  inkWordmarkDot: {
    width: 6,
    height: 6,
    marginBottom: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: INK_FAINT,
  },
  chipText: {
    fontSize: 16,
    fontWeight: '600',
    color: INK,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
  },
  bigNumber: {
    fontFamily: fonts.serif,
    fontSize: 136,
    lineHeight: 140,
    fontWeight: '700',
    color: INK,
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
  },
  bigLabel: {
    flex: 1,
    marginBottom: 24,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '600',
    color: INK,
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 28,
  },
  tile: {
    width: (STORY_SIZE.width - PAD * 2 - 12) / 2,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 6,
    borderRadius: 22,
    backgroundColor: INK_FAINT,
  },
  tileLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: INK_SOFT,
  },
  tileValue: {
    fontSize: 28,
    fontWeight: '800',
    color: INK,
  },
  best: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: INK_FAINT,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: INK,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '600',
    color: INK,
  },
  footerName: {
    fontSize: 20,
    fontWeight: '700',
    color: INK,
  },
  footerHint: {
    marginTop: 2,
    fontSize: 15,
    color: INK_SOFT,
  },
});
