"""
Android ve web ikon yazı tiplerini üretir: Material Symbols Rounded'ın yalnızca kullanılan ikonları.

Çalıştırma: npm run icons:android   (python + fonttools: pip install fonttools)
Girdi:  src/constants/android-symbols.ts (SF → Material eşlemesi)
Çıktı:  assets/fonts/PuanlaSymbols{,Fill,Bold,BoldFill}.ttf ve src/constants/symbol-glyphs.ts

Değişken yazı tipi Google'ın deposundan bir kez indirilir (scripts/.cache/, git'e girmez). Dört durağan kesit
çıkarılır: normal/kalın (wght 400/600) × çizgi/dolu (FILL 0/1), opsz 24, GRAD 0. Alt kümeleme sayesinde her
dosya birkaç on KB; tüm kütüphane (~15 MB) uygulamaya girmez.
"""
import re
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'scripts' / '.cache' / 'material-symbols'
MAPPING = ROOT / 'src' / 'constants' / 'android-symbols.ts'
FONTS = ROOT / 'assets' / 'fonts'
GLYPHS = ROOT / 'src' / 'constants' / 'symbol-glyphs.ts'

BASE = 'https://github.com/google/material-design-icons/raw/master/variablefont/'
NAME = 'MaterialSymbolsRounded%5BFILL,GRAD,opsz,wght%5D'

VARIANTS = {
    'PuanlaSymbols': {'FILL': 0, 'wght': 400},
    'PuanlaSymbolsFill': {'FILL': 1, 'wght': 400},
    'PuanlaSymbolsBold': {'FILL': 0, 'wght': 600},
    'PuanlaSymbolsBoldFill': {'FILL': 1, 'wght': 600},
}


def download(suffix: str) -> Path:
    target = CACHE / f'rounded{suffix}'
    if not target.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        print(f'İndiriliyor: {NAME}{suffix}')
        urllib.request.urlretrieve(BASE + NAME + suffix, target)
    return target


def main():
    names = sorted(set(re.findall(r":\s*'([a-z0-9_]+)'", MAPPING.read_text(encoding='utf-8'))))
    codepoints = {}
    for line in download('.codepoints').read_text(encoding='utf-8').splitlines():
        name, code = line.split()
        codepoints[name] = int(code, 16)

    missing = [n for n in names if n not in codepoints]
    if missing:
        raise SystemExit(f'Material Symbols içinde yok: {", ".join(missing)}')

    unicodes = [codepoints[n] for n in names]
    source = download('.ttf')
    FONTS.mkdir(parents=True, exist_ok=True)

    for family, axes in VARIANTS.items():
        font = TTFont(source)
        static = instancer.instantiateVariableFont(font, {**axes, 'opsz': 24, 'GRAD': 0})
        options = subset.Options()
        options.layout_features = []  # ligatürler gerekmez, ikon karakter koduyla çizilir
        options.name_IDs = ['*']
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=unicodes)
        subsetter.subset(static)
        for record in static['name'].names:
            if record.nameID in (1, 4, 16):
                record.string = family
            elif record.nameID == 6:
                record.string = family
        out = FONTS / f'{family}.ttf'
        static.save(out)
        print(f'{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB')

    body = '\n'.join(f"  {n}: 0x{codepoints[n]:x}," for n in names)
    GLYPHS.write_text(
        '// Bu dosya `npm run icons:android` ile üretilir; elle düzenleme.\n'
        '/** Material Symbols adı → karakter kodu (yalnızca gömülen ikonlar) */\n'
        f'export const SYMBOL_GLYPHS: Record<string, number> = {{\n{body}\n}};\n',
        encoding='utf-8',
    )
    print(f'{GLYPHS.relative_to(ROOT)}: {len(names)} ikon')


if __name__ == '__main__':
    main()
