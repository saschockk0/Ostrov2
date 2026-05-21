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
