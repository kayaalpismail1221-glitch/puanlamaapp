import { router } from 'expo-router';

import { ME } from '@/types';

/** Kullanıcının profiline git; kendi profilinse Profilim sekmesine geç */
export function openUserProfile(userId: string) {
  if (userId === ME) router.navigate('/profilim');
  else router.push({ pathname: '/kullanici/[id]', params: { id: userId } });
}
