import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { unwrap } from '@/api/errors';
import { removeUserFolder } from '@/api/storage';
import { supabase } from '@/lib/supabase';
import type { SignupDraft } from '@/types';

/**
 * Hesap işlemleri: kayıt, giriş (e-posta/şifre, Apple, Google), şifre sıfırlama, hesap silme.
 * Şifre hiçbir zaman cihazda saklanmaz; doğrudan Supabase Auth'a gider.
 */

export type SignUpResult = { needsVerification: boolean };

export async function signUp(draft: SignupDraft & { email: string }, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email: draft.email,
    password,
    options: {
      // Veritabanındaki handle_new_user tetikleyicisi profili bu bilgilerle oluşturur
      data: { name: draft.name, username: draft.username },
    },
  });
  // Supabase, kayıtlı bir e-postayı sızdırmamak için hata yerine boş kimlikli kullanıcı döner
  const failure =
    error ??
    (data.user && data.user.identities?.length === 0
      ? Object.assign(new Error('User already registered'), { name: 'AuthApiError' })
      : null);
  if (failure) {
    // İstek hata verse de hesap açılıp oturum kurulmuş olabilir (yavaş bağlantıda yanıt kayboldu, art arda iki
    // istekte ikincisi "kayıtlı" dedi): oturum bu e-postaysa kayıt başarılı, kullanıcıya uyarı gösterilmez
    const { data: current } = await supabase.auth.getSession();
    if (current.session?.user.email?.toLowerCase() === draft.email.trim().toLowerCase()) return { needsVerification: false };
    throw failure;
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

/**
 * Telefon doğrulaması: Supabase Auth numaraya SMS kodu gönderir (Supabase → Auth → Phone sağlayıcısı gerekir).
 * Kod doğrulanınca veritabanı numarayı onaylı sayar ve rehber eşleştirmesi açılır (`on_auth_user_phone`).
 * `phone`: "+905XXXXXXXXX"
 */
export async function sendPhoneCode(phone: string) {
  unwrap(await supabase.auth.updateUser({ phone }));
}

export async function verifyPhoneCode(phone: string, code: string) {
  unwrap(await supabase.auth.verifyOtp({ phone, token: code, type: 'phone_change' }));
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

/**
 * Google ile giriş (şimdilik yalnız Android; iOS'ta Apple var). Google Cloud'daki "Web application" istemci
 * kimliği `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` ile gelir: kimlik jetonunun alıcısı odur ve Supabase'teki Google
 * sağlayıcısında da kayıtlı olmalı. Paket adı + imza SHA-1'iyle bir "Android" istemcisi de gerekir (bkz. SUPABASE.md).
 * Değişken yoksa düğme görünmez. Yerel modül Expo Go'da yok; içe aktarma ilk kullanıma kadar ertelenir.
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export const isGoogleSignInAvailable = () =>
  Platform.OS === 'android' &&
  GOOGLE_WEB_CLIENT_ID !== '' &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');
let googleModule: GoogleSignInModule | undefined;

async function google(): Promise<GoogleSignInModule> {
  if (!googleModule) {
    googleModule = await import('@react-native-google-signin/google-signin');
    googleModule.GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
  }
  return googleModule;
}

/**
 * Google ile giriş; yeni hesapta profil Google'daki adla açılır (`handle_new_user`, `full_name`).
 * Dönüş: iptal edildiyse false.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const { GoogleSignin, isErrorWithCode, statusCodes } = await google();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return false;
    if (!response.data.idToken) throw new Error('Google kimlik bilgisi alınamadı');
    unwrap(await supabase.auth.signInWithIdToken({ provider: 'google', token: response.data.idToken }));
    return true;
  } catch (error) {
    // Çift dokunuşta ikinci istek: ilki sürüyor
    if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) return false;
    throw error;
  }
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

/**
 * Kayıtta e-posta adımı: adres zaten kayıtlı mı (giriş gerektirmez). İstek başarısızsa `undefined`: kullanıcı
 * engellenmez, kayıt isteği yine söyler (şifre adımında alanın altında).
 */
export async function emailRegistered(email: string): Promise<boolean | undefined> {
  try {
    const { data, error } = await supabase.rpc('email_registered', { p_email: email });
    return error ? undefined : !!data;
  } catch {
    return undefined;
  }
}

export async function signOut() {
  // Sunucuya ulaşılamasa da cihazdaki oturum silinir
  await supabase.auth.signOut({ scope: 'local' });
  // Google son hesabı hatırlar; çıkılmazsa bir sonraki girişte hesap seçici açılmaz
  if (isGoogleSignInAvailable()) {
    await google()
      .then((m) => m.GoogleSignin.signOut())
      .catch(() => {});
  }
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
