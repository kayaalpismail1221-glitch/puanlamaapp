import { Share } from 'react-native';

import { appLink, inviteLink } from '@/constants/app';
import { cuisineLabel } from '@/constants/cuisines';
import i18n from '@/i18n';
import { formatScore } from '@/lib/format';
import { isMe } from '@/lib/session';
import type { Place, Post } from '@/types';

/**
 * Sistem paylaşım menüsü: kısa, anlamlı bir metin + uygulamayı ilgili ekranda açan bağlantı.
 * Metinler etkin dilde; bağlantı `constants/app.ts` → `appLink`.
 */
function share(text: string, path: string) {
  const link = appLink(path);
  return Share.share({ message: `${text}\n\n${i18n.t('share.openInApp', { link })}` }).catch(() => {});
}

export const shareProfile = (user: { id: string; username: string }) =>
  share(
    isMe(user.id)
      ? i18n.t('share.profileMine', { username: user.username })
      : i18n.t('share.profile', { username: user.username }),
    `kullanici/${user.id}`,
  );

export function sharePost(post: Post, place: Place, authorName: string) {
  const text =
    post.score === undefined
      ? i18n.t('share.postNoScore', { place: place.name, area: place.neighborhood || place.district })
      : isMe(post.userId)
        ? i18n.t('share.postMine', { place: place.name, score: formatScore(post.score) })
        : i18n.t('share.post', { name: authorName, place: place.name, score: formatScore(post.score) });
  return share(text, `gonderi/${post.id}`);
}

export function sharePlace(place: Place, community?: { average: number; count: number }) {
  const where = [cuisineLabel(place.cuisine), place.neighborhood || place.district].filter(Boolean).join(' · ');
  const text = community
    ? i18n.t('share.placeRated', { place: place.name, where, score: formatScore(community.average), count: community.count })
    : i18n.t('share.place', { place: place.name, where });
  return share(text, `mekan/${place.id}`);
}

/** Genel davet: indirme bağlantısıyla (yoksa App Store'da aratma önerisiyle) */
export function shareInvite() {
  const link = inviteLink();
  const how = link ? i18n.t('invite.download', { link }) : i18n.t('invite.searchStore');
  return Share.share({ message: `${i18n.t('settings.inviteMessage')}\n\n${how}` }).catch(() => {});
}
