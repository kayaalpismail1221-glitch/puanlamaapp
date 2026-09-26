import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { CompareStep, SentimentChoice, useRankResultText } from '@/components/rank-steps';
import { Button, LoadingView, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { colors, hitSlop, radius, spacing, typography } from '@/constants/theme';
import { getPlace, usePlace } from '@/data/entities';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { useRankFlow } from '@/hooks/use-rank-flow';
import { haptics } from '@/lib/haptics';
import { placeSubtitle } from '@/lib/place';
import { useAppStore } from '@/store/app-store';

/**
 * Puanlama ekranı (Beli tarzı; akış hooks/use-rank-flow):
 * izlenim → ikili karşılaştırma → hesaplanan puan + isteğe bağlı not.
 * Gönderi ekranı aynı akışı kendi içinde gösterir.
 */
export default function RateScreen() {
  // `from=gonderi`: gönderi ekranından açıldıysa oraya geri dönülür
  // `sonra=gonderi`: kaydedince doğrudan gönderi ekranına geçilir (onboarding)
  const { id, from, sonra } = useLocalSearchParams<{ id: string; from?: string; sonra?: string }>();
  const place = usePlace(id);
  const { rankings, onboarded, actions } = useAppStore();
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();
  const flow = useRankFlow(id);
  const resultText = useRankResultText();

  const [note, setNote] = useState(
    () => Object.values(rankings).flat().find((e) => e.placeId === id)?.note ?? '',
  );

  if (place === undefined) return <LoadingView style={styles.container} />;
  if (!place) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text>{t('rate.notFound')}</Text>
        <Button title={t('rate.close')} variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  const save = (thenShare = false) => {
    if (!flow.result) return;
    haptics.success();
    actions.rank(place.id, flow.result.sentiment, flow.result.index, note);
    if (sonra === 'gonderi') {
      router.replace({ pathname: '/gonderi-olustur', params: { placeId: place.id, akis: 'onboarding' } });
    } else if (thenShare) {
      router.replace({ pathname: '/gonderi-olustur', params: { placeId: place.id } });
    } else router.back();
  };

  return (
    <View style={[styles.container, { paddingTop: spacing.lg }]}>
      {/* Üst bar */}
      <View style={styles.topBar}>
        <PressableScale onPress={() => router.back()} hitSlop={hitSlop} style={styles.iconButton} accessibilityLabel={t('rate.close')}>
          <SymbolView name="xmark" tintColor={colors.primary} size={16} weight="semibold" />
        </PressableScale>
        {flow.phase !== 'sentiment' && (
          <PressableScale onPress={flow.undo} hitSlop={hitSlop} style={styles.iconButton} accessibilityLabel={t('rate.undo')}>
            <SymbolView name="arrow.uturn.backward" tintColor={colors.primary} size={16} weight="semibold" />
          </PressableScale>
        )}
      </View>

      <View style={styles.placeHeader}>
        <PlaceImage uri={place.photoUrl} style={styles.placeThumb} />
        <View style={{ flex: 1 }}>
          <Text variant="title3" numberOfLines={1}>
            {place.name}
          </Text>
          <Text variant="footnote" color={colors.textSecondary}>
            {placeSubtitle(place)}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {flow.phase === 'sentiment' && <SentimentChoice key="sentiment" onChoose={flow.choose} />}

        {flow.phase === 'compare' && (
          <CompareStep
            key={`compare-${flow.step}`}
            place={place}
            other={flow.otherPlaceId ? getPlace(flow.otherPlaceId) : undefined}
            step={flow.step}
            total={flow.totalSteps}
            onPick={flow.answer}
            onSkip={flow.skip}
          />
        )}

        {flow.result && (
          <Animated.View key="result" entering={FadeIn} style={styles.resultSection}>
            <Animated.View entering={ZoomIn.springify()}>
              <ScoreBadge score={flow.result.score} size="lg" />
            </Animated.View>
            <Text variant="subhead" color={colors.textSecondary} align="center">
              {resultText(flow.result)}
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('rate.notePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={200}
              style={[typography.body, styles.note]}
            />
          </Animated.View>
        )}
      </View>

      {flow.result && (
        <Animated.View style={[styles.footer, footerStyle]}>
          <Button title={sonra === 'gonderi' ? t('rate.saveAndContinue') : t('common.save')} onPress={() => save()} />
          {/* Onboarding sırasında gönderi ekranı henüz erişilebilir değil */}
          {onboarded && from !== 'gonderi' && (
            <Button title={t('rate.saveAndShare')} icon="camera" variant="ghost" onPress={() => save(true)} />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  placeThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.button,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  resultSection: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  note: {
    alignSelf: 'stretch',
    minHeight: 96,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    paddingTop: spacing.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
});
