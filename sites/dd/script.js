/* FLUX// — reveal + rok. */
(() => {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
