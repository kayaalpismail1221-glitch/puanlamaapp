import { rememberInviter } from '@/lib/invite-code';
import { INVITE_PATH } from '@/lib/invite-referrer';
import { rememberLink } from '@/lib/pending-link';

/**
 * Uygulamaya dışarıdan gelen bağlantılar. "Paylaş → Expeat" uzantısı uygulamayı
 * `expeat://dataUrl=puanlaShareKey…` ile açar; bu bir sayfa değil, paylaşımı karşılayan ekrana yönlendirilir
 * (içerik expo-share-intent üzerinden gelir). Diğer bağlantılar (ör. `expeat://mekan/<id>`, eski `puanla://…`)
 * olduğu gibi açılır. Kurulum bitmemişken korunan rotalar kayıtlı değil: yol saklanır, kök düzen kurulumdan sonra açar
 * (`lib/pending-link`). Davet bağlantısı (`expeat://davet/<kullanıcı adı>` ya da evrensel bağlantı
 * `https://expeat.app/davet/<kullanıcı adı>`) bir sayfa değil: davet eden saklanır (`lib/invite-code`), uygulama kendi
 * açılış ekranında açılır.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  // Evrensel bağlantıda alan adı, şemalı bağlantıda şema düşer: ikisi de `davet/<kullanıcı adı>` yolu
  const invite = path
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .match(INVITE_PATH);
  if (invite) {
    rememberInviter(invite[1]);
    return '/';
  }
  const target = path.includes('dataUrl=') ? '/paylasim-al' : path;
  rememberLink(target);
  return target;
}
