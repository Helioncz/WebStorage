// SignalPlus — drobná interaktivita (mobilní menu, formulář, smooth scroll)

// Mobilní menu (hamburger)
const burger = document.getElementById("burger");
const nav = document.getElementById("mainNav");
if (burger && nav) {
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  // Zavřít po kliknutí na odkaz
  nav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
    })
  );
}

// Kontaktní formulář — bez backendu, jen potvrzení
const form = document.getElementById("contactForm");
const note = document.getElementById("formNote");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    form.reset();
    if (note) {
      note.hidden = false;
      setTimeout(() => (note.hidden = true), 6000);
    }
  });
}

// Jemná animace prvků při scrollu
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.style.opacity = "1";
        en.target.style.transform = "none";
        io.unobserve(en.target);
      }
    });
  },
  { threshold: 0.12 }
);
document.querySelectorAll(".card, .tile, .stat-box, .quote, .section-head").forEach((el) => {
  el.style.opacity = "0";
  el.style.transform = "translateY(18px)";
  el.style.transition = "opacity .5s ease, transform .5s ease";
  io.observe(el);
});
