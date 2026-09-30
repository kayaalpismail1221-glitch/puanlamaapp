import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { STORY_EXPORT } from '@/lib/story';

/**
 * Paylaşım kartlarının görsel olarak dışa aktarılması (1080×1920 PNG) ve gönderilmesi:
 * sistem paylaşım menüsü, Fotoğraflar'a kaydetme, Mesajlar'a ek olarak.
 */

export async function exportCard(ref: RefObject<View | null>): Promise<string> {
  if (!ref.current) throw new Error('card-not-ready');
  return captureRef(ref, { format: 'png', width: STORY_EXPORT.width, height: STORY_EXPORT.height, result: 'tmpfile' });
}

/** Sistem paylaşım menüsü (Instagram hikâyesi / gönderisi, TikTok, WhatsApp…) */
export async function shareImage(uri: string, dialogTitle: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
}

/**
 * Yerel modülü olmayan ortamda (web, eski build) paket dosya yüklenirken hata verir; bu yüzden
 * yalnızca düğmeye basılınca yüklenir ve yoksa özellik sessizce kapalı kalır.
 */
async function load<T>(importer: () => Promise<T>): Promise<T | null> {
  try {
    return await importer();
  } catch {
    return null;
  }
}

/** Fotoğraflar'a kaydeder (yalnızca ekleme izni istenir); izin verilmezse ya da desteklenmezse false */
export async function saveImage(uri: string): Promise<boolean> {
  // Kök paketteki saveToLibraryAsync bu sürümde yalnızca hata fırlatan bir kalıntı; çalışan API /legacy'de
  const MediaLibrary = await load(() => import('expo-media-library/legacy'));
  if (!MediaLibrary) return false;
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return false;
  await MediaLibrary.saveToLibraryAsync(uri);
  return true;
}

/** Mesajlar'ı görsel ekli açar; cihaz mesaj gönderemiyorsa false */
export async function messageImage(uri: string, body: string): Promise<boolean> {
  const SMS = await load(() => import('expo-sms'));
  if (!SMS || !(await SMS.isAvailableAsync())) return false;
  await SMS.sendSMSAsync([], body, { attachments: { uri, mimeType: 'image/png', filename: 'puanla.png' } });
  return true;
}
