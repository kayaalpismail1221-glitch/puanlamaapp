import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Alert, Linking, ScrollView, Share, StyleSheet, Switch, View } from 'react-native';

import { Avatar, PressableScale, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { areaLabel } from '@/lib/feed';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** Ayarlar: iOS gruplu liste düzeni */
export default function SettingsScreen() {
  const { profile, feedArea, hapticsEnabled, dispatch } = useAppStore();

  const logout = () =>
    Alert.alert('Çıkış yap', 'Tüm yerel veriler silinir ve karşılama ekranına dönersin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Çıkış yap', style: 'destructive', onPress: () => dispatch({ type: 'reset' }) },
    ]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      {/* Hesap kartı */}
      <Group>
        <PressableScale onPress={() => router.push('/profil-duzenle')} scaleTo={0.99} style={styles.account}>
          <Avatar uri={profile?.avatarUri} name={profile?.name ?? '?'} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="headline">{profile?.name}</Text>
            <Text variant="subhead" color={colors.textSecondary}>
              @{profile?.username} · Profili düzenle
            </Text>
          </View>
          <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={14} weight="semibold" />
        </PressableScale>
      </Group>

      <Group title="Tercihler">
        <Row icon="location.fill" label="Feed bölgesi" value={areaLabel(feedArea)} onPress={() => router.push('/konum-sec')} />
        <Row
          icon="iphone.radiowaves.left.and.right"
          label="Titreşim"
          accessory={
            <Switch
              value={hapticsEnabled}
              onValueChange={(v) => {
                dispatch({ type: 'setHapticsEnabled', enabled: v });
                if (v) haptics.success();
              }}
              trackColor={{ true: colors.primary }}
            />
          }
        />
        <Row icon="gear" label="Konum ve fotoğraf izinleri" onPress={() => Linking.openSettings()} last />
      </Group>

      <Group title="Topluluk">
        <Row icon="person.badge.plus" label="Arkadaş bul" onPress={() => router.push('/arkadas-bul')} />
        <Row icon="trophy" label="Liderlik tablosu" onPress={() => router.push('/siralama')} />
        <Row
          icon="square.and.arrow.up"
          label="Puanla’yı arkadaşlarına öner"
          onPress={() => Share.share({ message: 'Gittiğim her yeri Puanla’da puanlıyorum, sen de gel! 🍽️' })}
          last
        />
      </Group>

      <Group title="Hakkında">
        <Row icon="info.circle" label="Sürüm" value={Constants.expoConfig?.version ?? '1.0.0'} last />
      </Group>

      <Group>
        <PressableScale onPress={logout} scaleTo={0.99} style={styles.logout}>
          <Text variant="body" color={colors.danger}>
            Çıkış yap
          </Text>
        </PressableScale>
      </Group>
    </ScrollView>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      {title && (
        <Text variant="footnote" color={colors.textSecondary} style={styles.groupTitle}>
          {title.toLocaleUpperCase('tr')}
        </Text>
      )}
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  accessory,
  onPress,
  last,
}: {
  icon: SFSymbol;
  label: string;
  value?: string;
  accessory?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.99} haptic={!!onPress} style={styles.row}>
      <View style={styles.rowIcon}>
        <SymbolView name={icon} tintColor={colors.onPrimary} size={15} />
      </View>
      <View style={[styles.rowBody, !last && styles.rowDivider]}>
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        {value && (
          <Text variant="body" color={colors.textSecondary} numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        )}
        {accessory}
        {onPress && !accessory && (
          <SymbolView name="chevron.right" tintColor={colors.textTertiary} size={13} weight="semibold" />
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    paddingHorizontal: spacing.lg,
  },
  groupBody: {
    borderRadius: radius.card,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
    backgroundColor: colors.background,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.button - 4,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingRight: spacing.lg,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  value: {
    maxWidth: 160,
  },
  logout: {
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
  },
});
