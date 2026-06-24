/* NOCTÜRN — interakce. Vanilla JS, bez frameworku. Respektuje reduced-motion. */
(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // ---------- rok v patičce ----------
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // ---------- nav po scrollu ----------
  const nav = document.getElementById("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 30);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // ---------- hero title reveal po načtení ----------
  const title = document.querySelector(".hero-title");
  requestAnimationFrame(() => title && title.classList.add("in"));

  // ---------- scroll reveal (IntersectionObserver) ----------
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.16 }
  );
  document.querySelectorAll(".reveal, .tile").forEach((el) => io.observe(el));

  // ---------- word-by-word reveal ----------
  document.querySelectorAll(".reveal-words").forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w) => `<span class="w">${w}</span>`).join(" ");
    const spans = el.querySelectorAll(".w");
    const wio = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          spans.forEach((s, i) => setTimeout(() => (s.style.opacity = "1"), i * 35));
          wio.disconnect();
        });
      },
      { threshold: 0.3 }
    );
    wio.observe(el);
  });

  // ---------- count-up statistiky ----------
  document.querySelectorAll("[data-count]").forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    const sio = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          if (reduce) { el.textContent = target; sio.disconnect(); return; }
          let cur = 0;
          const step = Math.max(1, Math.round(target / 40));
          const tick = () => {
            cur = Math.min(target, cur + step);
            el.textContent = cur;
            if (cur < target) requestAnimationFrame(tick);
          };
          tick();
          sio.disconnect();
        });
      },
      { threshold: 0.5 }
    );
    sio.observe(el);
  });

  // ---------- kinetic řádky reagující na scroll ----------
  const kinetics = [...document.querySelectorAll(".kinetic-row")];
  if (kinetics.length && !reduce) {
    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      kinetics.forEach((row) => {
        const speed = parseFloat(row.dataset.speed) || 1;
        const rect = row.getBoundingClientRect();
        const progress = (rect.top - vh) / (vh + rect.height); // ~ -1..0
        row.style.transform = `translateX(${progress * speed * 22}%)`;
      });
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  // ---------- custom kurzor + magnetická tlačítka ----------
  if (fine && !reduce) {
    const dot = document.getElementById("cursorDot");
    const ring = document.getElementById("cursorRing");
    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;

    window.addEventListener("mousemove", (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    });
    const loop = () => {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
      requestAnimationFrame(loop);
    };
    loop();

    document.querySelectorAll("[data-cursor]").forEach((el) => {
      el.addEventListener("mouseenter", () => ring.classList.add("grow"));
      el.addEventListener("mouseleave", () => ring.classList.remove("grow"));
    });

    document.querySelectorAll(".magnetic").forEach((el) => {
      const strength = 0.35;
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y2 = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * strength}px, ${y2 * strength}px)`;
      });
      el.addEventListener("mouseleave", () => (el.style.transform = ""));
    });
  }
})();
