import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { block, report, type ReportReason } from '@/api/content';
import { showError } from '@/api/errors';
import { colors } from '@/constants/theme';
import i18n from '@/i18n';
import { haptics } from '@/lib/haptics';

/**
 * Kullanıcı içeriği güvenliği (App Store 1.2): gönderi, yorum ve kişi için tek tip
 * şikâyet ve engelleme akışı. Şikâyetler `reports` tablosuna düşer ve 24 saat içinde incelenir.
 */

type MenuOption = { label: string; destructive?: boolean; onPress: () => void };

/** iOS'ta sistem menüsü, diğerlerinde uyarı penceresi */
export function showMenu(title: string | undefined, options: MenuOption[]) {
  const cancel = i18n.t('common.cancel');
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => o.label), cancel],
        destructiveButtonIndex: options.flatMap((o, i) => (o.destructive ? [i] : [])),
        cancelButtonIndex: options.length,
        tintColor: colors.primary,
      },
      (i) => options[i]?.onPress(),
    );
  } else {
    Alert.alert(title ?? '', undefined, [
      ...options.map((o) => ({ text: o.label, onPress: o.onPress, style: o.destructive ? ('destructive' as const) : undefined })),
      { text: cancel, style: 'cancel' as const },
    ]);
  }
}

const REASONS: ReportReason[] = ['offensive', 'spam', 'fake', 'other'];

type ReportTarget = { postId: string } | { commentId: string } | { userId: string } | { listId: string };

/** Sebep seçtirip şikâyeti gönderir */
export function openReportMenu(target: ReportTarget) {
  showMenu(
    i18n.t('moderation.reportTitle'),
    REASONS.map((reason) => ({
      label: i18n.t(`moderation.reasons.${reason}`),
      onPress: () =>
        report(target, reason).then(
          () => {
            haptics.success();
            Alert.alert(i18n.t('common.thanks'), i18n.t('moderation.reported'));
          },
          (error) => showError(error, i18n.t('failures.report')),
        ),
    })),
  );
}

/** Onay alıp kişiyi engeller; `onBlocked` ile ekranlar verilerini yeniler */
export function confirmBlock(user: { id: string; name: string }, onBlocked?: () => void) {
  Alert.alert(i18n.t('moderation.blockTitle', { name: user.name }), i18n.t('moderation.blockText'), [
    { text: i18n.t('common.cancel'), style: 'cancel' },
    {
      text: i18n.t('moderation.block'),
      style: 'destructive',
      onPress: () =>
        block(user.id).then(
          () => {
            haptics.success();
            onBlocked?.();
          },
          (error) => showError(error, i18n.t('failures.block')),
        ),
    },
  ]);
}
