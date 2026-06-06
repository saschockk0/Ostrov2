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

/* ─── prefers-reduced-motion: не автозапускаем hero-видео ──────────
   Пользователь с непереносимостью движения видит постер; включить
   видео можно вручную кнопкой play. */
(function () {
  if (!window.matchMedia) return;
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll("video.js-hero-video, .hero-video").forEach((v) => {
    try {
      v.removeAttribute("autoplay");
      v.pause();
    } catch (e) {}
  });
})();
