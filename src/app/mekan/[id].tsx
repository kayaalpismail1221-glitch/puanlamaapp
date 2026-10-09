import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from '@/components/symbol';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppMapView, PinMarker } from '@/components/app-map';
import { PlaceDetailSkeleton, PostGridSkeleton } from '@/components/skeleton';
import { Avatar, Divider, ErrorView, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, onScoreColor, radius, scoreColor, spacing } from '@/constants/theme';
import { PostGrid } from '@/components/post-grid';
import { usePlace, useUser } from '@/data/entities';
import { usePlaceDetails, usePlacePosts } from '@/hooks/queries';
import { usePalette } from '@/hooks/use-palette';
import { formatScore } from '@/lib/format';
import { linkSource } from '@/lib/links';
import { haptics } from '@/lib/haptics';
import { isInstagram, placeSubtitle } from '@/lib/place';
import { segmentStanding } from '@/lib/ranking';
import { showAlert, showMenu } from '@/lib/dialog';
import { confirmRemoveScore } from '@/lib/remove-score';
import { highlightLabel } from '@/lib/post-meta';
import { sharePlace } from '@/lib/share';
import { useAppStore } from '@/store/app-store';

/** Kapak haritasının yükseklik / genişlik oranı (durum çubuğu hariç) */
const HERO_ASPECT = 1;
/** Kapak haritasının yakınlığı (enlem/boylam aralığı; ~600 m) */
const MAP_DELTA = 0.006;
/** Android üst çubuğu (actionBarSize) */
const ANDROID_HEADER_HEIGHT = 56;

/** Veride şemasız kalmış site adresi ("www.ornek.com") iOS'ta açılmaz */
const withScheme = (url: string) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cached = usePlace(id);
  const details = usePlaceDetails(id);
  const placePosts = usePlacePosts(id);
  const { scoreOf, scored, rankings, isSaved, saved: savedPlaces, actions } = useAppStore();
  const { t } = useTranslation();
  // Arama yapamayan cihaz ya da bozuk adres: sessiz kalmasın
  const openLink = (url: string) => Linking.openURL(url).catch(() => showAlert(t('failures.linkOpen')));
  const palette = usePalette();
  const place = cached ?? details.data?.place;

  // Android: saydam üst çubuk, fotoğraf kaydırılıp geçilince Material'daki gibi zemin rengine bürünür
  // (içerik durum çubuğu ve düğmelerin altından yazıyla üst üste geçmesin). iOS'ta sistem başlığı kalır.
  const insets = useSafeAreaInsets();
  // Kapak haritası durum çubuğunun arkasına da uzanır (harita çentiğin altında kalsa da bir şey kaybolmaz)
  const { width } = useWindowDimensions();
  const heroHeight = Math.round(width * HERO_ASPECT);
  const heroBottom = insets.top + heroHeight;
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [heroBottom - 140, heroBottom - 70], [0, 1], 'clamp'),
  }));

  // Üstteki puana dokununca genel puan ve gönderilere iner (bölümün konumu: gövde + gövde içindeki yeri)
  const scrollRef = useRef<Animated.ScrollView>(null);
  const bodyY = useRef(0);
  const postsSectionY = useRef(0);
  const scrollToPosts = () => {
    haptics.tap();
    const header = insets.top + (Platform.OS === 'android' ? ANDROID_HEADER_HEIGHT : 44) + spacing.sm;
    scrollRef.current?.scrollTo({ y: Math.max(0, bodyY.current + postsSectionY.current - header), animated: true });
  };

  if (!place) {
    // Önbellek "yok" dediyse (silinmiş ya da bozuk bağlantıdaki geçersiz kimlik) "bağlantını kontrol et" yerine bulunamadı
    if (details.isError && cached !== null) {
      return <ErrorView onRetry={() => details.refetch()} style={styles.container} />;
    }
    if (cached === undefined && details.isPending) return <PlaceDetailSkeleton />;
    return (
      <View style={[styles.container, styles.center]}>
        <Text>{t('place.notFound')}</Text>
      </View>
    );
  }

  const myScore = scoreOf(place.id);
  const myEntry = scored.find((e) => e.placeId === place.id);
  // Puanın bağlamı: kendi türündeki listende kaçıncı (eşitler aynı sırada)
  const standing = myEntry ? segmentStanding(rankings, place.id) : undefined;
  // Puan sıralamadan ve Top 3'ten çıkar; paylaşılan gönderiler kalır
  const confirmUnrank = () => confirmRemoveScore(place.name, () => actions.unrank(place.id));
  const saved = isSaved(place.id);
  const savedEntry = savedPlaces.find((s) => s.placeId === place.id);
  const source = savedEntry?.link ? linkSource(savedEntry.link) : null;
  const posts = placePosts.data ?? [];
  const highlights = details.data?.summary.highlights ?? [];
  // Takip edilenlerin bu mekâna verdiği puanlar
  const friendScores = details.data?.friends ?? [];
  const friendAverage = friendScores.length
    ? friendScores.reduce((sum, f) => sum + f.score, 0) / friendScores.length
    : undefined;
  const postCount = details.data?.postCount ?? posts.length;
  // Büyük rozet mekânın Puanla puanı (herkesin kıyaslamalarından); kendi puanın altında küçük
  const community = details.data?.rating?.average ?? undefined;
  const communityCount = details.data?.rating?.count ?? 0;

  const openDirections = () => router.push({ pathname: '/yol-tarifi/[id]', params: { id: place.id } });
  const showMore = () => {
    haptics.tap();
    showMenu(place.name, [
      {
        icon: 'exclamationmark.bubble',
        label: t('place.wrongInfo'),
        onPress: () => router.push({ pathname: '/mekan-duzelt/[id]', params: { id: place.id } }),
      },
    ]);
  };
  // Arka plan rengine yumuşak geçiş: haritanın altındaki ad her görünümde okunur
  const fade = [`${palette.background}00`, `${palette.background}D9`, palette.background] as const;

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollRef}
        style={styles.container}
        contentInsetAdjustmentBehavior="never"
        // Sağdaki kaydırma çubuğu harita kapaklı sayfada uzun ve dikkat dağıtıcı duruyordu
        showsVerticalScrollIndicator={false}
        onScroll={Platform.OS === 'android' ? onScroll : undefined}
        scrollEventThrottle={16}>
        <Stack.Screen
          options={{
            headerRight: () => (
              <View style={styles.headerActions}>
                <PressableScale
                  onPress={() => sharePlace(place, details.data?.rating)}
                  hitSlop={hitSlop}
                  style={styles.headerButton}
                  accessibilityLabel={t('share.sharePlace')}>
                  <SymbolView name="square.and.arrow.up" tintColor={colors.primary} size={18} weight="semibold" />
                </PressableScale>
                {/* Dikey üç nokta: seyrek kullanılan seçenekler (Bilgi yanlış mı?) */}
                <PressableScale
                  onPress={showMore}
                  hitSlop={hitSlop}
                  style={styles.headerButton}
                  accessibilityLabel={t('moderation.options')}>
                  <SymbolView
                    name="ellipsis"
                    tintColor={colors.primary}
                    size={18}
                    weight="semibold"
                    style={Platform.OS === 'ios' && styles.vertical}
                  />
                </PressableScale>
              </View>
            ),
          }}
        />

        {/* Kapak: fotoğraf yerine mekânın haritası (fotoğraf her mekânda yok, olan da kırpılıyordu). Haritaya dokununca
            yol tarifi; adı ve puanı haritanın alt kısmında, zemine yumuşak geçişin üstünde */}
        <PressableScale
          onPress={openDirections}
          scaleTo={1}
          haptic={false}
          style={{ height: heroBottom }}
          accessibilityRole="button"
          accessibilityLabel={t('place.directions')}>
          <AppMapView
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            initialRegion={{
              // Pin ortanın üstünde dursun, ad onu örtmesin
              latitude: place.latitude - MAP_DELTA * 0.18,
              longitude: place.longitude,
              latitudeDelta: MAP_DELTA,
              longitudeDelta: MAP_DELTA,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}>
            <PinMarker coordinate={{ latitude: place.latitude, longitude: place.longitude }}>
              <View style={styles.pin}>
                <SymbolView name="fork.knife" tintColor={colors.onPrimary} size={14} />
              </View>
            </PinMarker>
          </AppMapView>
          <LinearGradient pointerEvents="none" colors={fade} locations={[0, 0.55, 1]} style={styles.heroFade} />
          <View style={styles.heroTitle}>
            <View style={styles.heroName}>
              <Text variant="largeTitle" color={colors.primary} numberOfLines={3}>
                {place.name}
              </Text>
              <Text variant="subhead" numberOfLines={2}>
                {placeSubtitle(place)}
              </Text>
            </View>
            {community !== undefined ? (
              <PressableScale
                onPress={scrollToPosts}
                haptic={false}
                style={styles.puanla}
                accessibilityRole="button"
                accessibilityLabel={t('place.puanlaScoreLabel', { score: formatScore(community), count: communityCount })}>
                <ScoreBadge score={community} size="lg" />
                {/* Marka adı yerine puanın kaç kişiden geldiği: puanın ne kadar güvenilir olduğunu söyler */}
                <Text
                  variant="caption"
                  color={colors.textSecondary}
                  align="center"
                  numberOfLines={2}
                  style={styles.puanlaLabel}>
                  {t('place.ratedBy', { count: communityCount })}
                </Text>
              </PressableScale>
            ) : (
              details.isPending && <View style={styles.puanlaPlaceholder} />
            )}
          </View>
        </PressableScale>

        <View style={styles.body} onLayout={(e) => (bodyY.current = e.nativeEvent.layout.y)}>
          {/* Adın altında: kullanıcıların en çok seçtiği üç öne çıkan (düz yazı: bilgi, düğme değil), sonra kısa yollar
              (gri zeminli düğme çubuğu: dokunulabildiği belli) */}
          <View style={styles.info}>
            {highlights.length > 0 && (
              <Text variant="subhead" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {highlights.slice(0, 3).map((h, i) => (
                  <Text key={h.label} variant="subhead">
                    {i > 0 && <Text variant="subhead" color={colors.textTertiary}>{'  ·  '}</Text>}
                    <Text variant="subhead" color={colors.primary} style={styles.bold}>
                      {highlightLabel(h.label)}
                    </Text>
                    <Text variant="subhead" color={colors.textSecondary}>{` ${h.count}`}</Text>
                  </Text>
                ))}
              </Text>
            )}
            {place.closed && (
              <View style={styles.closedBadge}>
                <SymbolView name="xmark.circle.fill" tintColor={colors.textSecondary} size={14} />
                <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
                  {t('place.closedBanner')}
                </Text>
              </View>
            )}
            <View style={styles.links}>
              <LinkButton icon="arrow.triangle.turn.up.right.diamond.fill" label={t('place.directions')} onPress={openDirections} />
              {place.phone && (
                <LinkButton icon="phone.fill" label={t('place.call')} onPress={() => openLink(`tel:${place.phone}`)} />
              )}
              {place.website && (
                <LinkButton
                  icon={isInstagram(place.website) ? 'at' : 'safari'}
                  label={isInstagram(place.website) ? t('place.instagram') : t('place.website')}
                  onPress={() => openLink(withScheme(place.website!))}
                />
              )}
            </View>
          </View>

          {myEntry && myScore !== undefined && (
            <View style={styles.myScore}>
              <ScoreBadge score={myScore} size="sm" />
              <Text variant="footnote" color={colors.textSecondary} style={{ flex: 1 }}>
                <Text variant="footnote" style={styles.bold}>
                  {t('place.yourScore')}
                </Text>
                {standing &&
                  ` · ${
                    standing.total === 1
                      ? t('place.segmentFirst', { segment: t(`segments.${standing.segment}`) })
                      : t('place.segmentStanding', {
                          segment: t(`segments.${standing.segment}`),
                          rank: standing.rank,
                          total: standing.total,
                        })
                  }`}
                {myEntry.note ? ` · “${myEntry.note}”` : ''}
                {'  '}
                <Text variant="footnote" color={colors.primary} style={styles.bold} onPress={confirmUnrank}>
                  {t('place.removeScore')}
                </Text>
              </Text>
            </View>
          )}

          {savedEntry && (savedEntry.note || source) && (
            <View style={styles.savedInfo}>
              {savedEntry.note && <Text variant="subhead">{savedEntry.note}</Text>}
              {source && savedEntry.link && (
                <PressableScale onPress={() => openLink(savedEntry.link!)} style={styles.sourceChip}>
                  <SymbolView name={source.icon} tintColor={colors.primary} size={14} />
                  <Text variant="footnote" color={colors.primary} style={styles.bold}>
                    {t('place.openSource', { source: source.label })}
                  </Text>
                </PressableScale>
              )}
            </View>
          )}

          {/* Eylemler: "+ Puanla" gönderi ekranını açar (puan orada verilir, fotoğraf eklenirse gönderi olur; ayrı
              "Gönderi" düğmesine gerek yok) ve Kaydet. İkisi aynı: çerçeveli, yazısı kadar geniş; kullanıldıysa (puanladın / kaydettin) içi dolu */}
          <View style={styles.actions}>
            <PressableScale
              onPress={() =>
                router.push({
                  pathname: '/gonderi-olustur',
                  params: { placeId: place.id, ...(myScore !== undefined && { yeniden: '1' }) },
                })
              }
              style={[styles.actionButton, myScore !== undefined && styles.actionButtonActive]}
              accessibilityRole="button"
              accessibilityLabel={myScore !== undefined ? t('place.rerate') : t('place.rate')}
              accessibilityState={{ selected: myScore !== undefined }}>
              <SymbolView
                name="plus"
                tintColor={myScore !== undefined ? colors.onPrimary : colors.primary}
                size={15}
                weight="bold"
              />
              <Text
                variant="subhead"
                color={myScore !== undefined ? colors.onPrimary : colors.primary}
                numberOfLines={1}
                style={styles.bold}>
                {myScore !== undefined ? t('place.rerate') : t('place.rate')}
              </Text>
            </PressableScale>
            <PressableScale
              onPress={() => {
                haptics.success();
                actions.toggleSaved(place.id);
              }}
              style={[styles.actionButton, saved && styles.actionButtonActive]}
              accessibilityRole="button"
              accessibilityLabel={saved ? t('place.saved') : t('place.save')}
              accessibilityState={{ selected: saved }}>
              <SymbolView
                name={saved ? 'bookmark.fill' : 'bookmark'}
                tintColor={saved ? colors.onPrimary : colors.primary}
                size={15}
              />
              <Text variant="subhead" color={saved ? colors.onPrimary : colors.primary} numberOfLines={1} style={styles.bold}>
                {saved ? t('place.saved') : t('place.save')}
              </Text>
            </PressableScale>
          </View>

          {/* Takip ettiklerinin puanı (yalnızca puanlayan varsa): başlıkta ortalama, altında her arkadaş yuvarlak
              avatarla; halkası verdiği puanın renginde, dokununca gönderisine (yoksa profiline) gider */}
          {friendScores.length > 0 && friendAverage !== undefined && (
            <View style={styles.friends}>
              <View style={styles.friendsHeader}>
                <Text variant="headline" style={styles.shrink} numberOfLines={1}>
                  {t('place.friendsScore')}
                </Text>
                <View style={styles.friendsSummary}>
                  <Text variant="footnote" color={colors.textSecondary}>
                    {t('place.ratedBy', { count: friendScores.length })}
                  </Text>
                  <View style={[styles.scorePill, { backgroundColor: scoreColor(friendAverage) }]}>
                    <Text variant="footnote" color={onScoreColor(friendAverage)} style={styles.scorePillText}>
                      {formatScore(friendAverage)}
                    </Text>
                  </View>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendList}>
                {friendScores.map((f) => (
                  <FriendScore key={f.userId} userId={f.userId} score={f.score} postId={f.postId} />
                ))}
              </ScrollView>
            </View>
          )}

          <Divider />

          {/* Gönderiler (üstteki puana dokununca buraya inilir) */}
          <View style={styles.postsSection} onLayout={(e) => (postsSectionY.current = e.nativeEvent.layout.y)}>
            <Text variant="headline">
              {postCount > 0 ? t('place.postsCount', { count: postCount }) : t('place.posts')}
            </Text>
          </View>
        </View>

        {/* Fotoğraflı ve yazılı gönderiler en altta, ekran genişliğinde ızgara */}
        {placePosts.isPending ? (
          <PostGridSkeleton count={6} />
        ) : (
          <PostGrid posts={posts} emptyText={t('place.noPosts')} />
        )}
        {/* ODbL (OpenStreetMap) ve Overture Maps lisansları gereği mekân bilgisinin atfı: sayfanın en altında */}
        <Text variant="caption" color={colors.textTertiary} align="center" style={styles.attribution}>
          {t('place.dataSource')}
        </Text>
      </Animated.ScrollView>
      {Platform.OS === 'android' && (
        <Animated.View
          pointerEvents="none"
          style={[styles.headerBar, { height: insets.top + ANDROID_HEADER_HEIGHT }, barStyle]}
        />
      )}
    </View>
  );
}

/** Kısa yol düğmesi: gri zemin, simge + yazı; satırı eşit paylaşır (yol tarifi, ara, web sitesi) */
function LinkButton({ icon, label, onPress }: { icon: SFSymbol; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.linkButton} accessibilityRole="button" accessibilityLabel={label}>
      <SymbolView name={icon} tintColor={colors.primary} size={15} />
      <Text
        variant="subhead"
        color={colors.primary}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[styles.bold, styles.shrink]}>
        {label}
      </Text>
    </PressableScale>
  );
}

/**
 * Arkadaşın puanı: avatar, çevresinde verdiği puanın renginde halka, alt kenarına binen puan etiketi ve adı.
 * Dokununca gönderisine, gönderisi yoksa profiline gider.
 */
function FriendScore({ userId, score, postId }: { userId: string; score: number; postId?: string }) {
  const user = useUser(userId);
  if (!user) return null;
  const color = scoreColor(score);
  return (
    <PressableScale
      onPress={() =>
        postId
          ? router.push({ pathname: '/gonderi/[id]', params: { id: postId } })
          : router.push({ pathname: '/kullanici/[id]', params: { id: userId } })
      }
      scaleTo={0.94}
      style={styles.friend}
      accessibilityRole="button"
      accessibilityLabel={`${user.name} ${formatScore(score)}`}>
      <View style={[styles.friendRing, { borderColor: color }]}>
        <Avatar uri={user.avatarUrl} name={user.name} size={54} />
      </View>
      <View style={[styles.scorePill, styles.friendScorePill, { backgroundColor: color }]}>
        <Text variant="caption" color={onScoreColor(score)} style={styles.scorePillText}>
          {formatScore(score)}
        </Text>
      </View>
      <Text variant="caption" numberOfLines={1} style={styles.bold}>
        {user.name.split(' ')[0]}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  // Fotoğrafın üstünde okunaklı dursun diye cam benzeri beyaz daire
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // iOS'ta yatay üç nokta dikey çevrilir (Android karşılığı zaten dikey: more_vert)
  vertical: {
    transform: [{ rotate: '90deg' }],
  },
  headerButton: {
    width: Platform.OS === 'android' ? 40 : 34,
    height: Platform.OS === 'android' ? 40 : 34,
    borderRadius: radius.full,
    backgroundColor: colors.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postsSection: {
    gap: spacing.lg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  // Ad ve puan haritanın alt kenarında, yumuşak geçişin üstünde
  // Ad ve puan rozeti üstten hizalı
  heroTitle: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  heroName: {
    flex: 1,
    gap: spacing.xs,
  },
  body: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
  info: {
    gap: spacing.md,
  },
  // Öne çıkanlar satırından biraz ayrık
  links: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs + 2,
  },
  linkButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    height: 40,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  shrink: {
    flexShrink: 1,
  },
  puanla: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  puanlaLabel: {
    fontWeight: '600',
    maxWidth: 84,
  },
  // Puan yüklenirken başlık kaymasın: rozet + etiket kadar yer
  puanlaPlaceholder: {
    width: 64,
    height: 64 + spacing.xs + 16,
  },
  myScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Puanla ve Kaydet: çerçeveli, yazısı kadar geniş
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    height: 38,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  actionButtonActive: {
    backgroundColor: colors.primary,
  },
  friends: {
    gap: spacing.md,
  },
  friendsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  friendsSummary: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  friendList: {
    gap: spacing.lg,
    paddingRight: spacing.xl,
  },
  friend: {
    alignItems: 'center',
    width: 70,
  },
  // Avatarın çevresinde puan renginde halka, arada zemin renginde boşluk
  friendRing: {
    padding: 2,
    borderRadius: radius.full,
    borderWidth: 2.5,
  },
  scorePill: {
    minWidth: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  // Avatarın alt kenarına biner
  friendScorePill: {
    marginTop: -11,
    marginBottom: spacing.xs,
    borderWidth: 2,
    borderColor: colors.background,
  },
  scorePillText: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  savedInfo: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  closedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  attribution: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  // Üç etiket tek satır: sığmayan kesilmez, yazısı küçülerek tam sığar
  pin: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
