/**
 * Android teması ve renk kaynakları.
 *
 * 1. Uygulama paleti (`src/constants/palettes.ts`) `res/values/colors.xml` ve `res/values-night/colors.xml`
 *    içine `puanla_*` renkleri olarak yazılır. `constants/theme` Android'de `PlatformColor('@color/puanla_*')`
 *    kullanır: renk, görünümü (Ayarlar → Görünüm ya da sistem) izleyen gece modu kaynağından okunur.
 * 2. Metin alanları iOS'taki gibi çıplak: Android'in alt çizgili ve iç boşluklu EditText zemini kaldırılır
 *    (ekranlar alanlarını kendi çizer; aynı düzen iki platformda aynı ölçüde durur).
 * 3. İmleç, seçim tutamacı ve sistem vurguları marka laciverti (koyuda açık mürekkep); pencere zemini
 *    görünüme göre (ekran geçişlerinde ve klavye açılırken beyaz/siyah parlama olmasın).
 *
 * Palet tek kaynaktan, `src/constants/palettes.ts`'ten okunur (projenin TypeScript derleyicisiyle); palet
 * değişince yeni build gerekir.
 */
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { AndroidConfig, withAndroidColors, withAndroidColorsNight, withAndroidStyles } = require('expo/config-plugins');

/** `palettes.ts` yalnızca veri: CommonJS'e çevirip çalıştırır */
function loadPalettes(projectRoot) {
  const ts = require('typescript');
  const file = path.join(projectRoot, 'src', 'constants', 'palettes.ts');
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = new Module(file);
  mod._compile(outputText, file);
  return mod.exports;
}

function themeFromPalettes(projectRoot) {
  const { androidColorName, light, dark } = loadPalettes(projectRoot);
  return {
    colors: Object.keys(light).map((key) => ({ name: androidColorName(key), light: light[key], dark: dark[key] })),
    primary: { light: light.primary, dark: dark.primary },
    background: { light: light.background, dark: dark.background },
  };
}

/** "#RRGGBB" ya da "rgba(r, g, b, a)" → Android "#AARRGGBB" */
function toAndroidColor(value) {
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgba) {
    const [r, g, b] = rgba.slice(1, 4).map((c) => Number(c).toString(16).padStart(2, '0'));
    const a = Math.round((rgba[4] === undefined ? 1 : Number(rgba[4])) * 255)
      .toString(16)
      .padStart(2, '0');
    return `#${a}${r}${g}${b}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  throw new Error(`[with-android-theme] Desteklenmeyen renk: ${value}`);
}

/** Seçili metnin zemini: marka mürekkebinin saydam hâli */
const highlight = (hex) => `#40${hex.slice(1).toUpperCase()}`;

function assign(colors, entries) {
  for (const { name, value } of entries) {
    colors = AndroidConfig.Colors.assignColorValue(colors, { name, value: toAndroidColor(value) });
  }
  return colors;
}

/** @param {import('expo/config').ExpoConfig} config */
module.exports = function withAndroidTheme(config) {
  config = withAndroidColors(config, (c) => {
    const { colors, primary, background } = themeFromPalettes(c.modRequest.projectRoot);
    c.modResults = assign(c.modResults, [
      ...colors.map(({ name, light }) => ({ name, value: light })),
      { name: 'colorPrimary', value: primary.light },
      { name: 'activityBackground', value: background.light },
    ]);
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, {
      name: 'puanla_selection',
      value: highlight(primary.light),
    });
    return c;
  });

  config = withAndroidColorsNight(config, (c) => {
    const { colors, primary, background } = themeFromPalettes(c.modRequest.projectRoot);
    c.modResults = assign(c.modResults, [
      ...colors.map(({ name, dark }) => ({ name, value: dark })),
      { name: 'colorPrimary', value: primary.dark },
      { name: 'activityBackground', value: background.dark },
    ]);
    c.modResults = AndroidConfig.Colors.assignColorValue(c.modResults, {
      name: 'puanla_selection',
      value: highlight(primary.dark),
    });
    return c;
  });

  config = withAndroidStyles(config, (c) => {
    const parent = AndroidConfig.Styles.getAppThemeGroup();
    const items = {
      'android:editTextBackground': '@android:color/transparent',
      colorAccent: '@color/colorPrimary',
      colorControlActivated: '@color/colorPrimary',
      'android:textColorHighlight': '@color/puanla_selection',
    };
    for (const [name, value] of Object.entries(items)) {
      c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, { add: true, parent, name, value });
    }
    return c;
  });

  return config;
};
