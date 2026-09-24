/**
 * Açılıp kapatılabilen özellikler.
 */

/**
 * E-postayla 6 haneli kod gönderen akışlar (kayıt doğrulama, şifremi unuttum).
 * Kendi SMTP servisimiz (alan adı + Resend) bağlanıp Supabase'e supabase/templates/ şablonları
 * yüklenene kadar kapalı: Supabase'in varsayılan e-postası kod değil, uygulamaya dönmeyen bir bağlantı içerir.
 * Açarken Supabase'te "Confirm email" ayarını da aç (bkz. SUPABASE.md).
 */
export const EMAIL_CODES_ENABLED = false;

/**
 * Apple ile giriş. Apple Developer hesabında "Sign in with Apple" yeteneği ve Supabase'te Apple
 * sağlayıcısı (Services ID + anahtar) ayarlanana kadar kapalı: yarım ayarlı buton hata verir ve
 * App Store incelemesinde "çalışmayan özellik" (Kural 2.1) sayılır. Ayarlayınca `true` yap.
 */
export const APPLE_SIGN_IN_ENABLED = false;
