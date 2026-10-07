"""6,5" iPhone seti: 1320×2868 görselleri 1284×2778'e ölçekler (oranlar neredeyse aynı; üstten/alttan 6 px kırpılır)."""
import sys
from pathlib import Path
from PIL import Image

W, H = 1284, 2778
# Kaynak klasör verilebilir (ör. out/en); varsayılan out
src = Path(__file__).parent / (sys.argv[1] if len(sys.argv) > 1 else 'out')
dst = src / '6.5'
dst.mkdir(exist_ok=True)
for f in sorted(src.glob('puanla-*.png')):
    im = Image.open(f).convert('RGB')
    h = round(im.height * W / im.width)
    im = im.resize((W, h), Image.LANCZOS)
    top = (h - H) // 2
    im.crop((0, top, W, top + H)).save(dst / f.name)
    print(dst / f.name, (W, H))
