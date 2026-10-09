import { Image } from '@/components/image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text as RNText, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/ui';
import { WorldMap } from '@/components/world-map';
import { cuisineLabel } from '@/constants/cuisines';
import { fonts, scoreColor, scoreOnBlack, withAlpha } from '@/constants/theme';
import { currentLanguage, currentLocale } from '@/i18n';
import { formatScore, initials, monthYear } from '@/lib/format';
import { possessive } from '@/lib/possessive';
import type { ScoredPlace } from '@/lib/insights';
import { placeShortArea } from '@/lib/place';
import { matchVerdict, STORY_SIZE, type GoalProgress, type MonthRecap } from '@/lib/story';
import type { CityDot, VisitedSummary } from '@/lib/visited';
import type { ViewBox } from '@/lib/world-projection';
import type { Place, PlaceList, PlaceListItem, Post } from '@/types';

/**
 * Instagram hikâyesi kartları (9:16). 540×960 mantıksal boyutta çizilir, dışa aktarımda
 * 1080×1920 olur. Instagram üst ~%13 ve alt ~%18'i kendi arayüzüyle kapattığı için
 * içerik bu güvenli alanın içinde kalır.
 *
 * Tasarım (kullanıcı isteği 2026-10-09: "siyah temelli, çok şık"): siyaha yakın zemin, üstte çok hafif ışık,
 * kırık beyaz yazı, serif başlıklar (sayıları italik), ince ayırıcı çizgiler; puanlar dolu disk yerine puan
 * renginde ince halka. Fotoğraflı kartlarda fotoğraf siyaha erir.
 *
 * Görsel içeren kartlar her görsel yüklendiğinde (ya da yüklenemediğinde) `onImageSettled`
 * çağırır; ekran tüm görseller hazır olmadan görüntü almaz.
 */

/** Kartın altındaki kişi; `hint` verilmezse "Beni takip et" (başkasının listesinde "Takip et") */
export type StoryAuthor = { name: string; username: string; avatarUri?: string; hint?: string };

type Common = { author: StoryAuthor; onImageSettled?: (uri: string) => void };

/** Kartların zemini; önizleme ekranları da kartın kenarı belli olsun diye bunu kullanır */
export const STORY_BACKGROUND = '#0A0A0B';

const PAD = 40;
const SAFE_TOP = 112;
const SAFE_BOTTOM = 150;
/** Kırık beyaz: saf beyaz siyah zeminde sert duruyor (koyu görünümdeki kararla aynı gerekçe) */
const INK = '#F2EFE9';
const INK_SOFT = 'rgba(242, 239, 233, 0.62)';
const INK_MUTED = 'rgba(242, 239, 233, 0.38)';
const HAIRLINE = 'rgba(242, 239, 233, 0.14)';
const SURFACE = 'rgba(242, 239, 233, 0.045)';
/** Fotoğraf üstündeki puan halkasının koyu cam zemini */
const ON_PHOTO = 'rgba(10, 10, 11, 0.55)';

/** Siyah zemin ve köşelerde çok hafif ışık; `tint` verilirse üstteki ışık o renkte (hedef, uyum) */
function Backdrop({ tint = '#FFFFFF', strength = 0.07 }: { tint?: string; strength?: number }) {
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={STORY_SIZE.width}
      height={STORY_SIZE.height}
      viewBox={`0 0 ${STORY_SIZE.width} ${STORY_SIZE.height}`}
      preserveAspectRatio="none">
      <Defs>
        <RadialGradient id="storyGlowTop" cx="82%" cy="0%" r="90%">
          <Stop offset="0" stopColor={tint} stopOpacity={strength} />
          <Stop offset="1" stopColor={tint} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="storyGlowBottom" cx="10%" cy="100%" r="70%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={strength * 0.6} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#storyGlowTop)" />
      <Rect width="100%" height="100%" fill="url(#storyGlowBottom)" />
    </Svg>
  );
}

/** Kartın görüntüsü alınan kök görünüm (ref buraya bağlanır); arka plan verilmezse siyah zemin */
const Frame = forwardRef<View, { children: ReactNode; background?: ReactNode }>(function Frame(
  { children, background },
  ref,
) {
  return (
    <View ref={ref} collapsable={false} style={styles.frame}>
      {background ?? <Backdrop />}
      <View style={styles.content}>{children}</View>
    </View>
  );
});

/**
 * Üst satır: serif "Expeat" (uygulama ikonu ve açılıştaki gibi, büyük E) ve yanında ince çizgi. Kartta marka adı
 * yalnızca burada geçer (kullanıcı kararı 2026-10-06): imza ve indirme kutusu adı tekrarlamaz.
 */
function Masthead() {
  return (
    <View style={styles.masthead}>
      <Text style={styles.wordmark}>Expeat</Text>
      <View style={styles.rule} />
    </View>
  );
}

function Kicker({ children }: { children: string }) {
  return <Text style={styles.kicker}>{children.toLocaleUpperCase(currentLocale())}</Text>;
}

/** Serif başlık; içindeki sayılar italik ("Favori *4*’üm") */
function Title({
  children,
  style,
  numberOfLines,
  fit,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  /** Tek satıra sığmazsa küçülsün */
  fit?: boolean;
}) {
  const parts = children.split(/(\d+)/);
  return (
    <Text
      style={[styles.title, style]}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.7 : undefined}>
      {parts.map((part, i) =>
        // Bölmede sayılar tek sıradadır; iç içe RN Text üst stilin yazı tipini ve rengini devralır
        i % 2 ? (
          <RNText key={i} style={styles.titleAccent}>
            {part}
          </RNText>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** Puan: puan renginde ince halka, içi aynı tonda saydam; fotoğraf üstünde koyu cam zemin */
function ScoreRing({ score, size, onPhoto }: { score: number; size: number; onPhoto?: boolean }) {
  const tone = scoreOnBlack(score);
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: size >= 80 ? 3 : 2,
          borderColor: tone,
          backgroundColor: onPhoto ? ON_PHOTO : withAlpha(scoreColor(score), 0.12),
        },
      ]}>
      <Text style={[styles.ringText, { color: tone, fontSize: size * 0.36 }]}>{formatScore(score)}</Text>
    </View>
  );
}

/** Yuvarlak profil fotoğrafı; yoksa baş harfler. `ringed`: dışta ince açık halka, arada zemin boşluğu (üst üste yüzler) */
function Avatar({
  name,
  uri,
  size,
  ringed,
  onImageSettled,
}: {
  name: string;
  uri?: string;
  size: number;
  ringed?: boolean;
  onImageSettled?: (uri: string) => void;
}) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  const face = uri ? (
    <Image
      source={{ uri }}
      style={[shape, !ringed && styles.avatarEdge]}
      onLoad={() => onImageSettled?.(uri)}
      onError={() => onImageSettled?.(uri)}
    />
  ) : (
    <View style={[shape, styles.avatarFallback, !ringed && styles.avatarEdge]}>
      <Text style={[styles.avatarInitials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
  if (!ringed) return face;
  return <View style={[styles.avatarRing, { borderRadius: size / 2 + AVATAR_RING_GAP + 1.5 }]}>{face}</View>;
}

const AVATAR_RING_GAP = 3;

/** Alt imza: kim paylaştı ve uygulama nereden indirilir (marka adı üstteki yazıda) */
function Footer({ author, onImageSettled }: Common) {
  const { t } = useTranslation();
  return (
    <View style={styles.footer}>
      <Avatar name={author.name} uri={author.avatarUri} size={48} onImageSettled={onImageSettled} />
      <View style={styles.flex}>
        <Text style={styles.footerName} numberOfLines={1}>
          @{author.username}
        </Text>
        <Text style={styles.footerHint} numberOfLines={1}>
          {author.hint ?? t('story.followHint')}
        </Text>
      </View>
      {/* Uygulaması olmayan izleyici için indirme yolu (Instagram'da tıklanır bağlantı yok) */}
      <View style={styles.getApp}>
        <Text style={styles.getAppSmall}>{t(Platform.OS === 'android' ? 'story.getAppKickerAndroid' : 'story.getAppKicker')}</Text>
        <Text style={styles.getAppBig}>{t(Platform.OS === 'android' ? 'story.getAppAndroid' : 'story.getApp')}</Text>
      </View>
    </View>
  );
}

/** Kartta dar alan: "Kafe · Caferağa" */
const placeLine = (place: Place) => `${cuisineLabel(place.cuisine)} · ${placeShortArea(place)}`;

/** Sıralı mekân satırları: italik sıra numarası, ad ve tür/semt, sağda puan halkası */
function PlaceRows({ items, ring }: { items: { place: Place; score?: number }[]; ring: number }) {
  return (
    <View style={styles.list}>
      {items.map(({ place, score }, i) => (
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
          {score !== undefined && <ScoreRing score={score} size={ring} />}
        </View>
      ))}
    </View>
  );
}

/* ---------- En iyi 5 ---------- */

export const TopFiveCard = forwardRef<View, Common & { items: ScoredPlace[] }>(function TopFiveCard(
  { items, ...common },
  ref,
) {
  const { t } = useTranslation();
  const top = items.slice(0, 5);
  return (
    <Frame ref={ref}>
      <Masthead />
      <View style={styles.titleBlock}>
        <Kicker>{t('story.top5Kicker')}</Kicker>
        <Title>{t('story.top5Title', { count: top.length })}</Title>
      </View>
      <PlaceRows items={top} ring={58} />
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

/* ---------- Favori 4 ---------- */

/** 2×2 afiş ızgarası (içerik genişliği: kenar boşlukları düşülmüş) */
const FAV_GAP = 16;
const FAV_WIDTH = (STORY_SIZE.width - PAD * 2 - FAV_GAP) / 2;
const FAV_HEIGHT = 180;

/** Profilde seçilen Favori 4: fotoğraflı afişler, köşede puan, altında ad ve semt */
export const FavoritesStoryCard = forwardRef<View, Common & { items: ScoredPlace[] }>(function FavoritesStoryCard(
  { items, ...common },
  ref,
) {
  const { t } = useTranslation();
  const shown = items.slice(0, 4);
  return (
    <Frame ref={ref}>
      <Masthead />
      <View style={styles.titleBlock}>
        <Title>{t(shown.length === 4 ? 'story.favoritesTitleFull' : 'story.favoritesTitle')}</Title>
      </View>
      <View style={styles.favGrid}>
        {shown.map(({ place, score }) => (
          <View key={place.id} style={styles.favItem}>
            <View style={styles.favPoster}>
              {place.photoUrl ? (
                <Image
                  source={{ uri: place.photoUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  onLoad={() => common.onImageSettled?.(place.photoUrl!)}
                  onError={() => common.onImageSettled?.(place.photoUrl!)}
                />
              ) : (
                <Text style={styles.favInitial}>{place.name.charAt(0).toLocaleUpperCase(currentLocale())}</Text>
              )}
              <View style={styles.favRing}>
                <ScoreRing score={score} size={50} onPhoto={!!place.photoUrl} />
              </View>
            </View>
            <Text style={styles.favName} numberOfLines={1}>
              {place.name}
            </Text>
            <Text style={styles.favSub} numberOfLines={1}>
              {placeLine(place)}
            </Text>
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
      <Masthead />
      <View style={styles.titleBlock}>
        <Kicker>{t('story.listKicker', { name: possessive(firstName, currentLanguage()) })}</Kicker>
        <Title style={styles.listTitle} numberOfLines={3}>
          {list.title}
        </Title>
      </View>
      <PlaceRows items={shown} ring={54} />
      {more > 0 && <Text style={styles.more}>{t('story.listMore', { count: more })}</Text>}
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

/* ---------- Tek gönderi ---------- */

/** Fotoğrafın üstü yazı için hafif, altı imza için tamamen siyaha erir */
const POST_SHADE = {
  colors: [
    'rgba(10, 10, 11, 0.72)',
    'rgba(10, 10, 11, 0.25)',
    'rgba(10, 10, 11, 0)',
    'rgba(10, 10, 11, 0)',
    'rgba(10, 10, 11, 0.82)',
    STORY_BACKGROUND,
  ],
  locations: [0, 0.16, 0.28, 0.4, 0.66, 0.86],
} as const;

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
            <LinearGradient colors={POST_SHADE.colors} locations={POST_SHADE.locations} style={StyleSheet.absoluteFill} />
          </>
        ) : undefined
      }>
      <Masthead />
      <View style={styles.spacer} />
      {post.score !== undefined && <ScoreRing score={post.score} size={96} onPhoto={!!photo} />}
      <Title style={styles.postTitle} numberOfLines={3}>
        {place.name}
      </Title>
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

/** Haritanın çerçevesi: ince kenarlı, içi hafif açık bir paspas; harita içinde yuvarlatılmış */
const MAP_MAT = 10;
const MAP_WIDTH = STORY_SIZE.width - PAD * 2 - MAP_MAT * 2 - 2;
export const STORY_MAP_ASPECT = 1.15;

/**
 * Lezzet haritası paylaşımı: "İsmail'in lezzet haritası", şehir ve mekân sayısı, gidilen şehirler koyu haritada
 * açık noktalarla; altta kim paylaştı.
 */
type MapStoryProps = Common & { dots: CityDot[]; view: ViewBox; summary: VisitedSummary };

export const MapStoryCard = forwardRef<View, MapStoryProps>(function MapStoryCard({ dots, view, summary, ...common }, ref) {
  const { t } = useTranslation();
  const firstName = common.author.name.split(' ')[0] || common.author.username;
  return (
    <Frame ref={ref}>
      <Masthead />
      <View style={styles.titleBlock}>
        <Title style={styles.mapTitle} numberOfLines={1} fit>
          {t('story.mapCardTitle', { name: possessive(firstName, currentLanguage()) })}
        </Title>
        <Text style={styles.mapStats}>
          {t('story.mapCities', { count: summary.cities })} · {t('story.mapPlaces', { count: summary.places })}
        </Text>
      </View>
      <View style={styles.mapMat}>
        <View style={styles.map}>
          <WorldMap view={view} width={MAP_WIDTH} height={MAP_WIDTH / STORY_MAP_ASPECT} dots={dots} dotScale={1.4} scheme="dark" />
        </View>
      </View>
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

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
      <Masthead />
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
        <Tile label={t('story.recapAverage')} value={formatScore(recap.average)} accent={scoreOnBlack(recap.average)} />
        <Tile label={t('story.recapDistricts')} value={String(recap.districts)} />
        <Tile label={t('story.recapPosts')} value={String(recap.posts)} />
      </View>
      {recap.best && (
        <View style={styles.best}>
          <View style={styles.flex}>
            <Text style={styles.tileLabel}>{t('story.recapBest')}</Text>
            <Text style={[styles.rowTitle, styles.bestTitle]} numberOfLines={1}>
              {recap.best.place.name}
            </Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {placeLine(recap.best.place)}
            </Text>
          </View>
          <ScoreRing score={recap.best.score} size={62} />
        </View>
      )}
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

/* ---------- Yıllık mekân hedefi ---------- */

/** İlerleme çubuğu: koyu yeşilden parlak yeşile */
const GOAL_FILL = [scoreColor(8.6), scoreOnBlack(9.6)] as const;

/**
 * Yıllık mekân hedefi: bu yıl kaç mekân puanlandı, hedefe ne kadar kaldı. Büyük sayı, ilerleme çubuğu,
 * tamamlanma ve kalan gün; altta "sen de hedef koy" çağrısı (imza ipucu ekrandan gelir).
 */
export const GoalStoryCard = forwardRef<View, Common & { progress: GoalProgress }>(function GoalStoryCard(
  { progress, ...common },
  ref,
) {
  const { t } = useTranslation();
  const { year, goal, done, daysLeft } = progress;
  const ratio = Math.min(done / goal, 1);
  const reached = done >= goal;
  return (
    <Frame ref={ref} background={<Backdrop tint={scoreColor(8)} strength={0.1} />}>
      <Masthead />
      {/* Kısa içerik: ana blok logo ile imza arasında ortalanır */}
      <View style={styles.spacer} />
      <View style={[styles.titleBlock, styles.flushTop]}>
        <Kicker>{t('story.goalKicker', { year })}</Kicker>
        <View style={styles.bigRow}>
          <Text style={styles.bigNumber}>{done}</Text>
          <Text style={styles.bigLabel}>{t('story.goalOf', { goal })}</Text>
        </View>
      </View>
      <View style={styles.goalTrack}>
        {ratio > 0 && (
          <LinearGradient
            colors={GOAL_FILL}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.goalFill, { width: `${ratio * 100}%` }]}
          />
        )}
      </View>
      <View style={styles.tiles}>
        <Tile
          label={t('story.goalDone')}
          value={t('profile.percent', { value: Math.round(ratio * 100) })}
          accent={reached ? scoreOnBlack(9) : undefined}
        />
        <Tile label={t('story.goalDaysLeft')} value={String(daysLeft)} />
      </View>
      <Text style={styles.statement}>
        {reached ? t('story.goalReached', { goal }) : t('story.goalStatement', { goal, count: goal - done })}
      </Text>
      <View style={styles.spacer} />
      <Footer {...common} />
    </Frame>
  );
});

/* ---------- Damak uyumu ---------- */

export type MatchPerson = { name: string; username: string; avatarUri?: string };

const MATCH_FACE = 74;
const MATCH_ROWS = 3;

/**
 * Damak uyumu: iki yüz, büyük yüzde (puan renginde çubukla), yüzdeye göre bir yorum ("Damak ikiziyiz") ve ikisinin
 * de favorisi olan en fazla 3 mekân iki puanla. İmza izleyiciyi kendi uyumuna bakmaya çağırır (ekrandan gelir).
 */
export const MatchStoryCard = forwardRef<
  View,
  Common & {
    me: MatchPerson;
    other: MatchPerson;
    percent: number;
    common: number;
    favorites: { place: Place; myScore: number; theirScore: number }[];
  }
>(function MatchStoryCard({ me, other, percent, common, favorites, ...rest }, ref) {
  const { t } = useTranslation();
  const shown = favorites.slice(0, MATCH_ROWS);
  const score = percent / 10;
  return (
    <Frame ref={ref} background={<Backdrop tint={scoreColor(score)} strength={0.09} />}>
      <Masthead />
      <View style={styles.spacer} />
      <View style={styles.matchHero}>
        <View style={styles.faces}>
          <Avatar name={me.name} uri={me.avatarUri} size={MATCH_FACE} ringed onImageSettled={rest.onImageSettled} />
          <View style={styles.faceOverlap}>
            <Avatar name={other.name} uri={other.avatarUri} size={MATCH_FACE} ringed onImageSettled={rest.onImageSettled} />
          </View>
        </View>
        <Kicker>{t('story.matchKicker')}</Kicker>
        <Text style={styles.matchPercent}>{t('profile.percent', { value: percent })}</Text>
        <View style={styles.matchTrack}>
          <View style={[styles.matchFill, { width: `${percent}%`, backgroundColor: scoreOnBlack(score) }]} />
        </View>
        <Text style={styles.matchVerdict}>{t(`story.matchVerdict.${matchVerdict(percent)}`)}</Text>
        <Text style={styles.matchNames} numberOfLines={1}>
          @{me.username} · @{other.username}
        </Text>
      </View>
      {shown.length > 0 ? (
        <View style={styles.matchList}>
          {/* Puan sütunlarının kime ait olduğu: küçük yüzler */}
          <View style={styles.matchHeader}>
            <Text style={[styles.tileLabel, styles.flex]} numberOfLines={1}>
              {t('story.matchFavorites').toLocaleUpperCase(currentLocale())}
            </Text>
            <View style={styles.matchColumn}>
              <Avatar name={me.name} uri={me.avatarUri} size={26} />
            </View>
            <View style={styles.matchColumn}>
              <Avatar name={other.name} uri={other.avatarUri} size={26} />
            </View>
          </View>
          {shown.map(({ place, myScore, theirScore }, i) => (
            <View key={place.id} style={[styles.matchRow, i > 0 && styles.rowBorder]}>
              <View style={styles.flex}>
                <Text style={styles.matchRowTitle} numberOfLines={1}>
                  {place.name}
                </Text>
                <Text style={styles.matchRowSub} numberOfLines={1}>
                  {placeLine(place)}
                </Text>
              </View>
              <ScoreRing score={myScore} size={42} />
              <ScoreRing score={theirScore} size={42} />
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.more, styles.matchCommon]}>{t('story.matchCommon', { count: common })}</Text>
      )}
      <View style={styles.spacer} />
      <Footer {...rest} />
    </Frame>
  );
});

const styles = StyleSheet.create({
  frame: {
    width: STORY_SIZE.width,
    height: STORY_SIZE.height,
    backgroundColor: STORY_BACKGROUND,
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

  /* Üst satır ve başlık */
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  wordmark: {
    fontFamily: fonts.serif,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '700',
    color: INK,
    letterSpacing: -0.4,
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: HAIRLINE,
  },
  titleBlock: {
    marginTop: 44,
    gap: 12,
  },
  flushTop: {
    marginTop: 0,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 3,
    color: INK_SOFT,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '600',
    color: INK,
    letterSpacing: -0.6,
  },
  titleAccent: {
    fontStyle: 'italic',
    fontWeight: '500',
  },
  listTitle: {
    fontSize: 42,
    lineHeight: 48,
  },

  /* Satırlar */
  list: {
    marginTop: 30,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 15,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
  },
  rank: {
    width: 30,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 30,
    fontWeight: '500',
    color: INK_MUTED,
    fontVariant: ['tabular-nums'],
  },
  rowTitle: {
    fontSize: 21,
    fontWeight: '600',
    color: INK,
    letterSpacing: -0.2,
  },
  rowSub: {
    marginTop: 3,
    fontSize: 14.5,
    color: INK_SOFT,
  },
  more: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: INK_SOFT,
  },

  /* Puan halkası */
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    fontFamily: fonts.serif,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  /* İmza */
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 22,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
  },
  avatarEdge: {
    borderWidth: 1,
    borderColor: 'rgba(242, 239, 233, 0.25)',
  },
  avatarRing: {
    padding: AVATAR_RING_GAP,
    borderWidth: 1.5,
    borderColor: 'rgba(242, 239, 233, 0.5)',
    backgroundColor: STORY_BACKGROUND,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(242, 239, 233, 0.12)',
  },
  avatarInitials: {
    fontWeight: '600',
    color: INK,
  },
  footerName: {
    fontSize: 18,
    fontWeight: '600',
    color: INK,
  },
  footerHint: {
    marginTop: 2,
    fontSize: 13.5,
    color: INK_SOFT,
  },
  getApp: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(242, 239, 233, 0.28)',
  },
  getAppSmall: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: INK_SOFT,
  },
  getAppBig: {
    marginTop: 1,
    fontSize: 15,
    fontWeight: '700',
    color: INK,
  },

  /* Favori 4 */
  favGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FAV_GAP,
    marginTop: 30,
  },
  favItem: {
    width: FAV_WIDTH,
  },
  favPoster: {
    height: FAV_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: HAIRLINE,
    overflow: 'hidden',
    backgroundColor: SURFACE,
  },
  favInitial: {
    fontFamily: fonts.serif,
    fontSize: 72,
    fontWeight: '600',
    color: INK_MUTED,
  },
  favRing: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  favName: {
    marginTop: 11,
    fontSize: 19,
    fontWeight: '600',
    color: INK,
    letterSpacing: -0.2,
  },
  favSub: {
    marginTop: 2,
    fontSize: 13.5,
    color: INK_SOFT,
  },

  /* Gönderi */
  postTitle: {
    marginTop: 22,
    fontSize: 54,
    lineHeight: 60,
  },
  postSub: {
    marginTop: 8,
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(242, 239, 233, 0.78)',
  },
  caption: {
    marginTop: 18,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 22,
    lineHeight: 30,
    color: 'rgba(242, 239, 233, 0.92)',
  },
  postFooter: {
    marginTop: 28,
  },

  /* Lezzet haritası */
  mapTitle: {
    fontSize: 42,
    lineHeight: 48,
  },
  mapStats: {
    fontSize: 17,
    fontWeight: '500',
    color: INK_SOFT,
  },
  mapMat: {
    marginTop: 28,
    padding: MAP_MAT,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: SURFACE,
  },
  map: {
    width: MAP_WIDTH,
    aspectRatio: STORY_MAP_ASPECT,
    borderRadius: 18,
    overflow: 'hidden',
  },

  /* Büyük sayı ve kutular (özet, hedef) */
  bigRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
  },
  bigNumber: {
    fontFamily: fonts.serif,
    fontSize: 150,
    lineHeight: 156,
    fontWeight: '600',
    color: INK,
    letterSpacing: -5,
    fontVariant: ['tabular-nums'],
  },
  bigLabel: {
    flex: 1,
    marginBottom: 26,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 28,
    lineHeight: 32,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: SURFACE,
  },
  tileLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: 1.8,
    color: INK_SOFT,
  },
  tileValue: {
    fontSize: 28,
    fontWeight: '700',
    color: INK,
    letterSpacing: -0.3,
  },
  best: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: SURFACE,
  },
  bestTitle: {
    marginTop: 6,
  },
  goalTrack: {
    height: 10,
    marginTop: 30,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: 'rgba(242, 239, 233, 0.1)',
  },
  goalFill: {
    height: '100%',
    borderRadius: 5,
  },
  statement: {
    marginTop: 28,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 28,
    lineHeight: 36,
    color: INK,
  },

  /* Damak uyumu */
  matchHero: {
    alignItems: 'center',
    gap: 8,
  },
  faces: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  faceOverlap: {
    marginLeft: -22,
  },
  matchPercent: {
    fontFamily: fonts.serif,
    fontSize: 100,
    lineHeight: 106,
    fontWeight: '600',
    color: INK,
    letterSpacing: -4,
    fontVariant: ['tabular-nums'],
  },
  matchTrack: {
    alignSelf: 'stretch',
    height: 8,
    marginHorizontal: 40,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(242, 239, 233, 0.1)',
  },
  matchFill: {
    height: '100%',
    borderRadius: 4,
  },
  matchVerdict: {
    marginTop: 8,
    fontFamily: fonts.serif,
    fontStyle: 'italic',
    fontSize: 32,
    lineHeight: 38,
    color: INK,
    textAlign: 'center',
  },
  matchNames: {
    fontSize: 15,
    fontWeight: '600',
    color: INK_SOFT,
  },
  matchList: {
    marginTop: 22,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: SURFACE,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
  },
  matchColumn: {
    width: 42,
    alignItems: 'center',
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  matchRowTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: INK,
  },
  matchRowSub: {
    marginTop: 2,
    fontSize: 13,
    color: INK_SOFT,
  },
  matchCommon: {
    marginTop: 22,
    textAlign: 'center',
  },
});
