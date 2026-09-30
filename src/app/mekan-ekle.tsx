import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import Animated from 'react-native-reanimated';

import { createPlace } from '@/api/content';
import { showError } from '@/api/errors';
import { Icon } from '@/components/icon';
import { Button, PressableScale, Text } from '@/components/ui';
import { CUISINES, cuisineLabel } from '@/constants/cuisines';
import { mapBaseProps } from '@/constants/map';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { DEFAULT_REGION, type Coords } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { queryClient } from '@/lib/query-client';
import type { Cuisine } from '@/types';

/**
 * Veritabanında olmayan mekânı ekleme.
 * Konum haritadan seçilir (varsayılan: kullanıcının bulunduğu yer); il, ilçe ve semt konumdan doldurulur.
 */
export default function AddPlaceScreen() {
  const params = useLocalSearchParams<{ ad?: string }>();
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();
  const mapRef = useRef<MapView>(null);

  const [name, setName] = useState(params.ad ?? '');
  const [cuisine, setCuisine] = useState<Cuisine>();
  const [coords, setCoords] = useState<Coords>();
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [saving, setSaving] = useState(false);

  /** Konumdan il / ilçe / semt önerisi (kullanıcı değiştirmediyse) */
  const fillAddress = async (point: Coords) => {
    try {
      const [address] = await Location.reverseGeocodeAsync(point);
      if (!address) return;
      // Türkiye'de: region = il, subregion = ilçe, district = mahalle/semt
      setCity((c) => c || address.region || address.city || '');
      setDistrict((d) => d || address.subregion || address.city || '');
      setNeighborhood((n) => n || address.district || '');
    } catch {
      // Adres bulunamazsa kullanıcı elle yazar
    }
  };

  useEffect(() => {
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      setCoords(point);
      mapRef.current?.animateToRegion({ ...point, latitudeDelta: 0.004, longitudeDelta: 0.004 }, 400);
      fillAddress(point);
    })().catch(() => {});
    // Yalnızca açılışta
  }, []);

  const moveTo = (region: Region) => setCoords({ latitude: region.latitude, longitude: region.longitude });

  const valid =
    name.trim().length >= 2 && !!cuisine && !!coords && city.trim().length > 0 && district.trim().length > 0;

  const save = async () => {
    if (!valid || !cuisine || !coords) return;
    setSaving(true);
    try {
      await createPlace({
        name,
        cuisine,
        city,
        district,
        neighborhood,
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
                  <Icon name={c.icon} tintColor={active ? colors.onPrimary : colors.primary} size={14} />
                  <Text variant="subhead" color={active ? colors.onPrimary : colors.text}>
                    {cuisineLabel(c.name)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Field>

        <Field label={t('newPlace.location')} hint={t('newPlace.locationHint')}>
          <View style={styles.map}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={DEFAULT_REGION}
              onRegionChangeComplete={moveTo}
              showsUserLocation
              {...mapBaseProps}
            />
            {/* Sabit iğne: haritanın ortası seçilen konumdur */}
            <View pointerEvents="none" style={styles.pinWrap}>
              <View style={styles.pin}>
                <Icon name="fork.knife" tintColor={colors.onPrimary} size={14} />
              </View>
            </View>
          </View>
          <Button
            title={t('newPlace.fillAddress')}
            variant="ghost"
            size="sm"
            onPress={() => {
              if (!coords) return;
              setCity('');
              setDistrict('');
              setNeighborhood('');
              fillAddress(coords);
            }}
          />
        </Field>

        <View style={styles.row}>
          <Field label={t('newPlace.city')} style={styles.flex}>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder={t('newPlace.cityPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[typography.body, styles.input]}
            />
          </Field>
          <Field label={t('newPlace.district')} style={styles.flex}>
            <TextInput
              value={district}
              onChangeText={setDistrict}
              placeholder={t('newPlace.districtPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[typography.body, styles.input]}
            />
          </Field>
        </View>
        <Field label={t('newPlace.neighborhood')} hint={t('common.optional')}>
          <TextInput
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder={t('newPlace.neighborhoodPlaceholder')}
            placeholderTextColor={colors.textTertiary}
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
