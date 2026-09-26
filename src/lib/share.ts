import { Share } from 'react-native';

import { appLink, inviteLink } from '@/constants/app';
import { cuisineLabel } from '@/constants/cuisines';
import i18n, { currentLanguage } from '@/i18n';
import { formatScore } from '@/lib/format';
import { possessive } from '@/lib/possessive';
import { getCurrentUserId, isMe } from '@/lib/session';
import type { Place, PlaceList, Post } from '@/types';

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

/** Liste: başlık + mekân sayısı; bağlantı listeyi uygulamada açar */
export function shareList(list: PlaceList) {
  const text = isMe(list.author.id)
    ? i18n.t('share.listMine', { title: list.title, count: list.placeCount })
    : i18n.t('share.list', {
        name: possessive(list.author.name.split(' ')[0] || list.author.username, currentLanguage()),
        title: list.title,
        count: list.placeCount,
      });
  return share(text, `liste/${list.id}`);
}

/** Damak uyumu: "@zeynepyer ile damak uyumumuz %82"; bağlantı kendi profiline, alan kişi kendi uyumunu görsün */
export function shareTasteMatch(other: { username: string }, percent: number, common: number) {
  const me = getCurrentUserId();
  if (!me) return;
  return share(
    i18n.t('share.tasteMatch', {
      username: other.username,
      percent: i18n.t('profile.percent', { value: percent }),
      count: common,
    }),
    `kullanici/${me}`,
  );
}

/** Genel davet: indirme bağlantısıyla (yoksa App Store'da aratma önerisiyle) */
export function shareInvite() {
  const link = inviteLink();
  const how = link ? i18n.t('invite.download', { link }) : i18n.t('invite.searchStore');
  return Share.share({ message: `${i18n.t('settings.inviteMessage')}\n\n${how}` }).catch(() => {});
}
