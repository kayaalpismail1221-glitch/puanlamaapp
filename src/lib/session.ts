/**
 * Oturum açmış kullanıcının kimliği; kanca kullanılamayan yardımcılar (ör. yönlendirme) için.
 * Değeri uygulama durumu (store) oturum değiştikçe günceller.
 */
let currentUserId: string | undefined;

export const setCurrentUserId = (id: string | undefined) => {
  currentUserId = id;
};

export const getCurrentUserId = () => currentUserId;

export const isMe = (userId: string | undefined) => !!userId && userId === currentUserId;
