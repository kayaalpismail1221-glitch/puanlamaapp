-- Yeni bildirim türleri: yorumun beğenildi, yorumuna yanıt geldi.
-- Enum değeri eklendiği işlemde kullanılamadığından ayrı migration; kullanan kısım 20261005110000_comment_social.

alter type public.notification_type add value if not exists 'comment_like';
alter type public.notification_type add value if not exists 'reply';
