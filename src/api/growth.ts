import { supabase } from '@/lib/supabase';

/**
 * Birinci taraf büyüme ölçümü (migration 20261013120000_share_events). Yalnızca ne paylaşıldığı ve kanal
 * kaydedilir; mesaj metni ya da alıcı değil. Kayıt ateşle-unut: ağ hatası paylaşımı hiçbir zaman etkilemez.
 */

export type ShareKind = 'profile' | 'post' | 'place' | 'list' | 'taste' | 'goal' | 'invite' | 'story' | 'map';
export type ShareChannel = 'sheet' | 'whatsapp' | 'sms' | 'messages' | 'save' | 'copy';

export function logShare(
  kind: ShareKind,
  options: { target?: string; channel?: ShareChannel; completed?: boolean } = {},
) {
  supabase
    .rpc('log_share', {
      p_kind: kind,
      p_target: options.target ?? null,
      p_channel: options.channel ?? 'sheet',
      p_completed: options.completed ?? null,
    })
    .then(
      () => {},
      () => {},
    );
}
