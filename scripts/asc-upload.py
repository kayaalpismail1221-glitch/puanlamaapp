"""
IPA'yı App Store Connect'e EAS kuyruğu olmadan yükler (App Store Connect API: buildUploads + buildUploadFiles).
Windows'ta Xcode ya da Transporter gerekmez; sürüm ve derleme numarası IPA'nın içinden okunur.

Gerekli: App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys'te "App Manager"
yetkili bir anahtar. .p8 dosyası yalnızca bir kez indirilir; depoya koyma.
Ortam değişkenleri (.env.local da okunur): ASC_KEY_ID, ASC_ISSUER_ID ve isteğe bağlı ASC_KEY_PATH
(boşsa AuthKey_<ASC_KEY_ID>.p8 şuralarda aranır: ~/.appstoreconnect/private_keys, ~/private_keys, ~/.private_keys).

Kullanım: npm run asc:upload -- <dosya.ipa>
"""
import hashlib
import os
import plistlib
import re
import sys
import time
import zipfile
from pathlib import Path

import jwt
import requests

sys.stdout.reconfigure(encoding='utf-8')  # Windows konsolu (cp1254) Türkçe karakter ve okları basamıyor

APP_ID = '6815859231'
BUNDLE_ID = 'app.puanla'
API = 'https://api.appstoreconnect.apple.com/v1'
ROOT = Path(__file__).resolve().parents[1]


def settings():
    """Ortam değişkenleri; eksikler .env.local'dan"""
    values = dict(os.environ)
    env_file = ROOT / '.env.local'
    if env_file.exists():
        for line in env_file.read_text(encoding='utf-8').splitlines():
            m = re.match(r'^\s*(ASC_[A-Z_]+)\s*=\s*(.*?)\s*$', line)
            if m and m.group(1) not in values:
                values[m.group(1)] = m.group(2).strip('"\'')
    key_id, issuer = values.get('ASC_KEY_ID'), values.get('ASC_ISSUER_ID')
    if not key_id or not issuer:
        sys.exit('ASC_KEY_ID ve ASC_ISSUER_ID gerekli (ortam değişkeni ya da .env.local)')
    if values.get('ASC_KEY_PATH'):
        key_path = Path(values['ASC_KEY_PATH'])
    else:
        home = Path.home()
        dirs = [home / '.appstoreconnect' / 'private_keys', home / 'private_keys', home / '.private_keys']
        key_path = next((d / f'AuthKey_{key_id}.p8' for d in dirs if (d / f'AuthKey_{key_id}.p8').exists()), None)
    if not key_path or not key_path.exists():
        sys.exit(f'AuthKey_{key_id}.p8 bulunamadı (ASC_KEY_PATH ile yolunu ver)')
    return key_id, issuer, key_path.read_text()


KEY_ID, ISSUER, PRIVATE_KEY = settings()


def token():
    """App Store Connect JWT'si (ES256, en fazla 20 dakika geçerli)"""
    now = int(time.time())
    claims = {'iss': ISSUER, 'iat': now, 'exp': now + 15 * 60, 'aud': 'appstoreconnect-v1'}
    return jwt.encode(claims, PRIVATE_KEY, algorithm='ES256', headers={'kid': KEY_ID, 'typ': 'JWT'})


def api(method, path, body=None, params=None):
    res = requests.request(method, API + path, json=body, params=params, timeout=60,
                           headers={'Authorization': f'Bearer {token()}'})
    if res.status_code >= 400:
        sys.exit(f'{method} {path} → {res.status_code}\n{res.text}')
    return res.json() if res.text else None


def ipa_info(path):
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if re.match(r'^Payload/[^/]+\.app/Info\.plist$', n))
        info = plistlib.loads(z.read(name))
    return info['CFBundleIdentifier'], info['CFBundleShortVersionString'], info['CFBundleVersion']


def details(state):
    for kind in ('errors', 'warnings'):
        for item in state.get(kind) or []:
            print(f'  {kind}: {item.get("code", "")} {item.get("message") or item.get("description") or item}')


def main():
    if len(sys.argv) < 2:
        sys.exit('Kullanım: npm run asc:upload -- <dosya.ipa>')
    ipa = Path(sys.argv[1])
    bundle_id, version, build = ipa_info(ipa)
    if bundle_id != BUNDLE_ID:
        sys.exit(f'Bu IPA {bundle_id}, beklenen {BUNDLE_ID}')
    size = ipa.stat().st_size
    md5 = hashlib.md5(ipa.read_bytes()).hexdigest()
    print(f'{ipa.name}: {version} ({build}), {size / 1e6:.1f} MB')

    upload = api('POST', '/buildUploads', {'data': {
        'type': 'buildUploads',
        'attributes': {'cfBundleShortVersionString': version, 'cfBundleVersion': build, 'platform': 'IOS'},
        'relationships': {'app': {'data': {'type': 'apps', 'id': APP_ID}}},
    }})['data']
    file = api('POST', '/buildUploadFiles', {'data': {
        'type': 'buildUploadFiles',
        'attributes': {'assetType': 'ASSET', 'fileName': ipa.name, 'fileSize': size, 'uti': 'com.apple.ipa'},
        'relationships': {'buildUpload': {'data': {'type': 'buildUploads', 'id': upload['id']}}},
    }})['data']

    operations = file['attributes'].get('uploadOperations') or []
    with ipa.open('rb') as f:
        for i, op in enumerate(operations, 1):
            f.seek(op['offset'])
            chunk = f.read(op['length'])
            headers = {h['name']: h['value'] for h in op.get('requestHeaders') or []}
            res = requests.request(op['method'], op['url'], data=chunk, headers=headers, timeout=600)
            if res.status_code >= 300:
                sys.exit(f'Parça {i} yüklenemedi: {res.status_code}\n{res.text[:500]}')
            print(f'  parça {i}/{len(operations)} yüklendi')

    api('PATCH', f'/buildUploadFiles/{file["id"]}', {'data': {
        'type': 'buildUploadFiles', 'id': file['id'],
        'attributes': {'sourceFileChecksums': {'file': {'hash': md5, 'algorithm': 'MD5'}}, 'uploaded': True},
    }})
    print('Yükleme bitti, Apple teslim alıyor…')

    last = None
    for _ in range(120):  # en fazla ~30 dk
        state = api('GET', f'/buildUploads/{upload["id"]}')['data']['attributes'].get('state') or {}
        if state.get('state') != last:
            last = state.get('state')
            print(f'  durum: {last}')
            details(state)
        if last in ('COMPLETE', 'FAILED'):
            break
        time.sleep(15)
    if last != 'COMPLETE':
        sys.exit('Teslim tamamlanmadı (yukarıdaki durum/hatalara bak)')

    # Apple derlemeyi işler; bitince TestFlight'ta görünür
    for _ in range(80):  # en fazla ~20 dk
        builds = api('GET', '/builds', params={'filter[app]': APP_ID, 'filter[version]': build,
                                               'filter[preReleaseVersion.version]': version})['data']
        processing = builds[0]['attributes'].get('processingState') if builds else 'henüz görünmüyor'
        print(f'  derleme: {processing}')
        if processing in ('VALID', 'INVALID', 'FAILED'):
            break
        time.sleep(15)
    print('Bitti: App Store Connect → TestFlight' if processing == 'VALID' else 'Derleme durumunu App Store Connect\'te kontrol et')


if __name__ == '__main__':
    main()
