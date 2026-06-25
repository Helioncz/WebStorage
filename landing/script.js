/* ===== Project Hangar — landing page interaktivita ===== */
(function () {
  'use strict';

  /* ---- Boot intro (jen při načtení z vrchu stránky) ---- */
  (function boot() {
    var el = document.getElementById('boot');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // hraje jen když jsme úplně nahoře a uživatel respektuje pohyb
    if (!el || reduce || window.scrollY > 4) { if (el) el.remove(); return; }

    el.classList.add('run');
    document.body.style.overflow = 'hidden';
    var log = document.getElementById('bootLog');
    var bar = document.getElementById('bootBar');
    var lines = [
      { t: '> project-hangar --launch', d: 0 },
      { t: '<span class="ok">✓</span> trezor odemčen', d: 30 },
      { t: '<span class="ok">✓</span> workspace načten · 3 projekty', d: 58 },
      { t: '<span class="ok">✓</span> live preview server na :5173', d: 80 },
      { t: '<span class="ok">✓</span> AI agent připojen', d: 100 },
      { t: 'ready <span class="cur">▋</span>', d: 100 }
    ];
    var html = '', i = 0;
    function step() {
      if (i >= lines.length) {
        setTimeout(function () {
          el.classList.add('done');
          document.body.style.overflow = '';
          setTimeout(function () { el.remove(); }, 700);
        }, 480);
        return;
      }
      html += (i ? '\n' : '') + lines[i].t;
      log.innerHTML = html;
      bar.style.width = lines[i].d + '%';
      i++;
      setTimeout(step, i === 1 ? 360 : 300);
    }
    setTimeout(step, 260);
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

  /* ---- Mini demo generátor (reálné šablony aplikace) ---- */
  var TEMPLATES = {
    web: {
      label: 'Webová prezentace',
      extra: ['kontakt.html', 'assets/'],
      note: '## Web na klíč\n\nPostup: podklady → design →\nrealizace → nasazení → předání.',
      site: 'web'
    },
    eshop: {
      label: 'E-shop',
      extra: ['kosik.html', 'produkty/', 'assets/'],
      note: '## E-shop\n\nNezapomenout: platby, doprava,\nGDPR, obchodní podmínky.',
      site: 'eshop'
    },
    servis: {
      label: 'Servisní zakázka',
      extra: ['zaloha/', 'CHANGELOG.md'],
      note: '## Servisní zakázka\n\nPřed zásahem vždy záloha!',
      site: 'servis'
    }
  };

  // živé náhledy webu (skutečně vykreslené, světlý web jako reálný výstup)
  function siteHtml(kind, name) {
    var title = name.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    if (kind === 'eshop') {
      return '<div class="s s-eshop">' +
        '<div class="s-nav"><b>' + escapeHtml(title) + '</b><span>Produkty · Košík 🛒</span></div>' +
        '<div class="s-grid">' +
          '<div class="s-card"><div class="s-img"></div><span>Produkt A</span><b>349 Kč</b></div>' +
          '<div class="s-card"><div class="s-img"></div><span>Produkt B</span><b>590 Kč</b></div>' +
          '<div class="s-card"><div class="s-img"></div><span>Produkt C</span><b>120 Kč</b></div>' +
          '<div class="s-card"><div class="s-img"></div><span>Produkt D</span><b>880 Kč</b></div>' +
        '</div></div>';
    }
    if (kind === 'servis') {
      return '<div class="s s-servis">' +
        '<div class="s-nav"><b>' + escapeHtml(title) + '</b><span>Stav: aktivní</span></div>' +
        '<div class="s-status"><span class="ok-dot"></span> Web běží — probíhá údržba</div>' +
        '<div class="s-rows"><div class="s-line"></div><div class="s-line short"></div><div class="s-line"></div></div>' +
        '</div>';
    }
    return '<div class="s s-web">' +
      '<div class="s-nav"><b>' + escapeHtml(title) + '</b><span>O nás · Služby · Kontakt</span></div>' +
      '<div class="s-hero"><div class="s-h1">' + escapeHtml(title) + '</div>' +
      '<div class="s-sub">Důvěryhodná prezentace za pár minut</div>' +
      '<span class="s-btn">Nezávazná poptávka</span></div></div>';
  }

  var demoType = document.getElementById('demoType');
  var currentType = 'web';
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
      var base = ['index.html', 'style.css', 'script.js', 'README.md'];
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
      if (urlEl) urlEl.textContent = slug + '.cz';

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
