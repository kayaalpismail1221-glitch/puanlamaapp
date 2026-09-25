import { useQuery } from '@tanstack/react-query';

import { fetchMyInvites, matchContacts, type ContactMatch } from '@/api/contacts';
import { readAllContacts } from '@/lib/contacts';
import { keys } from '@/lib/query-client';

export type ContactFriends =
  | { status: 'ok'; matches: (ContactMatch & { contactName: string })[] }
  | { status: 'denied' | 'unavailable'; matches: [] };

/**
 * Rehberdeki Puanla kullanıcıları. Rehber yalnızca kullanıcı "Rehberini tara" deyince okunur
 * (izin o an istenir); sonuç oturum boyunca önbellekte kalır. Rehber sunucuya özet olarak kaydedilir,
 * böylece rehberdeki biri sonradan katılınca bildirim gelir.
 */
export function useContactFriends() {
  const query = useQuery<ContactFriends>({
    queryKey: keys.contactMatches(),
    queryFn: async () => {
      const contacts = await readAllContacts();
      if (typeof contacts === 'string') return { status: contacts, matches: [] };
      const names = new Map(contacts.map((c) => [c.phone, c.name]));
      const matches = await matchContacts(contacts.map((c) => c.phone), true);
      return { status: 'ok', matches: matches.map((m) => ({ ...m, contactName: names.get(m.phone) ?? m.user.name })) };
    },
    enabled: false,
    staleTime: Infinity,
    retry: false,
  });
  return { ...query, scan: () => query.refetch() };
}

/** Beni davet edenler (onboarding davet bağlamı) */
export function useMyInvites(enabled = true) {
  return useQuery({ queryKey: keys.myInvites(), queryFn: fetchMyInvites, enabled });
}
