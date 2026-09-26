import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import Animated from 'react-native-reanimated';

import { createPlace, fetchAreaAt, type AreaAt } from '@/api/content';
import { showError } from '@/api/errors';
import { Button, PressableScale, Text } from '@/components/ui';
import { CUISINES, cuisineLabel } from '@/constants/cuisines';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { DEFAULT_REGION, type Coords } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { placeArea } from '@/lib/place';
import { queryClient } from '@/lib/query-client';
import type { Cuisine } from '@/types';

/** İğnenin durduğu yer: bilinen bölgede (İstanbul) semt veritabanından, dışında kullanıcıdan */
type AreaState = { status: 'idle' | 'loading' } | { status: 'known'; area: AreaAt } | { status: 'unknown' };

/**
 * Veritabanında olmayan mekânı ekleme.
 * Konum haritadan seçilir (varsayılan: kullanıcının bulunduğu yer). İl/ilçe/mahalle iğnenin konumundan
 * hesaplanır ve elle değiştirilemez; sokak adresi Apple'ın ters geokodlamasından önerilir.
 */
export default function AddPlaceScreen() {
  const params = useLocalSearchParams<{ ad?: string }>();
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();
  const mapRef = useRef<MapView>(null);

  const [name, setName] = useState(params.ad ?? '');
  const [cuisine, setCuisine] = useState<Cuisine>();
  const [coords, setCoords] = useState<Coords>();
  // İğne gerçekten yerleştirildi mi: GPS konumu geldi ya da kullanıcı haritayı kaydırdı.
  // Varsayılan harita merkezi kaydedilmesin (eskiden mekânlar yanlış semtle böyle eklendi).
  const [placed, setPlaced] = useState(false);
  // Son çözümlenen konum ve semti; iğne başka yerdeyse "bulunuyor" sayılır
  const [resolved, setResolved] = useState<{ coords: Coords; area: AreaAt | null }>();
  const [address, setAddress] = useState('');
  const addressEdited = useRef(false);
  // Bilinmeyen bölgede elle girilen il/ilçe/semt
  const [manual, setManual] = useState({ city: '', district: '', neighborhood: '' });
  const manualEdited = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoords(point);
      setPlaced(true);
      mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 400);
    })().catch(() => {});
  }, []);

  // İğne durunca (kısa gecikmeyle) semti ve adres önerisini bul; eski yanıtlar yenisinin üstüne yazmaz
  useEffect(() => {
    if (!coords || !placed) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const [known, geocoded] = await Promise.all([
        fetchAreaAt(coords).catch(() => null),
        Location.reverseGeocodeAsync(coords)
          .then((list) => list[0])
          .catch(() => undefined),
      ]);
      if (stale) return;
      setResolved({ coords, area: known });
      if (geocoded && !addressEdited.current) {
        const street = geocoded.street ?? '';
        setAddress(street && geocoded.streetNumber ? `${street} No:${geocoded.streetNumber}` : street);
      }
      // Türkiye'de: region = il, subregion = ilçe, district = mahalle/semt
      if (!known && geocoded && !manualEdited.current) {
        setManual({
          city: geocoded.region ?? geocoded.city ?? '',
          district: geocoded.subregion ?? geocoded.city ?? '',
          neighborhood: geocoded.district ?? '',
        });
      }
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [coords, placed]);

  const area: AreaState =
    !coords || !placed
      ? { status: 'idle' }
      : resolved?.coords !== coords
        ? { status: 'loading' }
        : resolved.area
          ? { status: 'known', area: resolved.area }
          : { status: 'unknown' };

  const moveTo = (region: Region) => setCoords({ latitude: region.latitude, longitude: region.longitude });
  const editManual = (key: keyof typeof manual) => (value: string) => {
    manualEdited.current = true;
    setManual((m) => ({ ...m, [key]: value }));
  };

  const areaReady =
    area.status === 'known' ||
    (area.status === 'unknown' && manual.city.trim().length > 0 && manual.district.trim().length > 0);
  const valid = name.trim().length >= 2 && !!cuisine && !!coords && placed && areaReady;

  const save = async () => {
    if (!valid || !cuisine || !coords) return;
    setSaving(true);
    const where = area.status === 'known' ? area.area : manual;
    try {
      await createPlace({
        name,
        cuisine,
        city: where.city,
        district: where.district,
        neighborhood: where.neighborhood,
        address,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      haptics.success();
      // Arama sonuçlarında yeni mekân hemen görünsün
      queryClient.invalidateQueries({ queryKey: ['search', 'places'] });
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      router.back();
    } catch (error) {
      showError(error, t('failures.placeAdd'));
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Field label={t('newPlace.name')}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('newPlace.namePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            autoFocus={!params.ad}
            maxLength={120}
            style={[typography.body, styles.input]}
          />
        </Field>

        <Field label={t('newPlace.kind')}>
          <View style={styles.chips}>
            {CUISINES.map((c) => {
              const active = c.name === cuisine;
              return (
                <PressableScale
                  key={c.name}
                  haptic={false}
                  onPress={() => {
                    haptics.select();
                    setCuisine(c.name);
                  }}
                  style={[styles.chip, active && styles.chipActive]}>
                  <SymbolView name={c.icon} tintColor={active ? colors.onPrimary : colors.primary} size={14} />
                  <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
                    {cuisineLabel(c.name)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Field>

        <Field label={t('newPlace.location')} hint={t('newPlace.locationHint')}>
          <View style={styles.map} onTouchStart={() => setPlaced(true)}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={DEFAULT_REGION}
              onRegionChangeComplete={moveTo}
              showsUserLocation
            />
            {/* Sabit iğne: haritanın ortası seçilen konumdur */}
            <View pointerEvents="none" style={styles.pinWrap}>
              <View style={styles.pin}>
                <SymbolView name="fork.knife" tintColor={colors.onPrimary} size={14} />
              </View>
            </View>
          </View>
          {placed && <AreaCard state={area} />}
        </Field>

        {area.status === 'unknown' && (
          <>
            <Text variant="footnote" color={colors.textSecondary}>
              {t('newPlace.areaManualHint')}
            </Text>
            <View style={styles.row}>
              <Field label={t('newPlace.city')} style={styles.flex}>
                <TextInput
                  value={manual.city}
                  onChangeText={editManual('city')}
                  placeholder={t('newPlace.cityPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  style={[typography.body, styles.input]}
                />
              </Field>
              <Field label={t('newPlace.district')} style={styles.flex}>
                <TextInput
                  value={manual.district}
                  onChangeText={editManual('district')}
                  placeholder={t('newPlace.districtPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  style={[typography.body, styles.input]}
                />
              </Field>
            </View>
            <Field label={t('newPlace.neighborhood')} hint={t('common.optional')}>
              <TextInput
                value={manual.neighborhood}
                onChangeText={editManual('neighborhood')}
                placeholder={t('newPlace.neighborhoodPlaceholder')}
                placeholderTextColor={colors.textTertiary}
                style={[typography.body, styles.input]}
              />
            </Field>
          </>
        )}

        <Field label={t('newPlace.address')} hint={t('common.optional')}>
          <TextInput
            value={address}
            onChangeText={(value) => {
              addressEdited.current = true;
              setAddress(value);
            }}
            placeholder={t('newPlace.addressPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            maxLength={120}
            style={[typography.body, styles.input]}
          />
        </Field>
      </ScrollView>

      <Animated.View style={[styles.footer, footerStyle]}>
        <Button title={t('newPlace.add')} onPress={save} disabled={!valid} loading={saving} />
      </Animated.View>
    </View>
  );
}

/** İğnenin semti: "Caferağa, Kadıköy · İstanbul" */
function AreaCard({ state }: { state: AreaState }) {
  const { t } = useTranslation();
  if (state.status === 'unknown') return null;
  const loading = state.status !== 'known';
  return (
    <View style={styles.areaCard}>
      <SymbolView name="mappin.circle.fill" tintColor={colors.primary} size={22} />
      <View style={styles.flex}>
        <Text variant="headline" numberOfLines={1} color={loading ? colors.textSecondary : colors.text}>
          {loading ? t('newPlace.areaLoading') : `${placeArea(state.area)} · ${state.area.city}`}
        </Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {t('newPlace.areaHint')}
        </Text>
      </View>
    </View>
  );
}

function Field({
  label,
  hint,
  style,
  children,
}: {
  label: string;
  hint?: string;
  style?: object;
  children: ReactNode;
}) {
  return (
    <View style={[styles.field, style]}>
      <View style={styles.fieldHeader}>
        <Text variant="headline">{label}</Text>
        {hint && (
          <Text variant="footnote" color={colors.textSecondary}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  form: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  field: {
    gap: spacing.sm,
  },
  fieldHeader: {
    gap: 2,
  },
  input: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  map: {
    height: 200,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  pinWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
  areaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  flex: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
