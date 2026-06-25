/* ===== Project Hangar — landing page interaktivita ===== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Intro splash: parallax + skrytí nav ---- */
  (function intro() {
    var inner = document.getElementById('introInner');
    var introEl = document.getElementById('intro');
    if (!introEl) return;
    document.body.classList.add('pre-scroll');

    function onScroll() {
      var y = window.scrollY;
      var vh = window.innerHeight;
      // nav se objeví po 55 % výšky intro
      document.body.classList.toggle('pre-scroll', y < vh * 0.55);
      if (inner && !reduceMotion) {
        var p = Math.min(y / vh, 1);            // 0 → 1 napříč první obrazovkou
        inner.style.transform = 'translateY(' + (p * -60) + 'px) scale(' + (1 - p * 0.12) + ')';
        inner.style.opacity = String(Math.max(1 - p * 1.35, 0));
      }
    }
    window.addEventListener('scroll', function () {
      window.requestAnimationFrame(onScroll);
    }, { passive: true });
    onScroll();

    // klik na „scroll" plynule sjede na obsah
    var sc = document.getElementById('introScroll');
    if (sc) sc.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: window.innerHeight, behavior: 'smooth' });
    });
  })();

  /* ---- Vlastní kurzor ---- */
  (function cursor() {
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (!fine || reduceMotion) return;
    var dot = document.getElementById('curDot');
    var ring = document.getElementById('curRing');
    if (!dot || !ring) return;
    document.body.classList.add('has-cursor');

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%)';
    });
    (function loop() {
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px) translate(-50%,-50%)';
      window.requestAnimationFrame(loop);
    })();

    var hot = 'a, button, summary, .seg-btn, input, [role="group"] button';
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest(hot)) ring.classList.add('hot');
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest(hot)) ring.classList.remove('hot');
    });
    document.addEventListener('mousedown', function () { ring.classList.add('down'); });
    document.addEventListener('mouseup', function () { ring.classList.remove('down'); });
    document.addEventListener('mouseleave', function () { dot.style.opacity = ring.style.opacity = '0'; });
    document.addEventListener('mouseenter', function () { dot.style.opacity = '1'; ring.style.opacity = ''; });
  })();

  /* ---- Mobilní menu ---- */
  var nav = document.getElementById('nav');
  var burger = document.getElementById('navBurger');
  if (burger) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('.nav-links a').forEach(function (a) {
      a.addEventListener('click', function () { nav.classList.remove('open'); });
    });
  }

  /* ---- Placeholder download ---- */
  var win = document.getElementById('winDownload');
  if (win) {
    win.addEventListener('click', function (e) {
      e.preventDefault();
      var t = win.textContent;
      win.textContent = 'Download bude doplněn po vydání ⤓';
      setTimeout(function () { win.textContent = t; }, 2200);
    });
  }

  /* ---- Hero simulace workflow ---- */
  var files = ['index.html', 'style.css', 'script.js'];
  var fileTree = document.getElementById('fileTree');
  var projName = document.getElementById('projName');
  var repoBtn = document.getElementById('repoBtn');
  var repoOk = document.getElementById('repoOk');
  var aiMsg = document.getElementById('aiMsg');
  var pvHero = document.querySelector('.pv-hero');
  var pvH1 = document.getElementById('pvH1');
  var pvSub = document.getElementById('pvSub');
  var timers = [];
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  var nameText = 'muj-novy-web';
  function typeName(i) {
    if (!projName) return;
    if (i <= nameText.length) {
      projName.textContent = nameText.slice(0, i);
      at(60, function () { typeName(i + 1); });
    }
  }

  function typeAI(text, i) {
    if (!aiMsg) return;
    if (i <= text.length) {
      aiMsg.innerHTML = text.slice(0, i) + '<span class="cursor">▋</span>';
      at(24, function () { typeAI(text, i + 1); });
    } else {
      aiMsg.innerHTML = text;
    }
  }

  function runHero() {
    if (!fileTree) return;
    clearTimers();
    fileTree.innerHTML = '';
    if (projName) projName.textContent = '';
    if (repoBtn) repoBtn.classList.remove('show', 'flash');
    if (repoOk) repoOk.classList.remove('show');
    if (aiMsg) aiMsg.innerHTML = '';
    if (pvH1) pvH1.textContent = 'Vítejte';
    if (pvSub) pvSub.textContent = 'Váš nový web';

    // krok 1: napsání názvu
    at(300, function () { typeName(1); });

    // krok 2: vznik souborů
    files.forEach(function (f, idx) {
      var li = document.createElement('li');
      li.textContent = f;
      fileTree.appendChild(li);
      at(1100 + idx * 320, function () { li.classList.add('show'); });
    });

    // krok 3: GitHub tlačítko + push
    at(2300, function () { if (repoBtn) repoBtn.classList.add('show'); });
    at(3100, function () { if (repoBtn) repoBtn.classList.add('flash'); });
    at(3500, function () { if (repoOk) repoOk.classList.add('show'); });

    // krok 4: AI agent navrhne úpravu
    at(4200, function () { typeAI('Vylepšil jsem hero sekci — výraznější nadpis a CTA.', 1); });

    // krok 5: live preview update
    at(5400, function () {
      if (pvHero) { pvHero.classList.add('update'); at(620, function () { pvHero.classList.remove('update'); }); }
      if (pvH1) pvH1.textContent = 'Postavte web rychleji';
      if (pvSub) pvSub.textContent = 'S GitHubem a AI agentem';
    });

    // smyčka
    at(8800, runHero);
  }

  // spustit hero až je vidět (šetří výkon)
  var hero = document.getElementById('appWindow');
  if (hero && 'IntersectionObserver' in window) {
    var started = false;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && !started) { started = true; runHero(); }
        else if (!en.isIntersecting && started) { clearTimers(); started = false; }
      });
    }, { threshold: .2 }).observe(hero);
  } else if (hero) {
    runHero();
  }

  /* ---- Mini demo generátor (reálné šablony webů z aplikace) ---- */
  var TEMPLATES = {
    nocturn: {
      label: 'NOCTÜRN — Creative Studio', tld: '.studio',
      extra: ['assets/'],
      note: '## NOCTÜRN — Creative Studio\n\nTmavá báze + acid lime, bento grid,\nkinetic typografie, custom kurzor.',
      site: 'nocturn'
    },
    flux: {
      label: 'FLUX// — Digital Product Studio', tld: '.dev',
      extra: ['assets/'],
      note: '## FLUX// — Digital Product Studio\n\nBrutalismus: black/white, neon,\nraw borders, ticker, monospace.',
      site: 'flux'
    },
    lumen: {
      label: 'LUMEN — Editorial Studio', tld: '.com',
      extra: ['assets/'],
      note: '## LUMEN — Editorial Studio\n\nEditorial / luxury: světlá, serif\ndisplay, whitespace, terracotta akcent.',
      site: 'lumen'
    },
    prisma: {
      label: 'Prisma — SaaS', tld: '.app',
      extra: ['assets/'],
      note: '## Prisma — SaaS landing\n\nGradient mesh + glassmorphism,\nbento sekce, ceník.',
      site: 'prisma'
    }
  };

  // živé náhledy webu ve skutečném stylu každé šablony
  function siteHtml(kind, name) {
    var title = name.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    var T = escapeHtml(title);
    if (kind === 'flux') {
      return '<div class="t t-flux">' +
        '<div class="tf-nav"><b>' + T + '//</b><span>WORK · INFO</span></div>' +
        '<div class="tf-hero"><span class="tf-tag">DIGITAL PRODUCT STUDIO</span>' +
        '<div class="tf-h">WE BUILD<br><span>PRODUCTS.</span></div></div>' +
        '<div class="tf-ticker"><span>SHIP FAST ✱ BOLD ✱ RAW ✱ SHIP FAST ✱ BOLD ✱ RAW ✱</span></div></div>';
    }
    if (kind === 'lumen') {
      return '<div class="t t-lumen">' +
        '<div class="tl-nav"><b>' + T + '</b><span>Work · Journal · Contact</span></div>' +
        '<div class="tl-hero"><div class="tl-h">Quiet design for brands that <em>say something.</em></div>' +
        '<span class="tl-btn">Selected work →</span></div></div>';
    }
    if (kind === 'prisma') {
      return '<div class="t t-prisma"><div class="tp-mesh"></div>' +
        '<div class="tp-nav"><b>◭ ' + T + '</b><span>Features · Pricing</span></div>' +
        '<div class="tp-hero"><div class="tp-h">Ship products at the <span>speed of thought.</span></div>' +
        '<span class="tp-btn">Start free</span></div></div>';
    }
    return '<div class="t t-nocturn">' +
      '<div class="tn-nav"><b>' + T + '<i>⁂</i></b><span>Work · Studio · Contact</span></div>' +
      '<div class="tn-hero"><div class="tn-h">We build<br>digital things<br>that <i>move.</i></div></div>' +
      '<div class="tn-marq"><span>Branding ✦ Web ✦ Motion ✦ Art Direction ✦ Branding ✦ Web ✦</span></div></div>';
  }

  var demoType = document.getElementById('demoType');
  var currentType = 'nocturn';
  if (demoType) {
    demoType.querySelectorAll('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        demoType.querySelectorAll('.seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        currentType = b.dataset.type;
      });
    });
  }

  function slugify(s) {
    return (s || 'muj-web').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'muj-web';
  }

  var runBtn = document.getElementById('demoRun');
  if (runBtn) {
    runBtn.addEventListener('click', function () {
      var raw = document.getElementById('demoName').value;
      var slug = slugify(raw);
      var t = TEMPLATES[currentType];

      // soubory
      var base = ['index.html', 'styles.css', 'script.js', 'README.md'];
      var allFiles = base.concat(t.extra);
      var ft = document.getElementById('demoFiles');
      ft.innerHTML = '';
      allFiles.forEach(function (f) {
        var li = document.createElement('li');
        li.textContent = f;
        ft.appendChild(li);
      });

      // repo + url
      document.getElementById('demoRepo').textContent = 'helion/' + slug;
      var urlEl = document.getElementById('demoUrl');
      if (urlEl) urlEl.textContent = slug + (t.tld || '.com');

      // readme z reálného payloadu šablony
      document.getElementById('demoReadme').textContent =
        '# ' + slug + '\n' +
        '> ' + t.label + ' · Project Hangar\n\n' +
        t.note;

      // živý náhled webu
      document.getElementById('demoPreview').innerHTML = siteHtml(t.site, slug);
    });
    // vygenerovat výchozí stav
    runBtn.click();
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---- Reveal on scroll ---- */
  var reveals = document.querySelectorAll('.section-head, .card, .step, .feat, .sec-item, .road-item, .download-box');
  reveals.forEach(function (el) { el.classList.add('reveal'); });
  if ('IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); ro.unobserve(en.target); }
      });
    }, { threshold: .12 });
    reveals.forEach(function (el) { ro.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }
})();
