"""Google Play görselleri: telefon ekran görüntüleri 1080×1920 (9:16) + tanıtım görseli 1024×500.

Kaynak screens.html'in Android modu (?os=android). Edge başsız açılır ve DevTools protokolüyle sürülür: sayfa
`window.__shotReady` diyene kadar (yazı tipleri, fotoğraflar, MapLibre karoları) beklenir, sonra çekilir.
(`--screenshot` + sanal zaman ağdan gelen harita karolarını beklemiyordu.)

Kullanım:  python render-play.py [slayt numaraları] [feature]     (varsayılan 1–9 + tanıtım görseli)
Play en fazla 8 telefon görseli alır: set 1–8 (önem sırası), 9 yedek.
Harita stili değişirse önce: node --experimental-strip-types --no-warnings gen-map-style.mjs
Gerekenler: Microsoft Edge, `pip install websocket-client pillow`.
"""
import base64
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket

from export_play import export

HERE = Path(__file__).parent
OUT = HERE / 'out' / 'play'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
PORT = 9333


class Page:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=60, suppress_origin=True)
        self.next_id = 0

    def call(self, method, **params):
        self.next_id += 1
        self.ws.send(json.dumps({'id': self.next_id, 'method': method, 'params': params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get('id') == self.next_id:
                if 'error' in msg:
                    raise RuntimeError(f'{method}: {msg["error"]}')
                return msg.get('result', {})

    def evaluate(self, expression):
        return self.call('Runtime.evaluate', expression=expression, returnByValue=True)['result'].get('value')


def shoot(page, query, width, height, scale, name, timeout=60):
    page.call('Emulation.setDeviceMetricsOverride', width=width, height=height, deviceScaleFactor=scale, mobile=False)
    url = (HERE / 'screens.html').resolve().as_uri() + f'?os=android&{query}'
    page.call('Page.navigate', url=url)
    deadline = time.time() + timeout
    time.sleep(1)
    while not page.evaluate('window.__shotReady === true'):
        if time.time() > deadline:
            raise TimeoutError(f'{name}: sayfa {timeout} sn içinde hazır olmadı')
        time.sleep(0.5)
    time.sleep(0.5)  # son kare
    shot = page.call('Page.captureScreenshot', format='png', captureBeyondViewport=False)
    (OUT / name).write_bytes(base64.b64decode(shot['data']))
    print(f'out/play/{name}')


def main():
    args = sys.argv[1:]
    slides = [int(a) for a in args if a.isdigit()] if args else list(range(1, 10))
    feature = not args or 'feature' in args
    OUT.mkdir(parents=True, exist_ok=True)
    profile = tempfile.mkdtemp(prefix='puanla-play-')
    edge = subprocess.Popen([
        EDGE, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}',
        # Harita (MapLibre) WebGL ister: GPU'suz başsız tarayıcıda yazılım çizimi
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
        '--allow-file-access-from-files', 'about:blank',
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json/list'))
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise RuntimeError('Edge DevTools açılmadı')
        page = Page(next(t for t in targets if t['type'] == 'page')['webSocketDebuggerUrl'])
        page.call('Page.enable')
        page.call('Runtime.enable')
        for n in slides:
            shoot(page, f's={n}', 450, 800, 2.4, f'puanla-play-{n}.png')
        if feature:
            # Tanıtım görseli 2× çizilip küçültülür (keskin yazı)
            shoot(page, 's=feature', 1024, 500, 2, 'feature-2x.png')
    finally:
        edge.terminate()
    export()


if __name__ == '__main__':
    main()
