/* Prisma — reveal + count-up + rok. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    const o = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      if (reduce) { el.textContent = target; o.disconnect(); return; }
      let c = 0; const step = Math.max(1, Math.round(target / 35));
      const t = () => { c = Math.min(target, c + step); el.textContent = c; if (c < target) requestAnimationFrame(t); };
      t(); o.disconnect();
    }), { threshold: 0.6 });
    o.observe(el);
  });

  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
