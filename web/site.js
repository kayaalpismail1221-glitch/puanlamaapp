// Menü, beliren bölümler, sayaçlar, sabit telefon ve içindekiler
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = document.querySelector('.nav');
  if (nav) {
    const on = () => nav.classList.toggle('scrolled', scrollY > 24);
    on();
    addEventListener('scroll', on, { passive: true });
  }
  const IO = 'IntersectionObserver' in window;
  const once = (els, fn, opts) => {
    if (!IO) return els.forEach(fn);
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); }
    }, opts);
    els.forEach((e) => io.observe(e));
  };
  once(document.querySelectorAll('.reveal'), (e) => e.classList.add('in'), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

  // Sayaçlar: 0'dan hedefe (yazı başta son değerle gelir; JS'siz ve arama motorlarında doğru görünür)
  const lang = document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-US';
  once(document.querySelectorAll('[data-count]'), (el) => {
    if (reduce) return;
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || '';
    const f = (v) => v.toLocaleString(lang, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
    const t0 = performance.now(), dur = 1600;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = f(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = f(0);
    setTimeout(() => requestAnimationFrame(tick), el.closest('.ring') ? 400 : 0);
  }, { threshold: 0.6 });

  // Özellikler: ekranın ortasından geçen adım etkin, telefon o ekrana geçer
  const show = document.querySelector('.show');
  if (show && IO) {
    const groups = [show.querySelectorAll('.show-step'), show.querySelectorAll('.stage-img'), show.querySelectorAll('.stage-dots i')];
    const set = (i) => groups.forEach((g) => g.forEach((el, j) => el.classList.toggle('on', j === i)));
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) set(+e.target.dataset.i);
    }, { rootMargin: '-50% 0px -50% 0px' });
    groups[0].forEach((s) => io.observe(s));
  }

  // İçindekiler: okunan bölümü işaretle
  const toc = document.querySelectorAll('.toc a');
  if (toc.length && IO) {
    const map = new Map([...toc].map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) toc.forEach((a) => a.classList.toggle('on', a === map.get(e.target.id)));
    }, { rootMargin: '-30% 0px -60% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }
})();
