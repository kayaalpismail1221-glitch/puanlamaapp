const { existsSync } = require('fs');

/**
 * app.json'u git'e girmeyen Android ayarlarıyla tamamlar (değerler EAS ortam değişkenlerinden ya da yerel dosyadan).
 * Kurulum: docs/android.md
 *
 * - GOOGLE_MAPS_ANDROID_API_KEY: Android'de react-native-maps Google Haritalar kullanır; anahtarsız derlemede
 *   haritalar boş (gri) görünür. Expo Go'da gerekmez.
 * - GOOGLE_SERVICES_JSON (EAS "file" değişkeni) ya da kökteki google-services.json: Android push bildirimleri
 *   Firebase Cloud Messaging ister; yoksa uygulama çalışır ama push jetonu alınamaz.
 *
 * @param {import('expo/config').ConfigContext} context
 * @returns {import('expo/config').ExpoConfig}
 */
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  const googleServices =
    process.env.GOOGLE_SERVICES_JSON ?? (existsSync('./google-services.json') ? './google-services.json' : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(mapsKey && { config: { ...config.android?.config, googleMaps: { apiKey: mapsKey } } }),
      ...(googleServices && { googleServicesFile: googleServices }),
    },
  };
};
