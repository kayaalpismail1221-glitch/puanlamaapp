// Android harita stilini (src/constants/map-style.ts, açık görünüm) Play görselleri için map-style.js'e yazar.
// Çalıştırma: node --experimental-strip-types --no-warnings docs/app-store-screenshots/gen-map-style.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapLibreStyle } from '../../src/constants/map-style.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), 'map-style.js');
writeFileSync(out, `// Üretildi: gen-map-style.mjs (kaynak src/constants/map-style.ts). Elle düzenleme.\nwindow.PUANLA_MAP_STYLE=${JSON.stringify(mapLibreStyle('light'))};\n`);
console.log(out);
