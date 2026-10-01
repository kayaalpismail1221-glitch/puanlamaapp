import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json'un üstüne yalnızca gizli/ortama bağlı ayarlar (EAS'ta ortam değişkeni, yerelde `.env.local`).
 * Android haritası anahtarsız (MapLibre + OpenFreeMap, `components/app-map.android.tsx`).
 * - `GOOGLE_SERVICES_JSON`: Firebase'in `google-services.json`'u (EAS'ta "file" türü değişken; yerelde
 *   `.env.local`'a `GOOGLE_SERVICES_JSON=./google-services.json`). Android push (FCM) bunsuz çalışmaz; FCM V1
 *   hizmet hesabı anahtarı ayrıca EAS'a yüklenir.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
