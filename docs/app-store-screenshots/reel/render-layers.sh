#!/usr/bin/env bash
# Reels katmanlarını üretir (şeffaf PNG): reel.html parçaları + screens.html slayt katmanları → layers/
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
TMPD="$(cygpath -u "${TEMP:-/tmp}")"
mkdir -p layers
shot() { # $1 çıktı adı, $2 url, $3 genişlik, $4 yükseklik, $5 ölçek
  "$EDGE" --headless=new --user-data-dir="$(cygpath -w "$TMPD/puanla-reel-$1")" --disable-gpu --hide-scrollbars \
    --default-background-color=00000000 --force-device-scale-factor="$5" --window-size="$3,$4" \
    --virtual-time-budget=20000 --screenshot="$(cygpath -w "$PWD/layers/$1.png")" "$2" 2>/dev/null
}
R="file:///$(cygpath -m "$PWD")/reel.html"
S="file:///$(cygpath -m "$PWD/..")/screens.html"
shot bg "$R?part=bg" 432 880 2.5
for p in hookA hookB cta; do shot "$p" "$R?part=$p" 432 768 2.5; done
for n in 1 2 3 4 5 7; do
  for l in copy phone float; do shot "s$n-$l" "$S?s=$n&layer=$l" 440 956 2.4545; done
done
sleep 8
ls layers | wc -l
