import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Divider, PressableScale, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { schoolById, searchSchools, type School } from '@/data/schools';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** Profile okul (üniversite) ekle / değiştir */
export default function PickSchoolScreen() {
  const { profile, actions } = useAppStore();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const current = schoolById(profile?.schoolId);

  // Seçili okul en üstte, sonra arama sonuçları
  const results = useMemo(() => {
    const found = searchSchools(query);
    return current && !query ? [current, ...found.filter((s) => s.id !== current.id)] : found;
  }, [query, current]);

  const select = (school?: School) => {
    haptics.success();
    actions.updateProfile({ schoolId: school?.id });
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <Text variant="subhead" color={colors.textSecondary}>
          {t('school.intro')}
        </Text>
        <SearchField value={query} onChangeText={setQuery} placeholder={t('school.placeholder')} autoFocus />
      </View>
      <FlatList
        data={results}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 40 + spacing.md} />}
        ListEmptyComponent={
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            {t('school.noMatch', { query })}
          </Text>
        }
        ListFooterComponent={
          current ? (
            <Button title={t('school.remove')} variant="ghost" onPress={() => select(undefined)} style={styles.remove} />
          ) : null
        }
        renderItem={({ item }) => {
          const active = item.id === current?.id;
          return (
            <PressableScale onPress={() => select(item)} scaleTo={0.99} haptic={false} style={styles.row}>
              <View style={[styles.icon, active && styles.iconActive]}>
                <SymbolView name="graduationcap.fill" tintColor={active ? colors.onPrimary : colors.primary} size={18} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="headline" numberOfLines={2}>
                  {item.name}
                </Text>
                <Text variant="footnote" color={colors.textSecondary}>
                  {[item.short, item.city, item.type === 'state' ? t('school.state') : t('school.foundation')].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {active && <SymbolView name="checkmark" tintColor={colors.primary} size={16} weight="bold" />}
            </PressableScale>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  search: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: {
    backgroundColor: colors.primary,
  },
  empty: {
    padding: spacing.xl,
  },
  remove: {
    margin: spacing.lg,
  },
});
