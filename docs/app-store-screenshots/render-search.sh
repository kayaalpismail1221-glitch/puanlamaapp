#!/usr/bin/env bash
# App Store arama sonucu görseli (3840×2560): search.html → out/search-tr.png, out/search-en.png
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
TMPD="$(cygpath -u "${TEMP:-/tmp}")"
mkdir -p out
for lang in tr en; do
  "$EDGE" --headless=new --user-data-dir="$(cygpath -w "$TMPD/expeat-search-$lang")" --disable-gpu --hide-scrollbars \
    --allow-file-access-from-files --force-device-scale-factor=2 --window-size=1920,1280 --virtual-time-budget=30000 \
    --screenshot="$(cygpath -w "$PWD/out")\search-$lang.png" "file:///$(cygpath -m "$PWD")/search.html?lang=$lang" 2>/dev/null
  echo "out/search-$lang.png"
done
# Edge arka planda yazar: bitmesini bekle
sleep 20
