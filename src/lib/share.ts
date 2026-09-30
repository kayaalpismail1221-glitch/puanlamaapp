import { Platform, Share } from 'react-native';

import { logShare, type ShareKind } from '@/api/growth';
import { appLink, inviteLink } from '@/constants/app';
import i18n, { currentLanguage } from '@/i18n';
import { formatScore } from '@/lib/format';
import { placeShortArea, placeSubtitle } from '@/lib/place';
import { possessive } from '@/lib/possessive';
import { getCurrentUserId, isMe } from '@/lib/session';
import type { Place, PlaceList, Post } from '@/types';

/**
 * Sistem paylaşım menüsü: kısa, anlamlı bir metin + uygulamayı ilgili ekranda açan bağlantı.
 * Metinler etkin dilde; bağlantı `constants/app.ts` → `appLink`. Her paylaşım ölçüme yazılır (`logShare`).
 */
function share(text: string, path: string, kind: ShareKind, target?: string) {
  return shareMessage(`${text}\n\n${i18n.t('share.openInApp', { link: appLink(path) })}`, kind, target);
}

/** Paylaşım menüsünü açar; iOS paylaşımın yapılıp yapılmadığını bildirir, ölçüme o da yazılır */
async function shareMessage(message: string, kind: ShareKind, target?: string) {
  try {
    const result = await Share.share({ message });
    logShare(kind, { target, completed: result.action === Share.sharedAction });
  } catch {
    // Menü açılamadı
  }
}

export const shareProfile = (user: { id: string; username: string }) =>
  share(
    isMe(user.id)
      ? i18n.t('share.profileMine', { username: user.username })
      : i18n.t('share.profile', { username: user.username }),
    `kullanici/${user.id}`,
    'profile',
    user.id,
  );

export function sharePost(post: Post, place: Place, authorName: string) {
  const text =
    post.score === undefined
      ? i18n.t('share.postNoScore', { place: place.name, area: placeShortArea(place) })
      : isMe(post.userId)
        ? i18n.t('share.postMine', { place: place.name, score: formatScore(post.score) })
        : i18n.t('share.post', { name: authorName, place: place.name, score: formatScore(post.score) });
  return share(text, `gonderi/${post.id}`, 'post', post.id);
}

export function sharePlace(place: Place, community?: { average: number; count: number }) {
  const where = placeSubtitle(place);
  const text = community
    ? i18n.t('share.placeRated', { place: place.name, where, score: formatScore(community.average), count: community.count })
    : i18n.t('share.place', { place: place.name, where });
  return share(text, `mekan/${place.id}`, 'place', place.id);
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
  return share(text, `liste/${list.id}`, 'list', list.id);
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
    'taste',
    other.username,
  );
}

/** Yıllık hedef: "2026'da 50 mekân hedefliyorum, 31'ine gittim"; bağlantı hedef sayfası, alan kişi kendi hedefini koysun */
export function shareYearGoal(year: number, goal: number, done: number) {
  return share(i18n.t('challenge.shareText', { year, goal, done }), 'hedef', 'goal', String(year));
}

/**
 * Davet mesajının indirme satırı: mağaza bağlantısı, yoksa gönderenin platformundaki mağazada aratma önerisi
 * (Android'den gönderilen davet Google Play der).
 */
export function downloadHint() {
  const link = inviteLink();
  if (link) return i18n.t('invite.download', { link });
  return Platform.OS === 'android' ? i18n.t('invite.searchStoreAndroid') : i18n.t('invite.searchStore');
}

/**
 * Uygulamaya davet mesajı. Kullanıcı adı verilirse davetliye "Seni kim davet etti?" alanına ne yazacağı söylenir
 * (ilk puanından sonra davet edene +100, davetliye +50 XP). Düğmelere doğrudan bağlanabilir: dokunma olayı
 * `username` taşımadığı için yok sayılır.
 */
export function shareInvite(options?: { username?: string }) {
  const how = downloadHint();
  const username = typeof options?.username === 'string' ? options.username : undefined;
  const hint = username ? `\n${i18n.t('invite.xpHint', { username })}` : '';
  return shareMessage(`${i18n.t('settings.inviteMessage')}${hint}\n\n${how}`, 'invite');
}
