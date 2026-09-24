import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Avatar, Button, Divider, ErrorView, LoadingView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { PostGrid } from '@/components/post-grid';
import { usePlace, useUser } from '@/data/entities';
import { usePlaceDetails, usePlacePosts } from '@/hooks/queries';
import { formatScore, priceLabel } from '@/lib/format';
import { linkSource } from '@/lib/links';
import { priceBucketLabel } from '@/lib/post-meta';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cached = usePlace(id);
  const details = usePlaceDetails(id);
  const placePosts = usePlacePosts(id);
  const { scoreOf, scored, isSaved, saved: savedPlaces, actions } = useAppStore();
  const place = cached ?? details.data?.place;

  if (!place) {
    if (details.isError) return <ErrorView onRetry={() => details.refetch()} style={styles.container} />;
    if (cached === undefined && details.isPending) return <LoadingView style={styles.container} />;
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Mekân bulunamadı.</Text>
      </View>
    );
  }

  const myScore = scoreOf(place.id);
  const myEntry = scored.find((e) => e.placeId === place.id);
  const saved = isSaved(place.id);
  const savedEntry = savedPlaces.find((s) => s.placeId === place.id);
  const source = savedEntry?.link ? linkSource(savedEntry.link) : null;
  const posts = placePosts.data ?? [];
  const summary = details.data?.summary;
  const hasSummary = !!summary && (!!summary.price || summary.highlights.length > 0 || summary.dishes.length > 0);
  // Takip edilenlerin bu mekâna verdiği puanlar
  const friendScores = details.data?.friends ?? [];
  const friendAverage = friendScores.length
    ? friendScores.reduce((sum, f) => sum + f.score, 0) / friendScores.length
    : undefined;
  const postCount = details.data?.postCount ?? posts.length;

  return (
    <ScrollView style={styles.container} contentInsetAdjustmentBehavior="never">
      <PlaceImage uri={place.photoUrl} style={styles.hero} />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="title" color={colors.primary}>
              {place.name}
            </Text>
            <Text variant="subhead" color={colors.textSecondary}>
              {place.cuisine} · {place.neighborhood}, {place.city} · {priceLabel(place.priceLevel)}
            </Text>
          </View>
          {myScore !== undefined && <ScoreBadge score={myScore} size="lg" />}
        </View>

        {myEntry && (
          <Text variant="footnote" color={colors.textSecondary}>
            Sıralamanda {myEntry.rank}. sırada
            {myEntry.note ? ` · “${myEntry.note}”` : ''}
          </Text>
        )}

        {savedEntry && (savedEntry.note || source) && (
          <View style={styles.savedInfo}>
            {savedEntry.note && <Text variant="subhead">{savedEntry.note}</Text>}
            {source && savedEntry.link && (
              <PressableScale onPress={() => Linking.openURL(savedEntry.link!)} style={styles.sourceChip}>
                <SymbolView name={source.icon} tintColor={colors.primary} size={14} />
                <Text variant="footnote" color={colors.primary} style={{ fontWeight: '600' }}>
                  {source.label} gönderisini aç
                </Text>
              </PressableScale>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <Button
            title={myScore !== undefined ? 'Yeniden puanla' : 'Puanla'}
            icon="star"
            onPress={() => router.push({ pathname: '/degerlendir/[id]', params: { id: place.id } })}
            style={{ flex: 1 }}
          />
          {myScore === undefined && (
            <Button
              title={saved ? 'Kaydedildi' : 'Kaydet'}
              icon={saved ? 'bookmark.fill' : 'bookmark'}
              variant="secondary"
              onPress={() => {
                haptics.success();
                actions.toggleSaved(place.id);
              }}
              style={{ flex: 1 }}
            />
          )}
        </View>
        <Button
          title="Gönderi paylaş"
          icon="camera"
          variant="secondary"
          onPress={() => router.push({ pathname: '/gonderi-olustur', params: { placeId: place.id } })}
        />

        <Divider />

        {hasSummary && summary && (
          <>
            <Text variant="headline">Puanla kullanıcılarına göre</Text>
            <View style={styles.summary}>
              {summary.price && (
                <SummaryRow icon="creditcard" label="Kişi başı genelde">
                  <Text variant="headline" color={colors.primary}>
                    {priceBucketLabel(summary.price.key)}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    {summary.priceVotes} kişiye göre
                  </Text>
                </SummaryRow>
              )}
              {summary.dishes.length > 0 && (
                <SummaryRow icon="fork.knife" label="En çok yenilenler">
                  <Text variant="subhead" style={{ fontWeight: '600' }}>
                    {summary.dishes.map((d) => d.name).join(', ')}
                  </Text>
                </SummaryRow>
              )}
              {summary.highlights.length > 0 && (
                <View style={styles.summaryChips}>
                  {summary.highlights.map((h) => (
                    <View key={h.label} style={styles.summaryChip}>
                      <Text variant="footnote" color={colors.primary} style={{ fontWeight: '600' }}>
                        {h.label}
                      </Text>
                      <Text variant="caption" color={colors.textSecondary}>
                        {h.count}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
            <Divider />
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text variant="headline">Arkadaşların puanı</Text>
          {friendAverage !== undefined && (
            <Text variant="subhead" color={colors.textSecondary}>
              Ortalama {formatScore(friendAverage)}
            </Text>
          )}
        </View>
        {friendScores.length === 0 ? (
          <Text variant="subhead" color={colors.textSecondary}>
            {details.isPending ? ' ' : 'Takip ettiğin kimse burayı henüz puanlamadı.'}
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendScores}>
            {friendScores.map((f) => (
              <FriendScore key={f.userId} userId={f.userId} score={f.score} postId={f.postId} />
            ))}
          </ScrollView>
        )}

        {details.data?.rating && (
          <Text variant="footnote" color={colors.textSecondary}>
            Tüm Puanla kullanıcılarının ortalaması {formatScore(details.data.rating.average)} ·{' '}
            {details.data.rating.count} kişi
          </Text>
        )}

        <Divider />

        <View style={styles.mapWrap}>
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: place.latitude,
              longitude: place.longitude,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}>
            <Marker coordinate={{ latitude: place.latitude, longitude: place.longitude }}>
              <View style={styles.pin}>
                <SymbolView name="fork.knife" tintColor={colors.onPrimary} size={14} />
              </View>
            </Marker>
          </MapView>
        </View>

        <Text variant="headline">
          Gönderiler{postCount > 0 ? ` (${postCount})` : ''}
        </Text>
      </View>

      {placePosts.isPending ? (
        <LoadingView />
      ) : (
        <PostGrid posts={posts} emptyText="Bu mekân hakkında henüz gönderi yok. İlk paylaşan sen ol!" />
      )}
      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

/** Arkadaşın puanı; gönderisi varsa ona, yoksa profiline gider */
function FriendScore({ userId, score, postId }: { userId: string; score: number; postId?: string }) {
  const user = useUser(userId);
  if (!user) return null;
  return (
    <PressableScale
      onPress={() =>
        postId
          ? router.push({ pathname: '/gonderi/[id]', params: { id: postId } })
          : router.push({ pathname: '/kullanici/[id]', params: { id: userId } })
      }
      style={styles.friendScore}>
      <Avatar uri={user.avatarUrl} name={user.name} size={48} />
      <View style={styles.friendBadge}>
        <ScoreBadge score={score} size="sm" />
      </View>
      <Text variant="caption" numberOfLines={1}>
        {user.name.split(' ')[0]}
      </Text>
    </PressableScale>
  );
}

function SummaryRow({ icon, label, children }: { icon: SFSymbol; label: string; children: ReactNode }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryIcon}>
        <SymbolView name={icon} tintColor={colors.primary} size={16} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="footnote" color={colors.textSecondary}>
          {label}
        </Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    width: '100%',
    height: 320,
  },
  body: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  friendScores: {
    gap: spacing.lg,
  },
  friendScore: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 64,
  },
  friendBadge: {
    marginTop: -spacing.lg,
    marginLeft: spacing.xl,
  },
  mapWrap: {
    height: 160,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
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
