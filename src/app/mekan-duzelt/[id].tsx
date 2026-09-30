import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Region } from 'react-native-maps';
import Animated from 'react-native-reanimated';
import { SymbolView } from '@/components/symbol';

import { suggestPlaceCorrection } from '@/api/content';
import { showError } from '@/api/errors';
import { AppMapView } from '@/components/app-map';
import { SettingsGroup, SettingsRow } from '@/components/settings-list';
import { Button, ErrorView, LoadingView, Text } from '@/components/ui';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useEntityRetry, usePlace } from '@/data/entities';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { showAlert } from '@/lib/dialog';
import { distanceKm, type Coords } from '@/lib/geo';
import { haptics } from '@/lib/haptics';
import { formatPhone, normalizePhoneInput, normalizeWebsiteInput, websiteLabel } from '@/lib/place';
import { keys, queryClient } from '@/lib/query-client';
import type { CorrectionField } from '@/types/database';

const FIELDS: CorrectionField[] = ['phone', 'address', 'website', 'name', 'location', 'closed'];
/** Kaldırılabilen bilgiler (ad ve konum her mekânda olmak zorunda) */
const REMOVABLE: CorrectionField[] = ['phone', 'address', 'website'];

/**
 * "Bilgi yanlış mı?": mekânın telefonunu, adresini, web sitesini, adını, konumunu düzeltmeyi ya da
 * kapandığını bildirmeyi önerir. Değişiklik tek bildirimle değil, bağımsız ikinci bir bildirimle
 * ya da yönetici onayıyla uygulanır (veritabanında `suggest_place_correction`).
 */
export default function FixPlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const place = usePlace(id);
  const retryPlace = useEntityRetry('place', id);
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();

  const [field, setField] = useState<CorrectionField>();
  const [text, setText] = useState('');
  const [remove, setRemove] = useState(false);
  const [coords, setCoords] = useState<Coords>();
  // Harita yalnızca kullanıcı dokunup kaydırdıysa öneri sayılır (açılıştaki bölge değişimi değil)
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);

  if (!place) {
    if (place === undefined && !retryPlace) return <LoadingView style={styles.container} />;
    return (
      <ErrorView
        message={place === null ? t('place.notFound') : undefined}
        onRetry={retryPlace ?? undefined}
        style={styles.container}
      />
    );
  }

  const currentValue: Partial<Record<CorrectionField, string | undefined>> = {
    phone: place.phone && formatPhone(place.phone),
    address: place.address,
    website: place.website && websiteLabel(place.website),
    name: place.name,
  };

  const choose = (next: CorrectionField) => {
    haptics.select();
    setField(next);
    setText('');
    setRemove(false);
    setCoords(undefined);
    setTouched(false);
  };

  /** Gönderilecek değer; geçersizse hata metni */
  const prepared = (): { value?: string; error?: string } => {
    if (!field || field === 'closed' || field === 'location') return {};
    if (remove) return { value: '' };
    if (field === 'phone') {
      const phone = normalizePhoneInput(text);
      return phone ? { value: phone } : { error: t('fixPlace.invalidPhone') };
    }
    if (field === 'website') {
      const website = normalizeWebsiteInput(text);
      return website ? { value: website } : { error: t('fixPlace.invalidWebsite') };
    }
    return { value: text.trim() };
  };

  const ready =
    !!field &&
    (field === 'closed' ||
      (field === 'location' && touched && !!coords && distanceKm(coords, place) > 0.005) ||
      remove ||
      text.trim().length >= (field === 'name' ? 2 : 1));

  const send = async () => {
    if (!field || !ready) return;
    const { value, error } = prepared();
    if (error) {
      haptics.warning();
      showAlert(t('errors.title'), error);
      return;
    }
    setSending(true);
    try {
      const result = await suggestPlaceCorrection(place.id, field, { value, coords });
      haptics.success();
      if (result === 'applied') await queryClient.invalidateQueries({ queryKey: keys.place(place.id) });
      showAlert(
        result === 'applied' ? t('fixPlace.appliedTitle') : t('fixPlace.pendingTitle'),
        result === 'applied' ? t('fixPlace.appliedText') : t('fixPlace.pendingText'),
        [{ text: t('common.ok'), onPress: () => router.back() }],
      );
    } catch (e) {
      showError(e);
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="footnote" color={colors.textSecondary}>
          {t('fixPlace.explain')}
        </Text>

        <SettingsGroup title={t('fixPlace.question')}>
          {FIELDS.map((f, i) => (
            <SettingsRow
              key={f}
              label={t(`fixPlace.fields.${f}`)}
              checked={field === f}
              onPress={() => choose(f)}
              last={i === FIELDS.length - 1}
            />
          ))}
        </SettingsGroup>

        {field && field !== 'closed' && field !== 'location' && (
          <View style={styles.section}>
            <Text variant="footnote" color={colors.textSecondary}>
              {t('fixPlace.current', { value: currentValue[field] || t('fixPlace.none') })}
            </Text>
            {!remove && (
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={
                  field === 'phone'
                    ? t('fixPlace.phonePlaceholder')
                    : field === 'address'
                      ? t('fixPlace.addressPlaceholder')
                      : field === 'website'
                        ? t('fixPlace.websitePlaceholder')
                        : t('fixPlace.correct')
                }
                placeholderTextColor={colors.textTertiary}
                keyboardType={field === 'phone' ? 'phone-pad' : field === 'website' ? 'url' : 'default'}
                autoCapitalize={field === 'website' ? 'none' : 'sentences'}
                autoCorrect={field !== 'website'}
                maxLength={field === 'website' ? 300 : 120}
                autoFocus
                style={[typography.body, styles.input]}
              />
            )}
            {REMOVABLE.includes(field) && !!currentValue[field] && (
              <SettingsGroup>
                <SettingsRow label={t('fixPlace.remove')} checked={remove} onPress={() => setRemove((r) => !r)} last />
              </SettingsGroup>
            )}
          </View>
        )}

        {field === 'location' && (
          <View style={styles.section}>
            <Text variant="footnote" color={colors.textSecondary}>
              {t('fixPlace.locationHint')}
            </Text>
            <View style={styles.map} onTouchStart={() => setTouched(true)}>
              <AppMapView
                style={StyleSheet.absoluteFill}
                initialRegion={{ latitude: place.latitude, longitude: place.longitude, latitudeDelta: 0.003, longitudeDelta: 0.003 }}
                onRegionChangeComplete={(region: Region) => setCoords({ latitude: region.latitude, longitude: region.longitude })}
                showsUserLocation
              />
              <View pointerEvents="none" style={styles.pinWrap}>
                <View style={styles.pin}>
                  <SymbolView name="fork.knife" tintColor={colors.onPrimary} size={14} />
                </View>
              </View>
            </View>
          </View>
        )}

        {field === 'closed' && (
          <Text variant="subhead" color={colors.textSecondary}>
            {t('fixPlace.closedText')}
          </Text>
        )}
      </ScrollView>

      <Animated.View style={[styles.footer, footerStyle]}>
        <Button title={t('fixPlace.send')} onPress={send} disabled={!ready} loading={sending} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  input: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  map: {
    height: 260,
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
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
