#!/usr/bin/env bash
# App Store ürün sayfası başlık görseli (3840×1646): header.html → out/header-tr.png, out/header-en.png
cd "$(dirname "$0")"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
TMPD="$(cygpath -u "${TEMP:-/tmp}")"
mkdir -p out
for lang in tr en; do
  "$EDGE" --headless=new --user-data-dir="$(cygpath -w "$TMPD/expeat-header-$lang")" --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --window-size=1920,823 --virtual-time-budget=20000 \
    --screenshot="$(cygpath -w "$PWD/out")\header-$lang.png" "file:///$(cygpath -m "$PWD")/header.html?lang=$lang" 2>/dev/null
  echo "out/header-$lang.png"
done
