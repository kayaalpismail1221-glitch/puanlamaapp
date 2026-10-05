// Menü kaydırınca katılaşır; bölümler görünüme girince belirir
(() => {
  const nav = document.querySelector('.nav:not(.solid)');
  if (nav) {
    const on = () => nav.classList.toggle('scrolled', scrollY > 24);
    on();
    addEventListener('scroll', on, { passive: true });
  }
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) return els.forEach((e) => e.classList.add('in'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((e) => io.observe(e));
})();
