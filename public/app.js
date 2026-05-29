// --- Yandex.Metrika goal helper ---
// Safe wrapper: ничего не делает, если счётчик не подключён или YM_COUNTER_ID не заменён
function ymGoal(name, params) {
  try {
    const id = window.__YM_ID__;
    if (!id || id === "YM_COUNTER_ID" || typeof window.ym !== "function") return;
    if (params) window.ym(id, "reachGoal", name, params);
    else window.ym(id, "reachGoal", name);
  } catch (_) {
    // не блокируем UX, если Метрика недоступна
  }
}

class RangeCalendar {
  constructor(container, summaryEl, onChange) {
    this.el = container;
    this.sumEl = summaryEl;
    this.onChange = onChange;
    this.today = new Date();
    this.today.setHours(0, 0, 0, 0);
    this.viewYear = this.today.getFullYear();
    this.viewMonth = this.today.getMonth();
    this.start = null;
    this.end = null;
    this.hover = null;
    this.render();
  }

  fmt(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  parse(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }

  isWe(d) { const w = d.getDay(); return w === 0 || w === 5 || w === 6; }

  render() {
    const { viewYear: yr, viewMonth: mo } = this;
    const first = new Date(yr, mo, 1);
    const last  = new Date(yr, mo + 1, 0);
    let off = first.getDay();
    off = off === 0 ? 6 : off - 1;

    const cells = [];
    for (let i = 0; i < off; i++) cells.push(null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(yr, mo, d));
    while (cells.length % 7) cells.push(null);

    const monthStr = new Date(yr, mo, 1).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    const WDS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const WD_WE = [false, false, false, false, true, true, true];
    const prevDis = yr < this.today.getFullYear() ||
      (yr === this.today.getFullYear() && mo <= this.today.getMonth());

    this.el.innerHTML = `
      <div class="rc-header">
        <button type="button" class="rc-nav" id="rcPrev" aria-label="Предыдущий месяц" ${prevDis ? "disabled" : ""}>‹</button>
        <span class="rc-month">${monthStr}</span>
        <button type="button" class="rc-nav" id="rcNext" aria-label="Следующий месяц">›</button>
      </div>
      <div class="rc-weekdays">
        ${WDS.map((w, i) => `<span class="rc-wd${WD_WE[i] ? " rc-wd--we" : ""}">${w}</span>`).join("")}
      </div>
      <div class="rc-grid" id="rcGrid">
        ${cells.map((d) => this._cell(d)).join("")}
      </div>
      <div class="rc-hint">
        <span class="rc-hint__dot--we"></span>
        <span>Пт – Вс: тариф выходного дня</span>
      </div>`;

    this._updateSummary();
    this.el.querySelector("#rcPrev").addEventListener("click", () => this._prevMo());
    this.el.querySelector("#rcNext").addEventListener("click", () => this._nextMo());

    const grid = this.el.querySelector("#rcGrid");
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest(".rc-day");
      if (!btn || btn.classList.contains("rc-day--past") || btn.classList.contains("rc-day--empty")) return;
      this._pick(this.parse(btn.dataset.date));
    });
    grid.addEventListener("mouseover", (e) => {
      const btn = e.target.closest(".rc-day");
      this.hover = (btn && !btn.classList.contains("rc-day--past") && !btn.classList.contains("rc-day--empty") && this.start && !this.end)
        ? this.parse(btn.dataset.date) : null;
      this._refresh();
    });
    grid.addEventListener("mouseleave", () => { this.hover = null; this._refresh(); });
  }

  _cell(d) {
    if (!d) return `<div class="rc-day rc-day--empty"></div>`;
    const iso  = this.fmt(d);
    const past = d < this.today;
    const tod  = d.getTime() === this.today.getTime();
    const we   = this.isWe(d);
    let cls = "rc-day";
    if (past) cls += " rc-day--past";
    else if (tod) cls += " rc-day--today";
    if (we && !past) cls += " rc-day--we";
    const rc = this._rangeClass(d);
    if (rc) cls += ` ${rc}`;
    return `<button type="button" class="${cls}" data-date="${iso}">${d.getDate()}</button>`;
  }

  _rangeClass(d) {
    const { start: s, end: e, hover: h } = this;
    if (!s) return "";
    const effEnd = e || h;
    if (!effEnd) return d.getTime() === s.getTime() ? "rc-day--start rc-day--end" : "";
    const [lo, hi] = s <= effEnd ? [s, effEnd] : [effEnd, s];
    const isS = d.getTime() === lo.getTime();
    const isE = d.getTime() === hi.getTime();
    const inR = d > lo && d < hi;
    if (isS && isE) return "rc-day--start rc-day--end";
    if (isS) return "rc-day--start";
    if (isE) return "rc-day--end";
    if (inR) return "rc-day--range";
    return "";
  }

  _pick(date) {
    if (date < this.today) return;
    if (!this.start || this.end) {
      this.start = date; this.end = null; this.hover = null;
    } else if (date.getTime() === this.start.getTime()) {
      this.start = null;
    } else {
      const [s, e] = date < this.start ? [date, this.start] : [this.start, date];
      this.start = s; this.end = e;
      this.onChange(this.fmt(s), this.fmt(e));
    }
    this._refresh(); this._updateSummary();
  }

  _refresh() {
    const grid = this.el.querySelector("#rcGrid");
    if (!grid) return;
    grid.querySelectorAll(".rc-day:not(.rc-day--empty)").forEach((btn) => {
      const d = this.parse(btn.dataset.date);
      btn.classList.remove("rc-day--start", "rc-day--end", "rc-day--range");
      const rc = this._rangeClass(d);
      if (rc) rc.split(" ").forEach((c) => btn.classList.add(c));
    });
  }

  _updateSummary() {
    if (!this.sumEl) return;
    const { start: s, end: e } = this;
    if (s && e) {
      const nights = Math.round((e - s) / 86400000);
      const pl = (n) => n % 10 === 1 && n % 100 !== 11 ? "ночь"
        : [2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100) ? "ночи" : "ночей";
      const fd = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      this.sumEl.innerHTML = `
        <span>${fd(s)} — ${fd(e)}, <strong>${nights} ${pl(nights)}</strong></span>
        <button type="button" class="rc-reset" id="rcReset" aria-label="Сбросить">×</button>`;
      this.sumEl.classList.remove("hidden");
      this.sumEl.querySelector("#rcReset").addEventListener("click", () => this.reset());
    } else if (s) {
      const fd = (d) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      this.sumEl.innerHTML = `<span>Заезд: <strong>${fd(s)}</strong> — выберите дату выезда</span>`;
      this.sumEl.classList.remove("hidden");
    } else {
      this.sumEl.classList.add("hidden");
    }
  }

  reset() {
    this.start = null; this.end = null; this.hover = null;
    this.onChange(null, null);
    this._refresh(); this._updateSummary();
  }

  _prevMo() {
    if (this.viewMonth === 0) { this.viewYear--; this.viewMonth = 11; } else this.viewMonth--;
    const n = new Date();
    if (this.viewYear < n.getFullYear() || (this.viewYear === n.getFullYear() && this.viewMonth < n.getMonth())) {
      this.viewYear = n.getFullYear(); this.viewMonth = n.getMonth();
    }
    this.render();
  }

  _nextMo() {
    if (this.viewMonth === 11) { this.viewYear++; this.viewMonth = 0; } else this.viewMonth++;
    this.render();
  }
}

const modal = document.getElementById("wizardModal");
const steps = Array.from(document.querySelectorAll(".step"));
const progressBar = document.getElementById("progressBar");
const stepLabel = document.getElementById("stepLabel");
const form = document.getElementById("applicationForm");
const reviewBlock = document.getElementById("reviewBlock");
const formMessage = document.getElementById("formMessage");
const nextBtn = document.getElementById("nextStep");
const prevBtn = document.getElementById("prevStep");
const submitBtn = document.getElementById("submitApp");
const quickCalcForm = document.getElementById("quickCalc");
const quickCalcResult = document.getElementById("quickCalcResult");
const canopyBlock = document.getElementById("canopyBlock");
const turnstileContainer = document.getElementById("turnstileContainer");
const wizardSuccess = document.getElementById("wizardSuccess");
const successMessage = document.getElementById("successMessage");
const liveQuoteBar = document.getElementById("liveQuoteBar");
const liveQuoteTotal = document.getElementById("liveQuoteTotal");

const TOTAL_STEPS = steps.length;
let currentStep = 1;
let stepDirection = 1;
let turnstileSiteKey = "";
let turnstileToken = "";
let turnstileWidgetId = null;
let turnstileScriptLoaded = false;
let campingSuggested = false;

function suggestCamping() {
  if (campingSuggested) return;
  campingSuggested = true;

  const guests = Number(form.elements.adults.value || 2) + Number(form.elements.children.value || 0);
  if (guests < 1) return;

  // Fill tents: prefer 2-person pairs, use 1-person for odd remainder
  const setVal = (name, val) => {
    const input = form.elements[name];
    if (input) { input.value = val; input.dispatchEvent(new Event("change", { bubbles: true })); }
  };
  setVal("tent2", Math.floor(guests / 2));
  setVal("tent1", guests % 2);
  setVal("sleepingSet", guests);

  const hint = document.getElementById("campingHint");
  if (hint) hint.textContent = `Подобрано для ${guests} чел. — можно изменить`;
}

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}


function showStep(stepNum) {
  const prevStep = currentStep;
  stepDirection = stepNum >= prevStep ? 1 : -1;
  currentStep = stepNum;

  // Цель — только при движении вперёд, чтобы не считать «листание назад»
  if (stepNum > prevStep && stepNum >= 2 && stepNum <= TOTAL_STEPS) {
    ymGoal(`wizard_step_${stepNum}`);
  }

  steps.forEach((step) => {
    const num = Number(step.dataset.step);
    const isActive = num === stepNum;
    step.classList.toggle("hidden", !isActive);
    if (isActive) {
      step.classList.remove("step--slide-left", "step--slide-right");
      step.classList.add(stepDirection >= 0 ? "step--slide-right" : "step--slide-left");
      // Force reflow then remove to trigger animation
      void step.offsetWidth;
      step.classList.remove("step--slide-left", "step--slide-right");
    }
  });

  const progress = (stepNum / TOTAL_STEPS) * 100;
  progressBar.style.width = `${progress}%`;
  stepLabel.textContent = `Шаг ${stepNum} из ${TOTAL_STEPS}`;

  if (stepNum === 5) renderTurnstile();

  prevBtn.classList.toggle("hidden", stepNum === 1);
  nextBtn.classList.toggle("hidden", stepNum === TOTAL_STEPS);
  submitBtn.classList.toggle("hidden", stepNum !== TOTAL_STEPS);

  if (stepNum === 3) suggestCamping();

  // Show live quote bar from step 3 onwards (dates + guests available)
  if (stepNum >= 3) {
    refreshLiveQuote();
  } else {
    liveQuoteBar.classList.add("hidden");
  }
}

async function refreshLiveQuote() {
  const answers = getAnswersFromForm(form);
  if (!answers.arrivalDate || !answers.departureDate) return;
  try {
    const quote = await getQuote(answers);
    liveQuoteTotal.textContent = money(quote.total);
    liveQuoteBar.classList.remove("hidden");
  } catch {
    liveQuoteBar.classList.add("hidden");
  }
}

function showSuccess(applicationId) {
  form.classList.add("hidden");
  wizardSuccess.classList.remove("hidden");
  successMessage.textContent = `Заявка #${applicationId} принята. Мы свяжемся с вами в ближайшее время.`;
  progressBar.style.width = "100%";
  stepLabel.textContent = "Готово";
  prevBtn.classList.add("hidden");
  nextBtn.classList.add("hidden");
  submitBtn.classList.add("hidden");
  liveQuoteBar.classList.add("hidden");
}

function openWizard() {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  form.classList.remove("hidden");
  wizardSuccess.classList.add("hidden");
  formMessage.textContent = "";
  wizardCal.reset();
  campingSuggested = false;
  showStep(1);
  document.body.style.overflow = "hidden";
  ymGoal("wizard_open");
}

function closeWizard() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

async function getQuote(payload) {
  const response = await fetch("/api/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Ошибка расчета");
  }
  return response.json();
}

function getAnswersFromForm(sourceForm) {
  const fd = new FormData(sourceForm);
  return {
    adults: fd.get("adults"),
    children: fd.get("children"),
    arrivalDate: fd.get("arrivalDate"),
    departureDate: fd.get("departureDate"),
    perDay: {
      instructor: 0,
      tent1: fd.get("tent1"),
      tent2: fd.get("tent2"),
      tent3: fd.get("tent3"),
      sleepingSet: fd.get("sleepingSet"),
      canopyEverest: fd.get("canopyType") === "canopyEverest" && fd.get("needCanopy") ? 1 : 0,
      canopyLarge: fd.get("canopyType") === "canopyLarge" && fd.get("needCanopy") ? 1 : 0,
      canopyMedium: fd.get("canopyType") === "canopyMedium" && fd.get("needCanopy") ? 1 : 0,
      canopySmall: fd.get("canopyType") === "canopySmall" && fd.get("needCanopy") ? 1 : 0,
      tableSet: fd.get("tableSet"),
      stove: fd.get("stove"),
      gasCanister: fd.get("gasCanister"),
      transfer: fd.get("transfer"),
    },
    fixed: {
      regattaCrew: fd.get("regattaCrew"),
      supHour: fd.get("supHour"),
      kayakHour: fd.get("kayakHour"),
    },
    storeTripPeople: fd.get("storeTripPeople"),
  };
}

function validatePhone(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10;
}

function validateStep() {
  formMessage.textContent = "";

  if (currentStep === 1) {
    const adults = Number(form.elements.adults.value || 0);
    const children = Number(form.elements.children.value || 0);
    if (adults + children < 1) {
      formMessage.textContent = "Укажите хотя бы одного гостя.";
      return false;
    }
  }

  if (currentStep === 2) {
    const arrival = form.elements.arrivalDate.value;
    const departure = form.elements.departureDate.value;
    if (!arrival || !departure) {
      formMessage.textContent = "Выберите даты заезда и выезда на календаре.";
      return false;
    }
    if (new Date(departure) <= new Date(arrival)) {
      formMessage.textContent = "Дата выезда должна быть позже даты заезда.";
      return false;
    }
  }

  if (currentStep === 5) {
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    if (!name) {
      formMessage.textContent = "Введите имя.";
      return false;
    }
    if (!phone || !validatePhone(phone)) {
      formMessage.textContent = "Введите корректный номер телефона (не менее 10 цифр).";
      return false;
    }
  }

  if (currentStep === 6) {
    if (!form.elements.privacyConsent.checked) {
      formMessage.textContent = "Необходимо согласие с политикой обработки данных.";
      return false;
    }
  }

  return true;
}

async function updateReview() {
  const answers = getAnswersFromForm(form);
  const quote = await getQuote(answers);
  const lines = quote.breakdown
    .map((row) => `<li>${row.label}: <strong>${money(row.amount)}</strong></li>`)
    .join("");
  reviewBlock.innerHTML = `
    <p>Ночей: <strong>${quote.nights}</strong>, гостей: <strong>${quote.guests}</strong></p>
    <ul>${lines}</ul>
    <p><strong>Итого: ${money(quote.total)}</strong></p>
    <small>${quote.disclaimer}</small>
  `;
  return quote;
}

// Wrap every number input inside a container with custom +/− stepper
function initSteppers(container) {
  container.querySelectorAll('input[type="number"]').forEach((input) => {
    const wrapper = document.createElement("div");
    wrapper.className = "stepper";
    input.parentNode.insertBefore(wrapper, input);

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "stepper__btn";
    minusBtn.setAttribute("aria-label", "Уменьшить");
    minusBtn.textContent = "−";

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "stepper__btn";
    plusBtn.setAttribute("aria-label", "Увеличить");
    plusBtn.textContent = "+";

    wrapper.appendChild(minusBtn);
    wrapper.appendChild(input);
    wrapper.appendChild(plusBtn);

    const getMin = () => (input.min !== "" ? Number(input.min) : 0);
    const getMax = () => (input.max !== "" ? Number(input.max) : Infinity);

    minusBtn.addEventListener("click", () => {
      const next = (Number(input.value) || 0) - 1;
      if (next >= getMin()) {
        input.value = next;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    plusBtn.addEventListener("click", () => {
      const next = (Number(input.value) || 0) + 1;
      if (next <= getMax()) {
        input.value = next;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  });
}

initSteppers(form);
initSteppers(quickCalcForm);

// Init wizard calendar (step 2)
const wizardCal = new RangeCalendar(
  document.getElementById("wizardCal"),
  document.getElementById("wizardCalSummary"),
  (arrival, departure) => {
    form.elements.arrivalDate.value = arrival || "";
    form.elements.departureDate.value = departure || "";
  }
);

// Init quick-calculator calendar
const quickCalcSubmit = quickCalcForm.querySelector(".calc-v2__submit");
const quickCalCal = new RangeCalendar(
  document.getElementById("quickCalCal"),
  document.getElementById("quickCalCalSummary"),
  (arrival, departure) => {
    document.getElementById("qcArrival").value = arrival || "";
    document.getElementById("qcDeparture").value = departure || "";
    const ready = arrival && departure;
    quickCalcSubmit.disabled = !ready;
    quickCalcSubmit.textContent = ready ? "Рассчитать →" : "Выберите даты →";
  }
);

// Open wizard
document.querySelectorAll(".js-open-wizard").forEach((btn) => btn.addEventListener("click", openWizard));

// Close buttons
document.getElementById("closeWizard").addEventListener("click", closeWizard);
document.getElementById("closeWizardSuccess").addEventListener("click", closeWizard);

// Close on overlay click
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeWizard();
});

// Close on ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeWizard();
});

prevBtn.addEventListener("click", () => {
  if (currentStep > 1) showStep(currentStep - 1);
});

nextBtn.addEventListener("click", async () => {
  if (!validateStep()) return;

  // Step 3: toggle camping block on own-gear checkbox
  if (currentStep === 3) {
    const needCanopy = form.elements.needCanopy.checked;
    canopyBlock.classList.toggle("hidden", !needCanopy);
  }

  // Step 5 (contacts): build review on next step
  if (currentStep === 5) {
    try {
      await updateReview();
    } catch (error) {
      formMessage.textContent = error.message;
      return;
    }
  }

  if (currentStep < TOTAL_STEPS) showStep(currentStep + 1);
});

// Toggle canopy block when checkbox changes (on step 3)
form.elements.needCanopy.addEventListener("change", () => {
  canopyBlock.classList.toggle("hidden", !form.elements.needCanopy.checked);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStep()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = "Отправляем…";

  try {
    const answers = getAnswersFromForm(form);
    const payload = {
      website: form.elements.website.value,
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      messenger: form.elements.messenger.value.trim(),
      email: form.elements.email.value.trim(),
      comment: form.elements.comment.value.trim(),
      turnstileToken,
      answers,
    };

    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось отправить заявку.");

    form.reset();
    showSuccess(data.applicationId);
    ymGoal("wizard_submit", { applicationId: data.applicationId });
  } catch (error) {
    formMessage.textContent = error.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Отправить заявку";
  }
});

quickCalcForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const arrivalDate = document.getElementById("qcArrival").value;
  const departureDate = document.getElementById("qcDeparture").value;
  if (!arrivalDate || !departureDate) {
    quickCalcResult.classList.remove("hidden");
    quickCalcResult.textContent = "Выберите даты заезда и выезда на календаре справа.";
    return;
  }
  try {
    const quote = await getQuote({
      adults: quickCalcForm.elements.adults.value,
      children: quickCalcForm.elements.children.value,
      arrivalDate,
      departureDate,
      perDay: {},
      fixed: {},
      storeTripPeople: 0,
    });
    quickCalcResult.classList.remove("hidden");
    quickCalcResult.innerHTML = `
      <p>Ночей: <strong>${quote.nights}</strong></p>
      <p>Предварительная стоимость: <strong>${money(quote.total)}</strong></p>
      <small>${quote.disclaimer}</small>
    `;
    document.getElementById("calcLead").classList.remove("hidden");
  } catch (error) {
    quickCalcResult.classList.remove("hidden");
    quickCalcResult.textContent = error.message;
  }
});

// Events: dynamic loading from API
const KIND_LABELS = { regatta: 'Регата', school: 'Школа', promo: 'Акция', corp: 'Корп.', season: 'Сезон' };
const KIND_TAG_CLASS = { regatta: 'event-tag--regatta', school: 'event-tag--school', promo: 'event-tag--promo', corp: 'event-tag--corp', season: 'event-tag--season' };
const MONTHS_SHORT = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DOWS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

let loadedEvents = [];

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderEventItem(ev) {
  const kind = ev.kind || 'season';
  const tagLabel = KIND_LABELS[kind] || 'Сезон';
  const tagClass = KIND_TAG_CLASS[kind] || 'event-tag--season';
  let dateNum = '—', dateMeta = '';
  if (ev.date) {
    const d = new Date(ev.date + 'T00:00:00');
    dateNum = String(d.getDate()).padStart(2, '0');
    dateMeta = MONTHS_SHORT[d.getMonth()] + ' · ' + DOWS_SHORT[d.getDay()];
  }
  return `<div class="event-item" data-kind="${escHtml(kind)}">
    <div>
      <div class="event-item__date-num">${dateNum}</div>
      <div class="event-item__date-meta">${escHtml(dateMeta)}</div>
    </div>
    <div>
      <div class="event-item__tags">
        <span class="event-tag ${tagClass}">${escHtml(tagLabel)}</span>
        ${ev.spots ? `<span class="event-item__spots">${escHtml(ev.spots)}</span>` : ''}
      </div>
      <div class="event-item__name">${escHtml(ev.title)}</div>
      ${ev.description ? `<div class="event-item__sub">${escHtml(ev.description)}</div>` : ''}
    </div>
    <span class="event-item__arrow">→</span>
  </div>`;
}

function renderFeaturedEvent(ev) {
  const d = ev.date ? new Date(ev.date + 'T00:00:00') : null;
  const dayStr = d ? String(d.getDate()) : '—';
  const monthStr = d ? MONTHS_FULL[d.getMonth()] : '';
  const dowStr = d ? DOWS_SHORT[d.getDay()].toLowerCase() + (DOWS_SHORT[d.getDay()] === 'Сб' || DOWS_SHORT[d.getDay()] === 'Вс' ? '' : '') : '';
  const dowFull = d ? ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'][d.getDay()] : '';
  const kindLabel = KIND_LABELS[ev.kind] || 'Событие';
  return `<article class="event-featured">
    <div class="event-featured__visual">
      <span class="event-featured__badge">Ближайшее событие</span>
      <div class="event-featured__date-block">
        <span class="event-featured__day">${dayStr}</span>
        <div>
          <div class="event-featured__month-name">${escHtml(monthStr)}</div>
          <div class="event-featured__dow">${escHtml(dowFull)}</div>
        </div>
      </div>
      ${ev.spots ? `<span class="event-featured__crew">${escHtml(ev.spots)}</span>` : ''}
    </div>
    <div class="event-featured__body">
      <div class="event-featured__kind">${escHtml(kindLabel)}${ev.description ? ' · ' + escHtml(ev.description) : ''}</div>
      <h3 class="event-featured__title">${escHtml(ev.title)}</h3>
      <div class="event-featured__footer">
        <div class="event-featured__actions">
          <button class="btn btn-primary js-open-wizard">Оставить заявку →</button>
        </div>
      </div>
    </div>
  </article>`;
}

function applyEventsFilter(filter) {
  document.querySelectorAll('#eventsList .event-item').forEach(item => {
    const kind = item.dataset.kind;
    const show = filter === 'all'
      || (filter === 'regatta' && (kind === 'regatta' || kind === 'corp'))
      || (filter === 'school' && kind === 'school')
      || (filter === 'promo' && kind === 'promo');
    item.style.display = show ? '' : 'none';
  });
}

function renderEventsSection(events) {
  loadedEvents = events;
  const listEl = document.getElementById('eventsList');
  const countEl = document.getElementById('eventsCount');
  const featuredSlot = document.getElementById('eventFeaturedSlot');
  if (!listEl) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = events.filter(e => !e.date || new Date(e.date + 'T00:00:00') >= today);
  const nearest = upcoming[0];

  if (nearest && featuredSlot) {
    featuredSlot.innerHTML = renderFeaturedEvent(nearest);
    featuredSlot.querySelector('.js-open-wizard')?.addEventListener('click', () => {
      document.querySelector('.js-open-wizard')?.click();
    });
  } else if (featuredSlot) {
    featuredSlot.innerHTML = '';
  }

  if (countEl) countEl.textContent = events.length + ' ' + (events.length === 1 ? 'событие' : events.length < 5 ? 'события' : 'событий');
  listEl.innerHTML = events.length
    ? events.map(renderEventItem).join('')
    : '<div style="padding:24px;text-align:center;color:#6b7280">Мероприятий пока нет</div>';

  const activeTab = document.querySelector('.filter-tab.is-active');
  if (activeTab) applyEventsFilter(activeTab.dataset.filter);
}

fetch('/api/events')
  .then(r => r.json())
  .then(events => renderEventsSection(Array.isArray(events) ? events : []))
  .catch(() => renderEventsSection([]));

// Events filter tabs
const filterTabs = document.querySelectorAll(".filter-tab");
filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    applyEventsFilter(tab.dataset.filter);
  });
});

function renderTurnstile() {
  if (!turnstileSiteKey) return;
  if (turnstileWidgetId != null && window.turnstile) {
    window.turnstile.reset(turnstileWidgetId);
    return;
  }
  if (!turnstileScriptLoaded) {
    turnstileScriptLoaded = true;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => mountTurnstile();
    document.head.appendChild(script);
  } else if (window.turnstile) {
    mountTurnstile();
  }
}

function mountTurnstile() {
  if (!window.turnstile || turnstileWidgetId != null) return;
  turnstileWidgetId = window.turnstile.render("#turnstileContainer", {
    sitekey: turnstileSiteKey,
    callback: (token) => { turnstileToken = token; },
    "expired-callback": () => { turnstileToken = ""; },
    "error-callback": () => { turnstileToken = ""; },
  });
}

fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    turnstileSiteKey = cfg.turnstileSiteKey || "";
    if (!turnstileSiteKey) {
      turnstileContainer.textContent =
        "Turnstile можно включить через TURNSTILE_SITE_KEY и TURNSTILE_SECRET_KEY.";
    }
  })
  .catch(() => {
    turnstileContainer.textContent = "Не удалось загрузить конфигурацию безопасности.";
  });

// --- Lead form after quick calculator ---
const calcLeadForm = document.getElementById("calcLeadForm");
const calcLeadMsg  = document.getElementById("calcLeadMsg");

calcLeadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name  = calcLeadForm.elements.name.value.trim();
  const phone = calcLeadForm.elements.phone.value.trim();
  if (!name || !validatePhone(phone)) {
    calcLeadMsg.textContent = "Введите имя и корректный телефон (не менее 10 цифр).";
    return;
  }
  const btn = calcLeadForm.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Отправляем…";
  try {
    const response = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        phone,
        answers: {
          adults: quickCalcForm.elements.adults.value,
          children: quickCalcForm.elements.children.value,
          arrivalDate: document.getElementById("qcArrival").value,
          departureDate: document.getElementById("qcDeparture").value,
          perDay: {},
          fixed: {},
          storeTripPeople: 0,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка отправки.");
    calcLeadForm.classList.add("hidden");
    calcLeadMsg.style.color = "var(--brand-leaf-700)";
    calcLeadMsg.textContent = `Заявка #${data.applicationId} принята. Перезвоним в ближайшее время!`;
    ymGoal("calc_lead_submit", { applicationId: data.applicationId });
  } catch (err) {
    calcLeadMsg.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Получить консультацию";
  }
});

// --- Click tracking: phone / WhatsApp / map ---
// Делегированный обработчик — работает и для динамически добавленных ссылок (sticky CTA и т.п.)
document.addEventListener("click", (e) => {
  const link = e.target.closest("a[href]");
  if (!link) return;
  const href = link.getAttribute("href") || "";

  if (href.startsWith("tel:")) {
    ymGoal("phone_click");
  } else if (/wa\.me|api\.whatsapp\.com/.test(href)) {
    ymGoal("whatsapp_click");
  } else if (/yandex\.ru\/maps/.test(href)) {
    ymGoal("map_click");
  }
});

// --- Mobile navigation ---
(function initMobileNav() {
  const burger = document.getElementById("navBurger");
  const nav = document.getElementById("mainNav");
  const backdrop = document.getElementById("navBackdrop");
  if (!burger || !nav) return;

  const open = () => {
    nav.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    burger.setAttribute("aria-label", "Закрыть меню");
    if (backdrop) backdrop.classList.add("is-visible");
    document.body.style.overflow = "hidden";
  };

  const close = () => {
    nav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Открыть меню");
    if (backdrop) backdrop.classList.remove("is-visible");
    document.body.style.overflow = "";
  };

  burger.addEventListener("click", () => {
    nav.classList.contains("is-open") ? close() : open();
  });

  if (backdrop) backdrop.addEventListener("click", close);

  nav.querySelectorAll("a[href^='#']").forEach((link) => {
    link.addEventListener("click", close);
  });

  document.querySelectorAll(".js-open-wizard").forEach((btn) => {
    btn.addEventListener("click", close);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
})();

// --- Show-all events button ---
document.querySelectorAll(".js-show-all-events").forEach((btn) => {
  btn.addEventListener("click", () => {
    const allTab = document.querySelector('.filter-tab[data-filter="all"]');
    if (allTab) allTab.click();
  });
});

// --- Dynamic season timeline ---
(function updateTimeline() {
  const SEASON_START = new Date(new Date().getFullYear(), 4, 1);  // 1 мая
  const SEASON_END   = new Date(new Date().getFullYear(), 8, 28); // 28 сентября
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (today < SEASON_START || today > SEASON_END) return;

  const total = SEASON_END - SEASON_START;
  const elapsed = today - SEASON_START;
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100)).toFixed(1);

  const bar = document.querySelector(".timeline-track__progress");
  const nowEl = document.querySelector(".timeline-track__now");
  if (bar) bar.style.width = pct + "%";
  if (nowEl) nowEl.style.left = pct + "%";

  // Обновляем точки месяцев: прошедшие = is-past
  const MONTH_INDICES = [4, 5, 6, 7, 8]; // май–сентябрь (0-indexed)
  document.querySelectorAll(".timeline-month__dot").forEach((dot, i) => {
    const monthEnd = new Date(today.getFullYear(), MONTH_INDICES[i] + 1, 0);
    dot.classList.toggle("is-past", today > monthEnd);
  });
})();


// --- Gallery photos + Lightbox ---
(function initGallery() {
  const section = document.getElementById('gallery');
  const grid = document.getElementById('galleryGrid');
  if (!section || !grid) return;

  const lb       = document.getElementById('lightbox');
  const lbImg    = document.getElementById('lightboxImg');
  const lbCaption = document.getElementById('lightboxCaption');
  const lbClose  = document.getElementById('lightboxClose');
  const lbPrev   = document.getElementById('lightboxPrev');
  const lbNext   = document.getElementById('lightboxNext');

  let photos = [];
  let current = 0;

  function openLightbox(idx) {
    current = (idx + photos.length) % photos.length;
    lbImg.src = photos[current].url;
    lbImg.alt = photos[current].caption || 'Фото';
    if (lbCaption) lbCaption.textContent = photos[current].caption || '';
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (lbClose) lbClose.addEventListener('click', closeLightbox);
  if (lbPrev)  lbPrev.addEventListener('click', () => openLightbox(current - 1));
  if (lbNext)  lbNext.addEventListener('click', () => openLightbox(current + 1));
  if (lb) lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });

  document.addEventListener('keydown', e => {
    if (!lb || !lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')      closeLightbox();
    if (e.key === 'ArrowLeft')   openLightbox(current - 1);
    if (e.key === 'ArrowRight')  openLightbox(current + 1);
  });

  fetch('/api/gallery')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      photos = data;
      if (!photos.length) { section.hidden = true; return; }
      photos.forEach((photo, idx) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        const img = document.createElement('img');
        img.src = photo.url;
        img.alt = photo.caption || 'Фото с острова';
        img.loading = 'lazy';
        img.decoding = 'async';
        item.appendChild(img);
        if (photo.caption) {
          const cap = document.createElement('span');
          cap.className = 'gallery-item__caption';
          cap.textContent = photo.caption;
          item.appendChild(cap);
        }
        item.addEventListener('click', () => openLightbox(idx));
        grid.appendChild(item);
      });
    })
    .catch(() => { section.hidden = true; });
})();

// --- Yandex review photos ---
(function loadReviewPhotos() {
  const container = document.getElementById("reviewPhotos");
  const grid = document.getElementById("reviewPhotosGrid");
  if (!container || !grid) return;

  const YANDEX_REVIEWS_URL =
    "https://yandex.ru/maps/org/parusny_klub_ostrov/107818186926/reviews/";

  fetch("/api/reviews")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then(({ reviews }) => {
      const photos = [];
      for (const review of reviews) {
        for (const url of review.photos || []) {
          photos.push({ url, author: review.author });
          if (photos.length >= 6) break;
        }
        if (photos.length >= 6) break;
      }
      if (!photos.length) return;

      photos.forEach(({ url, author }) => {
        const a = document.createElement("a");
        a.href = YANDEX_REVIEWS_URL;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "review-photo-item";

        const img = document.createElement("img");
        img.src = url;
        img.alt = `Фото от ${author}`;
        img.loading = "lazy";
        img.decoding = "async";

        const caption = document.createElement("span");
        caption.className = "review-photo-item__author";
        caption.textContent = author;

        a.appendChild(img);
        a.appendChild(caption);
        grid.appendChild(a);
      });

      container.hidden = false;
    })
    .catch(() => {
      // API не настроен — фото-сетка скрыта
    });
})();
