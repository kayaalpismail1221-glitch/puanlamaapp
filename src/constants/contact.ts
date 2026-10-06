/**
 * Alan adı, iletişim adresi ve herkese açık yasal metin bağlantıları. Bu dosya hiçbir şey içe aktarmaz: yasal metin
 * betiği (`scripts/legal/build.mjs`) onu Node'da doğrudan okur. Uygulama içinde `@/constants/app` üzerinden de alınır.
 */

/** Uygulamanın web sitesi (web/, Vercel): tanıtım, yasal sayfalar, davet sayfası */
export const WEB_URL = 'https://expeat.app';

/** Destek, şikâyet ve gizlilik talepleri için iletişim adresi (yasal metinlerde de geçer) */
export const SUPPORT_EMAIL = 'destek@expeat.app';

/**
 * Herkese açık yasal sayfalar (web sitesi, `npm run web:build` aynı metinlerden üretir). App Store Connect'teki
 * Privacy Policy URL alanına `legalUrl('privacy', 'tr')`, Support URL alanına `legalUrl('support', 'tr')` yazılır.
 * Düz metin yedekleri Supabase Storage "legal" klasöründe (`npm run legal:build -- --upload`).
 */
const LEGAL_PATHS = {
  tr: { terms: '/kosullar', privacy: '/gizlilik', support: '/destek' },
  en: { terms: '/en/terms', privacy: '/en/privacy', support: '/en/support' },
} as const;

export const legalUrl = (doc: 'terms' | 'privacy' | 'support', lang: 'tr' | 'en') => `${WEB_URL}${LEGAL_PATHS[lang][doc]}`;
