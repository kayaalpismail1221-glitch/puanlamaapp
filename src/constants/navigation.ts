import type { NativeStackNavigationOptions } from 'expo-router';

import { colors } from '@/constants/theme';

/** Sekmelerin içindeki büyük başlıklı iOS stack başlığı */
export const largeTitleStackOptions: NativeStackNavigationOptions = {
  headerLargeTitleEnabled: true,
  headerLargeTitleShadowVisible: false,
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerLargeTitleStyle: { color: colors.primary },
  headerTitleStyle: { color: colors.primary },
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: colors.background },
};
