import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { BottomInsetSpacer } from '@/components/bottom-inset';
import { ContactFriends } from '@/components/contact-friends';
import { SuggestionRow } from '@/components/people-you-may-know';
import { UserRowsSkeleton } from '@/components/skeleton';
import { Button, Divider, ErrorView, SearchField, Text } from '@/components/ui';
import { UserRow } from '@/components/user-row';
import { colors, spacing } from '@/constants/theme';
import { usePeopleYouMayKnow, useSearchUsers } from '@/hooks/queries';
import { shareInvite } from '@/lib/share';
import { useAppSelector } from '@/store/app-store';
import type { PersonSuggestion, UserProfile } from '@/types';

type Item = PersonSuggestion | UserProfile;
const isSuggestion = (item: Item): item is PersonSuggestion => 'reason' in item;

/**
 * Kullanıcı adıyla arkadaş arama ve takip etme listesi ("Tümünü gör", ayarlardan arkadaş bul).
 * Arama boşken bildirim merkezindekiyle aynı gerekçeli öneriler (Takip et / ✕); önerecek kimse kalmadıysa davet çağrısı.
 */
export function FriendFinder({ header }: { header?: React.ReactElement }) {
  const { t } = useTranslation();
  const username = useAppSelector((s) => s.profile?.username);
  const [query, setQuery] = useState('');
  const searching = query.trim().replace(/^@/, '').length > 0;
  const suggested = usePeopleYouMayKnow(30);
  const results = useSearchUsers(query);
  const active = searching ? results : suggested;
  const data: Item[] = (searching ? results.data : suggested.data) ?? [];

  return (
    <FlatList<Item>
      data={data}
      keyExtractor={(item) => (isSuggestion(item) ? item.user.id : item.id)}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic"
      // Klavye son sonuçları örtmesin (iOS; Android'de alttaki boşluk)
      automaticallyAdjustKeyboardInsets
      ListFooterComponent={<BottomInsetSpacer />}
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          {!searching && <ContactFriends />}
          <SearchField value={query} onChangeText={setQuery} placeholder={t('friends.searchPlaceholder')} />
          {!searching && !!suggested.data?.length && (
            <Text variant="footnote" color={colors.textSecondary} style={styles.bold}>
              {t('friends.mayKnow')}
            </Text>
          )}
        </View>
      }
      ItemSeparatorComponent={() => <Divider inset={spacing.lg + 44 + spacing.md} />}
      ListEmptyComponent={
        active.isPending ? (
          <UserRowsSkeleton />
        ) : active.isError ? (
          <ErrorView onRetry={() => active.refetch()} />
        ) : searching ? (
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.empty}>
            {t('friends.noMatch', { query: query.trim() })}
          </Text>
        ) : (
          <View style={styles.caughtUp}>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {t('friends.allCaughtUp')}
            </Text>
            <Button title={t('contacts.inviteFriends')} icon="square.and.arrow.up" size="sm" onPress={() => shareInvite({ username })} />
          </View>
        )
      }
      renderItem={({ item }) =>
        isSuggestion(item) ? (
          <SuggestionRow suggestion={item} />
        ) : (
          <UserRow user={item} subtitle={t('friends.reviews', { username: item.username, count: item.postCount })} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  bold: {
    fontWeight: '600',
  },
  empty: {
    padding: spacing.xl,
  },
  caughtUp: {
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
});
