const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealHero() {
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    if (reduceMotion) {
      el.classList.add('is-in');
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  });
}

function countUp(el) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target) || reduceMotion) return;
  const start = performance.now();
  const duration = 1100;
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
  };
  el.textContent = '0';
  requestAnimationFrame(tick);
}

function setupScrollReveal() {
  const nodes = [...document.querySelectorAll('[data-scroll-reveal]')];
  if (!nodes.length) return;
  if (reduceMotion || !('IntersectionObserver' in window)) {
    nodes.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        entry.target.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
  );
  nodes.forEach((el) => io.observe(el));
}

function setupNav() {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

revealHero();
setupScrollReveal();
setupNav();
