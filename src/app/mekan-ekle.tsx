import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from '@/components/symbol';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import Animated from 'react-native-reanimated';

import { createPlace, fetchAreaAt, searchPlaces, type AreaAt } from '@/api/content';
import { showError } from '@/api/errors';
import { PlaceRow } from '@/components/place-row';
import { Button, Divider, PressableScale, Text } from '@/components/ui';
import { CUISINES, cuisineLabel } from '@/constants/cuisines';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { addressFromGeocode, formatStreetAddress, hasHouseNumber } from '@/lib/address';
import { showAlert } from '@/lib/dialog';
import { DEFAULT_REGION, distanceKm, formatDistance, type Coords } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { placeArea, similarPlaceNames } from '@/lib/place';
import { deliverPlaceChoice } from '@/lib/place-choice';
import { queryClient } from '@/lib/query-client';
import type { Cuisine, Place } from '@/types';

/** İğnenin durduğu yer: bilinen bölgede (İstanbul) semt veritabanından, dışında kullanıcıdan */
type AreaState = { status: 'idle' | 'loading' } | { status: 'known'; area: AreaAt } | { status: 'unknown' };

/**
 * İğne nasıl yerleşti: `gps` = açılışta kullanıcının bulunduğu yere kondu (henüz onaylanmadı; mekânda
 * olmayan biri evinin konumunu kaydetmesin), `set` = kullanıcı haritayı kaydırdı, adres aradı ya da
 * "Şu an buradayım" dedi. Yalnızca `set` kaydedilebilir.
 */
type Pin = 'none' | 'gps' | 'set';

type AddressHit = { coords: Coords; label: string; detail: string };

/** Adres ile iğne bundan uzaksa kayıt durur (kapı numaralı adreslerde) */
const ADDRESS_TOLERANCE_KM = 0.25;
/** Kopya uyarısı için iğnenin çevresi */
const DUPLICATE_RADIUS_KM = 0.15;

/**
 * Veritabanında olmayan mekânı ekleme. Doğruluk için:
 * 1. İğne açıkça yerleştirilir (GPS konumu onaylanır ya da harita/adres aramasıyla taşınır).
 * 2. İl/ilçe/mahalle iğneden hesaplanır, elle yazılamaz (İstanbul dışında kullanıcı yazar).
 * 3. Sokak adresi Apple'dan önerilir, veri setindeki biçime getirilir; kapı numarası varsa iğneyle karşılaştırılır.
 * 4. Yakında benzer adlı mekân varsa "Bunlardan biri mi?" diye sorulur; seçilirse yeni kayıt açılmaz.
 */
export default function AddPlaceScreen() {
  const params = useLocalSearchParams<{ ad?: string; istek?: string }>();
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();
  const mapRef = useRef<MapView>(null);
  const addressInput = useRef<TextInput>(null);

  const [name, setName] = useState(params.ad ?? '');
  const [cuisine, setCuisine] = useState<Cuisine>();
  const [coords, setCoords] = useState<Coords>();
  const [gps, setGps] = useState<Coords>();
  const [pin, setPinState] = useState<Pin>('none');
  const pinRef = useRef<Pin>('none');
  const setPin = (next: Pin) => {
    pinRef.current = next;
    setPinState(next);
  };
  // Son çözümlenen konum ve semti; iğne başka yerdeyse "bulunuyor" sayılır
  const [resolved, setResolved] = useState<{ coords: Coords; area: AreaAt | null }>();
  const [address, setAddress] = useState('');
  const addressEdited = useRef(false);
  // Bilinmeyen bölgede elle girilen il/ilçe/semt
  const [manual, setManual] = useState({ city: '', district: '', neighborhood: '' });
  const manualEdited = useRef(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AddressHit[]>();
  const [searching, setSearching] = useState(false);
  const [duplicates, setDuplicates] = useState<Place[]>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setGps(point);
      // Kullanıcı bu arada iğneyi kendisi yerleştirdiyse geç gelen GPS onu geri çekmez
      if (pinRef.current !== 'none') return;
      setCoords(point);
      setPin('gps');
      mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 400);
    })().catch(() => {});
  }, []);

  // İğne durunca (kısa gecikmeyle) semti ve adres önerisini bul; eski yanıtlar yenisinin üstüne yazmaz
  useEffect(() => {
    if (!coords || pin === 'none') return;
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
      if (geocoded && !addressEdited.current) setAddress(addressFromGeocode(geocoded));
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
  }, [coords, pin]);

  const area: AreaState =
    !coords || pin === 'none'
      ? { status: 'idle' }
      : resolved?.coords !== coords
        ? { status: 'loading' }
        : resolved.area
          ? { status: 'known', area: resolved.area }
          : { status: 'unknown' };
  const where = area.status === 'known' ? area.area : manual;

  const moveTo = (region: Region) => setCoords({ latitude: region.latitude, longitude: region.longitude });
  const placePin = (point: Coords) => {
    setCoords(point);
    setPin('set');
    mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.003, longitudeDelta: 0.003 }, 400);
  };
  const editManual = (key: keyof typeof manual) => (value: string) => {
    manualEdited.current = true;
    setManual((m) => ({ ...m, [key]: value }));
  };

  /** Apple ile adres/semt arama; önce İstanbul içinde, bulunamazsa her yerde */
  const searchAddress = async () => {
    const q = query.trim();
    if (q.length < 3) return;
    setSearching(true);
    try {
      let points = await Location.geocodeAsync(`${q}, İstanbul, Türkiye`).catch(() => []);
      if (!points.length) points = await Location.geocodeAsync(q).catch(() => []);
      const found = await Promise.all(
        points.slice(0, 5).map(async (p) => {
          const point = { latitude: p.latitude, longitude: p.longitude };
          const place = (await Location.reverseGeocodeAsync(point).catch(() => []))[0];
          return {
            coords: point,
            label: (place && addressFromGeocode(place)) || place?.name || q,
            detail: [place?.district, place?.subregion ?? place?.city].filter(Boolean).join(', '),
          };
        }),
      );
      setHits(found);
    } finally {
      setSearching(false);
    }
  };

  const chooseHit = (hit: AddressHit) => {
    haptics.select();
    placePin(hit.coords);
    // Aranan adres kapı numarasıyla bulunduysa kullanıcının seçimi esas; iğne ince ayarı adresi ezmesin
    if (hasHouseNumber(hit.label)) {
      addressEdited.current = true;
      setAddress(hit.label);
    }
    setHits(undefined);
    setQuery('');
  };

  const areaReady =
    area.status === 'known' ||
    (area.status === 'unknown' && manual.city.trim().length > 0 && manual.district.trim().length > 0);
  const valid = name.trim().length >= 2 && !!cuisine && !!coords && pin === 'set' && areaReady;

  /** Yeni eklenen ya da mevcut olduğu anlaşılan mekânı çağıran ekrana teslim eder */
  const finish = (place: Place) => {
    router.back();
    if (params.istek) setTimeout(() => deliverPlaceChoice(params.istek, place), 300);
  };

  /** Kapı numaralı adres iğneden uzak bir yeri gösteriyorsa kaydı durdurur */
  const addressMatchesPin = async (point: Coords): Promise<boolean> => {
    const line = formatStreetAddress(address);
    if (!hasHouseNumber(line)) return true;
    const lookup = [line, where.neighborhood, where.district, where.city].filter(Boolean).join(', ');
    const points = await Location.geocodeAsync(lookup).catch(() => []);
    // Apple adresi bulamazsa karşılaştırılamaz; kullanıcının yazdığına güvenilir
    if (!points.length) return true;
    const nearest = points
      .map((p) => ({ coords: { latitude: p.latitude, longitude: p.longitude }, km: distanceKm(point, p) }))
      .sort((a, b) => a.km - b.km)[0]!;
    if (nearest.km <= ADDRESS_TOLERANCE_KM) return true;
    haptics.warning();
    showAlert(t('newPlace.mismatchTitle'), t('newPlace.mismatchText', { distance: formatDistance(nearest.km) }), [
      { text: t('newPlace.fixAddress'), style: 'cancel', onPress: () => addressInput.current?.focus() },
      { text: t('newPlace.moveToAddress'), onPress: () => placePin(nearest.coords) },
    ]);
    return false;
  };

  const create = async () => {
    if (!cuisine || !coords) return;
    setSaving(true);
    try {
      if (!(await addressMatchesPin(coords))) {
        setSaving(false);
        return;
      }
      const place = await createPlace({
        name,
        cuisine,
        city: where.city,
        district: where.district,
        neighborhood: where.neighborhood,
        address: formatStreetAddress(address),
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      haptics.success();
      // Arama sonuçlarında yeni mekân hemen görünsün
      queryClient.invalidateQueries({ queryKey: ['search', 'places'] });
      queryClient.invalidateQueries({ queryKey: ['areas'] });
      finish(place);
    } catch (error) {
      showError(error, t('failures.placeAdd'));
      setSaving(false);
    }
  };

  /** Önce yakında aynı mekân var mı bakılır; varsa kullanıcı seçer */
  const save = async () => {
    if (!valid || !coords) return;
    setSaving(true);
    const nearby = await searchPlaces(name.trim(), coords).catch(() => []);
    const similar = nearby.filter(
      (p) => distanceKm(coords, p) <= DUPLICATE_RADIUS_KM && similarPlaceNames(p.name, name),
    );
    if (similar.length) {
      haptics.warning();
      setSaving(false);
      setDuplicates(similar);
      return;
    }
    await create();
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
          <View style={styles.searchRow}>
            <TextInput
              value={query}
              onChangeText={(v) => {
                setQuery(v);
                setHits(undefined);
              }}
              onSubmitEditing={searchAddress}
              placeholder={t('newPlace.searchPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              style={[typography.body, styles.input, styles.flex]}
            />
            <Button
              title={t('newPlace.search')}
              size="sm"
              variant="secondary"
              onPress={searchAddress}
              loading={searching}
              disabled={query.trim().length < 3}
            />
          </View>
          {hits && (
            <View style={styles.hits}>
              {hits.length === 0 ? (
                <Text variant="footnote" color={colors.textSecondary} style={styles.hit}>
                  {t('newPlace.searchNoResult')}
                </Text>
              ) : (
                hits.map((hit, i) => (
                  <View key={`${hit.coords.latitude},${hit.coords.longitude}`}>
                    {i > 0 && <Divider inset={spacing.lg} />}
                    <PressableScale onPress={() => chooseHit(hit)} scaleTo={0.98} style={styles.hit}>
                      <SymbolView name="mappin.and.ellipse" tintColor={colors.primary} size={16} />
                      <View style={styles.flex}>
                        <Text variant="body" numberOfLines={1}>
                          {hit.label}
                        </Text>
                        {!!hit.detail && (
                          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
                            {hit.detail}
                          </Text>
                        )}
                      </View>
                    </PressableScale>
                  </View>
                ))
              )}
            </View>
          )}

          <View style={styles.map} onTouchStart={() => setPin('set')}>
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

          {pin === 'gps' && gps && coords && distanceKm(gps, coords) < 0.02 && (
            <View style={styles.confirm}>
              <Text variant="footnote" color={colors.textSecondary}>
                {t('newPlace.confirmHint')}
              </Text>
              <Button
                title={t('newPlace.confirmHere')}
                icon="location.fill"
                size="sm"
                variant="secondary"
                onPress={() => {
                  haptics.select();
                  setPin('set');
                }}
              />
            </View>
          )}
          {pin !== 'none' && <AreaCard state={area} />}
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

        <Field label={t('newPlace.address')} hint={t('newPlace.addressHint')}>
          <TextInput
            ref={addressInput}
            value={address}
            onChangeText={(value) => {
              addressEdited.current = true;
              setAddress(value);
            }}
            onBlur={() => setAddress((a) => formatStreetAddress(a))}
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

      <Modal
        visible={!!duplicates}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDuplicates(undefined)}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text variant="title2">{t('newPlace.duplicatesTitle')}</Text>
            <Text variant="subhead" color={colors.textSecondary}>
              {t('newPlace.duplicatesText')}
            </Text>
          </View>
          <ScrollView>
            {duplicates?.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <Divider inset={spacing.lg + 52 + spacing.md} />}
                <PlaceRow
                  place={p}
                  onPress={() => {
                    haptics.success();
                    setDuplicates(undefined);
                    finish(p);
                  }}
                  trailing={
                    <Text variant="footnote" color={colors.textSecondary}>
                      {coords ? formatDistance(distanceKm(coords, p)) : ''}
                    </Text>
                  }
                />
              </View>
            ))}
          </ScrollView>
          <View style={styles.sheetFooter}>
            <Button
              title={t('newPlace.notDuplicate')}
              variant="secondary"
              onPress={() => {
                setDuplicates(undefined);
                create();
              }}
            />
          </View>
        </View>
      </Modal>
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  hits: {
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  map: {
    height: 220,
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
  confirm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
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
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sheetHeader: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  sheetFooter: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
