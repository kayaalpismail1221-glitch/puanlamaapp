"""6,5" iPhone seti: 1320×2868 görselleri 1284×2778'e ölçekler (oranlar neredeyse aynı; üstten/alttan 6 px kırpılır)."""
from pathlib import Path
from PIL import Image

W, H = 1284, 2778
src = Path(__file__).parent / 'out'
dst = src / '6.5'
dst.mkdir(exist_ok=True)
for f in sorted(src.glob('puanla-*.png')):
    im = Image.open(f).convert('RGB')
    h = round(im.height * W / im.width)
    im = im.resize((W, h), Image.LANCZOS)
    top = (h - H) // 2
    im.crop((0, top, W, top + H)).save(dst / f.name)
    print(dst / f.name, (W, H))
