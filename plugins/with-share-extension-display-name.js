/**
 * Paylaşım uzantısının paylaşım menüsünde görünen adı.
 *
 * expo-share-intent, Xcode hedef adını ve görünen adı aynı ayardan (`iosShareExtensionName`) türetir.
 * Ad "Puanla" olursa hedef ana uygulamanınkiyle çakışır ve EAS uzantının imzalama profilini ana uygulamaya
 * takar (build "app ID does not match the bundle ID" hatasıyla düşer). Bu yüzden hedef "PuanlaShare" adıyla
 * oluşturulur, bu eklenti de uzantının Info.plist'indeki görünen adı yeniden "Puanla" yapar.
 *
 * Sıra: config eklentilerinde en son eklenen önce çalışır; bu eklenti app.json'da expo-share-intent'ten
 * ÖNCE yazıldığı için onun dosyaları yazmasından SONRA çalışır.
 */
const fs = require('node:fs');
const path = require('node:path');
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withShareExtensionDisplayName(config, { target, displayName }) {
  return withXcodeProject(config, (config) => {
    const file = path.join(config.modRequest.platformProjectRoot, target, 'ShareExtension-Info.plist');
    if (!fs.existsSync(file)) {
      throw new Error(`[with-share-extension-display-name] ${file} bulunamadı (eklenti sırası ya da hedef adı yanlış)`);
    }
    const plist = fs.readFileSync(file, 'utf8');
    const updated = plist.replace(
      /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
      `$1${displayName}$2`,
    );
    fs.writeFileSync(file, updated);
    return config;
  });
};
