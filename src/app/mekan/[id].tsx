import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Avatar, Button, Divider, PlaceImage, ScoreBadge, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { FEED, placeById, userById } from '@/data/mock';
import { priceLabel } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = placeById(id);
  const { scoreOf, scored, wantToGo, following, dispatch } = useAppStore();

  if (!place) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>Mekân bulunamadı.</Text>
      </View>
    );
  }

  const myScore = scoreOf(place.id);
  const myEntry = scored.find((e) => e.placeId === place.id);
  const saved = wantToGo.includes(place.id);
  const friendRatings = FEED.filter((f) => f.placeId === place.id && following.includes(f.userId));

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
                dispatch({ type: 'toggleWantToGo', placeId: place.id });
              }}
              style={{ flex: 1 }}
            />
          )}
        </View>

        <Divider />

        <Text variant="headline">Arkadaşların ne dedi?</Text>
        {friendRatings.length === 0 ? (
          <Text variant="subhead" color={colors.textSecondary}>
            Takip ettiğin kimse burayı henüz puanlamadı.
          </Text>
        ) : (
          friendRatings.map((f) => {
            const user = userById(f.userId);
            if (!user) return null;
            return (
              <View key={f.id} style={styles.friendRow}>
                <Avatar uri={user.avatarUrl} name={user.name} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="subhead" style={{ fontWeight: '600' }}>
                    {user.name}
                  </Text>
                  {f.note && (
                    <Text variant="subhead" color={colors.textSecondary}>
                      {f.note}
                    </Text>
                  )}
                </View>
                <ScoreBadge score={f.score} size="sm" />
              </View>
            );
          })
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
      </View>
    </ScrollView>
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
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mapWrap: {
    height: 160,
    borderRadius: radius.card,
    overflow: 'hidden',
    marginBottom: spacing.xxl,
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
