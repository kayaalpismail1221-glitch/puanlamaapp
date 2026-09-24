import { router } from 'expo-router';

import { isMe } from '@/lib/session';

/** Kullanıcının profiline git; kendi profilinse Profilim sekmesine geç */
export function openUserProfile(userId: string) {
  if (isMe(userId)) router.navigate('/profilim');
  else router.push({ pathname: '/kullanici/[id]', params: { id: userId } });
}
