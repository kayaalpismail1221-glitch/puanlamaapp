/**
 * Yasal metinler: Kullanım Koşulları (topluluk kuralları dahil) ve Gizlilik Politikası.
 * Tek kaynak: uygulama içi ekran (`app/yasal/[belge].tsx`) ve herkese açık HTML sayfaları
 * (`npm run legal:build` → Supabase Storage "legal" klasörü) buradan üretilir.
 *
 * Not: Metinler uygulamanın gerçek veri işleyişine göre yazıldı; yayından önce bir hukukçuya
 * (KVKK açısından) gözden geçirtilmesi önerilir. `{{email}}` yerine `constants/app.ts`'teki
 * iletişim adresi konur (`legalText`). Bu dosya bilerek hiçbir şey içe aktarmaz: Node betiği de okur.
 */
export type LegalDoc = 'terms' | 'privacy' | 'support';
export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalText = { title: string; updated: string; intro: string; sections: LegalSection[] };

const UPDATED_TR = 'Son güncelleme: 24 Eylül 2026';
const UPDATED_EN = 'Last updated: September 24, 2026';

const termsTr: LegalText = {
  title: 'Kullanım Koşulları',
  updated: UPDATED_TR,
  intro:
    'Puanla’yı kullanarak bu koşulları ve topluluk kurallarını kabul etmiş olursun. Lütfen dikkatlice oku; kabul etmiyorsan uygulamayı kullanma.',
  sections: [
    {
      heading: '1. Hizmet',
      paragraphs: [
        'Puanla; gittiğin restoran ve kafeleri puanlayıp sıralayabildiğin, fotoğraf ve yorum paylaşabildiğin, arkadaşlarının önerilerini görebildiğin bir sosyal uygulamadır. Hizmet “olduğu gibi” sunulur ve zaman içinde değişebilir.',
      ],
    },
    {
      heading: '2. Hesap',
      paragraphs: [
        'Hesap açmak için en az 13 yaşında olmalısın. 18 yaşından küçüksen uygulamayı veli ya da vasinin izniyle kullanmalısın.',
        'Verdiğin bilgilerin doğru olmasından ve hesabının güvenliğinden sen sorumlusun. Başkası adına hesap açamaz, başkasını taklit edemezsin.',
        'Hesabını dilediğin zaman Ayarlar > Hesabı sil adımıyla kalıcı olarak silebilirsin.',
      ],
    },
    {
      heading: '3. Topluluk kuralları — sıfır tolerans',
      paragraphs: [
        'Puanla’da uygunsuz içeriğe ve taciz eden kullanıcılara karşı sıfır tolerans uygulanır. Aşağıdakileri paylaşmak yasaktır:',
        '• Küfür, hakaret, taciz, zorbalık, tehdit ya da nefret söylemi (ırk, etnik köken, din, cinsiyet, cinsel yönelim, engellilik vb. hedef alan içerik);',
        '• Cinsel içerik, çıplaklık, şiddet ya da kan içeren görseller;',
        '• Yasa dışı faaliyetleri, uyuşturucuyu ya da kendine zarar vermeyi teşvik eden içerik;',
        '• Spam, reklam, sahte ya da yanıltıcı değerlendirme; bir işletmeden karşılık alarak yapılan ve bunu belirtmeyen değerlendirme;',
        '• Başkasının kişisel bilgileri, izinsiz çekilmiş kişi fotoğrafları ya da başkasına ait telif hakkıyla korunan içerik.',
        'Metinler gönderilmeden önce otomatik olarak uygunsuz ifadeler açısından denetlenir. Her gönderi, yorum ve profil “Şikâyet et” ile bildirilebilir; istemediğin kişileri “Engelle” ile tamamen gizleyebilirsin.',
        'Şikâyetleri 24 saat içinde inceleriz. Kurallara aykırı içeriği kaldırır, ihlal eden hesabı uyarmadan askıya alabilir ya da kalıcı olarak kapatabiliriz.',
      ],
    },
    {
      heading: '4. Paylaştığın içerik',
      paragraphs: [
        'Paylaştığın fotoğraf, yorum ve puanların sahibi sensin. Bunları paylaşarak Puanla’ya, içeriği uygulamada göstermek, depolamak ve hizmeti işletmek amacıyla dünya çapında, ücretsiz, devredilemeyen bir kullanım izni vermiş olursun. İçeriğini sildiğinde bu izin sona erer.',
        'Paylaştığın içeriğin sana ait olduğunu ya da paylaşma hakkına sahip olduğunu kabul edersin.',
      ],
    },
    {
      heading: '5. Mekân bilgileri',
      paragraphs: [
        'Mekân adları ve konumları OpenStreetMap katkıcılarının verisinden (ODbL lisansı) ve kullanıcı eklemelerinden oluşur; güncel ya da eksiksiz olmayabilir. Puanlar ve yorumlar kullanıcıların kişisel görüşleridir, Puanla’nın görüşünü yansıtmaz.',
      ],
    },
    {
      heading: '6. Sorumluluğun sınırlandırılması',
      paragraphs: [
        'Puanla, kullanıcı içeriğinden ya da mekânlarda yaşanan deneyimlerden sorumlu değildir. Yürürlükteki hukukun izin verdiği ölçüde hizmetin kullanımından doğan dolaylı zararlardan sorumluluk kabul edilmez.',
      ],
    },
    {
      heading: '7. Değişiklikler ve uygulanacak hukuk',
      paragraphs: [
        'Bu koşulları güncelleyebiliriz; önemli değişiklikleri uygulama içinde duyururuz. Koşullar Türkiye Cumhuriyeti hukukuna tabidir.',
      ],
    },
    {
      heading: '8. İletişim',
      paragraphs: ['Soruların ve bildirimlerin için: {{email}}'],
    },
  ],
};

const termsEn: LegalText = {
  title: 'Terms of Use',
  updated: UPDATED_EN,
  intro:
    'By using Puanla you agree to these terms and our community guidelines. Please read them carefully; if you don’t agree, don’t use the app.',
  sections: [
    {
      heading: '1. The service',
      paragraphs: [
        'Puanla is a social app for rating and ranking the restaurants and cafés you visit, sharing photos and reviews, and discovering places your friends recommend. The service is provided “as is” and may change over time.',
      ],
    },
    {
      heading: '2. Your account',
      paragraphs: [
        'You must be at least 13 years old to create an account. If you are under 18, you may use the app only with the permission of a parent or guardian.',
        'You are responsible for the accuracy of your information and the security of your account. You may not create an account for someone else or impersonate anyone.',
        'You can permanently delete your account at any time via Settings > Delete account.',
      ],
    },
    {
      heading: '3. Community guidelines — zero tolerance',
      paragraphs: [
        'Puanla has zero tolerance for objectionable content and abusive users. You may not post:',
        '• Profanity, insults, harassment, bullying, threats or hate speech (content targeting race, ethnicity, religion, gender, sexual orientation, disability, etc.);',
        '• Sexual content, nudity, or violent or graphic imagery;',
        '• Content promoting illegal activity, drugs or self-harm;',
        '• Spam, advertising, fake or misleading reviews, or undisclosed paid reviews;',
        '• Other people’s personal information, photos of people taken without consent, or content that infringes someone else’s copyright.',
        'Text is automatically screened for objectionable language before it is posted. Any post, comment or profile can be flagged with “Report”, and you can hide anyone completely with “Block”.',
        'We review reports within 24 hours. We remove content that violates these rules and may suspend or permanently terminate offending accounts without notice.',
      ],
    },
    {
      heading: '4. Your content',
      paragraphs: [
        'You own the photos, reviews and ratings you share. By sharing them, you grant Puanla a worldwide, royalty-free, non-transferable license to display and store that content in the app and to operate the service. This license ends when you delete the content.',
        'You confirm that the content you share is yours or that you have the right to share it.',
      ],
    },
    {
      heading: '5. Place information',
      paragraphs: [
        'Place names and locations come from OpenStreetMap contributors (ODbL license) and user submissions, and may not be current or complete. Ratings and reviews are users’ personal opinions and do not represent Puanla’s views.',
      ],
    },
    {
      heading: '6. Limitation of liability',
      paragraphs: [
        'Puanla is not responsible for user content or for experiences at any venue. To the extent permitted by law, we are not liable for indirect damages arising from use of the service.',
      ],
    },
    {
      heading: '7. Changes and governing law',
      paragraphs: [
        'We may update these terms and will announce significant changes in the app. These terms are governed by the laws of the Republic of Türkiye.',
      ],
    },
    {
      heading: '8. Contact',
      paragraphs: ['Questions and reports: {{email}}'],
    },
  ],
};

const privacyTr: LegalText = {
  title: 'Gizlilik Politikası',
  updated: UPDATED_TR,
  intro:
    'Bu politika, Puanla’nın (“biz”) hangi kişisel verileri neden işlediğini ve haklarını açıklar. 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında veri sorumlusu Puanla’dır.',
  sections: [
    {
      heading: '1. Topladığımız veriler',
      paragraphs: [
        '• Hesap bilgileri: e-posta adresi, ad-soyad, kullanıcı adı ve şifre (şifren yalnızca şifrelenmiş olarak saklanır). İsteğe bağlı olarak cep telefonu numarası (yalnızca arkadaşlarının seni rehberinden bulabilmesi için; profilinde görünmez, kimseyle paylaşılmaz). Apple ile giriş yaparsan Apple’ın paylaştığı ad ve e-posta.',
        '• Profil: profil fotoğrafı, okul (isteğe bağlı) ve yıllık hedef.',
        '• Paylaştıkların: puanlar ve sıralamalar, gönderiler, fotoğraflar, yorumlar, beğeniler, kaydettiklerin, Listem’e eklediğin bağlantı ve notlar, takip ilişkileri, şikâyet ve engellemeler.',
        '• Konum: “Yakınımda” feed’i ve harita için cihazının konumu yalnızca izin verirsen ve uygulama açıkken kullanılır. Konumun yakındaki gönderileri bulmak için anlık sorguda kullanılır; sunucularımızda saklanmaz.',
        '• Fotoğraflar ve kamera: yalnızca paylaşmak için seçtiğin ya da çektiğin fotoğraflar yüklenir; fotoğraf arşivinin geri kalanına erişmeyiz.',
      ],
    },
    {
      heading: '2. Kullanım amaçları ve hukuki sebepler',
      paragraphs: [
        'Verilerini hesabını oluşturmak ve yönetmek, paylaşımlarını diğer kullanıcılara göstermek, sana yakındaki ve arkadaşlarının önerdiği mekânları sunmak, hizmetin güvenliğini sağlamak ve topluluk kurallarını uygulamak için işleriz. Hukuki sebep: sözleşmenin kurulması ve ifası, meşru menfaatimiz ve (konum gibi) açık rızan.',
        'Reklam göstermiyoruz, verilerini satmıyoruz ve seni başka uygulama ya da sitelerde izlemiyoruz (tracking yok). Üçüncü taraf analiz ya da reklam aracı kullanmıyoruz.',
      ],
    },
    {
      heading: '3. Kimler görebilir',
      paragraphs: [
        'Profilin (ad, kullanıcı adı, fotoğraf, okul), puanların, gönderilerin ve yorumların Puanla kullanıcılarına görünür. E-posta adresin diğer kullanıcılara gösterilmez. Engellediğin kişiler seni ve paylaşımlarını göremez.',
      ],
    },
    {
      heading: '4. Hizmet sağlayıcılar ve yurt dışı aktarım',
      paragraphs: [
        'Verilerin, altyapı sağlayıcımız Supabase’in Avrupa Birliği (Frankfurt, Almanya) bölgesindeki sunucularında saklanır. Bu nedenle verilerin KVKK’nın 9. maddesi kapsamında yurt dışına aktarılır. Apple ile giriş kullanırsan kimlik doğrulama Apple tarafından yapılır. Yasal zorunluluklar dışında verilerini başka kimseyle paylaşmayız.',
      ],
    },
    {
      heading: '5. Saklama ve silme',
      paragraphs: [
        'Verilerini hesabın açık olduğu sürece saklarız. Ayarlar > Hesabı sil ile hesabını sildiğinde profilin, puanların, gönderilerin, fotoğrafların, yorumların ve diğer tüm verilerin kalıcı olarak silinir. Yasal yükümlülükler için saklanması gereken kayıtlar mevzuattaki süre boyunca tutulabilir.',
      ],
    },
    {
      heading: '6. Hakların',
      paragraphs: [
        'KVKK’nın 11. maddesi uyarınca verilerinin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini ya da silinmesini isteme, işlemeye itiraz etme ve zarara uğradıysan tazminat talep etme hakların vardır. Verilerinin çoğunu uygulama içinden düzenleyebilir ya da silebilirsin; diğer talepler için bize yazabilirsin.',
      ],
    },
    {
      heading: '7. Çocuklar',
      paragraphs: ['Puanla 13 yaşından küçük çocuklara yönelik değildir ve bilerek onlardan veri toplamayız.'],
    },
    {
      heading: '8. Güvenlik ve değişiklikler',
      paragraphs: [
        'Verilerin şifreli bağlantı (HTTPS) üzerinden iletilir; erişim, satır düzeyinde güvenlik kurallarıyla sınırlandırılır. Bu politikayı güncelleyebiliriz; önemli değişiklikleri uygulama içinde duyururuz.',
      ],
    },
    {
      heading: '9. İletişim',
      paragraphs: ['Gizlilikle ilgili soru ve talepler için: {{email}}'],
    },
  ],
};

const privacyEn: LegalText = {
  title: 'Privacy Policy',
  updated: UPDATED_EN,
  intro:
    'This policy explains what personal data Puanla (“we”) processes, why, and what your rights are. Puanla is the data controller under Türkiye’s Personal Data Protection Law No. 6698 (KVKK).',
  sections: [
    {
      heading: '1. Data we collect',
      paragraphs: [
        '• Account: email address, full name, username and password (stored only in hashed form). Optionally, your mobile number (only so friends can find you from their contacts; never shown on your profile or shared). If you sign in with Apple, the name and email Apple shares with us.',
        '• Profile: profile photo, school (optional) and yearly goal.',
        '• What you share: ratings and rankings, posts, photos, comments, likes, saves, links and notes in My List, follows, reports and blocks.',
        '• Location: used only if you allow it and only while the app is open, for the “Near me” feed and the map. Your location is used in a live query to find nearby posts and is not stored on our servers.',
        '• Photos and camera: only the photos you choose or take to share are uploaded; we don’t access the rest of your library.',
      ],
    },
    {
      heading: '2. How we use it and legal bases',
      paragraphs: [
        'We use your data to create and manage your account, show what you share to other users, suggest places near you and places your friends recommend, keep the service secure and enforce our community guidelines. Legal bases: performance of our contract with you, our legitimate interests, and your consent (e.g. for location).',
        'We don’t show ads, we don’t sell your data and we don’t track you across other apps or websites. We don’t use third-party analytics or advertising tools.',
      ],
    },
    {
      heading: '3. Who can see it',
      paragraphs: [
        'Your profile (name, username, photo, school), ratings, posts and comments are visible to Puanla users. Your email is never shown to other users. People you block can’t see you or your content.',
      ],
    },
    {
      heading: '4. Service providers and international transfers',
      paragraphs: [
        'Your data is stored with our infrastructure provider Supabase in its European Union region (Frankfurt, Germany), which means it is transferred outside Türkiye under Article 9 of the KVKK. If you use Sign in with Apple, authentication is handled by Apple. We don’t share your data with anyone else except where required by law.',
      ],
    },
    {
      heading: '5. Retention and deletion',
      paragraphs: [
        'We keep your data while your account is active. When you delete your account via Settings > Delete account, your profile, ratings, posts, photos, comments and all other data are permanently deleted. Records we are legally required to keep may be retained for the period the law requires.',
      ],
    },
    {
      heading: '6. Your rights',
      paragraphs: [
        'Under Article 11 of the KVKK (and, where applicable, the GDPR) you have the right to know whether your data is processed, request information, ask for correction or deletion, object to processing, and seek compensation for damages. You can edit or delete most of your data in the app; for anything else, contact us.',
      ],
    },
    {
      heading: '7. Children',
      paragraphs: ['Puanla is not directed at children under 13 and we don’t knowingly collect data from them.'],
    },
    {
      heading: '8. Security and changes',
      paragraphs: [
        'Your data is transmitted over encrypted connections (HTTPS) and access is restricted by row-level security rules. We may update this policy and will announce significant changes in the app.',
      ],
    },
    {
      heading: '9. Contact',
      paragraphs: ['For privacy questions and requests: {{email}}'],
    },
  ],
};

const supportTr: LegalText = {
  title: 'Destek',
  updated: UPDATED_TR,
  intro: 'Puanla ile ilgili her soru, öneri ve sorun için bize yazabilirsin. Genellikle 1 iş günü içinde yanıt veririz.',
  sections: [
    { heading: 'İletişim', paragraphs: ['E-posta: {{email}}', 'Uygulama içinden: Ayarlar > Bize yaz.'] },
    {
      heading: 'Uygunsuz içerik ve kullanıcı bildirme',
      paragraphs: [
        'Bir gönderi, yorum ya da profildeki … menüsünden “Şikâyet et”i seç. Şikâyetleri 24 saat içinde inceleriz.',
        'Aynı menüden kişiyi engelleyebilirsin; engellediğin kişiler seni ve paylaşımlarını göremez. Engelleri Ayarlar > Engellenen kişiler’den kaldırabilirsin.',
      ],
    },
    {
      heading: 'Hesabını silme',
      paragraphs: ['Ayarlar > Hesabı sil adımıyla hesabını ve tüm verilerini kalıcı olarak silebilirsin.'],
    },
    {
      heading: 'Eksik ya da hatalı mekân',
      paragraphs: ['Aramada “Yeni mekân ekle” ile eksik mekânı ekleyebilir, hatalı bilgileri bize e-postayla bildirebilirsin.'],
    },
  ],
};

const supportEn: LegalText = {
  title: 'Support',
  updated: UPDATED_EN,
  intro: 'Write to us about any question, idea or problem with Puanla. We usually reply within 1 business day.',
  sections: [
    { heading: 'Contact', paragraphs: ['Email: {{email}}', 'In the app: Settings > Contact us.'] },
    {
      heading: 'Reporting content and users',
      paragraphs: [
        'Choose “Report” from the … menu on any post, comment or profile. We review reports within 24 hours.',
        'From the same menu you can block someone; people you block can’t see you or your content. You can unblock people in Settings > Blocked people.',
      ],
    },
    {
      heading: 'Deleting your account',
      paragraphs: ['You can permanently delete your account and all your data via Settings > Delete account.'],
    },
    {
      heading: 'Missing or incorrect places',
      paragraphs: ['Use “Add a new place” in search to add a missing place, or email us about incorrect details.'],
    },
  ],
};

const LEGAL: Record<'tr' | 'en', Record<LegalDoc, LegalText>> = {
  tr: { terms: termsTr, privacy: privacyTr, support: supportTr },
  en: { terms: termsEn, privacy: privacyEn, support: supportEn },
};

/** İstenen belge, iletişim adresi yerleştirilmiş hâliyle */
export function legalText(lang: 'tr' | 'en', doc: LegalDoc, email: string): LegalText {
  const text = LEGAL[lang][doc];
  const fill = (value: string) => value.replaceAll('{{email}}', email);
  return {
    ...text,
    sections: text.sections.map((s) => ({ heading: s.heading, paragraphs: s.paragraphs.map(fill) })),
  };
}
