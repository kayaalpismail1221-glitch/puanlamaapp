// Metro ayarları. Uygulama iOS ve Android için; web yalnızca geliştirirken tarayıcıda hızlı deneme içindir.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// react-native-maps web'i desteklemiyor: web'de haritalar yerine yer tutucu gösterilir
const mapsShim = path.resolve(__dirname, 'src/shims/react-native-maps.web.tsx');
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: mapsShim };
  }
  return (resolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
