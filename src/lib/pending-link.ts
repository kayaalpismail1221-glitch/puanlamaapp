/**
 * Kurulum bitmeden gelen bağlantı (`puanla://mekan/…`, iOS paylaşım uzantısı): korunan rota o an kayıtlı olmadığı
 * için gezgin onu açamaz, kullanıcı karşılama ekranına düşer. Yol burada saklanır; kök düzen kurulum bitince açar.
 * Uygulama hazırken gelen bağlantıyı gezgin zaten açtığı için o durumda yalnızca silinir.
 */
let pending: string | null = null;

export function rememberLink(path: string) {
  // Tam adres de gelebilir (`puanla://mekan/…`): şema atılır, sunucu kısmı ilk yol parçası olur
  // Expo Go adresinde uygulama yolu `/--/`'dan sonra; geliştirme istemcisinin kendi açılış adresi saklanmaz
  if (path.includes('expo-development-client')) return;
  const withoutScheme = path.includes('/--/') ? path.split('/--/')[1] : path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const relative = withoutScheme.replace(/^\/+/, '');
  // Kök ya da yalnızca sorgu içeren adres bir yere götürmez
  pending = relative.split('?')[0] ? `/${relative}` : null;
}

/** Saklanan yolu verir ve siler */
export function takeLink(): string | null {
  const link = pending;
  pending = null;
  return link;
}

/** Yolun sorgu dışındaki kısmı `pathname` ile aynı mı (açılmış bağlantı ikinci kez açılmasın) */
export function isSamePath(link: string, pathname: string) {
  const strip = (p: string) => p.split('?')[0].replace(/\/+$/, '').replace(/^\/+/, '');
  return strip(link) === strip(pathname);
}
