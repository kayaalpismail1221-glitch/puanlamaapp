import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { showError } from '@/api/errors';
import type { ListDetails } from '@/api/lists';
import { PlaceRowsSkeleton } from '@/components/skeleton';
import { Button, Divider, PlaceImage, PressableScale, ScoreBadge, Text } from '@/components/ui';
import { cuisineLabel } from '@/constants/cuisines';
import { colors, fonts, radius, spacing, typography } from '@/constants/theme';
import { getPlace, useEntitiesVersion } from '@/data/entities';
import { useListDetails, useSaveList } from '@/hooks/queries';
import { useKeyboardFooterStyle } from '@/hooks/use-keyboard-footer';
import { showAlert } from '@/lib/dialog';
import { haptics } from '@/lib/haptics';
import {
  facets,
  LIST_DESCRIPTION_MAX,
  LIST_MAX_PLACES,
  LIST_NOTE_MAX,
  LIST_TITLE_MAX,
  matchesFilter,
  selectAll,
  selectedItems,
  type ListCandidate,
  type ListFilter,
} from '@/lib/lists';
import { useScored } from '@/store/app-store';

/**
 * Liste oluşturma ve düzenleme (`id` verilirse düzenleme).
 * Mekânlar kullanıcının puanladıklarından seçilir; mutfak ve ilçe çipleriyle daraltılır
 * ("Kadıköy · Dürümcü" → Görünenleri seç). Seçilen her mekâna isteğe bağlı not yazılabilir.
 */
export default function ListEditorScreen() {
  // `baslik`: yeni listenin hazır başlığı (profildeki "Favori mekânlarını listele")
  const { id, baslik } = useLocalSearchParams<{ id?: string; baslik?: string }>();
  const existing = useListDetails(id);
  // Düzenlemede form, mevcut liste yüklenince onun değerleriyle açılır
  if (id && existing.isPending) {
    return (
      <View style={styles.container}>
        <PlaceRowsSkeleton count={8} />
      </View>
    );
  }
  return <ListEditor id={id} initial={existing.data ?? undefined} initialTitle={baslik} />;
}

function ListEditor({ id, initial, initialTitle }: { id?: string; initial?: ListDetails; initialTitle?: string }) {
  const { t } = useTranslation();
  const footerStyle = useKeyboardFooterStyle();
  const scored = useScored();
  const version = useEntitiesVersion();
  const save = useSaveList();

  const [title, setTitle] = useState(initial?.list.title ?? initialTitle ?? '');
  const [description, setDescription] = useState(initial?.list.description ?? '');
  const [selected, setSelected] = useState<Map<string, string>>(
    () => new Map((initial?.items ?? []).map((i) => [i.place.id, i.note ?? ''])),
  );
  const [filter, setFilter] = useState<ListFilter>({});
  const details = initial;

  // Adaylar: puanladıkların (yüksekten düşüğe); düzenlenen listede puanı silinmiş mekânlar sonda
  const candidates = useMemo<ListCandidate[]>(() => {
    const ranked = scored.flatMap((e) => {
      const place = getPlace(e.placeId);
      return place ? [{ place, score: e.score }] : [];
    });
    const rankedIds = new Set(ranked.map((c) => c.place.id));
    const orphans = (details?.items ?? []).filter((i) => !rankedIds.has(i.place.id)).map((i) => ({ place: i.place }));
    return [...ranked, ...orphans];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, details, version]);

  const visible = useMemo(() => candidates.filter((c) => matchesFilter(c, filter)), [candidates, filter]);
  const cuisines = useMemo(() => facets(candidates, 'cuisine'), [candidates]);
  const districts = useMemo(() => facets(candidates, 'district'), [candidates]);

  const toggle = (placeId: string) => {
    haptics.select();
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(placeId)) next.delete(placeId);
      else if (next.size >= LIST_MAX_PLACES) {
        showAlert(t('lists.editor.max', { max: LIST_MAX_PLACES }));
        return prev;
      } else next.set(placeId, '');
      return next;
    });
  };

  const setNote = (placeId: string, note: string) =>
    setSelected((prev) => new Map(prev).set(placeId, note));

  const canSave = title.trim().length > 0 && selected.size > 0;

  const submit = () => {
    if (!canSave) return;
    save.mutate(
      {
        id,
        title: title.trim(),
        description: description.trim() || undefined,
        items: selectedItems(candidates, selected),
      },
      {
        onSuccess: (listId) => {
          haptics.success();
          if (id) router.back();
          else router.replace({ pathname: '/liste/[id]', params: { id: listId } });
        },
        onError: (error) => showError(error, t(id ? 'failures.listUpdate' : 'failures.listCreate')),
      },
    );
  };

  if (candidates.length === 0) {
    return (
      <View style={[styles.container, styles.empty]}>
        <SymbolView name="list.star" tintColor={colors.textTertiary} size={40} />
        <Text variant="headline" align="center">
          {t('lists.editor.noRanked')}
        </Text>
        <Button title={t('lists.editor.ratePlace')} icon="plus" onPress={() => router.replace('/mekan-puanla')} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: id ? t('screens.editList') : t('screens.newList') }} />
      <FlatList
        data={visible}
        keyExtractor={(c) => c.place.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        ItemSeparatorComponent={() => <Divider inset={spacing.lg + 28 + spacing.md} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={t('lists.editor.titlePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              maxLength={LIST_TITLE_MAX}
              accessibilityLabel={t('lists.editor.titleLabel')}
              style={styles.titleInput}
              autoFocus={!id}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('lists.editor.descriptionPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              maxLength={LIST_DESCRIPTION_MAX}
              multiline
              style={[typography.callout, styles.descriptionInput]}
            />

            <View style={styles.pickHeader}>
              <Text variant="title3">{t('lists.editor.pick')}</Text>
              <Text variant="footnote" color={colors.textSecondary}>
                {t('lists.editor.pickHint')}
              </Text>
            </View>

            <ChipRow
              options={cuisines}
              value={filter.cuisine}
              label={cuisineLabel}
              onChange={(cuisine) => setFilter((f) => ({ ...f, cuisine }))}
            />
            {districts.length > 1 && (
              <ChipRow
                options={districts}
                value={filter.district}
                label={(d) => d}
                onChange={(district) => setFilter((f) => ({ ...f, district }))}
              />
            )}

            <View style={styles.selectionRow}>
              <Text variant="footnote" color={colors.textSecondary}>
                {t('lists.editor.selected', { count: selected.size, max: LIST_MAX_PLACES })}
              </Text>
              <PressableScale
                onPress={() => {
                  haptics.select();
                  setSelected((prev) => (visible.every((c) => prev.has(c.place.id)) && prev.size ? new Map() : selectAll(visible, prev)));
                }}>
                <Text variant="footnote" color={colors.primary} style={styles.bold}>
                  {visible.length > 0 && visible.every((c) => selected.has(c.place.id))
                    ? t('lists.editor.clear')
                    : t('lists.editor.selectAll')}
                </Text>
              </PressableScale>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text variant="subhead" color={colors.textSecondary} align="center" style={styles.noMatch}>
            {t('lists.editor.noMatch')}
          </Text>
        }
        renderItem={({ item }) => (
          <CandidateRow
            candidate={item}
            note={selected.get(item.place.id)}
            onToggle={() => toggle(item.place.id)}
            onNote={(note) => setNote(item.place.id, note)}
          />
        )}
        ListFooterComponent={
          <Text variant="footnote" color={colors.textTertiary} align="center" style={styles.public}>
            {t('lists.editor.public')}
          </Text>
        }
      />
      <Animated.View style={[styles.footer, footerStyle]}>
        <Button
          title={id ? t('lists.editor.save') : t('lists.editor.create')}
          onPress={submit}
          disabled={!canSave}
          loading={save.isPending}
        />
      </Animated.View>
    </View>
  );
}

/** Seçim dairesi + mekân + puan; seçiliyse altında not alanı */
function CandidateRow({
  candidate,
  note,
  onToggle,
  onNote,
}: {
  candidate: ListCandidate;
  /** Seçili değilse undefined */
  note?: string;
  onToggle: () => void;
  onNote: (note: string) => void;
}) {
  const { t } = useTranslation();
  const { place, score } = candidate;
  const isSelected = note !== undefined;
  return (
    <View style={styles.candidate}>
      <PressableScale
        onPress={onToggle}
        haptic={false}
        scaleTo={0.98}
        style={styles.candidateRow}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}>
        <SymbolView
          name={isSelected ? 'checkmark.circle.fill' : 'circle'}
          tintColor={isSelected ? colors.primary : colors.textTertiary}
          size={24}
        />
        <PlaceImage uri={place.thumbUrl ?? place.photoUrl} style={styles.thumb} />
        <View style={styles.info}>
          <Text variant="headline" numberOfLines={1}>
            {place.name}
          </Text>
          <Text variant="footnote" color={colors.textSecondary} numberOfLines={1}>
            {[cuisineLabel(place.cuisine), place.neighborhood || place.district].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {score !== undefined && <ScoreBadge score={score} size="sm" />}
      </PressableScale>
      {isSelected && (
        <TextInput
          value={note}
          onChangeText={onNote}
          placeholder={t('lists.editor.notePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          maxLength={LIST_NOTE_MAX}
          style={[typography.subhead, styles.noteInput]}
        />
      )}
    </View>
  );
}

function ChipRow({
  options,
  value,
  label,
  onChange,
}: {
  options: [string, number][];
  value?: string;
  label: (v: string) => string;
  onChange: (v: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const chip = (key: string, text: string, active: boolean, next: string | undefined) => (
    <PressableScale
      key={key}
      haptic={false}
      onPress={() => {
        haptics.select();
        onChange(next);
      }}
      style={[styles.chip, active && styles.chipActive]}>
      <Text variant="footnote" color={active ? colors.onPrimary : colors.text} style={styles.bold}>
        {text}
      </Text>
    </PressableScale>
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.chips}>
      {chip('all', t('lists.editor.all'), !value, undefined)}
      {options.map(([v, n]) => chip(v, `${label(v)} ${n}`, value === v, value === v ? undefined : v))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xxl,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  titleInput: {
    marginHorizontal: spacing.lg,
    fontFamily: fonts.serif,
    fontSize: 26,
    fontWeight: '700',
    color: colors.primary,
    paddingVertical: spacing.xs,
  },
  descriptionInput: {
    marginHorizontal: spacing.lg,
    minHeight: 64,
    padding: spacing.md,
    paddingTop: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.text,
    textAlignVertical: 'top',
  },
  pickHeader: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chips: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  selectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  bold: {
    fontWeight: '600',
  },
  noMatch: {
    padding: spacing.xl,
  },
  candidate: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  noteInput: {
    marginLeft: 24 + spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  public: {
    padding: spacing.xl,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
