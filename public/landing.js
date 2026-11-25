const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealHero() {
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    if (reduceMotion) {
      el.classList.add('is-in');
      return;
    }
    requestAnimationFrame(() => el.classList.add('is-in'));
  });
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
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.15 }
  );
  nodes.forEach((el) => io.observe(el));
}

function setupNav() {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 12);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/** Hero parallax: atmosphere layers drift slightly against scroll */
function setupParallax() {
  const root = document.querySelector('[data-parallax]');
  const visual = document.querySelector('.hero-visual');
  if (!root || reduceMotion) return;

  let ticking = false;
  const update = () => {
    ticking = false;
    const y = Math.min(window.scrollY, window.innerHeight);
    const p = y / Math.max(window.innerHeight, 1);
    root.style.transform = `translate3d(0, ${p * 36}px, 0)`;
    if (visual) visual.style.transform = `translate3d(0, ${p * -48}px, 0)`;
  };

  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true }
  );
}

revealHero();
setupScrollReveal();
setupNav();
setupParallax();
