/**
 * Mekân temizleme kurallarının testleri (örnekler Overture/OSM'deki gerçek kayıtlardan).
 * Çalıştırma: npm run test:places
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, test } from 'node:test';

import { assignPlaces, buildDiacriticDictionary, categorize, cleanName, formatAddress, isVenueName, normalizePhone, normalizeWebsite, overtureCategory, restoreTurkish, similarNames, spellingSimilarity } from './lib.mjs';

describe('isim', () => {
  test('büyük/küçük harf düzelir, karışık yazıma dokunulmaz', () => {
    assert.equal(cleanName('ASLI BÖREK'), 'Aslı Börek');
    assert.equal(cleanName('van kahvaltı evi'), 'Van Kahvaltı Evi');
    assert.equal(cleanName('KFC'), 'KFC');
    assert.equal(cleanName("d'Orient Büyükada"), "d'Orient Büyükada");
    assert.equal(cleanName("Paci'niN Yeri"), "Paci'niN Yeri");
    assert.equal(cleanName('BBQ HOUSE KADIKÖY'), 'BBQ House Kadıköy');
    assert.equal(cleanName('Balıkçı ersin'), 'Balıkçı Ersin');
    assert.equal(cleanName('Smyrna_restourant'), 'Smyrna Restourant');
    assert.equal(cleanName('iF Cafe ve bar'), 'iF Cafe ve Bar');
  });

  test('süslü Unicode, emoji ve arama motoru eki temizlenir; Latin harfsiz ad düşer', () => {
    assert.equal(cleanName('𝐒𝐨𝐤𝐚𝐤 𝐊ü𝐥𝐭ü𝐫ü'), 'Sokak Kültürü');
    assert.equal(cleanName('Burger 🍔 Lab'), 'Burger Lab');
    assert.equal(cleanName('Çamlıca Yöresel Van Kahvaltı Salonu | Avcılar Kahvaltı Salonu'), 'Çamlıca Yöresel Van Kahvaltı Salonu');
    assert.equal(cleanName('مقهى ابوعبده شيشه'), null);
    assert.equal(cleanName('42.5'), '42.5');
    assert.equal(cleanName('مقهى ابوعبده', 'Abu Abdo Cafe'), 'Abu Abdo Cafe');
    assert.equal(cleanName('مطعم الوالي VALI Restaurant'), 'VALI Restaurant');
  });
});

describe('adres', () => {
  const kadikoy = { district: 'Kadıköy' };
  test('mahalle, posta kodu, il ve daire bilgisi atılır; kısaltmalar tek biçim', () => {
    assert.equal(formatAddress('Caferağa Mah. Güneşlibahçe Sok. No:48/B', kadikoy), 'Güneşlibahçe Sk. No:48/B');
    assert.equal(formatAddress('Güneşlibahçe Sok. no 34710', kadikoy), 'Güneşlibahçe Sk.');
    assert.equal(formatAddress('Cevdet Paşa Cd. No:52 D:54', { district: 'Beşiktaş' }), 'Cevdet Paşa Cd. No:52');
    assert.equal(
      formatAddress('Ünalan Mah. Çeçen Sok, Akasya Avm No: 25 Kat: 2 Daire: 466', { district: 'Üsküdar' }),
      'Çeçen Sk.',
    );
    assert.equal(formatAddress('Sakıp Sabancı Cad. No:46, 34467 Sarıyer, İstanbul, Türkiye', { district: 'Sarıyer' }), 'Sakıp Sabancı Cd. No:46');
    assert.equal(formatAddress('Mimaroba Mahallesi, Mustafa Kemal Bulvarı, 27 C1', { district: 'Büyükçekmece' }), 'Mustafa Kemal Blv.');
  });

  test('sokaktan sonra yalın numara kapı no olur; ayrı bölümdeki numara eklenir', () => {
    assert.equal(formatAddress('Sandalcı Sokak 12', { district: 'Kartal' }), 'Sandalcı Sk. No:12');
    assert.equal(formatAddress('49, Mustafa Kemal Atatürk Cd', { district: 'Sarıyer' }), 'Mustafa Kemal Atatürk Cd. No:49');
    assert.equal(formatAddress('Halk Sk. No:24', kadikoy), 'Halk Sk. No:24');
    assert.equal(formatAddress('1638. Sokak', { district: 'Esenyurt' }), '1638. Sk.');
    assert.equal(formatAddress('A-1. Cadde 53', { district: 'Sultangazi' }), 'A-1. Cd. No:53');
  });

  test('bina adı sokaktan önceyse korunur; yalnızca bina adı varsa o döner', () => {
    assert.equal(formatAddress('Time Göztepe, Fahrettin Kerim Gökay Caddesi 132', kadikoy), 'Fahrettin Kerim Gökay Cd. No:132');
    assert.equal(formatAddress('Capacity AVM, Fişekhane Caddesi 7', { district: 'Bakırköy' }), 'Capacity AVM, Fişekhane Cd. No:7');
    assert.equal(formatAddress('Galataport', { district: 'Beyoğlu' }), 'Galataport');
  });

  test('güvenilmez adres boş döner', () => {
    // Başka il geçiyor (Bayrampaşa'daki kayıtta İzmit adresi)
    assert.equal(formatAddress('Yahya Kemal Mah. Akasyalar Cad. No:24 Arasta Park AVM /Kocaeli/İzmit', { district: 'Bayrampaşa' }), '');
    // Adresteki ilçe konumla çelişiyor
    assert.equal(formatAddress('Kayabaşı, Adnan Menderes Bulvari A3, 34494 Başakşehir/İstanbul', kadikoy), '');
    // Sokak yok
    assert.equal(formatAddress('Koza Mahallesi', { district: 'Esenyurt' }), '');
    assert.equal(formatAddress('İceri Gir Sorsan Gosterirler', { district: 'Başakşehir' }), '');
    assert.equal(formatAddress('تركيا', {}), '');
    assert.equal(formatAddress('Cad. No:20', { district: 'Sarıyer' }), '');
  });

  test('tamamı büyük harfli adres düzelir', () => {
    assert.equal(formatAddress('ATATÜRK CADDESİ NO:12', { district: 'Maltepe' }), 'Atatürk Cd. No:12');
  });

  test('il adıyla anılan yol başka il sayılmaz, kendi ilinin adı yolda kalır', () => {
    assert.equal(formatAddress('Ankara Cd. No:5, Kartal/İstanbul', { district: 'Kartal' }), 'Ankara Cd. No:5');
    assert.equal(formatAddress('Bursa Sokak 3', kadikoy), 'Bursa Sk. No:3');
    assert.equal(formatAddress('İstanbul Caddesi No:14, Bakırköy', { district: 'Bakırköy' }), 'İstanbul Cd. No:14');
    assert.equal(formatAddress('Mudanya Yolu Caddesi No:3', kadikoy), 'Mudanya Yolu Cd. No:3');
    // Yol değil il olarak geçiyorsa yine başka il
    assert.equal(formatAddress('Atatürk Cd. No:5, Ankara', kadikoy), '');
  });
});

describe('başka iller (PLACES_CITY)', () => {
  /** Kurallar il seçimiyle yüklenir: her il ayrı süreçte denenir */
  const formatIn = (city, raw, district) => {
    const code = `import { formatAddress } from './scripts/places/lib.mjs';
      console.log(JSON.stringify(formatAddress(${JSON.stringify(raw)}, { district: ${JSON.stringify(district)} })));`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, PLACES_CITY: city },
      cwd: new URL('../..', import.meta.url),
      encoding: 'utf8',
    });
    return JSON.parse(out);
  };

  test('kendi ilinin adı ve posta kodu atılır; başka il (İstanbul dahil) ve başka ilçe güvenilmez', () => {
    assert.equal(formatIn('ankara', 'Kızılay Mah. Atatürk Blv. No:12, 06420 Çankaya/Ankara', 'Çankaya'), 'Atatürk Blv. No:12');
    assert.equal(formatIn('ankara', 'Bağdat Cd. No:3, Kadıköy/İstanbul', 'Çankaya'), '');
    assert.equal(formatIn('ankara', 'Atatürk Blv. No:5, Keçiören/Ankara', 'Çankaya'), '');
    assert.equal(formatIn('izmir', 'Kıbrıs Şehitleri Cd. No:40, 35220 Konak/İzmir', 'Konak'), 'Kıbrıs Şehitleri Cd. No:40');
    assert.equal(formatIn('bursa', 'Ankara Yolu Cd. No:200, Yıldırım/Bursa', 'Yıldırım'), 'Ankara Yolu Cd. No:200');
  });

  test("Kocaeli'de ilçe adları (İzmit, Gebze) başka il değil", () => {
    assert.equal(formatIn('kocaeli', 'Hürriyet Cd. No:21, 41300 İzmit/Kocaeli', 'İzmit'), 'Hürriyet Cd. No:21');
    assert.equal(formatIn('kocaeli', 'Hürriyet Cd. No:21, Gebze/Kocaeli', 'İzmit'), '');
  });
});

describe('iletişim', () => {
  test('telefon E.164', () => {
    assert.equal(normalizePhone('0216 123 45 67'), '+902161234567');
    assert.equal(normalizePhone('+90 (532) 123-45-67'), '+905321234567');
    assert.equal(normalizePhone('2161234567'), '+902161234567');
    assert.equal(normalizePhone('444 0 555'), null);
    assert.equal(normalizePhone('+86 185 1385 1053'), null);
    assert.equal(normalizePhone('+90 212 123 45 67; +90 212 765 43 21'), '+902121234567');
  });

  test('web sitesi: Facebook ve kısaltıcılar atılır, izleme parametreleri silinir', () => {
    assert.equal(normalizeWebsite('http://www.facebook.com/abc'), null);
    assert.equal(normalizeWebsite('http://fbf.bz/b/5Wc'), null);
    assert.equal(normalizeWebsite('ciya.com.tr'), 'https://ciya.com.tr');
    assert.equal(normalizeWebsite('https://instagram.com/kronotrop?igsh=abc&utm_source=x'), 'https://instagram.com/kronotrop');
  });
});

describe('kategori ve ayıklama', () => {
  test('isim türden önce gelir; bar isminde cafe geçse de bardır', () => {
    assert.equal(categorize('Cızbız Sucuk Köfte', { fallbacks: [overtureCategory('mediterranean_restaurant')] }), 'Köfteci');
    assert.equal(categorize('Mersin Biftek Tantuni', { fallbacks: [overtureCategory('buffet_restaurant')] }), 'Kebapçı');
    assert.equal(categorize('Cafe Bar Pera', { fallbacks: ['Bar'] }), 'Bar');
    assert.equal(categorize('Öz Mantıcım', { fallbacks: [overtureCategory('asian_restaurant')] }), 'Restoran');
    assert.equal(categorize('Romantik Teras', { fallbacks: ['Kafe'] }), 'Kafe');
    assert.equal(categorize('Moonberry Coffee', { fallbacks: [overtureCategory('cafe')] }), 'Kafe');
    assert.equal(categorize('Egerokka', { fallbacks: [overtureCategory('greek_restaurant')] }), 'Dünya mutfağı');
    assert.equal(categorize('Adı Yok', { osmCuisine: 'pizza;italian', fallbacks: ['Restoran'] }), 'Pizzacı');
    assert.equal(overtureCategory('hookah_bar'), null);
  });

  test('börek/simit/poğaça börekçidir; adında pastane de geçen pastane kalır', () => {
    assert.equal(categorize('Tarihi Karaköy Börekçisi'), 'Börekçi');
    assert.equal(categorize('Simit Sarayı', { fallbacks: ['Kafe'] }), 'Börekçi');
    assert.equal(categorize('Poğaça Dünyası'), 'Börekçi');
    assert.equal(categorize('Baylan Pastanesi'), 'Pastane & fırın');
    assert.equal(categorize('Özsüt Pastane & Börek'), 'Pastane & fırın');
    assert.equal(categorize('Kuru Kahveci Fırın'), 'Pastane & fırın');
    assert.equal(categorize('Adı Yok', { osmCuisine: 'simit' }), 'Börekçi');
  });

  test('mekân olmayanlar ve ekmek fırınları ayıklanır', () => {
    assert.equal(isVenueName('Dostlar Kıraathanesi'), false);
    assert.equal(isVenueName('Keyf Nargile'), false);
    assert.equal(isVenueName('Akyurt Süpermarket Et İşleme Tesisleri'), false);
    assert.equal(isVenueName('Gunay Usta Ozel Servis'), false);
    assert.equal(isVenueName('Bozok Traktor'), false);
    // Çeşme'deki "Traktör" restoranı (bayi değil)
    assert.equal(isVenueName('Traktör'), true);
    assert.equal(isVenueName('Traktör Cafe'), true);
    // Semt adı (Kuyumcukent) kuyumcu değil
    assert.equal(isVenueName('Döner Bank Kuyumcukent'), true);
    assert.equal(isVenueName('Altın Kuyumcu'), false);
    assert.equal(isVenueName("Deren A'mor Organizasyon ve Parti Evi"), false);
    assert.equal(isVenueName('Bartender Acadamyy'), true);
    // Tür zaten restoran: bu kelimeler geçse de gerçek mekân
    assert.equal(isVenueName('Günaydın Kasap & Steakhouse'), true);
    assert.equal(isVenueName('Marmaris Büfe Şaşkınbakkal'), true);
    assert.equal(isVenueName('Tost Akademisi'), true);
    assert.equal(isVenueName('Köy Kahvesi - Çayocağı'), false);
    // Google karşılaştırmasında yakalananlar: bilardo salonu, vapur iskelesi, kuaför ("Salon + ad" kalıbı)
    assert.equal(isVenueName('Bella Bilardo'), false);
    assert.equal(isVenueName('Istanbul Kadikoy Iskelesi'), false);
    assert.equal(isVenueName('Salon Altunel'), false);
    assert.equal(isVenueName('Karadeniz Pide Salonu'), true);
    assert.equal(isVenueName('İskele Balık'), true);
    assert.equal(isVenueName('Bereket Ekmek Fırını', { bakery: true }), false);
    assert.equal(isVenueName('Saatli Fırın Börek', { bakery: true }), true);
  });
});

describe('aynı mekân', () => {
  test('şube eki, tür kelimesi ve bitişik yazım farkı', () => {
    assert.ok(similarNames('Kronotrop Cihangir', 'Kronotrop'));
    assert.ok(similarNames('Kasapdöner', 'Kasap Döner'));
    assert.ok(similarNames('Çiya Sofrası', 'ÇİYA SOFRASI'));
    assert.ok(similarNames('Baylan Pastanesi', 'Baylan'));
    assert.ok(!similarNames('Çiya Sofrası', 'Çiya Kebap'));
    assert.ok(!similarNames('Kahve Dünyası', 'Kahve Diyarı'));
    assert.ok(!similarNames('Cafe Roxie', 'Cafe Nero'));
  });

  test('yok sayılan kelimeler (sokak, mahalle) ayırt edici sayılmaz', () => {
    const ignore = new Set(['asmali', 'mescit']);
    assert.ok(similarNames('Asmalı Bakery', 'Antakya Kebap Asmalı'));
    assert.ok(!similarNames('Asmalı Bakery', 'Antakya Kebap Asmalı', { ignore }));
    assert.ok(!similarNames('Asmalıpera Pub', 'Asmalı Pera Bar', { ignore }));
    assert.ok(similarNames('Kronotrop Cihangir', 'Kronotrop', { ignore: new Set(['cihangir']) }));
    assert.ok(similarNames('Çiya Sofrası', 'ÇİYA SOFRASI', { ignore: new Set(['ciya']) }));
  });
});

describe('yazım benzerliği', () => {
  test('yazım hatası ve harf yer değiştirmesi yakın; kardeş işletmeler uzak', () => {
    assert.ok(spellingSimilarity('Burger Yiyelin', 'Burger Yiyelim') >= 0.85);
    assert.ok(spellingSimilarity('Mero Lahamcun', 'Mero Lahmacun') >= 0.85);
    assert.ok(spellingSimilarity('Diva Kebap', 'Diva Kebab') >= 0.85);
    assert.ok(spellingSimilarity('İtalyan Cornetto', 'İtalyan Kornetto') >= 0.85);
    assert.ok(spellingSimilarity('Çiya Sofrası', 'Çiya Kebap') < 0.85);
    assert.ok(spellingSimilarity('Moda Reçel', 'Moda Van Kahvaltı') < 0.85);
    assert.ok(spellingSimilarity('Tekçe Kanat', 'Tekce Steakhouse') < 0.85);
  });
});

describe('canlıdaki mekânlarla eşleme', () => {
  // Canlı durum: mekânlar ve kaynak bağları; yeni yapının satırları (yer: Kadıköy, aralar birkaç metre)
  const at = (meters) => ({ latitude: 40.99 + meters / 111_000, longitude: 29.02 });
  const place = (name, [source, external_id], meters, activity = 0) => ({ name, source, external_id, rating_count: activity, post_count: 0, ...at(meters) });
  const row = (name, keys, meters) => ({ name, sources: keys.map((k) => ({ source: k.split(':')[0], external_id: k.split(':')[1] })), ...at(meters) });
  const assign = (places, links, rows) => {
    const result = assignPlaces(rows, new Map(Object.entries(links)), new Map(Object.entries(places)));
    return {
      to: rows.map((r) => result.assigned.get(r) ?? null),
      detach: result.detach.map((d) => `${d.source}/${d.external_id}→${d.place_id}`).sort(),
      originals: result.originals.map((o) => `${o.id}→${o.external_id ? `${o.source}/${o.external_id}` : 'boş'}`).sort(),
    };
  };

  test('yanlış birleşmiş mekân bölünür, puanlı kayıt adı uyuşan satırda kalır (Çiya)', () => {
    const places = {
      A: place('Çiya Sofrası', ['osm', 'n1'], 0, 7),
      B: place('Çiya Sofrası', ['overture', 'o1'], 4),
    };
    const links = { 'osm/n1': 'A', 'overture/o1': 'B', 'osm/n2': 'B' };
    const { to, detach, originals } = assign(places, links, [row('Çiya Kebap', ['osm:n2'], 4), row('Çiya Sofrası', ['overture:o1', 'osm:n1'], 0)]);
    assert.deepEqual(to, ['B', 'A']);
    assert.deepEqual(detach, ['overture/o1→B']);
    // B'nin ilk kaynağı (o1) artık A'nın satırında: B kendi satırının kaynağını alır
    assert.deepEqual(originals, ['B→osm/n2']);
  });

  test('aynı mekâna düşen ikinci satır yeni mekân açar, ezmez (Emirgan)', () => {
    const places = { E: place('Emirgan Tarihi Çınaraltı', ['osm', 'n1'], 0, 3) };
    const links = { 'osm/n1': 'E', 'overture/o1': 'E' };
    const { to, detach, originals } = assign(places, links, [row('Emirgan Sütiş', ['overture:o1'], 10), row('Emirgan Tarihi Çınaraltı', ['osm:n1'], 0)]);
    assert.deepEqual(to, [null, 'E']);
    assert.deepEqual(detach, ['overture/o1→E']);
    assert.deepEqual(originals, []);
  });

  test('yeni mekân açan satırın kaynağı eski mekânın ilk kaynağıysa eski mekân bırakır (tekillik)', () => {
    // E, Sütiş'in Overture kaydından açılmış; Sütiş yeni mekân açarken o1'i ilk kaynak yazacak
    const places = { E: place('Emirgan Tarihi Çınaraltı', ['overture', 'o1'], 0, 3) };
    const links = { 'osm/n1': 'E', 'overture/o1': 'E' };
    const { to, originals } = assign(places, links, [row('Emirgan Sütiş', ['overture:o1'], 10), row('Emirgan Tarihi Çınaraltı', ['osm:n1'], 0)]);
    assert.deepEqual(to, [null, 'E']);
    assert.deepEqual(originals, ['E→osm/n1']);
  });

  test('yarıda kalmış yükleme: bağı çözülmüş satır yeni mekân açar, ilk kaynağı boşalan mekân kendi satırından alır', () => {
    const places = {
      E: place('Emirgan Tarihi Çınaraltı', ['overture', 'o1'], 0, 3),
      F: { ...place('Fıstık Kafe', ['osm', 'n5'], 40), external_id: null },
    };
    const links = { 'osm/n1': 'E', 'osm/n5': 'F' };
    const { to, detach, originals } = assign(places, links, [
      row('Emirgan Sütiş', ['overture:o1'], 10),
      row('Emirgan Tarihi Çınaraltı', ['osm:n1'], 0),
      row('Fıstık Kafe', ['osm:n5'], 40),
    ]);
    assert.deepEqual(to, [null, 'E', 'F']);
    assert.deepEqual(detach, []);
    assert.deepEqual(originals, ['E→osm/n1', 'F→osm/n5']);
  });

  test('puanlı mekân, kaynağı başka işletmeye geçen satıra kaptırılmaz (Galata)', () => {
    // L: OSM'deki Pilavcı ile Overture'daki Lily Cafe yanlış birleşmiş, adı "Galata Lily Cafe", puanı var
    const places = {
      L: place('Galata Lily Cafe', ['osm', 'n1'], 0, 2),
      P: place('Galata Pilavcısı', ['overture', 'o2'], 3),
    };
    const links = { 'osm/n1': 'L', 'overture/o1': 'L', 'overture/o2': 'P' };
    const { to, detach, originals } = assign(places, links, [row('Galata Pilavcısı', ['osm:n1', 'overture:o2'], 0), row('Galata Lily Cafe', ['overture:o1'], 5)]);
    assert.deepEqual(to, ['P', 'L']);
    assert.deepEqual(detach, ['osm/n1→L']);
    assert.deepEqual(originals, ['L→overture/o1']);
  });

  test('birleşen kopyalardan puanlı olan ayakta kalır', () => {
    const places = {
      Q1: place('Moda Kahvesi', ['osm', 'n1'], 0),
      Q2: place('Moda Kahvesi', ['overture', 'o1'], 6, 4),
    };
    const links = { 'osm/n1': 'Q1', 'overture/o1': 'Q2' };
    const { to, detach, originals } = assign(places, links, [row('Moda Kahvesi', ['osm:n1', 'overture:o1'], 0)]);
    assert.deepEqual(to, ['Q2']);
    assert.deepEqual(detach, ['osm/n1→Q1']);
    // Q1'in satırı kalmadı (--prune siler): ilk kaynağı boşalır
    assert.deepEqual(originals, ['Q1→boş']);
  });

  test('değişmeyen eşleşmede hiçbir bağ çözülmez, yeni satır yeni mekân açar', () => {
    const places = { K: place('Kronotrop', ['osm', 'n1'], 0, 1), U: place('Ev Yapımı Tatlı', ['user', null], 300) };
    const links = { 'osm/n1': 'K', 'overture/o1': 'K' };
    const { to, detach, originals } = assign(places, links, [row('Kronotrop Cihangir', ['osm:n1', 'overture:o1'], 0), row('Yeni Kafe', ['osm:n9'], 50)]);
    assert.deepEqual(to, ['K', null]);
    assert.deepEqual(detach, []);
    assert.deepEqual(originals, []);
  });
});

describe('Türkçe karakter', () => {
  const corpus = [
    ...Array(10).fill('Tavuk Dünyası Kadıköy'),
    ...Array(9).fill('Köfteci Yusuf'),
    'Kofte Evi Şişli', // Türkçe klavyeyle ama sade yazılmış tek örnek: oran yine %90
    ...Array(6).fill('İşkembe Salonu'),
    ...Array(4).fill('Işkembe Çorbası'), // belirsiz: dokunulmaz
    ...Array(20).fill('Köy Kahvaltısı'),
    ...Array(3).fill('Koy Balık Şişli'), // kısa kelime: %98 tutarlılık yok
  ];
  const dictionary = buildDiacriticDictionary(corpus);

  test('tutarlı kelimeler düzelir, biçim korunur', () => {
    assert.equal(restoreTurkish('Tavuk Dunyasi Bagcilar', dictionary), 'Tavuk Dünyası Bagcilar');
    assert.equal(restoreTurkish('KOFTECI', dictionary), 'KÖFTECİ');
    assert.equal(restoreTurkish('kofteci', dictionary), 'köfteci');
  });

  test('belirsiz ve kısa kelimeler ile Türkçe harfli metinler olduğu gibi kalır', () => {
    assert.equal(restoreTurkish('Iskembe Salonu', dictionary), 'Iskembe Salonu');
    assert.equal(restoreTurkish('Koy Restaurant', dictionary), 'Koy Restaurant');
    // Yazan Türkçe klavye kullanmış: "Dunyasi" bilinçli olabilir
    assert.equal(restoreTurkish('Şef Dunyasi', dictionary), 'Şef Dunyasi');
  });
});
