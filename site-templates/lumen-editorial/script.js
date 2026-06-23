/* LUMEN — minimal interakce: nav, reveal, hodiny, rok. */
(() => {
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 20);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });

  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  const clock = document.getElementById("clock");
  if (clock) {
    const tick = () => {
      const d = new Date();
      clock.textContent = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " · Lisbon";
    };
    tick(); setInterval(tick, 1000 * 30);
  }
})();
