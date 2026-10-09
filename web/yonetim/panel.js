/**
 * Expeat yönetim paneli (expeat.app/admin).
 *
 * Giriş ekranı yok: panel bağlantısı `expeat.app/admin#k=<anahtar>` bir kez açılınca anahtar bu tarayıcıda saklanır,
 * sonra `expeat.app/admin` doğrudan açılır. Her istek Supabase'deki `admin_panel(anahtar, işlem, argümanlar)`
 * fonksiyonuna gider; anahtarı veritabanı denetler (yalnızca özeti saklanır). Publishable key herkese açıktır,
 * service role anahtarı bu sayfada yoktur.
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://kzedsqgegrzmngxvhmfk.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_QH4Pwd_N_pHuUQDetyLpCw_HWtXlKLe';
  const KEY_STORE = 'expeat-admin-key';
  const THEME_STORE = 'expeat-admin-theme';

  const main = document.getElementById('main');
  const nf = new Intl.NumberFormat('tr-TR');
  const nf1 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  /* ---------- Depolama (gizli pencerede ya da kapalıyken de çalışsın) ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* yok say */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* yok say */ } },
  };

  /* ---------- Anahtar ---------- */
  let adminKey = null;
  (function readKey() {
    const m = location.hash.match(/(?:^#|&)k=([A-Za-z0-9_-]{32,200})/);
    if (m) {
      adminKey = m[1];
      store.set(KEY_STORE, adminKey);
      history.replaceState(null, '', location.pathname + '#/genel');
    } else {
      adminKey = store.get(KEY_STORE);
    }
  })();

  /* ---------- Yardımcılar ---------- */
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = (v) => nf.format(Number(v) || 0);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };

  const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  function fmtDate(v, withYear = false) {
    if (!v) return '—';
    const d = new Date(v);
    const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    return withYear || d.getFullYear() !== new Date().getFullYear() ? `${s} ${d.getFullYear()}` : s;
  }
  function fmtDay(v) {
    const [y, m, d] = String(v).slice(0, 10).split('-').map(Number);
    return `${d} ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
  }
  function ago(v) {
    if (!v) return '—';
    const s = (Date.now() - new Date(v).getTime()) / 1000;
    if (s < 60) return 'az önce';
    if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
    if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
    if (s < 86400 * 2) return 'dün';
    if (s < 86400 * 30) return `${Math.floor(s / 86400)} gün önce`;
    return fmtDate(v);
  }
  const CUR = { TRY: '₺', USD: '$', EUR: '€' };
  function money(amount, currency = 'TRY') {
    return `${CUR[currency] ?? ''}${nf.format(Math.round(Number(amount) || 0))}`;
  }
  function storageUrl(bucket, path) {
    if (!path) return null;
    if (/^https?:\/\//.test(path)) return path;
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  const photoUrl = (p) => storageUrl('post-photos', p);
  function avatar(u, lg = false) {
    const url = storageUrl('avatars', u?.avatar_path);
    const cls = `avatar${lg ? ' lg' : ''}`;
    const initial = esc((u?.name || u?.username || '?').trim().charAt(0).toLocaleUpperCase('tr'));
    if (url) return `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy" data-initial="${initial}">`;
    return `<span class="${cls}">${initial}</span>`;
  }
  function scoreBadge(s) {
    if (s == null) return '';
    const n = Number(s);
    const cls = n >= 6.7 ? '' : n >= 3.3 ? ' mid' : ' low';
    return `<span class="score${cls}">${nf1.format(n)}</span>`;
  }
  const distanceM = (a, b, c, d) => {
    const r = Math.PI / 180;
    const x = Math.sin(((c - a) * r) / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(((d - b) * r) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(x));
  };
  const fmtDistance = (m) => (m >= 1000 ? `${nf1.format(m / 1000)} km` : `${Math.round(m)} m`);

  const ICON = {
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m-2 15-5-5 1.4-1.4 3.6 3.6 7.6-7.6L19 8z"/></svg>',
    image: '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2M8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4m0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4"/></svg>',
    badge: '<svg viewBox="0 0 24 24"><path d="m23 12-2.4-2.8.3-3.7-3.6-.8-1.9-3.2L12 3 8.6 1.5 6.7 4.7l-3.6.8.3 3.7L1 12l2.4 2.8-.3 3.7 3.6.8 1.9 3.2L12 21l3.4 1.5 1.9-3.2 3.6-.8-.3-3.7zm-12.9 4.7-3.8-3.8 1.5-1.5 2.3 2.3 5.8-5.8 1.5 1.5z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M17.7 6.3A8 8 0 1 0 19.7 14h-2.1a6 6 0 1 1-1.4-6.2L13 11h7V4z"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M14 3v2h3.6l-9.8 9.8 1.4 1.4L19 6.4V10h2V3zm5 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2z"/></svg>',
  };

  /* ---------- API ---------- */
  class ApiError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }
  async function api(action, args = {}) {
    let res;
    try {
      res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_panel`, {
        method: 'POST',
        headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: adminKey, p_action: action, p_args: args }),
      });
    } catch {
      throw new ApiError('Bağlantı kurulamadı. İnternetini kontrol et.', 'network');
    }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* düz metin */ }
    if (!res.ok) {
      const code = body?.code ?? String(res.status);
      if (code === '42501') throw new ApiError('Panel anahtarı geçersiz.', code);
      if (code === 'PGRST202') throw new ApiError('Veritabanında panel fonksiyonu yok: admin_panel migration\'ı henüz çalıştırılmamış.', code);
      throw new ApiError(body?.message || `Hata (${res.status})`, code);
    }
    return body;
  }

  /* ---------- Bildirim, onay, çekmece ---------- */
  function toast(msg, err = false) {
    const el = document.createElement('div');
    el.className = `toast${err ? ' err' : ''}`;
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), err ? 5200 : 2800);
  }
  const fail = (e) => toast(e?.message || String(e), true);

  const modalWrap = $('#modalWrap');
  const modal = $('#modal');
  function openModal(html) {
    modal.innerHTML = html;
    modalWrap.hidden = false;
    return modal;
  }
  function closeModal() {
    modalWrap.hidden = true;
    modal.innerHTML = '';
  }
  function confirmBox({ title, text, ok = 'Onayla', danger = false }) {
    return new Promise((resolve) => {
      openModal(`
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
        <div class="actions">
          <button class="btn" data-a="no" type="button">Vazgeç</button>
          <button class="btn ${danger ? 'danger solid' : 'primary'}" data-a="yes" type="button">${esc(ok)}</button>
        </div>`);
      const done = (v) => { closeModal(); resolve(v); };
      $('[data-a="yes"]', modal).onclick = () => done(true);
      $('[data-a="no"]', modal).onclick = () => done(false);
      modalWrap.querySelector('.modal-scrim').onclick = () => done(false);
      $('[data-a="yes"]', modal).focus();
    });
  }

  const drawerWrap = $('#drawerWrap');
  const drawer = $('#drawer');
  let drawerCleanup = null;
  function openDrawer(title, bodyHtml) {
    drawerCleanup?.();
    drawerCleanup = null;
    drawer.innerHTML = `
      <div class="drawer-head"><h2>${esc(title)}</h2><button class="close-btn" data-close type="button" aria-label="Kapat">${ICON.close}</button></div>
      <div class="drawer-body">${bodyHtml}</div>`;
    drawerWrap.hidden = false;
    drawer.scrollTop = 0;
    return $('.drawer-body', drawer);
  }
  function closeDrawer() {
    drawerCleanup?.();
    drawerCleanup = null;
    drawerWrap.hidden = true;
    drawer.innerHTML = '';
  }
  drawerWrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
  modalWrap.addEventListener('click', (e) => { if (e.target.matches('.modal-scrim')) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalWrap.hidden) closeModal();
    else if (!drawerWrap.hidden) closeDrawer();
  });

  /* ---------- Tema ---------- */
  const THEMES = ['auto', 'light', 'dark'];
  const THEME_LABEL = { auto: 'Tema: cihazla aynı', light: 'Tema: açık', dark: 'Tema: koyu' };
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    $('#themeLabel').textContent = THEME_LABEL[t];
  }
  let theme = store.get(THEME_STORE) || 'auto';
  applyTheme(theme);
  $('#themeBtn').onclick = () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set(THEME_STORE, theme);
    applyTheme(theme);
  };

  /* ---------- Sayaçlar ---------- */
  let overviewCache = null;
  async function loadOverview(force = false) {
    if (!overviewCache || force) overviewCache = await api('overview');
    updateCounts();
    return overviewCache;
  }
  function updateCounts() {
    for (const el of $$('[data-count]')) {
      const n = overviewCache?.[el.dataset.count] ?? 0;
      el.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
    }
  }
  function bumpCount(key, delta) {
    if (!overviewCache) return;
    overviewCache[key] = Math.max(0, (overviewCache[key] || 0) + delta);
    updateCounts();
  }

  /* ---------- Yönlendirme ---------- */
  const ROUTES = {
    genel: pageOverview,
    sikayetler: pageReports,
    duzeltmeler: pageCorrections,
    kullanicilar: pageUsers,
    mekanlar: pagePlaces,
    gonderiler: pagePosts,
    dogrulanmis: pageVerified,
    uygulama: pageApp,
    gecmis: pageAudit,
  };
  let pageCleanup = null;
  let renderToken = 0;
  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [name, query = ''] = raw.split('?');
    return { name: ROUTES[name] ? name : 'genel', params: new URLSearchParams(query) };
  }
  async function render() {
    const { name, params } = parseRoute();
    for (const a of $$('#nav a')) a.classList.toggle('active', a.dataset.route === name);
    $('#nav a.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    pageCleanup?.();
    pageCleanup = null;
    closeDrawer();
    const token = ++renderToken;
    main.innerHTML = '<div class="skeleton" style="height:36px;width:240px;margin-bottom:24px"></div><div class="skeleton" style="height:320px"></div>';
    try {
      await ROUTES[name](params, () => token === renderToken);
    } catch (e) {
      if (token !== renderToken) return;
      if (e.code === '42501') return showGate('Bu tarayıcıdaki panel anahtarı geçersiz. Panel bağlantısını yeniden aç.');
      main.innerHTML = `<div class="card empty-state"><h3>Yüklenemedi</h3><p>${esc(e.message)}</p><button class="btn" type="button" onclick="location.reload()">Yeniden dene</button></div>`;
    }
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => {
    // Sayfa açıkken anahtarlı bağlantı açıldı: anahtarı baştan okumak için yeniden yükle
    if (/(?:^#|&)k=/.test(location.hash)) location.reload();
    else render();
  });
  const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

  function showGate(text) {
    document.body.innerHTML = `
      <div class="gate"><div>
        <div class="wordmark">Expeat</div>
        <p>${esc(text)}</p>
      </div></div>`;
  }

  function head(title, sub, actions = '') {
    return `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="head-actions">${actions}</div>` : ''}</div>`;
  }

  /* =====================================================================
   * Genel bakış
   * ===================================================================== */
  async function pageOverview(_params, alive) {
    const o = await loadOverview(true);
    if (!alive()) return;
    const rev = o.revenue_month || {};
    const revText = Object.keys(rev).length ? Object.entries(rev).map(([c, v]) => money(v, c)).join(' · ') : money(0);
    const plus = (n) => (n > 0 ? `<b>+${num(n)}</b>` : '0');

    main.innerHTML = `
      ${head('Genel bakış', `Son güncelleme ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`,
        `<button class="btn" id="reload" type="button">${ICON.refresh} Yenile</button>`)}
      <div class="grid kpis">
        <div class="card kpi"><div class="label">Kullanıcı</div><div class="value">${num(o.users)}</div><div class="meta">bugün ${plus(o.users_today)} · 7 gün ${plus(o.users_7d)}</div></div>
        <div class="card kpi"><div class="label">Aktif (7 gün)</div><div class="value">${num(o.active_7d)}</div><div class="meta">puanlayan ya da paylaşan</div></div>
        <div class="card kpi"><div class="label">Gönderi</div><div class="value">${num(o.posts)}</div><div class="meta">7 gün ${plus(o.posts_7d)} · ${num(o.comments)} yorum</div></div>
        <div class="card kpi"><div class="label">Puanlama</div><div class="value">${num(o.rankings)}</div><div class="meta">7 gün ${plus(o.rankings_7d)}</div></div>
        <div class="card kpi link${o.pending_reports ? ' alert' : ''}" data-go="#/sikayetler"><div class="label">Bekleyen şikâyet</div><div class="value">${num(o.pending_reports)}</div><div class="meta">${num(o.banned)} yasaklı hesap</div></div>
        <div class="card kpi link${o.pending_corrections ? ' alert' : ''}" data-go="#/duzeltmeler"><div class="label">Yanlış bilgi bildirimi</div><div class="value">${num(o.pending_corrections)}</div><div class="meta">${num(o.places_closed)} mekân kapalı</div></div>
        <div class="card kpi link" data-go="#/mekanlar"><div class="label">Mekân</div><div class="value">${num(o.places)}</div><div class="meta">${num(o.places_user)} kullanıcı ekledi</div></div>
        <div class="card kpi link" data-go="#/dogrulanmis"><div class="label">Doğrulanmış mekân</div><div class="value">${num(o.verified_active)}</div><div class="meta">bu ay ${esc(revText)}</div></div>
      </div>
      <div class="grid two">
        <div class="card">
          <div class="card-head">
            <div><h2 id="chartTitle">Son 30 gün</h2><div class="sub" id="chartSub"></div></div>
            <div class="chart-tabs" id="chartTabs">
              <button type="button" data-k="users" class="on">Kayıt</button>
              <button type="button" data-k="posts">Gönderi</button>
              <button type="button" data-k="rankings">Puan</button>
            </div>
          </div>
          <div class="chart" id="chart"></div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Yeni kullanıcılar</h2><a href="#/kullanicilar" class="sub">Tümü</a></div>
          <div class="list-rows" style="padding-top:8px">
            ${(o.latest_users || []).map((u) => `
              <div class="it click" data-user="${esc(u.id)}" style="cursor:pointer">
                ${avatar(u)}
                <div style="min-width:0;flex:1"><div class="cell-main">${esc(u.name)}</div><div class="cell-sub">@${esc(u.username)}</div></div>
                <span class="cell-sub nowrap">${ago(u.created_at)}</span>
              </div>`).join('') || '<div class="empty-state">Henüz kullanıcı yok</div>'}
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-head"><h2>İller</h2><span class="sub">gönderi sayısına göre</span></div>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <thead><tr><th>İl</th><th class="num">Mekân</th><th class="num">Puan</th><th class="num">Gönderi</th><th class="hide-sm" style="width:40%"></th></tr></thead>
            <tbody>${citiesRows(o.cities || [])}</tbody>
          </table>
        </div>
      </div>`;

    $('#reload').onclick = () => render();
    for (const el of $$('[data-go]')) el.onclick = () => go(el.dataset.go);
    for (const el of $$('[data-user]')) el.onclick = () => userDrawer(el.dataset.user);
    for (const tr of $$('[data-city]')) tr.onclick = () => go(`#/mekanlar?city=${encodeURIComponent(tr.dataset.city)}`);

    let key = 'users';
    const titles = { users: 'Günlük yeni kullanıcı', posts: 'Günlük gönderi', rankings: 'Günlük puanlama' };
    const draw = () => {
      const series = (o.daily || []).map((d) => ({ day: d.day, v: Number(d[key]) || 0 }));
      const total = series.reduce((s, d) => s + d.v, 0);
      $('#chartTitle').textContent = titles[key];
      $('#chartSub').textContent = `Son 30 günde ${num(total)}`;
      barChart($('#chart'), series, titles[key]);
    };
    $('#chartTabs').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      key = b.dataset.k;
      for (const x of $$('#chartTabs button')) x.classList.toggle('on', x === b);
      draw();
    };
    draw();
    const onResize = debounce(draw, 120);
    window.addEventListener('resize', onResize);
    pageCleanup = () => window.removeEventListener('resize', onResize);
  }

  function citiesRows(cities) {
    const max = Math.max(1, ...cities.map((c) => Number(c.posts) || 0));
    return cities.slice(0, 12).map((c) => `
      <tr class="click" data-city="${esc(c.city)}">
        <td class="cell-main">${esc(c.city)}</td>
        <td class="num">${num(c.places)}</td>
        <td class="num">${num(c.ratings)}</td>
        <td class="num">${num(c.posts)}</td>
        <td class="hide-sm"><div class="bar-inline"><i style="width:${((Number(c.posts) || 0) / max) * 100}%"></i></div></td>
      </tr>`).join('');
  }

  /** Tek seri çubuk grafik: ince çubuklar, 4px yuvarlak üst, geri planda ızgara, üstüne gelince değer */
  function barChart(el, data, label) {
    const w = Math.max(280, el.clientWidth - 40);
    const h = 220;
    const pad = { l: 34, r: 4, t: 10, b: 26 };
    const max = Math.max(...data.map((d) => d.v), 0);
    const step = niceStep(max);
    const top = Math.max(step * Math.ceil(max / step), step);
    const iw = w - pad.l - pad.r;
    const ih = h - pad.t - pad.b;
    const slot = iw / data.length;
    const bw = Math.max(2, Math.min(18, slot - Math.max(2, slot * 0.28)));
    const y = (v) => pad.t + ih - (v / top) * ih;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">`;
    for (let v = 0; v <= top; v += step) {
      svg += `<line class="grid-line" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis-text" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${num(v)}</text>`;
    }
    data.forEach((d, i) => {
      const x = pad.l + i * slot + (slot - bw) / 2;
      const bh = (d.v / top) * ih;
      const r = Math.min(4, bw / 2, bh);
      const by = pad.t + ih - bh;
      svg += `<rect class="hit" data-i="${i}" x="${pad.l + i * slot}" y="${pad.t}" width="${slot}" height="${ih}"/>`;
      if (bh > 0) {
        svg += `<path class="bar" data-b="${i}" d="M${x},${by + bh} V${by + r} Q${x},${by} ${x + r},${by} H${x + bw - r} Q${x + bw},${by} ${x + bw},${by + r} V${by + bh} Z"/>`;
      }
      if (i % 5 === 0 || i === data.length - 1) {
        svg += `<text class="axis-text" x="${x + bw / 2}" y="${h - 6}" text-anchor="middle">${esc(fmtDay(d.day))}</text>`;
      }
    });
    svg += '</svg><div class="tip" hidden></div>';
    el.innerHTML = svg;
    const tip = $('.tip', el);
    const svgEl = $('svg', el);
    svgEl.addEventListener('mousemove', (e) => {
      const hit = e.target.closest('.hit');
      for (const b of $$('.bar.hover', el)) b.classList.remove('hover');
      if (!hit) { tip.hidden = true; return; }
      const i = Number(hit.dataset.i);
      $(`[data-b="${i}"]`, el)?.classList.add('hover');
      const d = data[i];
      tip.innerHTML = `${esc(fmtDay(d.day))}<br><b>${num(d.v)}</b>`;
      tip.hidden = false;
      tip.style.left = `${20 + pad.l + (i + 0.5) * slot}px`;
      tip.style.top = `${8 + y(d.v)}px`;
    });
    svgEl.addEventListener('mouseleave', () => {
      tip.hidden = true;
      for (const b of $$('.bar.hover', el)) b.classList.remove('hover');
    });
  }
  function niceStep(max) {
    if (max <= 4) return 1;
    const raw = max / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    const n = raw / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  /* =====================================================================
   * Şikâyetler
   * ===================================================================== */
  const REASON = { spam: 'Spam', offensive: 'Rahatsız edici', fake: 'Sahte / yanıltıcı', other: 'Diğer' };
  const TARGET = { post: 'Gönderi', comment: 'Yorum', list: 'Liste', user: 'Kullanıcı' };

  async function pageReports(_params, alive) {
    const items = await api('reports');
    if (!alive()) return;
    if (overviewCache) { overviewCache.pending_reports = items.length; updateCounts(); }
    main.innerHTML = `
      ${head('Şikâyetler', 'Kullanıcıların bildirdiği gönderi, yorum, liste ve hesaplar. Aynı içeriğin şikâyetleri tek satırda toplanır.')}
      <div class="queue" id="queue"></div>`;
    const q = $('#queue');
    if (!items.length) {
      q.innerHTML = emptyState('Kuyruk temiz', 'Bekleyen şikâyet yok.');
      return;
    }
    q.innerHTML = items.map((r) => {
      const photo = photoUrl(r.photo);
      const isUser = r.target_type === 'user';
      return `
        <article class="card qitem" data-id="${esc(r.id)}">
          ${photo ? `<img class="thumb" src="${esc(photo)}" alt="" loading="lazy">` : `<div class="thumb empty">${isUser ? ICON.user : ICON.image}</div>`}
          <div style="min-width:0">
            <div class="row">
              <span class="tag blue">${esc(TARGET[r.target_type] || r.target_type)}</span>
              <span class="tag ${r.reason === 'offensive' ? 'bad' : 'warn'}">${esc(REASON[r.reason] || r.reason)}</span>
              ${r.report_count > 1 ? `<span class="tag bad">${num(r.report_count)} şikâyet</span>` : ''}
              ${r.place_name ? `<span class="cell-sub">${esc(r.place_name)}</span>` : ''}
            </div>
            <div class="preview">${esc(r.preview || '—')}</div>
            ${r.details ? `<div class="callout" style="margin:6px 0">“${esc(r.details)}”</div>` : ''}
            <div class="meta">
              ${r.author_id ? `Yazan <a href="#" data-user="${esc(r.author_id)}">@${esc(r.author_username)}</a> · ` : ''}
              Bildiren @${esc(r.reporter_username || 'silinmiş')} · ${ago(r.created_at)}
            </div>
          </div>
          <div class="actions">
            <button class="btn sm" data-act="dismiss" type="button">İhlal yok, kapat</button>
            ${isUser ? '' : '<button class="btn sm danger" data-act="remove" type="button">İçeriği kaldır</button>'}
            ${r.author_id ? `<button class="btn sm danger solid" data-act="ban" type="button">${isUser ? 'Hesabı yasakla' : 'Kaldır + yasakla'}</button>` : ''}
          </div>
        </article>`;
    }).join('');

    q.addEventListener('click', async (e) => {
      const u = e.target.closest('[data-user]');
      if (u) { e.preventDefault(); userDrawer(u.dataset.user); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const card = b.closest('[data-id]');
      const r = items.find((x) => x.id === card.dataset.id);
      const action = b.dataset.act;
      if (action === 'remove' && !(await confirmBox({
        title: `${TARGET[r.target_type]} kaldırılsın mı?`, text: 'İçerik kalıcı olarak silinir ve şikâyet kapanır.', ok: 'Kaldır', danger: true,
      }))) return;
      if (action === 'ban' && !(await confirmBox({
        title: `@${r.author_username} yasaklansın mı?`,
        text: 'Şikâyet edilen içerik silinir, hesap bir daha giriş yapamaz ve kişinin diğer şikâyetleri kapanır. Yasağı Kullanıcılar sayfasından kaldırabilirsin.',
        ok: 'Yasakla', danger: true,
      }))) return;
      for (const x of $$('button', card)) x.disabled = true;
      try {
        await api('resolve_report', { id: r.id, action });
        toast(action === 'dismiss' ? 'Şikâyet kapatıldı' : action === 'remove' ? 'İçerik kaldırıldı' : 'Hesap yasaklandı');
        if (action === 'ban') { render(); return; }
        card.remove();
        bumpCount('pending_reports', -1);
        if (!$('.qitem', q)) q.innerHTML = emptyState('Kuyruk temiz', 'Bekleyen şikâyet yok.');
      } catch (err) {
        for (const x of $$('button', card)) x.disabled = false;
        fail(err);
      }
    });
  }

  function emptyState(title, text) {
    return `<div class="card empty-state">${ICON.check}<h3>${esc(title)}</h3><div>${esc(text)}</div></div>`;
  }

  /* =====================================================================
   * Yanlış bilgi (mekân düzeltmeleri)
   * ===================================================================== */
  const FIELD = { phone: 'Telefon', address: 'Adres', website: 'Web sitesi', name: 'Ad', location: 'Konum', closed: 'Kapandı' };

  function makeMap(el, opts = {}) {
    if (!window.L) {
      el.innerHTML = '<div class="empty-state">Harita yüklenemedi</div>';
      return null;
    }
    const map = L.map(el, { zoomControl: true, attributionControl: true, ...opts });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    return map;
  }
  const pinIcon = (kind) => window.L && L.divIcon({ className: '', html: `<div class="pin ${kind}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });

  async function pageCorrections(_params, alive) {
    const items = await api('corrections');
    if (!alive()) return;
    if (overviewCache) { overviewCache.pending_corrections = items.length; updateCounts(); }
    main.innerHTML = `
      ${head('Yanlış bilgi bildirimleri', 'Kullanıcıların "Bilgi yanlış mı?" ile gönderdiği düzeltmeler. Kabul edilen alan kilitlenir; toplu veri yenilemesi onu bir daha ezmez.')}
      <div class="split">
        <div class="queue" id="queue"></div>
        <div class="card map-card"><div class="map" id="map"></div></div>
      </div>`;
    const q = $('#queue');
    if (!items.length) {
      q.innerHTML = emptyState('Bekleyen bildirim yok', 'Tüm düzeltmeler işlendi.');
    }
    q.innerHTML = items.map((c) => {
      let diff;
      if (c.field === 'location') {
        const d = distanceM(c.place_latitude, c.place_longitude, c.latitude, c.longitude);
        diff = `<div class="diff"><div class="old">Mevcut pin</div><span class="arrow">→</span><div class="new">${fmtDistance(d)} öteye taşı</div></div>`;
      } else if (c.field === 'closed') {
        diff = '<div class="diff"><div class="old">Açık</div><span class="arrow">→</span><div class="new">Kapandı</div></div>';
      } else {
        diff = `<div class="diff"><div class="old">${esc(c.current_value || 'boş')}</div><span class="arrow">→</span><div class="new">${esc(c.value || 'Kaldır (bilgi yok)')}</div></div>`;
      }
      return `
        <article class="card qitem" data-id="${esc(c.id)}" style="grid-template-columns:minmax(0,1fr) auto">
          <div style="min-width:0">
            <div class="row">
              <span class="tag ${c.field === 'closed' ? 'bad' : c.field === 'location' ? 'warn' : 'blue'}">${esc(FIELD[c.field] || c.field)}</span>
              ${c.supporters > 1 ? `<span class="tag good">${num(c.supporters)} kişi aynı şeyi bildirdi</span>` : ''}
            </div>
            <div class="preview" style="margin-bottom:0"><a href="#" data-place="${esc(c.place_id)}"><b>${esc(c.place_name)}</b></a></div>
            <div class="meta">${esc(c.cuisine)} · ${esc([c.neighborhood, c.district, c.city].filter(Boolean).join(', '))}</div>
            ${diff}
            <div class="meta" style="margin-top:8px">@${esc(c.reporter || 'silinmiş')} · ${ago(c.created_at)} ·
              <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.place_name} ${c.district} ${c.city}`)}" target="_blank" rel="noopener">Haritada kontrol et</a></div>
          </div>
          <div class="actions">
            <button class="btn sm good solid" data-act="accept" type="button">Uygula</button>
            <button class="btn sm" data-act="reject" type="button">Reddet</button>
          </div>
        </article>`;
    }).join('') || q.innerHTML;

    const map = makeMap($('#map'));
    const layers = new Map();
    if (map) {
      const bounds = [];
      for (const c of items) {
        const group = L.layerGroup().addTo(map);
        const cur = [c.place_latitude, c.place_longitude];
        bounds.push(cur);
        L.marker(cur, { icon: pinIcon(c.field === 'location' ? 'cur' : 'place'), title: c.place_name }).addTo(group)
          .on('click', () => focusItem(c.id, false));
        if (c.field === 'location') {
          const nw = [c.latitude, c.longitude];
          bounds.push(nw);
          L.polyline([cur, nw], { color: '#e5484d', weight: 2, dashArray: '5 6' }).addTo(group);
          L.marker(nw, { icon: pinIcon('new'), title: 'Önerilen konum' }).addTo(group).on('click', () => focusItem(c.id, false));
        }
        layers.set(c.id, { group, bounds: c.field === 'location' ? [cur, [c.latitude, c.longitude]] : [cur] });
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      else map.setView([41.015, 28.98], 11);
      setTimeout(() => map.invalidateSize(), 50);
      pageCleanup = () => map.remove();
    }

    function focusItem(id, moveMap = true) {
      for (const el of $$('.qitem', q)) el.classList.toggle('focus', el.dataset.id === id);
      const card = $(`.qitem[data-id="${CSS.escape(id)}"]`, q);
      if (!moveMap) card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const l = layers.get(id);
      if (map && l && moveMap) {
        if (l.bounds.length > 1) map.fitBounds(l.bounds, { padding: [60, 60], maxZoom: 18 });
        else map.setView(l.bounds[0], 17);
      }
    }

    q.addEventListener('click', async (e) => {
      const p = e.target.closest('[data-place]');
      if (p) { e.preventDefault(); placeDrawer(p.dataset.place); return; }
      const card = e.target.closest('.qitem');
      if (!card) return;
      const b = e.target.closest('[data-act]');
      if (!b) { focusItem(card.dataset.id); return; }
      const c = items.find((x) => x.id === card.dataset.id);
      const accept = b.dataset.act === 'accept';
      if (accept && c.field === 'closed' && !(await confirmBox({
        title: `${c.place_name} kapalı işaretlensin mi?`, text: 'Mekân arama, harita ve önerilerden çıkar. Gönderileri ve puanları durur. Mekânlar sayfasından geri açabilirsin.', ok: 'Kapalı işaretle', danger: true,
      }))) return;
      for (const x of $$('button', card)) x.disabled = true;
      try {
        await api('resolve_correction', { id: c.id, accept });
        toast(accept ? 'Düzeltme uygulandı' : 'Bildirim reddedildi');
        if (accept) { render(); return; } // aynı alandaki uyuşan öneriler de kapanır
        card.remove();
        layers.get(c.id)?.group.remove();
        bumpCount('pending_corrections', -1);
        if (!$('.qitem', q)) q.innerHTML = emptyState('Bekleyen bildirim yok', 'Tüm düzeltmeler işlendi.');
      } catch (err) {
        for (const x of $$('button', card)) x.disabled = false;
        fail(err);
      }
    });
  }

  /* =====================================================================
   * Kullanıcılar
   * ===================================================================== */
  const PAGE = 50;

  async function pageUsers(params, alive) {
    const st = { q: params.get('q') || '', filter: params.get('filter') || 'all', sort: 'new', offset: 0 };
    main.innerHTML = `
      ${head('Kullanıcılar', '')}
      <div class="toolbar">
        <label class="search">${ICON.search}<input id="q" type="search" placeholder="Ad, kullanıcı adı ya da e-posta" value="${esc(st.q)}" autocomplete="off"></label>
        <div class="chips" id="filters">
          ${[['all', 'Tümü'], ['reported', 'Şikâyetli'], ['banned', 'Yasaklı'], ['admin', 'Yönetici']]
            .map(([k, l]) => `<button class="chip-btn${st.filter === k ? ' on' : ''}" data-f="${k}" type="button">${l}</button>`).join('')}
        </div>
        <select class="select" id="sort" aria-label="Sıralama">
          <option value="new">En yeni</option>
          <option value="active">Son giriş</option>
          <option value="posts">En çok gönderi</option>
          <option value="followers">En çok takipçi</option>
        </select>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Kişi</th><th class="hide-sm">E-posta</th><th>Katıldı</th><th class="hide-sm">Son giriş</th><th class="num">Puan</th><th class="num">Gönderi</th><th class="num hide-sm">Takipçi</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div><div class="pager" id="pager"></div></div>`;

    const load = async () => {
      const tb = $('#rows');
      tb.innerHTML = `<tr><td colspan="8"><div class="skeleton" style="height:120px"></div></td></tr>`;
      try {
        const res = await api('users', { q: st.q, filter: st.filter, sort: st.sort, limit: PAGE, offset: st.offset });
        if (!alive()) return;
        tb.innerHTML = res.rows.map((u) => `
          <tr class="click" data-id="${esc(u.id)}">
            <td><div class="person">${avatar(u)}<div style="min-width:0"><div class="cell-main">${esc(u.name)}</div><div class="cell-sub">@${esc(u.username)}</div></div></div></td>
            <td class="hide-sm cell-sub">${esc(u.email || '—')}</td>
            <td class="nowrap">${fmtDate(u.created_at)}</td>
            <td class="hide-sm nowrap cell-sub">${ago(u.last_sign_in_at)}</td>
            <td class="num">${num(u.rating_count)}</td>
            <td class="num">${num(u.post_count)}</td>
            <td class="num hide-sm">${num(u.follower_count)}</td>
            <td class="nowrap">${u.banned ? '<span class="tag bad">Yasaklı</span>' : ''}${u.is_admin ? ' <span class="tag gold">Yönetici</span>' : ''}</td>
          </tr>`).join('') || '<tr><td colspan="8" class="empty-state">Sonuç yok</td></tr>';
        pager($('#pager'), res.total, st, load);
      } catch (e) { fail(e); }
    };

    $('#sort').value = st.sort;
    $('#q').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.offset = 0; load(); }, 300));
    $('#filters').onclick = (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      st.filter = b.dataset.f; st.offset = 0;
      for (const x of $$('#filters .chip-btn')) x.classList.toggle('on', x === b);
      load();
    };
    $('#sort').onchange = (e) => { st.sort = e.target.value; st.offset = 0; load(); };
    $('#rows').onclick = (e) => {
      const tr = e.target.closest('[data-id]');
      if (tr) userDrawer(tr.dataset.id, load);
    };
    await load();
  }

  function pager(el, total, st, load, size = PAGE) {
    const from = total ? st.offset + 1 : 0;
    const to = Math.min(st.offset + size, total);
    el.innerHTML = `
      <span>${num(from)}–${num(to)} / ${num(total)}</span>
      <span style="display:flex;gap:6px">
        <button class="btn sm" data-p="-1" type="button" ${st.offset === 0 ? 'disabled' : ''}>Önceki</button>
        <button class="btn sm" data-p="1" type="button" ${to >= total ? 'disabled' : ''}>Sonraki</button>
      </span>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b || b.disabled) return;
      st.offset = Math.max(0, st.offset + Number(b.dataset.p) * size);
      load();
      main.scrollIntoView({ behavior: 'smooth' });
    };
  }

  async function userDrawer(id, onChange) {
    const body = openDrawer('Kullanıcı', '<div class="skeleton" style="height:400px"></div>');
    let d;
    try { d = await api('user', { id }); } catch (e) { if (body.isConnected) closeDrawer(); fail(e); return; }
    if (!body.isConnected) return; // bu arada başka bir şey açıldı
    if (!d) { body.innerHTML = '<div class="empty-state">Kullanıcı bulunamadı (silinmiş olabilir).</div>'; return; }
    const p = d.profile;
    body.innerHTML = `
      <div class="person" style="gap:14px">
        ${avatar(p, true)}
        <div style="min-width:0">
          <div style="font-size:20px;font-weight:700">${esc(p.name)}</div>
          <div class="cell-sub">@${esc(p.username)}</div>
          <div class="row" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            ${d.banned ? '<span class="tag bad">Yasaklı</span>' : '<span class="tag good">Aktif</span>'}
            ${p.is_admin ? '<span class="tag gold">Yönetici</span>' : ''}
            ${d.open_reports ? `<span class="tag warn">${num(d.open_reports)} açık şikâyet</span>` : ''}
          </div>
        </div>
      </div>
      ${p.bio ? `<div style="white-space:pre-wrap">${esc(p.bio)}</div>` : ''}
      <div class="facts">
        <div class="fact"><div class="v">${num(d.rating_count)}</div><div class="l">Puan</div></div>
        <div class="fact"><div class="v">${num(p.post_count)}</div><div class="l">Gönderi</div></div>
        <div class="fact"><div class="v">${num(p.follower_count)}</div><div class="l">Takipçi</div></div>
        <div class="fact"><div class="v">${num(p.following_count)}</div><div class="l">Takip</div></div>
        <div class="fact"><div class="v">${num(d.comment_count)}</div><div class="l">Yorum</div></div>
        <div class="fact"><div class="v">${num(p.like_total)}</div><div class="l">Aldığı beğeni</div></div>
      </div>
      <dl class="kv">
        <dt>E-posta</dt><dd>${esc(d.email || '—')}</dd>
        <dt>Telefon</dt><dd>${esc(d.phone || '—')}</dd>
        <dt>Katıldı</dt><dd>${fmtDate(p.created_at, true)}</dd>
        <dt>Son giriş</dt><dd>${ago(d.last_sign_in_at)}</dd>
        <dt>Davet eden</dt><dd>${d.invited_by ? `@${esc(d.invited_by)}` : '—'}</dd>
        <dt>Eklediği mekân</dt><dd>${num(d.places_added)}</dd>
        <dt>Düzeltme önerisi</dt><dd>${num(d.corrections)}</dd>
        <dt>Liste</dt><dd>${num(d.list_count)}</dd>
        <dt>Kimlik</dt><dd class="cell-sub" style="font-family:ui-monospace,monospace;font-size:12px">${esc(p.id)}</dd>
      </dl>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${p.is_admin ? '' : d.banned
          ? '<button class="btn good" id="ban" type="button">Yasağı kaldır</button>'
          : '<button class="btn danger" id="ban" type="button">Hesabı yasakla</button>'}
        <button class="btn" id="seePosts" type="button">Gönderilerini gör</button>
      </div>
      <div>
        <div class="section-title">Son gönderiler</div>
        ${d.posts.length ? `<div class="thumbs">${d.posts.map((x) => {
          const u = photoUrl(x.photo);
          return u ? `<img src="${esc(u)}" alt="" title="${esc(x.place_name)}" loading="lazy">` : `<div class="ph" title="${esc(x.place_name)}"></div>`;
        }).join('')}</div>` : '<div class="cell-sub">Gönderi yok</div>'}
      </div>
      <div>
        <div class="section-title">Son puanladıkları</div>
        <div class="mini-list">${d.rankings.map((r) => `
          <div class="it"><div style="min-width:0"><div class="cell-main">${esc(r.place_name)}</div><div class="cell-sub">${esc(r.district)}, ${esc(r.city)} · ${ago(r.rated_at)}</div></div>${scoreBadge(r.score)}</div>`).join('') || '<div class="cell-sub">Puan yok</div>'}
        </div>
      </div>`;
    $('#seePosts', body).onclick = () => go(`#/gonderiler?user=${encodeURIComponent(p.id)}`);
    const ban = $('#ban', body);
    if (ban) ban.onclick = async () => {
      const banning = !d.banned;
      if (!(await confirmBox(banning
        ? { title: `@${p.username} yasaklansın mı?`, text: 'Hesap bir daha giriş yapamaz. İçerikleri silinmez; istersen Gönderiler sayfasından kaldır.', ok: 'Yasakla', danger: true }
        : { title: `@${p.username} yasağı kaldırılsın mı?`, text: 'Kişi yeniden giriş yapabilir.', ok: 'Yasağı kaldır' }))) return;
      ban.disabled = true;
      try {
        await api('set_ban', { id: p.id, banned: banning });
        toast(banning ? 'Hesap yasaklandı' : 'Yasak kaldırıldı');
        onChange?.();
        userDrawer(id, onChange);
      } catch (e) { ban.disabled = false; fail(e); }
    };
  }

  /* =====================================================================
   * Mekânlar
   * ===================================================================== */
  async function pagePlaces(params, alive) {
    const o = await loadOverview();
    if (!alive()) return;
    const st = { q: params.get('q') || '', filter: params.get('filter') || 'all', city: params.get('city') || '', offset: 0 };
    main.innerHTML = `
      ${head('Mekânlar', `${num(o.places)} mekân · düzenlenen alanlar kilitlenir, toplu veri yenilemesi onları ezmez.`)}
      <div class="toolbar">
        <label class="search">${ICON.search}<input id="q" type="search" placeholder="Mekân, tür, semt ya da kimlik" value="${esc(st.q)}" autocomplete="off"></label>
        <select class="select" id="city" aria-label="İl">
          <option value="">Tüm iller</option>
          ${(o.cities || []).map((c) => `<option value="${esc(c.city)}">${esc(c.city)}</option>`).join('')}
        </select>
      </div>
      <div class="chips" id="filters" style="margin:-4px 0 14px">
        ${[['all', 'Tümü'], ['popular', 'Puanlanmış'], ['user', 'Kullanıcı ekledi'], ['verified', 'Doğrulanmış'], ['closed', 'Kapalı'], ['locked', 'Elle düzeltilmiş']]
          .map(([k, l]) => `<button class="chip-btn${st.filter === k ? ' on' : ''}" data-f="${k}" type="button">${l}</button>`).join('')}
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Mekân</th><th>Konum</th><th class="num">Ortalama</th><th class="num">Puan</th><th class="num hide-sm">Gönderi</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table></div><div class="pager" id="pager"></div></div>`;
    $('#city').value = st.city;

    let rows = [];
    const load = async () => {
      const tb = $('#rows');
      tb.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:120px"></div></td></tr>`;
      try {
        const res = await api('places', { q: st.q, filter: st.filter, city: st.city, limit: PAGE, offset: st.offset });
        if (!alive()) return;
        rows = res.rows;
        tb.innerHTML = rows.map((p) => `
          <tr class="click" data-id="${esc(p.id)}">
            <td><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.cuisine)}</div></td>
            <td><div>${esc(p.district)}</div><div class="cell-sub">${esc([p.neighborhood, p.city].filter(Boolean).join(', '))}</div></td>
            <td class="num">${p.average != null ? scoreBadge(p.average) : '<span class="cell-sub">—</span>'}</td>
            <td class="num">${num(p.rating_count)}</td>
            <td class="num hide-sm">${num(p.post_count)}</td>
            <td><div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${placeTags(p)}</div></td>
          </tr>`).join('') || '<tr><td colspan="6" class="empty-state">Sonuç yok</td></tr>';
        pager($('#pager'), res.total, st, load);
      } catch (e) { fail(e); }
    };

    $('#q').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); st.offset = 0; load(); }, 300));
    $('#city').onchange = (e) => { st.city = e.target.value; st.offset = 0; load(); };
    $('#filters').onclick = (e) => {
      const b = e.target.closest('[data-f]');
      if (!b) return;
      st.filter = b.dataset.f; st.offset = 0;
      for (const x of $$('#filters .chip-btn')) x.classList.toggle('on', x === b);
      load();
    };
    $('#rows').onclick = (e) => {
      const tr = e.target.closest('[data-id]');
      if (tr) placeDrawer(rows.find((p) => p.id === tr.dataset.id), load);
    };
    await load();
  }

  function placeTags(p) {
    const t = [];
    if (p.verified_until && new Date(p.verified_until) > new Date()) t.push(`<span class="tag gold">${ICON.badge}Doğrulanmış</span>`);
    if (p.closed_at) t.push('<span class="tag bad">Kapalı</span>');
    if (p.created_by) t.push('<span class="tag blue">Kullanıcı ekledi</span>');
    if (p.pending_corrections) t.push(`<span class="tag warn">${num(p.pending_corrections)} bildirim</span>`);
    return t.join('');
  }

  /** Mekân çekmecesi: kimlik ya da liste satırıyla açılır */
  async function placeDrawer(placeOrId, onChange) {
    let p = typeof placeOrId === 'object' ? placeOrId : null;
    const body = openDrawer('Mekân', '<div class="skeleton" style="height:400px"></div>');
    try {
      if (!p) p = (await api('places', { q: placeOrId, limit: 1 })).rows[0];
      await loadOverview();
    } catch (e) { if (body.isConnected) closeDrawer(); fail(e); return; }
    if (!body.isConnected) return; // bu arada başka bir şey açıldı
    if (!p) { body.innerHTML = '<div class="empty-state">Mekân bulunamadı.</div>'; return; }
    const cuisines = overviewCache?.cuisines || [p.cuisine];
    const verified = p.verified_until && new Date(p.verified_until) > new Date();
    body.innerHTML = `
      <div>
        <div style="font-size:20px;font-weight:700">${esc(p.name)}</div>
        <div class="cell-sub">${esc([p.neighborhood, p.district, p.city].filter(Boolean).join(', '))}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${placeTags(p)}</div>
      </div>
      <div class="facts">
        <div class="fact"><div class="v">${p.average != null ? nf1.format(p.average) : '—'}</div><div class="l">Ortalama</div></div>
        <div class="fact"><div class="v">${num(p.rating_count)}</div><div class="l">Puan</div></div>
        <div class="fact"><div class="v">${num(p.post_count)}</div><div class="l">Gönderi</div></div>
      </div>
      <form class="form" id="placeForm" autocomplete="off">
        <label class="field"><span>Ad</span><input class="input" name="name" value="${esc(p.name)}" maxlength="120" required></label>
        <label class="field"><span>Tür</span><select class="select" name="cuisine">${cuisines.map((c) => `<option${c === p.cuisine ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
        <label class="field"><span>Adres</span><input class="input" name="address" value="${esc(p.address)}" maxlength="160"></label>
        <div class="row2">
          <label class="field"><span>Telefon <span class="hint">+90…</span></span><input class="input" name="phone" value="${esc(p.phone || '')}" maxlength="20" inputmode="tel"></label>
          <label class="field"><span>Web sitesi</span><input class="input" name="website" value="${esc(p.website || '')}" maxlength="160" inputmode="url"></label>
        </div>
        <div class="field">
          <span>Konum <span class="hint">pini sürükle; il/ilçe/mahalle koordinattan yeniden yazılır</span></span>
          <div class="map small" id="placeMap"></div>
          <div class="row2">
            <input class="input" name="latitude" value="${esc(p.latitude)}" inputmode="decimal" aria-label="Enlem">
            <input class="input" name="longitude" value="${esc(p.longitude)}" inputmode="decimal" aria-label="Boylam">
          </div>
        </div>
        <label class="toggle"><input type="checkbox" name="closed" ${p.closed_at ? 'checked' : ''}> Mekân kapandı (arama, harita ve önerilerden çıkar)</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" type="submit">Kaydet</button>
          <button class="btn" type="button" id="sell">${ICON.badge} ${verified ? 'Doğrulanmışı uzat' : 'Doğrulanmış sat'}</button>
          <a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.district} ${p.city}`)}">${ICON.external} Google Haritalar</a>
        </div>
      </form>
      <dl class="kv">
        <dt>Kaynak</dt><dd>${esc(p.source)}${p.created_by_username ? ` · @${esc(p.created_by_username)} ekledi` : ''}</dd>
        <dt>Eklendi</dt><dd>${fmtDate(p.created_at, true)}</dd>
        <dt>Kilitli alanlar</dt><dd>${p.locked_fields?.length ? p.locked_fields.map((f) => esc(FIELD[f] || f)).join(', ') : '—'}</dd>
        ${verified ? `<dt>Doğrulanmış</dt><dd>${fmtDate(new Date(new Date(p.verified_until).getTime() - 1), true)} gününe kadar</dd>` : ''}
        <dt>Kimlik</dt><dd class="cell-sub" style="font-family:ui-monospace,monospace;font-size:12px">${esc(p.id)}</dd>
      </dl>`;

    const form = $('#placeForm', body);
    const latIn = form.elements.latitude;
    const lngIn = form.elements.longitude;
    const map = makeMap($('#placeMap', body), { scrollWheelZoom: false });
    if (map) {
      map.setView([p.latitude, p.longitude], 17);
      const marker = L.marker([p.latitude, p.longitude], { draggable: true, icon: pinIcon('new') }).addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLatLng();
        latIn.value = ll.lat.toFixed(6);
        lngIn.value = ll.lng.toFixed(6);
      });
      const sync = () => {
        const lat = Number(latIn.value), lng = Number(lngIn.value);
        if (Number.isFinite(lat) && Number.isFinite(lng)) { marker.setLatLng([lat, lng]); map.panTo([lat, lng]); }
      };
      latIn.addEventListener('change', sync);
      lngIn.addEventListener('change', sync);
      setTimeout(() => map.invalidateSize(), 250);
      drawerCleanup = () => map.remove();
    }

    $('#sell', body).onclick = () => saleModal(p, () => { onChange?.(); });
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = form.elements;
      const patch = {};
      const val = (k) => f[k].value.trim();
      if (val('name') !== p.name) patch.name = val('name');
      if (f.cuisine.value !== p.cuisine) patch.cuisine = f.cuisine.value;
      if (val('address') !== (p.address || '')) patch.address = val('address');
      if (val('phone') !== (p.phone || '')) patch.phone = val('phone');
      if (val('website') !== (p.website || '')) patch.website = val('website');
      const lat = Number(val('latitude')), lng = Number(val('longitude'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { toast('Konum geçersiz', true); return; }
      if (Math.abs(lat - p.latitude) > 1e-7 || Math.abs(lng - p.longitude) > 1e-7) { patch.latitude = lat; patch.longitude = lng; }
      if (f.closed.checked !== Boolean(p.closed_at)) patch.closed = f.closed.checked;
      if (!Object.keys(patch).length) { toast('Değişiklik yok'); return; }
      const btn = $('[type=submit]', form);
      btn.disabled = true;
      try {
        await api('update_place', { id: p.id, patch });
        toast('Mekân güncellendi');
        onChange?.();
        const fresh = (await api('places', { q: p.id, limit: 1 })).rows[0];
        placeDrawer(fresh || p.id, onChange);
      } catch (err) { btn.disabled = false; fail(err); }
    };
  }

  /* =====================================================================
   * Gönderiler
   * ===================================================================== */
  async function pagePosts(params, alive) {
    const st = { q: '', user: params.get('user') || '', offset: 0 };
    const SIZE = 30;
    let userName = '';
    if (st.user) {
      try { userName = (await api('user', { id: st.user }))?.profile?.username || ''; } catch { /* yok say */ }
      if (!alive()) return;
    }
    main.innerHTML = `
      ${head('Gönderiler', st.user ? `@${esc(userName || '…')} kişisinin gönderileri · <a href="#/gonderiler">tümünü göster</a>` : 'En yeniden eskiye.')}
      <div class="toolbar">
        <label class="search">${ICON.search}<input id="q" type="search" placeholder="Açıklama, kullanıcı ya da mekân" autocomplete="off"></label>
      </div>
      <div class="posts" id="grid"></div>
      <div style="text-align:center;margin-top:18px"><button class="btn" id="more" type="button" hidden>Daha fazla</button></div>`;
    const grid = $('#grid');
    let items = [];

    const card = (p) => {
      const photo = photoUrl(p.photos?.[0]);
      return `
        <article class="card post" data-id="${esc(p.id)}">
          <div class="ph">
            ${photo ? `<img class="photo" src="${esc(photo)}" alt="" loading="lazy">` : '<div class="photo empty">Fotoğrafsız</div>'}
            ${p.open_reports ? `<span class="tag bad badge-r">${num(p.open_reports)} şikâyet</span>` : ''}
          </div>
          <div class="body">
            <div class="person"><a href="#" data-user="${esc(p.author?.id)}">${avatar(p.author)}</a>
              <div style="min-width:0"><div class="cell-main">${esc(p.author?.name)}</div><div class="cell-sub">${esc(p.place?.name)} · ${esc(p.place?.district)}</div></div>
              <span style="margin-left:auto">${scoreBadge(p.score)}</span>
            </div>
            ${p.caption ? `<div class="caption">${esc(p.caption)}</div>` : ''}
            <div class="foot">
              <span class="stats">♥ ${num(p.like_count)} · ${num(p.comment_count)} yorum · ${ago(p.created_at)}</span>
              <button class="btn sm danger" data-del type="button">Sil</button>
            </div>
          </div>
        </article>`;
    };

    const load = async (append = false) => {
      if (!append) { st.offset = 0; grid.innerHTML = '<div class="skeleton" style="height:320px"></div>'.repeat(4); }
      try {
        const res = await api('posts', { q: st.q, user_id: st.user || null, limit: SIZE, offset: st.offset });
        if (!alive()) return;
        items = append ? items.concat(res) : res;
        if (append) grid.insertAdjacentHTML('beforeend', res.map(card).join(''));
        else grid.innerHTML = res.map(card).join('') || '<div class="card empty-state" style="grid-column:1/-1">Gönderi yok</div>';
        $('#more').hidden = res.length < SIZE;
      } catch (e) { fail(e); }
    };

    $('#q').addEventListener('input', debounce((e) => { st.q = e.target.value.trim(); load(); }, 300));
    $('#more').onclick = () => { st.offset += SIZE; load(true); };
    grid.onclick = async (e) => {
      const u = e.target.closest('[data-user]');
      if (u) { e.preventDefault(); userDrawer(u.dataset.user); return; }
      if (!e.target.closest('[data-del]')) return;
      const el = e.target.closest('[data-id]');
      const p = items.find((x) => x.id === el.dataset.id);
      if (!(await confirmBox({ title: 'Gönderi silinsin mi?', text: `@${p.author?.username} kişisinin ${p.place?.name} gönderisi kalıcı olarak silinir. Puanı durur.`, ok: 'Sil', danger: true }))) return;
      try {
        await api('delete_post', { id: p.id });
        el.remove();
        toast('Gönderi silindi');
      } catch (err) { fail(err); }
    };
    await load();
  }

  /* =====================================================================
   * Doğrulanmış mekânlar (satış)
   * ===================================================================== */
  const PLAN = { monthly: 'Aylık', quarterly: '3 aylık', yearly: 'Yıllık', custom: 'Özel' };
  const STATUS = {
    active: ['good', 'Aktif'],
    upcoming: ['blue', 'Başlamadı'],
    expired: ['', 'Bitti'],
    cancelled: ['bad', 'İptal'],
  };

  async function pageVerified(_params, alive) {
    const v = await api('verifications');
    if (!alive()) return;
    const rev = v.revenue || {};
    const sum = (k) => Object.entries(rev).map(([c, r]) => money(r[k] || 0, c)).join(' · ') || money(0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    main.innerHTML = `
      ${head('Doğrulanmış mekânlar', 'Mekânlara satılan doğrulanmış rozeti: satış kaydı, süre ve gelir.',
        `<button class="btn primary" id="newSale" type="button">${ICON.plus} Yeni satış</button>`)}
      <div class="callout" style="margin-bottom:16px">Rozet süresi veritabanında tutulur (<code>places.verified_until</code>); uygulamada rozetin gösterilmesi ayrı bir güncellemeyle gelecek.</div>
      <div class="grid kpis">
        <div class="card kpi"><div class="label">Aktif doğrulanmış mekân</div><div class="value">${num(v.active)}</div></div>
        <div class="card kpi${v.expiring ? ' alert' : ''}"><div class="label">14 gün içinde bitecek</div><div class="value">${num(v.expiring)}</div></div>
        <div class="card kpi"><div class="label">Bu ay gelir</div><div class="value">${esc(sum('month'))}</div></div>
        <div class="card kpi"><div class="label">Bu yıl gelir</div><div class="value">${esc(sum('year'))}</div><div class="meta">toplam ${esc(sum('total'))}</div></div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Mekân</th><th>Paket</th><th class="num">Tutar</th><th>Süre</th><th>Durum</th><th class="hide-sm">İletişim</th><th></th></tr></thead>
        <tbody id="rows">${v.rows.map((r) => {
          const end = new Date(`${r.ends_on}T00:00:00`);
          const left = Math.round((end - today) / 86400000) + 1;
          const [cls, label] = STATUS[r.status] || ['', r.status];
          return `
            <tr data-id="${esc(r.id)}">
              <td><a href="#" class="cell-main" data-place="${esc(r.place_id)}">${esc(r.place_name)}</a><div class="cell-sub">${esc(r.district)}, ${esc(r.city)}</div></td>
              <td>${esc(PLAN[r.plan] || r.plan)}</td>
              <td class="num">${money(r.price, r.currency)}</td>
              <td class="nowrap">${fmtDay(r.starts_on)} – ${fmtDay(r.ends_on)}${r.status === 'active' ? `<div class="cell-sub">${num(left)} gün kaldı</div>` : ''}</td>
              <td><span class="tag ${cls}">${label}</span></td>
              <td class="hide-sm"><div>${esc(r.contact_name || '—')}</div><div class="cell-sub">${esc([r.contact_phone, r.contact_email].filter(Boolean).join(' · '))}</div>${r.note ? `<div class="cell-sub">${esc(r.note)}</div>` : ''}</td>
              <td class="nowrap">${r.status === 'cancelled' || r.status === 'expired' ? '' : '<button class="btn sm danger" data-cancel type="button">İptal</button>'}</td>
            </tr>`;
        }).join('') || '<tr><td colspan="7" class="empty-state">Henüz satış yok. “Yeni satış” ile ilk mekânı ekle.</td></tr>'}</tbody>
      </table></div></div>`;
    $('#newSale').onclick = () => saleModal(null, render);
    $('#rows').onclick = async (e) => {
      const pl = e.target.closest('[data-place]');
      if (pl) { e.preventDefault(); placeDrawer(pl.dataset.place, render); return; }
      if (!e.target.closest('[data-cancel]')) return;
      const id = e.target.closest('[data-id]').dataset.id;
      const r = v.rows.find((x) => x.id === id);
      if (!(await confirmBox({ title: 'Satış iptal edilsin mi?', text: `${r.place_name} için ${PLAN[r.plan]} paket iptal edilir; rozet süresi kalan satışlara göre yeniden hesaplanır. Gelirden düşer.`, ok: 'İptal et', danger: true }))) return;
      try { await api('cancel_verification', { id }); toast('Satış iptal edildi'); render(); } catch (err) { fail(err); }
    };
  }

  function addPlanEnd(start, plan) {
    const [y, m, d] = start.split('-').map(Number);
    const months = { monthly: 1, quarterly: 3, yearly: 12 }[plan];
    if (!months) return '';
    const e = new Date(Date.UTC(y, m - 1 + months, d) - 86400000);
    return e.toISOString().slice(0, 10);
  }
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function saleModal(place, onDone) {
    let chosen = place;
    const start = place?.verified_until && new Date(place.verified_until) > new Date()
      ? new Date(place.verified_until).toISOString().slice(0, 10)
      : todayIso();
    const m = openModal(`
      <h3>${ICON.badge.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;color:var(--gold)"')} Doğrulanmış satış</h3>
      <form class="form" id="saleForm" autocomplete="off" style="margin-top:14px">
        <div class="field ac">
          <span>Mekân</span>
          <input class="input" id="placeSearch" placeholder="Mekân ara…" value="${esc(place ? `${place.name} · ${place.district}` : '')}" ${place ? 'readonly' : ''} required>
          <div class="ac-list" id="acList" hidden></div>
        </div>
        <div class="row2">
          <label class="field"><span>Paket</span><select class="select" name="plan">
            ${Object.entries(PLAN).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}
          </select></label>
          <div class="field"><span>Tutar</span><div style="display:flex;gap:6px">
            <input class="input" name="price" type="number" min="0" step="1" required style="flex:1;min-width:0">
            <select class="select" name="currency"><option>TRY</option><option>USD</option><option>EUR</option></select>
          </div></div>
        </div>
        <div class="row2">
          <label class="field"><span>Başlangıç</span><input class="input" type="date" name="starts_on" value="${start}" required></label>
          <label class="field"><span>Bitiş</span><input class="input" type="date" name="ends_on" required></label>
        </div>
        <div class="row2">
          <label class="field"><span>Yetkili</span><input class="input" name="contact_name" maxlength="120"></label>
          <label class="field"><span>Telefon</span><input class="input" name="contact_phone" maxlength="40" inputmode="tel"></label>
        </div>
        <label class="field"><span>E-posta</span><input class="input" name="contact_email" type="email" maxlength="160"></label>
        <label class="field"><span>Not</span><textarea class="input" name="note" maxlength="1000" placeholder="Fatura no, ödeme şekli…"></textarea></label>
        <div class="actions" style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px">
          <button class="btn" type="button" data-a="no">Vazgeç</button>
          <button class="btn primary" type="submit">Satışı kaydet</button>
        </div>
      </form>`);
    const form = $('#saleForm', m);
    const f = form.elements;
    const syncEnd = () => {
      const auto = addPlanEnd(f.starts_on.value, f.plan.value);
      f.ends_on.readOnly = Boolean(auto);
      if (auto) f.ends_on.value = auto;
    };
    f.plan.onchange = syncEnd;
    f.starts_on.onchange = syncEnd;
    syncEnd();
    $('[data-a="no"]', m).onclick = closeModal;

    const search = $('#placeSearch', m);
    const list = $('#acList', m);
    if (!place) {
      let found = [];
      search.addEventListener('input', debounce(async () => {
        chosen = null;
        const q = search.value.trim();
        if (q.length < 2) { list.hidden = true; return; }
        try {
          found = (await api('places', { q, limit: 8 })).rows;
          list.innerHTML = found.map((p, i) => `<button type="button" data-i="${i}"><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.cuisine)} · ${esc(p.district)}, ${esc(p.city)}</div></button>`).join('')
            || '<div class="cell-sub" style="padding:10px 12px">Bulunamadı</div>';
          list.hidden = false;
        } catch (e) { fail(e); }
      }, 250));
      list.onclick = (e) => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        chosen = found[Number(b.dataset.i)];
        search.value = `${chosen.name} · ${chosen.district}`;
        list.hidden = true;
      };
      setTimeout(() => search.focus(), 30);
    } else {
      setTimeout(() => f.price.focus(), 30);
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!chosen) { toast('Listeden bir mekân seç', true); search.focus(); return; }
      if (f.ends_on.value < f.starts_on.value) { toast('Bitiş başlangıçtan önce olamaz', true); return; }
      const btn = $('[type=submit]', form);
      btn.disabled = true;
      try {
        await api('add_verification', {
          place_id: chosen.id,
          plan: f.plan.value,
          price: Number(f.price.value),
          currency: f.currency.value,
          starts_on: f.starts_on.value,
          ends_on: f.ends_on.value,
          contact_name: f.contact_name.value,
          contact_phone: f.contact_phone.value,
          contact_email: f.contact_email.value,
          note: f.note.value,
        });
        closeModal();
        toast(`${chosen.name} doğrulanmış olarak kaydedildi`);
        if (!drawerWrap.hidden && place) placeDrawer(place.id, onDone);
        onDone?.();
      } catch (err) { btn.disabled = false; fail(err); }
    };
  }

  /* =====================================================================
   * Uygulama: zorunlu güncelleme + büyüme
   * ===================================================================== */
  async function pageApp(params, alive) {
    const days = Number(params.get('days')) || 30;
    const [versions, g] = await Promise.all([api('versions'), api('growth', { days })]);
    if (!alive()) return;
    const KIND = { profile: 'Profil', post: 'Gönderi', place: 'Mekân', list: 'Liste', taste: 'Damak uyumu', goal: 'Hedef', invite: 'Davet', story: 'Hikâye', map: 'Lezzet haritası' };
    const kinds = Object.entries(g.shares_by_kind || {}).sort((a, b) => b[1] - a[1]);
    const maxKind = Math.max(1, ...kinds.map((k) => k[1]));
    const pct = (v) => (v == null ? '—' : `%${nf1.format(Number(v) * 100)}`);
    main.innerHTML = `
      ${head('Uygulama', 'Zorunlu güncelleme ve büyüme ölçümleri.')}
      <div class="grid two">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>Büyüme</h2>
              <div class="chart-tabs" id="days">${[7, 30, 90].map((d) => `<button type="button" data-d="${d}" class="${d === days ? 'on' : ''}">${d} gün</button>`).join('')}</div>
            </div>
            <div class="card-pad">
              <div class="facts">
                <div class="fact"><div class="v">${num(g.active_users)}</div><div class="l">Aktif kullanıcı</div></div>
                <div class="fact"><div class="v">${num(g.new_users)}</div><div class="l">Yeni kullanıcı</div></div>
                <div class="fact"><div class="v">${pct(g.activation_rate)}</div><div class="l">Aktivasyon (7 günde 3 puan + 3 takip)</div></div>
                <div class="fact"><div class="v">${num(g.invited_joins)}</div><div class="l">Davetle gelen</div></div>
                <div class="fact"><div class="v">${g.k == null ? '—' : nf.format(g.k)}</div><div class="l">Viral katsayı (K)</div></div>
                <div class="fact"><div class="v">${num(g.shares)}</div><div class="l">Paylaşım (${num(g.sharers)} kişi)</div></div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Neler paylaşılıyor</h2><span class="sub">${num(g.shares_completed)} tamamlandı</span></div>
            <div class="list-rows" style="padding:8px 0">
              ${kinds.map(([k, n]) => `<div class="it"><span style="width:120px">${esc(KIND[k] || k)}</span><div class="bar-inline"><i style="width:${(n / maxKind) * 100}%"></i></div><span class="num" style="width:48px;text-align:right">${num(n)}</span></div>`).join('') || '<div class="empty-state">Bu dönemde paylaşım yok</div>'}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Zorunlu güncelleme</h2></div>
          <div class="card-pad stack">
            <div class="callout warn">Bu sürümün altındaki uygulamalar "Güncelle" ekranında kilitlenir. Mağazada olmayan bir sürüm yazarsan o platformdaki herkes kilitlenir.</div>
            ${versions.map((v) => `
              <form class="form" data-platform="${esc(v.platform)}">
                <label class="field"><span>${v.platform === 'ios' ? 'iOS' : 'Android'} en düşük sürüm <span class="hint">son değişiklik ${ago(v.updated_at)}</span></span>
                  <div style="display:flex;gap:8px"><input class="input" name="version" value="${esc(v.min_version)}" pattern="[0-9]+(\\.[0-9]+){0,2}" required style="flex:1">
                  <button class="btn" type="submit">Kaydet</button></div>
                </label>
              </form>`).join('')}
          </div>
        </div>
      </div>`;
    $('#days').onclick = (e) => {
      const b = e.target.closest('[data-d]');
      if (b) go(`#/uygulama?days=${b.dataset.d}`);
    };
    for (const form of $$('form[data-platform]')) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const platform = form.dataset.platform;
        const version = form.elements.version.value.trim();
        const old = versions.find((v) => v.platform === platform)?.min_version;
        if (version === old) { toast('Değişiklik yok'); return; }
        if (!(await confirmBox({
          title: `${platform === 'ios' ? 'iOS' : 'Android'} en düşük sürüm ${version} olsun mu?`,
          text: `${version} altındaki tüm ${platform === 'ios' ? 'iPhone' : 'Android'} kullanıcıları uygulamayı güncelleyene kadar kullanamaz.`,
          ok: 'Kaydet', danger: true,
        }))) return;
        try { await api('set_version', { platform, version }); toast('Sürüm kaydedildi'); render(); } catch (err) { fail(err); }
      };
    }
  }

  /* =====================================================================
   * İşlem geçmişi
   * ===================================================================== */
  const ACTION = {
    resolve_report: 'Şikâyet', resolve_correction: 'Yanlış bilgi', set_ban: 'Yasak', update_place: 'Mekân düzenleme',
    delete_post: 'Gönderi silme', add_verification: 'Doğrulanmış satış', cancel_verification: 'Satış iptali', set_version: 'Zorunlu güncelleme',
  };
  function describe(a) {
    const x = a.args || {};
    switch (a.action) {
      case 'resolve_report': return { dismiss: 'kapatıldı', remove: 'içerik kaldırıldı', ban: 'kaldırıldı + yasaklandı' }[x.action] || x.action;
      case 'resolve_correction': return x.accept ? 'uygulandı' : 'reddedildi';
      case 'set_ban': return x.banned ? 'hesap yasaklandı' : 'yasak kaldırıldı';
      case 'update_place': return Object.keys(x.patch || {}).map((k) => ({ latitude: 'konum', longitude: null, closed: x.patch.closed ? 'kapandı' : 'yeniden açıldı', name: 'ad', cuisine: 'tür', address: 'adres', phone: 'telefon', website: 'web' })[k]).filter(Boolean).join(', ');
      case 'add_verification': return `${PLAN[x.plan] || x.plan} · ${money(x.price, x.currency || 'TRY')}`;
      case 'set_version': return `${x.platform} ≥ ${x.version}`;
      default: return '';
    }
  }
  async function pageAudit(_params, alive) {
    const rows = await api('audit');
    if (!alive()) return;
    main.innerHTML = `
      ${head('İşlem geçmişi', 'Panelden yapılan son 200 değişiklik.')}
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Zaman</th><th>İşlem</th><th>Ayrıntı</th><th class="hide-sm">Kayıt</th></tr></thead>
        <tbody>${rows.map((a) => {
          const target = a.args?.id || a.args?.place_id || '';
          const link = a.action === 'update_place' || a.action === 'add_verification' ? `data-place="${esc(target)}"`
            : a.action === 'set_ban' ? `data-user="${esc(target)}"` : '';
          return `<tr${link ? ` class="click" ${link}` : ''}>
            <td class="nowrap">${fmtDate(a.created_at)} <span class="cell-sub">${new Date(a.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span></td>
            <td class="cell-main">${esc(ACTION[a.action] || a.action)}</td>
            <td>${esc(describe(a))}</td>
            <td class="hide-sm cell-sub" style="font-family:ui-monospace,monospace;font-size:12px">${esc(String(target).slice(0, 8))}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" class="empty-state">Henüz işlem yok</td></tr>'}</tbody>
      </table></div></div>`;
    main.querySelector('tbody').onclick = (e) => {
      const p = e.target.closest('[data-place]');
      if (p) return placeDrawer(p.dataset.place);
      const u = e.target.closest('[data-user]');
      if (u) userDrawer(u.dataset.user);
    };
  }

  // Profil fotoğrafı yüklenemezse baş harf
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('avatar')) return;
    const span = document.createElement('span');
    span.className = img.className;
    span.textContent = img.dataset.initial || '?';
    img.replaceWith(span);
  }, true);

  /* ---------- Başlat ---------- */
  if (!adminKey) {
    showGate('Bu sayfa yalnızca yönetici bağlantısıyla açılır.');
    return;
  }
  if (!location.hash.startsWith('#/')) history.replaceState(null, '', location.pathname + '#/genel');
  render();
  loadOverview().catch(() => { /* sayfa kendi hatasını gösterir */ });
})();
