import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Divider, PressableScale, SearchField, Text } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { schoolById, searchSchools, type School } from '@/data/schools';
import { haptics } from '@/lib/haptics';
import { useAppStore } from '@/store/app-store';

/** Profile okul (üniversite) ekle / değiştir */
export default function PickSchoolScreen() {
  const { profile, dispatch } = useAppStore();
  const [query, setQuery] = useState('');
  const current = schoolById(profile?.schoolId);

  // Seçili okul en üstte, sonra arama sonuçları
  const results = useMemo(() => {
    const found = searchSchools(query);
    return current && !query ? [current, ...found.filter((s) => s.id !== current.id)] : found;
  }, [query, current]);

  const select = (school?: School) => {
    haptics.success();
    dispatch({ type: 'updateProfile', patch: { schoolId: school?.id } });
    router.back();
  };

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <Text variant="subhead" color={colors.textSecondary}>
          Okulunu eklersen okuluna özel liderlik tablosunda yer alırsın.
        </Text>
        <SearchField value={query} onChangeText={setQuery} placeholder="Üniversite, kısaltma ya da şehir (ör. ODTÜ)" autoFocus />
      </View>
      <FlatList
        data={results}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 40 + spacing.md} />}
        ListEmptyComponent={
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            “{query}” ile eşleşen okul bulunamadı.
          </Text>
        }
        ListFooterComponent={
          current ? (
            <Button title="Okulu profilimden kaldır" variant="ghost" onPress={() => select(undefined)} style={styles.remove} />
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
                  {[item.short, item.city, item.type === 'state' ? 'Devlet' : 'Vakıf'].filter(Boolean).join(' · ')}
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
