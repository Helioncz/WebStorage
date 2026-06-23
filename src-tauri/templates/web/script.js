// ŠABLONA WEBU — drobná interaktivita (mobilní menu + formulář + rok v patičce)

const burger = document.getElementById("burger");
const nav = document.getElementById("mainNav");
if (burger && nav) {
  burger.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => nav.classList.remove("open")));
}

const form = document.getElementById("contactForm");
const note = document.getElementById("formNote");
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    form.reset();
    if (note) { note.hidden = false; setTimeout(() => (note.hidden = true), 6000); }
  });
}

const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();
