import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { unwrap } from '@/api/errors';
import { removeUserFolder } from '@/api/storage';
import { supabase } from '@/lib/supabase';
import type { SignupDraft } from '@/types';

/**
 * Hesap işlemleri: kayıt, giriş (e-posta/şifre ve Apple), şifre sıfırlama, hesap silme.
 * Şifre hiçbir zaman cihazda saklanmaz; doğrudan Supabase Auth'a gider.
 */

export type SignUpResult = { needsVerification: boolean };

export async function signUp(draft: SignupDraft & { email: string }, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: draft.email,
    password,
    options: {
      // Veritabanındaki handle_new_user tetikleyicisi profili bu bilgilerle oluşturur
      data: { name: draft.name, username: draft.username, phone: draft.phone },
    },
  });
  if (error) throw error;
  // Supabase, kayıtlı bir e-postayı sızdırmamak için hata yerine boş kimlikli kullanıcı döner
  if (data.user && data.user.identities?.length === 0) {
    throw Object.assign(new Error('User already registered'), { name: 'AuthApiError' });
  }
  return { needsVerification: !data.session };
}

/** E-posta doğrulaması açıksa kayıttan sonra gelen 6 haneli kod */
export async function verifySignupCode(email: string, code: string) {
  unwrap(await supabase.auth.verifyOtp({ email, token: code, type: 'signup' }));
}

export async function resendSignupCode(email: string) {
  unwrap(await supabase.auth.resend({ type: 'signup', email }));
}

export async function signIn(email: string, password: string) {
  unwrap(await supabase.auth.signInWithPassword({ email, password }));
}

export const isAppleSignInAvailable = () => AppleAuthentication.isAvailableAsync();

/**
 * Apple ile giriş. Apple adı yalnızca ilk girişte verir; varsa profile yazılır.
 * Dönüş: iptal edildiyse false.
 */
export async function signInWithApple(): Promise<boolean> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple kimlik bilgisi alınamadı');

  const data = unwrap(
    await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce }),
  );

  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ');
  if (name && data.user) {
    // Yeni hesapta profil e-postadan türetilmiş bir adla açılır; Apple'ın verdiği gerçek adla düzelt
    await supabase.from('profiles').update({ name }).eq('id', data.user.id);
  }
  return true;
}

/** Şifremi unuttum: e-postaya 6 haneli giriş kodu gönderir (hesap yoksa oluşturmaz) */
export async function sendLoginCode(email: string) {
  unwrap(await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
}

export async function verifyLoginCode(email: string, code: string) {
  unwrap(await supabase.auth.verifyOtp({ email, token: code, type: 'email' }));
}

export async function updatePassword(password: string) {
  unwrap(await supabase.auth.updateUser({ password }));
}

export async function usernameAvailable(username: string): Promise<boolean> {
  return unwrap(await supabase.rpc('username_available', { p_username: username })) ?? false;
}

export async function signOut() {
  // Sunucuya ulaşılamasa da cihazdaki oturum silinir
  await supabase.auth.signOut({ scope: 'local' });
}

/**
 * Hesabı kalıcı olarak siler: önce fotoğraflar, sonra veritabanındaki her şey.
 * App Store kuralı gereği uygulama içinden yapılabilmeli.
 */
export async function deleteAccount(userId: string) {
  await Promise.all([removeUserFolder('post-photos', userId), removeUserFolder('avatars', userId)]);
  unwrap(await supabase.rpc('delete_account'));
  await signOut();
}
