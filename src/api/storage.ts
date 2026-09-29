import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

/**
 * Fotoğraf yükleme: telefonda küçült, JPEG'e çevir, doğrudan depolamaya yükle.
 * 12 MP'lik bir iPhone fotoğrafı ~4 MB'tan ~250 KB'a iner; feed hızlı açılır, depolama ucuz kalır.
 */

export type Bucket = 'post-photos' | 'avatars';

export type LocalImage = { uri: string; width: number; height: number };

export type PreparedImage = LocalImage;

/** Uzun kenarı `maxSize` pikseli geçmeyecek şekilde küçültür ve JPEG olarak kaydeder */
export async function prepareImage(image: LocalImage, maxSize: number, quality = 0.8): Promise<PreparedImage> {
  const context = ImageManipulator.manipulate(image.uri);
  const longest = Math.max(image.width, image.height);
  if (longest > maxSize) {
    context.resize(image.width >= image.height ? { width: maxSize } : { height: maxSize });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  return { uri: result.uri, width: result.width, height: result.height };
}

/** Görselin piksel cinsinden bir dikdörtgenini kesip JPEG kaydeder (gönderi kırpma ekranı) */
export async function cropImage(
  image: LocalImage,
  rect: { originX: number; originY: number; width: number; height: number },
  quality = 0.92,
): Promise<LocalImage> {
  const rendered = await ImageManipulator.manipulate(image.uri).crop(rect).renderAsync();
  const result = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  return { uri: result.uri, width: result.width, height: result.height };
}

export async function uploadImage(bucket: Bucket, path: string, localUri: string): Promise<void> {
  const bytes = await new File(localUri).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  });
  if (error) throw error;
}

export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
}

/** Bir klasördeki tüm dosyaları (alt klasörler dahil) listeler */
async function listRecursive(bucket: Bucket, folder: string): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100, offset });
    if (error) throw error;
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      // Klasörlerin kimliği yoktur
      if (item.id) files.push(path);
      else files.push(...(await listRecursive(bucket, path)));
    }
    if (data.length < 100) return files;
  }
}

/** Kullanıcının kovadaki tüm dosyalarını siler (hesap silme) */
export async function removeUserFolder(bucket: Bucket, userId: string): Promise<void> {
  const files = await listRecursive(bucket, userId);
  for (let i = 0; i < files.length; i += 100) await removeFiles(bucket, files.slice(i, i + 100));
}
