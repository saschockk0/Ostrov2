// Lazy-load iframes when they scroll into view
(function () {
  var lazyFrames = document.querySelectorAll('iframe[data-src]');
  if ('IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.src = e.target.dataset.src;
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: '300px' });
    lazyFrames.forEach(function(f) { obs.observe(f); });
  } else {
    lazyFrames.forEach(function(f) { f.src = f.dataset.src; });
  }
})();

// Minimal hero video player: play/pause + mute only, muted by default
(function () {
  "use strict";

  const video = document.querySelector(".js-hero-video");
  if (!video) return;

  video.muted = true;
  // Половинная громкость по умолчанию (в 2 раза тише), когда звук включат
  video.volume = 0.5;

  const playBtn = document.querySelector(".js-hero-play");
  const muteBtn = document.querySelector(".js-hero-mute");
  const pauseIcon = document.querySelector(".js-hero-pause-icon");
  const playIcon = document.querySelector(".js-hero-play-icon");
  const mutedIcon = document.querySelector(".js-hero-muted-icon");
  const unmutedIcon = document.querySelector(".js-hero-unmuted-icon");

  // Иконки — это <svg> (SVGElement), у которых нет HTML-свойства .hidden,
  // поэтому переключаем именно атрибут через toggleAttribute.
  const setHidden = (el, hidden) => {
    if (el) el.toggleAttribute("hidden", hidden);
  };

  const syncPlay = () => {
    const playing = !video.paused;
    if (playBtn) playBtn.setAttribute("aria-label", playing ? "Пауза" : "Воспроизведение");
    setHidden(pauseIcon, !playing);
    setHidden(playIcon, playing);
  };

  const syncMute = () => {
    if (muteBtn) muteBtn.setAttribute("aria-label", video.muted ? "Включить звук" : "Выключить звук");
    setHidden(mutedIcon, !video.muted);
    setHidden(unmutedIcon, video.muted);
  };

  if (playBtn) {
    playBtn.addEventListener("click", () => {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    });
  }
  if (muteBtn) {
    muteBtn.addEventListener("click", () => {
      video.muted = !video.muted;
      syncMute();
    });
  }
  video.addEventListener("play", syncPlay);
  video.addEventListener("pause", syncPlay);

  syncPlay();
  syncMute();
})();

(function () {
  "use strict";

  const video = document.querySelector(".va-hero-video__el");
  const playBtn = document.querySelector(".va-hero-video__play");
  const muteBtn = document.querySelector(".va-hero-video__mute");

  if (video && playBtn) {
    const pauseBars = playBtn.querySelector(".va-hero-video__pause-icon");
    const playTri = playBtn.querySelector(".va-hero-video__play-icon");

    const setPlayingUi = (playing) => {
      playBtn.setAttribute("aria-label", playing ? "Пауза" : "Воспроизведение");
      if (pauseBars) pauseBars.hidden = !playing;
      if (playTri) playTri.hidden = playing;
    };

    setPlayingUi(!video.paused);

    playBtn.addEventListener("click", () => {
      if (video.paused) {
        video.play().catch(() => {});
        setPlayingUi(true);
      } else {
        video.pause();
        setPlayingUi(false);
      }
    });
  }

  if (video && muteBtn) {
    const syncMute = () => {
      const muted = video.muted;
      muteBtn.setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
      muteBtn.textContent = muted ? "🔇" : "🔊";
    };
    syncMute();
    muteBtn.addEventListener("click", () => {
      video.muted = !video.muted;
      syncMute();
    });
  }

  const nav = document.getElementById("vaNav");
  const navPanel = document.getElementById("vaNavPanel");
  const navToggle = document.querySelector(".va-nav__toggle");
  const navBackdrop = document.getElementById("vaNavBackdrop");

  const closeNav = () => {
    if (!nav) return;
    nav.classList.remove("is-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    if (navBackdrop) navBackdrop.hidden = true;
    document.body.classList.remove("va-nav-open");
  };

  const openNav = () => {
    if (!nav) return;
    nav.classList.add("is-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "true");
    if (navBackdrop) navBackdrop.hidden = false;
    document.body.classList.add("va-nav-open");
  };

  if (nav && navToggle) {
    navToggle.addEventListener("click", () => {
      if (nav.classList.contains("is-open")) closeNav();
      else openNav();
    });
  }

  if (navBackdrop) {
    navBackdrop.addEventListener("click", closeNav);
  }

  if (navPanel) {
    navPanel.querySelectorAll("a[href^='#']").forEach((link) => {
      link.addEventListener("click", closeNav);
    });
  }

  document.querySelectorAll(".js-open-wizard").forEach((btn) => {
    btn.addEventListener("click", closeNav);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNav();
  });

  const faqItems = document.querySelectorAll(".va-faq__item");
  if (faqItems.length) {
    faqItems.forEach((item) => {
      const trigger = item.querySelector(".va-faq__trigger");
      const panel = item.querySelector(".va-faq__panel");
      if (!trigger || !panel) return;

      trigger.addEventListener("click", () => {
        const isOpen = item.classList.contains("is-open");
        faqItems.forEach((other) => {
          other.classList.remove("is-open");
          const btn = other.querySelector(".va-faq__trigger");
          const p = other.querySelector(".va-faq__panel");
          if (btn) btn.setAttribute("aria-expanded", "false");
          if (p) p.hidden = true;
        });
        if (!isOpen) {
          item.classList.add("is-open");
          trigger.setAttribute("aria-expanded", "true");
          panel.hidden = false;
        }
      });
    });

    const first = faqItems[0];
    if (first) {
      first.classList.add("is-open");
      const btn = first.querySelector(".va-faq__trigger");
      const panel = first.querySelector(".va-faq__panel");
      if (btn) btn.setAttribute("aria-expanded", "true");
      if (panel) panel.hidden = false;
    }
  }
})();

/* ─── Sticky mobile CTA ──────────────────────────────────────────
   Показываем плавающую кнопку «Оставить заявку» после прокрутки hero.
   Прячем, когда виден калькулятор или футер (там есть свой CTA),
   а также когда открыт опросник. */
(function () {
  const cta = document.getElementById("mobileCta");
  if (!cta || !("IntersectionObserver" in window)) return;

  const hero = document.querySelector(".hero");
  const calc = document.getElementById("calculator");
  const footer = document.querySelector(".footer");
  const modal = document.getElementById("wizardModal");

  let pastHero = false;
  let overCalc = false;
  let overFooter = false;

  function update() {
    const modalOpen = modal && !modal.classList.contains("hidden");
    cta.classList.toggle(
      "is-visible",
      pastHero && !overCalc && !overFooter && !modalOpen
    );
  }

  if (hero) {
    new IntersectionObserver(
      ([e]) => {
        pastHero = !e.isIntersecting;
        update();
      },
      { rootMargin: "-45% 0px 0px 0px" }
    ).observe(hero);
  } else {
    pastHero = true;
  }

  if (calc) {
    new IntersectionObserver(
      ([e]) => {
        overCalc = e.isIntersecting;
        update();
      },
      { threshold: 0.12 }
    ).observe(calc);
  }

  if (footer) {
    new IntersectionObserver(
      ([e]) => {
        overFooter = e.isIntersecting;
        update();
      },
      { threshold: 0.05 }
    ).observe(footer);
  }

  if (modal) {
    new MutationObserver(update).observe(modal, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }

  update();
})();

/* ─── Hero-видео: автозапуск только на десктопе с нормальной сетью ──
   Мобильные, экономия трафика (Save-Data), медленная сеть и
   prefers-reduced-motion видят постер (~170 КБ) вместо загрузки 17 МБ
   видео при заходе. Видео стартует по кнопке play. Экономит мобильный
   трафик и ускоряет загрузку — самый конверсионно-важный сегмент. */
(function () {
  const video = document.querySelector("video.js-hero-video");
  if (!video) return;

  const mm = window.matchMedia ? (q) => window.matchMedia(q).matches : null;
  const reduced = mm ? mm("(prefers-reduced-motion: reduce)") : false;
  const isMobile = mm ? mm("(max-width: 768px)") : window.innerWidth <= 768;
  const conn = navigator.connection || {};
  const saveData = !!conn.saveData;
  const slow = /(^|-)2g$/.test(conn.effectiveType || "");

  if (reduced || isMobile || saveData || slow) {
    // Постер остаётся видимым, 17 МБ не качаем; запуск — кнопкой play.
    video.removeAttribute("autoplay");
    try { video.pause(); } catch (e) {}
    return;
  }

  // Десктоп с нормальной сетью: подгружаем и запускаем как раньше.
  // preload="none" → данных ещё нет, поэтому пробуем play() сразу (на случай
  // кэша) и повторяем по canplay, когда видео готово к воспроизведению.
  const tryPlay = () => {
    const p = video.play();
    if (p && p.catch) p.catch(() => {});
  };
  try {
    video.preload = "auto";
    tryPlay();
    video.addEventListener("canplay", tryPlay, { once: true });
  } catch (e) {}
})();

/* ─── Плавное появление блоков при прокрутке (scroll-reveal) ───────
   Прогрессивное улучшение: если нет IntersectionObserver или включён
   reduce-motion — ничего не делаем, контент остаётся видимым. Иначе
   ставим .reveal-on на <html>, прячем блоки ниже первого экрана и
   плавно показываем их при попадании во вьюпорт, со стаггером внутри
   групп (карточки в сетке появляются друг за другом). */
(function () {
  "use strict";

  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var docEl = document.documentElement;

  // Блоки-кандидаты на анимацию появления (только презентационные).
  var INCLUDE = [
    ".section > h2",
    ".section > p",
    ".section > .eyebrow",
    ".section__title",
    ".section-title",
    ".section-subtitle",
    ".section-head",
    ".va-fleet__head",
    ".fleet-scene",
    "#about .card",
    ".table-wrap",
    ".pricing-cta",
    ".faq-layout .eyebrow",
    ".faq details",
    ".events-grid",
    ".events-timeline",
    ".gallery-filters",
    ".testimonials-stat",
    ".yandex-reviews-wrap",
    ".editorial__quote",
    ".editorial__text",
    ".editorial__items",
    ".editorial__actions",
    ".weather-widget",
    ".footer-friends__title",
    ".friend-card"
  ].join(",");

  // Зоны, которые трогать нельзя: интерактив, sticky/абсолют, карта Leaflet,
  // hero/хедер/навигация/модалки (важно для конверсии — видны сразу).
  var EXCLUDE = "#calculator, #island-plan, .hero, .site-header, .va-nav, #wizardModal, .modal, .mobile-cta, .msgr-rail, #island-map";

  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -7% 0px", threshold: 0.05 }
  );

  var vh = window.innerHeight || docEl.clientHeight;
  var nodes = Array.prototype.slice.call(document.querySelectorAll(INCLUDE));
  var prepared = 0;
  var lastParent = null;
  var groupIdx = 0;

  nodes.forEach(function (el) {
    if (el.closest && el.closest(EXCLUDE)) return;

    // Уже видно при загрузке → показываем сразу, без анимации (нет «мигания»
    // и контент первого экрана появляется мгновенно).
    var rect = el.getBoundingClientRect();
    if (rect.top < vh * 0.9 && rect.bottom > 0) return;

    // Стаггер: соседние подходящие элементы одного родителя появляются каскадом.
    if (el.parentNode === lastParent) {
      groupIdx++;
    } else {
      groupIdx = 0;
      lastParent = el.parentNode;
    }
    var delay = Math.min(groupIdx * 70, 280);
    if (delay) el.style.setProperty("--reveal-delay", delay + "ms");

    el.classList.add("reveal");
    io.observe(el);
    prepared++;
  });

  if (prepared) docEl.classList.add("reveal-on");

  // Страховка: секции «галерея», «события», «отзывы» наполняются через API
  // уже после загрузки. Если контент дорисовался, когда пользователь проскроллил
  // мимо (или элемент стартовал с hidden), IntersectionObserver не сработает и
  // блок останется невидимым. Поэтому периодически показываем всё, что уже
  // попало в зону видимости или выше неё. Контент ниже первого экрана это не
  // затрагивает — он по-прежнему появляется плавно при прокрутке.
  function safetySweep() {
    var vhNow = window.innerHeight || docEl.clientHeight;
    var rest = document.querySelectorAll(".reveal:not(.is-revealed)");
    for (var i = 0; i < rest.length; i++) {
      var r = rest[i].getBoundingClientRect();
      if (r.top < vhNow) {
        rest[i].classList.add("is-revealed");
        io.unobserve(rest[i]);
      }
    }
  }

  window.addEventListener("load", function () { setTimeout(safetySweep, 300); });
  // догрузка API-секций: добиваем отложенными проходами
  setTimeout(safetySweep, 1800);
  setTimeout(safetySweep, 4500);
})();

/* ─── Тень у липкого хедера при прокрутке ─────────────────────────
   Мягко отделяем шапку от контента, когда страница прокручена.
   Работает и при reduce-motion (там просто без анимации тени). */
(function () {
  "use strict";
  var header = document.querySelector(".site-header");
  if (!header) return;

  var ticking = false;
  function apply() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    ticking = false;
  }
  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(apply);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  apply();
})();

/* ─── Scroll-spy: подсветка активного раздела в навигации ──────────
   Активен последний раздел, чей верх выше «линии чтения» (~30% экрана
   под хедером). Позиционный расчёт надёжнее ratio и не путает короткие
   секции с длинными. rAF-throttled, passive. */
(function () {
  "use strict";
  var nav = document.getElementById("mainNav");
  if (!nav) return;

  var entries = [];
  Array.prototype.forEach.call(nav.querySelectorAll('a[href^="#"]'), function (a) {
    var id = (a.getAttribute("href") || "").slice(1);
    var sec = id && document.getElementById(id);
    if (sec) entries.push({ id: id, link: a, sec: sec });
  });
  if (!entries.length) return;

  // Сортируем по порядку в DOM (а не по offsetTop: у скрытых секций он 0 и
  // ломает порядок). DOM-порядок = визуальный для обычного потока.
  entries.sort(function (x, y) {
    var p = x.sec.compareDocumentPosition(y.sec);
    if (p & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (p & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  // Видима ли секция (не display:none). У скрытых offsetParent === null.
  function visible(sec) {
    return sec.offsetParent !== null || sec.getClientRects().length > 0;
  }

  var current = null;
  function setActive(id) {
    if (id === current) return;
    current = id;
    for (var i = 0; i < entries.length; i++) {
      entries[i].link.classList.toggle("is-active", entries[i].id === id);
    }
  }

  var ticking = false;
  function update() {
    ticking = false;
    var line = (window.innerHeight || 0) * 0.3 + 80;
    var activeId = null;
    for (var i = 0; i < entries.length; i++) {
      if (!visible(entries[i].sec)) continue; // скрытые (напр. пустая галерея) пропускаем
      var top = entries[i].sec.getBoundingClientRect().top;
      if (activeId === null) activeId = entries[i].id; // дефолт — первый видимый раздел
      if (top <= line) activeId = entries[i].id;
      else break;
    }
    // У самого низа страницы — последний видимый раздел (контакты).
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
      for (var j = entries.length - 1; j >= 0; j--) {
        if (visible(entries[j].sec)) { activeId = entries[j].id; break; }
      }
    }
    if (activeId) setActive(activeId);
  }
  function onScroll() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();

/* ─── Плавное раскрытие/сворачивание FAQ ──────────────────────────
   Нативный <details> показывает ответ мгновенно. Анимируем высоту
   через Web Animations API (контент клипуется по overflow:hidden,
   который уже задан в .faq details). При reduce-motion или без WAAPI —
   обычное мгновенное поведение. */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var items = document.querySelectorAll(".faq details");
  if (!items.length) return;

  Array.prototype.forEach.call(items, function (d) {
    var summary = d.querySelector("summary");
    if (!summary || typeof d.animate !== "function") return;

    var anim = null;

    function clear() {
      d.style.height = "";
      anim = null;
    }

    summary.addEventListener("click", function (e) {
      e.preventDefault();
      if (anim) { anim.cancel(); anim = null; }

      var summaryH = summary.offsetHeight;

      if (!d.open) {
        // Открытие: ставим open, меряем полную высоту, анимируем от свёрнутой
        d.open = true;
        var fullH = d.offsetHeight;
        anim = d.animate(
          [{ height: summaryH + "px" }, { height: fullH + "px" }],
          { duration: 300, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" }
        );
        anim.onfinish = clear;
        anim.oncancel = clear;
      } else {
        // Закрытие: анимируем до высоты заголовка, потом снимаем open
        var startH = d.offsetHeight;
        anim = d.animate(
          [{ height: startH + "px" }, { height: summaryH + "px" }],
          { duration: 240, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }
        );
        anim.onfinish = function () { d.open = false; clear(); };
        anim.oncancel = clear;
      }
    });
  });
})();
