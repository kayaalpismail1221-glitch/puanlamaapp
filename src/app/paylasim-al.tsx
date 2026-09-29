import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { SymbolView } from '@/components/symbol';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { placeHint, sharedLink } from '@/lib/share-intent';

/** Paylaşım bu sürede gelmezse (ör. uzantı veri bırakmadı) Listem'e dönülür */
const GIVE_UP_MS = 4000;

/**
 * "Paylaş → Puanla" ile açılınca kısa ara ekran: paylaşılan bağlantıyı alır, mekân adını tahmin eder
 * ve Listem'e ekleme ekranına geçer (bağlantı hazır, arama önceden doldurulmuş).
 */
export default function ReceiveShareScreen() {
  const { t } = useTranslation();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const handled = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || handled.current) return;
    handled.current = true;
    const intent = shareIntent;
    const link = sharedLink(intent);
    resetShareIntent();
    placeHint(intent, link).then((hint) => {
      router.replace({
        pathname: '/listeye-ekle',
        params: { kaynak: 'social', ...(link && { baglanti: link }), ...(hint && { ara: hint }) },
      });
    });
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!handled.current) router.replace('/listem');
    }, GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <SymbolView name="bookmark.fill" tintColor={colors.onPrimary} size={26} />
      </View>
      <Text variant="headline" color={colors.primary}>
        {t('shareIntent.receiving')}
      </Text>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
});
