import type * as ContactsModule from 'expo-contacts';
import { Linking, Platform, Share } from 'react-native';

import { inviteLink } from '@/constants/app';
import i18n from '@/i18n';
import { formatScore } from '@/lib/format';
import { normalizePhone } from '@/lib/validation';

/**
 * Cihaz rehberi ve davet mesajları (masa döngüsü).
 * Rehber yerel modül ister; web'de ve modülü olmayan eski build'de özellik kapalı kalır (null döner).
 */

export type DeviceContact = { name: string; phone: string };

type Contacts = typeof ContactsModule;

async function loadContacts(): Promise<Contacts | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-contacts');
  } catch {
    return null;
  }
}

/** Rehber bu cihazda kullanılabilir mi (yerel modül var mı) */
export async function contactsAvailable() {
  return !!(await loadContacts());
}

type RawContact = { fullName?: string | null; phones?: { number?: string }[] | null };

/** Kişinin ilk Türkiye cep numarası; adı yoksa numara */
function toDeviceContact(c: RawContact): DeviceContact | undefined {
  for (const p of c.phones ?? []) {
    const phone = p.number ? normalizePhone(p.number) : undefined;
    if (phone) return { name: c.fullName?.trim() || phone, phone };
  }
  return undefined;
}

/**
 * Sistem kişi seçicisi (gönderide "Rehberden ekle").
 * Dönüş: seçilen kişi | null (vazgeçti) | 'no_mobile' (Türkiye cep numarası yok) | 'unavailable'
 */
export async function pickContact(): Promise<DeviceContact | null | 'no_mobile' | 'unavailable' | 'denied'> {
  const Contacts = await loadContacts();
  if (!Contacts) return 'unavailable';
  const contact = await Contacts.Contact.presentPicker();
  if (!contact) return null;
  const fields = [Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES] as const;
  let details: RawContact;
  try {
    details = await contact.getDetails(fields);
  } catch {
    // Bazı iOS sürümlerinde seçilen kişinin ayrıntıları için rehber izni gerekir
    if (!(await Contacts.requestPermissionsAsync()).granted) return 'denied';
    details = await contact.getDetails(fields);
  }
  return toDeviceContact(details) ?? 'no_mobile';
}

/** Rehberdeki Türkiye cep numaralı kişiler (izin istenir); izin yoksa 'denied' */
export async function readAllContacts(): Promise<DeviceContact[] | 'denied' | 'unavailable'> {
  const Contacts = await loadContacts();
  if (!Contacts) return 'unavailable';
  if (!(await Contacts.requestPermissionsAsync()).granted) return 'denied';
  const all = await Contacts.Contact.getAllDetails([Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES]);
  const byPhone = new Map<string, DeviceContact>();
  for (const c of all) {
    const contact = toDeviceContact(c);
    if (contact && !byPhone.has(contact.phone)) byPhone.set(contact.phone, contact);
  }
  return [...byPhone.values()];
}

/* ---------- Davet mesajı ---------- */

/** "İsmail, Çiya'ya 8,7 verdi. Sen kaç verirdin?" + indirme bağlantısı */
export function inviteText(input: { inviterName: string; placeName: string; score?: number }) {
  const first = input.inviterName.split(' ')[0] ?? input.inviterName;
  const body =
    input.score === undefined
      ? i18n.t('invite.messageNoScore', { name: first, place: input.placeName })
      : i18n.t('invite.message', { name: first, place: input.placeName, score: formatScore(input.score) });
  const link = inviteLink();
  return `${body}\n\n${link ? i18n.t('invite.download', { link }) : i18n.t('invite.searchStore')}`;
}

/** Davet mesajını doğrudan o kişiye WhatsApp'tan açar; WhatsApp yoksa SMS, o da yoksa paylaşım menüsü */
export async function sendInvite(phone: string, text: string, via: 'whatsapp' | 'sms') {
  if (via === 'whatsapp') {
    const url = `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // WhatsApp açılamadı; SMS'e düş
    }
  }
  try {
    const SMS = await import('expo-sms');
    if (await SMS.isAvailableAsync()) {
      await SMS.sendSMSAsync([phone], text);
      return;
    }
  } catch {
    // Yerel modül yok (web); paylaşım menüsüne düş
  }
  await Share.share({ message: text }).catch(() => {});
}
