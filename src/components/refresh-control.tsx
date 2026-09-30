import { RefreshControl as RNRefreshControl, type RefreshControlProps } from 'react-native';

import { usePalette } from '@/hooks/use-palette';

/**
 * Aşağı çekip yenileme, marka renginde. iOS: lacivert döner gösterge; Android: Material'ın yuvarlak göstergesi
 * lacivert, zemini kart rengi (varsayılanı gri üstünde yeşil/mavi). ScrollView bu öğeyi kopyalayıp kendi
 * içeriğini verdiği için tüm props olduğu gibi aktarılır.
 */
export function RefreshControl(props: RefreshControlProps) {
  const palette = usePalette();
  return (
    <RNRefreshControl
      tintColor={palette.primary}
      colors={[palette.primary]}
      progressBackgroundColor={palette.card}
      {...props}
    />
  );
}
