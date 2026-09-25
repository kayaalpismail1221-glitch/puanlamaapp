/**
 * Uygulamaya dışarıdan gelen bağlantılar. "Paylaş → Puanla" uzantısı uygulamayı
 * `puanla://dataUrl=puanlaShareKey…` ile açar; bu bir sayfa değil, paylaşımı karşılayan ekrana yönlendirilir
 * (içerik expo-share-intent üzerinden gelir). Diğer bağlantılar (ör. `puanla://mekan/<id>`) olduğu gibi açılır.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (path.includes('dataUrl=')) return '/paylasim-al';
  return path;
}
