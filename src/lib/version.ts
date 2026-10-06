/**
 * Uygulama sürümü karşılaştırması ("1.0.2" < "1.0.10"). Saf mantık: veritabanı testleri de içe aktarır.
 */

/** "1.2.3" → [1, 2, 3]; eksik kısımlar 0 ("1.2" = "1.2.0"). Sayı olmayan sürüm undefined. */
export function parseVersion(version: string): number[] | undefined {
  const parts = version.trim().split('.');
  if (parts.length === 0 || parts.length > 3 || !parts.every((p) => /^\d+$/.test(p))) return undefined;
  return [0, 1, 2].map((i) => Number(parts[i] ?? 0));
}

/**
 * Yüklü sürüm en düşük desteklenen sürümün altında mı. Sürümlerden biri okunamazsa false:
 * belirsizlikte kullanıcı hiçbir zaman kilitlenmez.
 */
export function isBelowMinVersion(current: string | null | undefined, min: string | null | undefined) {
  const a = current ? parseVersion(current) : undefined;
  const b = min ? parseVersion(min) : undefined;
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
