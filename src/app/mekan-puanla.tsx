import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PlaceSearchList } from '@/components/place-picker';
import { ScoreBadge, SearchField } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/app-store';

/** Puanlamak için mekân arama */
export default function SearchScreen() {
  const { scoreOf } = useAppStore();
  const [query, setQuery] = useState('');
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View style={styles.search}>
        <SearchField value={query} onChangeText={setQuery} placeholder={t('picker.searchPlaceholder')} autoFocus />
      </View>
      <PlaceSearchList
        query={query}
        onSelect={(place) => router.push({ pathname: '/degerlendir/[id]', params: { id: place.id } })}
        trailing={(place) => {
          const score = scoreOf(place.id);
          return score !== undefined ? (
            <ScoreBadge score={score} size="sm" />
          ) : (
            <Icon name="plus.circle" tintColor={colors.primary} size={26} />
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
  },
});
