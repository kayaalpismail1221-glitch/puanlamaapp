import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json'un üstüne yalnızca gizli/ortama bağlı ayarlar. Android haritası (react-native-maps → Google Maps SDK)
 * anahtar ister: EAS'ta `GOOGLE_MAPS_ANDROID_API_KEY` ortam değişkeni (production), yerelde `.env.local`.
 * Anahtar yoksa Android'de harita gri kalır; iOS Apple Haritalar kullanır, etkilenmez.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const apiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(apiKey ? { config: { ...config.android?.config, googleMaps: { apiKey } } } : {}),
    },
  };
};
