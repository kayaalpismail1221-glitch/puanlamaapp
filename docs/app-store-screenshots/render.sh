#!/usr/bin/env bash
# App Store ekran görüntülerini üretir: 6,9" iPhone (1320×2868). Kullanım: bash render.sh [slayt numaraları]
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
TMPD="$(cygpath -u "${TEMP:-/tmp}")"
mkdir -p out
for n in ${@:-1 2 3 4 5 6 7 8 9}; do
  "$EDGE" --headless=new --user-data-dir="$(cygpath -w "$TMPD/puanla-shot-$n")" --disable-gpu --hide-scrollbars --force-device-scale-factor=3 \
    --window-size=440,956 --virtual-time-budget=20000 \
    --screenshot="$(cygpath -w "$PWD/out")\puanla-$n.png" "file:///$(cygpath -m "$PWD")/screens.html?s=$n" 2>/dev/null
  echo "out/puanla-$n.png"
done
# Edge arka planda yazar: bitmesini bekle, sonra 6,5" (1284×2778) setini üret
sleep 8
python export-65.py >/dev/null && echo "out/6.5/ güncellendi"
