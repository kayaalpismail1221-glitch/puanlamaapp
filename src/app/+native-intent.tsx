import { rememberLink } from '@/lib/pending-link';

/**
 * Uygulamaya dışarıdan gelen bağlantılar. "Paylaş → Puanla" uzantısı uygulamayı
 * `puanla://dataUrl=puanlaShareKey…` ile açar; bu bir sayfa değil, paylaşımı karşılayan ekrana yönlendirilir
 * (içerik expo-share-intent üzerinden gelir). Diğer bağlantılar (ör. `puanla://mekan/<id>`) olduğu gibi açılır.
 * Kurulum bitmemişken korunan rotalar kayıtlı değil: yol saklanır, kök düzen kurulumdan sonra açar (`lib/pending-link`).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const target = path.includes('dataUrl=') ? '/paylasim-al' : path;
  rememberLink(target);
  return target;
}
