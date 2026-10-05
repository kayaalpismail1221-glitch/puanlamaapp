#!/usr/bin/env bash
# Web sitesi görselleri (telefonlar, paylaşım görseli, yemek fotoğrafları): App Store slaytlarının telefon + açıklama etiketleri (başlıksız, şeffaf) → web/img/ekran-N.webp
# Kaynak docs/app-store-screenshots/screens.html (?layer=nocopy). Kullanım: bash scripts/web/shots.sh [slayt numaraları]
cd "$(dirname "$0")/../.."
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
TMPD="$(cygpath -u "${TEMP:-/tmp}")"
RAW="$TMPD/expeat-web-shots"
mkdir -p "$RAW" web/img
S="file:///$(cygpath -m "$PWD")/docs/app-store-screenshots/screens.html"
NS="${@:-1 2 3 4 5 6 7 8 9}"
for n in $NS; do
  "$EDGE" --headless=new --user-data-dir="$(cygpath -w "$TMPD/expeat-web-$n")" --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 --force-device-scale-factor=2 --window-size=440,956 \
    --virtual-time-budget=20000 --screenshot="$(cygpath -w "$RAW/s$n.png")" "$S?s=$n&layer=nocopy" 2>/dev/null
done
sleep 8  # Edge arka planda yazar
python scripts/web/crop.py "$RAW" web/img $NS
# Paylaşım önizleme görselleri (og:image)
for l in tr en; do
  "$EDGE" --headless=new --user-data-dir="$(cygpath -w "$TMPD/expeat-og-$l")" --hide-scrollbars --window-size=1200,630 \
    --virtual-time-budget=10000 --screenshot="$(cygpath -w "$PWD/web/img")\og-$l.png" "file:///$(cygpath -m "$PWD")/scripts/web/og.html?lang=$l" 2>/dev/null
done
sleep 4
echo web/img/og-tr.png web/img/og-en.png
# Yemek fotoğrafları (yemek akışı ve kıyaslama kartı)
"$EDGE" --headless=new --user-data-dir="$(cygpath -w "$TMPD/expeat-photos")" --hide-scrollbars --window-size=1560,1800 \
  --virtual-time-budget=20000 --screenshot="$(cygpath -w "$RAW")\photos.png" "file:///$(cygpath -m "$PWD")/scripts/web/photos.html" 2>/dev/null
sleep 5
python scripts/web/photos.py "$RAW/photos.png" web/img
