/**
 * Mekân düzeltme kuyruğu (yönetici, yalnızca yerelde). Kendiliğinden uygulanmayan öneriler burada bekler:
 * tek kişinin bildirimi, yeni hesapların bildirimi, eşiğe ulaşmamış "kapandı" bildirimleri.
 *
 *   npm run places:review                      bekleyenler (mekân başına, destekleyen sayısıyla)
 *   npm run places:review -- --accept <id>     öneriyi uygular (alan kilitlenir, içe aktarım onu ezmez)
 *   npm run places:review -- --reject <id>     öneriyi reddeder
 *
 * Service role anahtarı gerekir: .env.local → SUPABASE_SERVICE_ROLE_KEY (EXPO_PUBLIC_ öneki OLMADAN).
 * Web yönetim paneli gelene kadar; aynı işi yapan RPC'ler admin_place_corrections / admin_resolve_correction.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local içinde olmalı.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const FIELD = {
  phone: 'Telefon',
  address: 'Adres',
  website: 'Web',
  name: 'Ad',
  location: 'Konum',
  closed: 'Kapandı',
};

async function resolve(id, accept) {
  if (accept) {
    const { error } = await supabase.rpc('apply_place_correction', { p_correction_id: id });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('place_corrections')
      .update({ status: 'rejected', resolved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending');
    if (error) throw error;
  }
  console.log(`${id} ${accept ? 'uygulandı' : 'reddedildi'}`);
}

async function list() {
  const { data, error } = await supabase
    .from('place_corrections')
    .select('id, field, value, latitude, longitude, created_at, user_id, place:places(id, name, phone, address, website, city, district, latitude, longitude)')
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;
  if (!data.length) {
    console.log('Bekleyen düzeltme yok.');
    return;
  }
  const current = (c) =>
    ({
      phone: c.place.phone,
      address: c.place.address,
      website: c.place.website,
      name: c.place.name,
      location: `${c.place.latitude},${c.place.longitude}`,
      closed: 'açık',
    })[c.field] || '—';
  const suggested = (c) => (c.field === 'location' ? `${c.latitude},${c.longitude}` : c.field === 'closed' ? 'kapandı' : c.value || '(kaldır)');
  const byPlace = Map.groupBy(data, (c) => c.place.id);
  for (const items of byPlace.values()) {
    const p = items[0].place;
    console.log(`\n${p.name} · ${p.district}/${p.city}`);
    console.log(`  https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=19/${p.latitude}/${p.longitude}`);
    for (const [field, group] of Map.groupBy(items, (c) => c.field)) {
      for (const c of group) {
        const same = group.filter((o) => suggested(o) === suggested(c)).length;
        console.log(
          `  ${FIELD[field].padEnd(8)} ${current(c)} → ${suggested(c)}  (${same} kişi, ${c.created_at.slice(0, 10)})  id: ${c.id}`,
        );
      }
    }
  }
  console.log(`\n${data.length} bekleyen öneri, ${byPlace.size} mekân. Uygula: --accept <id>, reddet: --reject <id>`);
}

const accept = flag('--accept');
const reject = flag('--reject');
if (accept) await resolve(accept, true);
else if (reject) await resolve(reject, false);
else await list();
