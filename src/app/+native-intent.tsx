import { rememberInviter } from '@/lib/invite-code';
import { INVITE_PATH } from '@/lib/invite-referrer';
import { rememberLink } from '@/lib/pending-link';

/**
 * Uygulamaya dışarıdan gelen bağlantılar. "Paylaş → Puanla" uzantısı uygulamayı
 * `puanla://dataUrl=puanlaShareKey…` ile açar; bu bir sayfa değil, paylaşımı karşılayan ekrana yönlendirilir
 * (içerik expo-share-intent üzerinden gelir). Diğer bağlantılar (ör. `puanla://mekan/<id>`) olduğu gibi açılır.
 * Kurulum bitmemişken korunan rotalar kayıtlı değil: yol saklanır, kök düzen kurulumdan sonra açar (`lib/pending-link`).
 * Davet bağlantısı (`puanla://davet/<kullanıcı adı>`) bir sayfa değil: davet eden saklanır (`lib/invite-code`),
 * uygulama kendi açılış ekranında açılır.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const invite = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').match(INVITE_PATH);
  if (invite) {
    rememberInviter(invite[1]);
    return '/';
  }
  const target = path.includes('dataUrl=') ? '/paylasim-al' : path;
  rememberLink(target);
  return target;
}
