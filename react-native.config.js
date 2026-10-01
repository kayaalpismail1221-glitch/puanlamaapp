/**
 * Yerel bağlama (autolinking) istisnaları. MapLibre yalnızca Android haritası için (`app-map.android.tsx`);
 * iOS Apple Haritalar kullanır, iOS derlemesine girmesin (boyut ve iOS'a giden güncellemeler etkilenmesin).
 */
module.exports = {
  dependencies: {
    '@maplibre/maplibre-react-native': {
      platforms: { ios: null },
    },
  },
};
