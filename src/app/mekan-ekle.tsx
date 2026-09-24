import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import MapView, { type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createPlace } from '@/api/content';
import { showError } from '@/api/errors';
import { Button, PressableScale, Text } from '@/components/ui';
import { CUISINES } from '@/constants/cuisines';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { priceLabel } from '@/lib/format';
import { DEFAULT_REGION, type Coords } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { queryClient } from '@/lib/query-client';
import type { Cuisine, Place } from '@/types';

const PRICE_LEVELS: Place['priceLevel'][] = [1, 2, 3, 4];

/**
 * Veritabanında olmayan mekânı ekleme.
 * Konum haritadan seçilir (varsayılan: kullanıcının bulunduğu yer); il, ilçe ve semt konumdan doldurulur.
 */
export default function AddPlaceScreen() {
  const params = useLocalSearchParams<{ ad?: string }>();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const [name, setName] = useState(params.ad ?? '');
  const [cuisine, setCuisine] = useState<Cuisine>();
  const [priceLevel, setPriceLevel] = useState<Place['priceLevel']>(2);
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
        priceLevel,
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
      showError(error, 'Mekân eklenemedi');
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Field label="Mekânın adı">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ör. Kadıköy Balıkçısı"
            placeholderTextColor={colors.textTertiary}
            autoFocus={!params.ad}
            maxLength={120}
            style={[typography.body, styles.input]}
          />
        </Field>

        <Field label="Ne tür bir yer?">
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
                    {c.name}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Field>

        <Field label="Fiyat seviyesi">
          <View style={styles.prices}>
            {PRICE_LEVELS.map((level) => {
              const active = level === priceLevel;
              return (
                <PressableScale
                  key={level}
                  haptic={false}
                  onPress={() => {
                    haptics.select();
                    setPriceLevel(level);
                  }}
                  style={[styles.price, active && styles.chipActive]}>
                  <Text variant="headline" color={active ? colors.onPrimary : colors.primary}>
                    {priceLabel(level)}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Field>

        <Field label="Konum" hint="Haritayı kaydırarak iğneyi mekânın üstüne getir">
          <View style={styles.map}>
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
          <Button
            title="Bu konumun adresini doldur"
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
          <Field label="İl" style={styles.flex}>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="İstanbul"
              placeholderTextColor={colors.textTertiary}
              style={[typography.body, styles.input]}
            />
          </Field>
          <Field label="İlçe" style={styles.flex}>
            <TextInput
              value={district}
              onChangeText={setDistrict}
              placeholder="Kadıköy"
              placeholderTextColor={colors.textTertiary}
              style={[typography.body, styles.input]}
            />
          </Field>
        </View>
        <Field label="Semt" hint="İsteğe bağlı">
          <TextInput
            value={neighborhood}
            onChangeText={setNeighborhood}
            placeholder="Moda"
            placeholderTextColor={colors.textTertiary}
            style={[typography.body, styles.input]}
          />
        </Field>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <Button title="Mekânı ekle" onPress={save} disabled={!valid} loading={saving} />
      </View>
    </KeyboardAvoidingView>
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
  prices: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  price: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: colors.surface,
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
