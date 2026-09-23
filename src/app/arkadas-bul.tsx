import { View } from 'react-native';

import { FriendFinder } from '@/components/friend-finder';
import { colors, spacing } from '@/constants/theme';

export default function FindFriendsModal() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: spacing.lg }}>
      <FriendFinder />
    </View>
  );
}
