/**
 * Mekân temizleme kurallarının testleri (örnekler Overture/OSM'deki gerçek kayıtlardan).
 * Çalıştırma: npm run test:places
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildDiacriticDictionary, categorize, cleanName, formatAddress, isVenueName, normalizePhone, normalizeWebsite, overtureCategory, restoreTurkish, similarNames } from './lib.mjs';

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
