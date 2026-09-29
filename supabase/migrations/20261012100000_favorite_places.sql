/**
 * Favori 4 (Letterboxd'daki "Favorite Films" gibi): kullanıcının kendisini en iyi anlatan dört mekânı.
 * Sıra kullanıcının seçtiği sıradır. Mekânlar puanladıkları arasından seçilir; puanı silinen mekân
 * istemcide gösterilmez ve bir sonraki kayıtta diziden düşer (dizi silinen mekânla da geçerli kalır).
 * Profiller üyelere açık olduğundan başka profilde de okunur.
 */
alter table public.profiles
  add column favorite_places uuid[] not null default '{}'
    constraint favorite_places_max check (
      cardinality(favorite_places) <= 4 and array_position(favorite_places, null) is null
    );

grant update (favorite_places) on public.profiles to authenticated;
