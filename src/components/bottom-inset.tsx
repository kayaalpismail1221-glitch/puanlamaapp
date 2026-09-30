/**
 * Kaydırılan içeriğin sonundaki boşluk (Android: bottom-inset.android.tsx). iOS'ta
 * `contentInsetAdjustmentBehavior="automatic"` alt güvenli alanı, `automaticallyAdjustKeyboardInsets` ve sistem
 * klavyeyi zaten hesaba katar: burada boşluk yok.
 */
export function BottomInsetSpacer(_props: { keyboardOnly?: boolean }) {
  return null;
}
