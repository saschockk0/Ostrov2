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
      // Начали новый выбор — старый диапазон больше не действует
      this.onChange(null, null);
    } else if (date.getTime() === this.start.getTime()) {
      this.start = null;
      this.onChange(null, null);
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

  // Программно задать диапазон (перенос дат из калькулятора в опросник).
  setRange(startIso, endIso) {
    if (!startIso || !endIso) return;
    this.start = this.parse(startIso);
    this.end = this.parse(endIso);
    this.hover = null;
    this.viewYear = this.start.getFullYear();
    this.viewMonth = this.start.getMonth();
    this.onChange(this.fmt(this.start), this.fmt(this.end));
    this.render(); // render() сам зовёт _updateSummary()
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
const skipExtrasBtn = document.getElementById("skipExtras");
const quickCalcForm = document.getElementById("quickCalc");
const quickCalcResult = document.getElementById("quickCalcResult");
const canopyBlock = document.getElementById("canopyBlock");
const turnstileContainer = document.getElementById("turnstileContainer");
const wizardSuccess = document.getElementById("wizardSuccess");
const successMessage = document.getElementById("successMessage");
const prepayBlock = document.getElementById("prepayBlock");
const prepayBtn = document.getElementById("prepayBtn");
const prepayHint = document.getElementById("prepayHint");
const liveQuoteBar = document.getElementById("liveQuoteBar");
const liveQuoteTotal = document.getElementById("liveQuoteTotal");

// Настройки предоплаты по СБП (приходят из /api/config)
let prepayEnabled = false;
let prepayPercent = 30;

const TOTAL_STEPS = steps.length;
let currentStep = 1;
let stepDirection = 1;
let turnstileSiteKey = "";
let turnstileToken = "";
let turnstileWidgetId = null;
let turnstileScriptLoaded = false;
let calcLeadTurnstileToken = "";
let calcLeadTurnstileWidgetId = null;

// Opt-in tent suggestion: triggered only by the «Подобрать палатки» button,
// never silently, so the live price never jumps without a user action.
function suggestCamping() {
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
  refreshLiveQuote();
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

  // Turnstile + price review live on the final (contacts) step
  if (stepNum === TOTAL_STEPS) {
    renderTurnstile();
    updateReview();
    // Автофокус на «Имя» — экономит тап и подталкивает заполнить контакты.
    // Задержка даёт доиграть слайд-анимации; preventScroll — без рывка.
    const nameInput = form.elements.name;
    if (nameInput && typeof nameInput.focus === "function") {
      setTimeout(() => { try { nameInput.focus({ preventScroll: true }); } catch (e) {} }, 140);
    }
  }

  prevBtn.classList.toggle("hidden", stepNum === 1);
  nextBtn.classList.toggle("hidden", stepNum === TOTAL_STEPS);
  submitBtn.classList.toggle("hidden", stepNum !== TOTAL_STEPS);
  skipExtrasBtn.classList.toggle("hidden", stepNum !== 2);

  // Live quote bar shows whenever dates are picked (refresh self-hides if not)
  refreshLiveQuote();
}

async function refreshLiveQuote() {
  const answers = getAnswersFromForm(form);
  if (!answers.arrivalDate || !answers.departureDate) {
    liveQuoteBar.classList.add("hidden");
    return;
  }
  try {
    const quote = await getQuote(answers);
    liveQuoteTotal.textContent = money(quote.total);
    liveQuoteBar.classList.remove("hidden");
  } catch {
    liveQuoteBar.classList.add("hidden");
  }
}

let successPrepay = { appId: null, amount: 0 };

function showSuccess(applicationId, quote) {
  form.classList.add("hidden");
  wizardSuccess.classList.remove("hidden");
  successMessage.textContent = `Заявка #${applicationId} принята. Мы свяжемся с вами в ближайшее время.`;
  progressBar.style.width = "100%";
  stepLabel.textContent = "Готово";
  prevBtn.classList.add("hidden");
  nextBtn.classList.add("hidden");
  submitBtn.classList.add("hidden");
  liveQuoteBar.classList.add("hidden");

  // Предлагаем предоплату по СБП, если она включена и есть рассчитанная сумма.
  const total = quote && quote.isValid ? Number(quote.total) || 0 : 0;
  const amount = Math.round((total * prepayPercent) / 100);
  if (prepayBlock) {
    if (prepayEnabled && amount > 0) {
      successPrepay = { appId: applicationId, amount };
      prepayHint.textContent = `Закрепите бронь предоплатой ${prepayPercent}% — ${amount.toLocaleString("ru-RU")} ₽ по СБП. Остаток оплатите на месте.`;
      prepayBtn.disabled = false;
      prepayBtn.textContent = "Внести предоплату по СБП";
      prepayBlock.classList.remove("hidden");
    } else {
      prepayBlock.classList.add("hidden");
    }
  }
}

if (prepayBtn) {
  prepayBtn.addEventListener("click", async () => {
    if (!successPrepay.appId) return;
    prepayBtn.disabled = true;
    prepayBtn.textContent = "Готовим оплату…";
    try {
      const response = await fetch(`/api/applications/${successPrepay.appId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || !data.confirmationUrl) {
        throw new Error(data.error || "Не удалось создать платёж.");
      }
      ymGoal("prepay_start", { applicationId: successPrepay.appId, amount: successPrepay.amount });
      window.location.href = data.confirmationUrl;
    } catch (error) {
      prepayHint.textContent = error.message;
      prepayBtn.disabled = false;
      prepayBtn.textContent = "Внести предоплату по СБП";
    }
  });
}

function openWizard() {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  form.classList.remove("hidden");
  wizardSuccess.classList.add("hidden");
  formMessage.textContent = "";
  clearFieldErrors();
  wizardCal.reset();
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

// Свободные места на выбранные даты (тихо возвращает null при ошибке — это лишь подсказка).
async function getAvailability(from, to) {
  try {
    const r = await fetch(`/api/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function pluralRu(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// «Осталось N свободных мест» по местам в лагере на выбранные даты (или '' если нет данных).
function spotsLineHtml(avail) {
  if (!avail || !Number.isFinite(avail.campFree)) return "";
  const n = Math.max(0, avail.campFree);
  const word = pluralRu(n, "свободное место", "свободных места", "свободных мест");
  const low = n <= 5 ? " calc-spots--low" : "";
  return `<p class="calc-spots${low}">Осталось <strong>${n}</strong> ${word} на эти даты</p>`;
}

function getAnswersFromForm(sourceForm) {
  const fd = new FormData(sourceForm);
  return {
    adults: fd.get("adults"),
    children: fd.get("children"),
    arrivalDate: fd.get("arrivalDate"),
    departureDate: fd.get("departureDate"),
    arrivalTime: fd.get("arrivalTime") || "",
    departureTime: fd.get("departureTime") || "",
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

function setFieldError(input, msg) {
  if (input) input.classList.add("is-error");
  formMessage.textContent = msg;
  if (input && typeof input.focus === "function") input.focus();
}

function clearFieldErrors() {
  form.querySelectorAll(".is-error").forEach((el) => el.classList.remove("is-error"));
}

function validateStep() {
  formMessage.textContent = "";
  clearFieldErrors();

  // Step 1: guests + dates
  if (currentStep === 1) {
    const adults = Number(form.elements.adults.value || 0);
    const children = Number(form.elements.children.value || 0);
    if (adults + children < 1) {
      setFieldError(form.elements.adults, "Укажите хотя бы одного гостя.");
      return false;
    }
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

  // Step 2 (equipment/services) is optional — no validation

  // Final step: contacts + consent
  if (currentStep === TOTAL_STEPS) {
    const name = form.elements.name.value.trim();
    const phone = form.elements.phone.value.trim();
    if (!name) {
      setFieldError(form.elements.name, "Введите имя.");
      return false;
    }
    if (!phone || !validatePhone(phone)) {
      setFieldError(form.elements.phone, "Введите корректный номер телефона (не менее 10 цифр).");
      return false;
    }
    if (!form.elements.privacyConsent.checked) {
      formMessage.textContent = "Необходимо согласие с политикой обработки данных.";
      return false;
    }
  }

  return true;
}

async function updateReview() {
  const answers = getAnswersFromForm(form);
  if (!answers.arrivalDate || !answers.departureDate) {
    reviewBlock.innerHTML = `<p>Даты не выбраны — менеджер рассчитает стоимость и свяжется с вами.</p>`;
    return null;
  }
  try {
    const quote = await getQuote(answers);
    const avail = await getAvailability(answers.arrivalDate, answers.departureDate);
    const lines = quote.breakdown
      .map((row) => `<li>${row.label}: <strong>${money(row.amount)}</strong></li>`)
      .join("");
    reviewBlock.innerHTML = `
      <p>Суток: <strong>${quote.days || quote.nights}</strong>, гостей: <strong>${quote.guests}</strong></p>
      ${spotsLineHtml(avail)}
      <ul>${lines}</ul>
      <p><strong>Итого: ${money(quote.total)}</strong></p>
      <small>${quote.disclaimer}</small>
    `;
    return quote;
  } catch {
    reviewBlock.innerHTML = `<p>Стоимость уточнит менеджер.</p>`;
    return null;
  }
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

// ── Time selects: часы 00:00–23:00 для времени приезда/отъезда ────
function fillTimeSelect(select, defaultValue) {
  for (let h = 0; h < 24; h++) {
    const value = `${String(h).padStart(2, "0")}:00`;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if (value === defaultValue) opt.selected = true;
    select.appendChild(opt);
  }
}

document.querySelectorAll('select[name="arrivalTime"]').forEach((s) => fillTimeSelect(s, "12:00"));
document.querySelectorAll('select[name="departureTime"]').forEach((s) => fillTimeSelect(s, "12:00"));

// ── Phone input mask: +7 (___) ___-__-__ ─────────────────────────
function applyPhoneMask(input) {
  if (!input) return;
  input.addEventListener("input", () => {
    let digits = input.value.replace(/\D/g, "");
    if (digits.startsWith("8")) digits = "7" + digits.slice(1);
    if (digits && !digits.startsWith("7")) digits = "7" + digits;
    digits = digits.slice(0, 11);
    const rest = digits.slice(1);
    let out = digits ? "+7" : "";
    if (rest.length > 0) out += " (" + rest.slice(0, 3);
    if (rest.length >= 3) out += ") " + rest.slice(3, 6);
    if (rest.length >= 6) out += "-" + rest.slice(6, 8);
    if (rest.length >= 8) out += "-" + rest.slice(8, 10);
    input.value = out;
  });
}

applyPhoneMask(form.elements.phone);

// Init wizard calendar (step 2)
const wizardCal = new RangeCalendar(
  document.getElementById("wizardCal"),
  document.getElementById("wizardCalSummary"),
  (arrival, departure) => {
    form.elements.arrivalDate.value = arrival || "";
    form.elements.departureDate.value = departure || "";
    refreshLiveQuote();
  }
);

// Init quick-calculator calendar.
// Кнопка всегда кликабельна: без выбранных дат она подсказывает, что делать,
// вместо «мёртвой» disabled-кнопки, которая выглядит сломанной.
const quickCalcSubmit = quickCalcForm.querySelector(".calc-v2__submit");
quickCalcSubmit.disabled = false; // страховка от закэшированного HTML с атрибутом disabled
const quickCalCal = new RangeCalendar(
  document.getElementById("quickCalCal"),
  document.getElementById("quickCalCalSummary"),
  (arrival, departure) => {
    document.getElementById("qcArrival").value = arrival || "";
    document.getElementById("qcDeparture").value = departure || "";
    quickCalcSubmit.textContent = arrival && departure ? "Рассчитать →" : "Выберите даты →";
  }
);

// Open wizard
document.querySelectorAll(".js-open-wizard").forEach((btn) => btn.addEventListener("click", openWizard));

// Тёплый переход из калькулятора в полный опросник с предзаполненными
// датами/людьми/временем — без повторного ввода (рост конверсии).
const calcToWizardBtn = document.getElementById("calcToWizard");
if (calcToWizardBtn) {
  calcToWizardBtn.addEventListener("click", () => {
    const qc = quickCalcForm.elements;
    const arrival = document.getElementById("qcArrival").value;
    const departure = document.getElementById("qcDeparture").value;
    openWizard(); // сбрасывает календарь и шаги — поэтому заполняем после.
    form.elements.adults.value = qc.adults.value || "2";
    form.elements.children.value = qc.children.value || "0";
    if (qc.arrivalTime.value) form.elements.arrivalTime.value = qc.arrivalTime.value;
    if (qc.departureTime.value) form.elements.departureTime.value = qc.departureTime.value;
    if (arrival && departure) wizardCal.setRange(arrival, departure);
    ymGoal("calc_to_wizard");
  });
}

// Close buttons
document.getElementById("closeWizard").addEventListener("click", closeWizard);
document.getElementById("closeWizardSuccess").addEventListener("click", closeWizard);

// Close on overlay click
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeWizard();
});

// Close on ESC (но не если поверх открыта модалка деталей шатра — её закроет свой хендлер)
document.addEventListener("keydown", (e) => {
  const tentModal = document.getElementById("tentModal");
  if (tentModal && tentModal.classList.contains("is-open")) return;
  if (e.key === "Escape" && !modal.classList.contains("hidden")) closeWizard();
});

prevBtn.addEventListener("click", () => {
  if (currentStep > 1) showStep(currentStep - 1);
});

nextBtn.addEventListener("click", () => {
  if (!validateStep()) return;
  if (currentStep < TOTAL_STEPS) showStep(currentStep + 1);
});

// Step 2 «Пропустить» → straight to contacts (with dates already chosen on step 1)
skipExtrasBtn.addEventListener("click", () => showStep(TOTAL_STEPS));

// Short track from step 1 → contacts without requiring dates (contact-only lead)
document.querySelectorAll(".js-skip-to-contacts").forEach((el) =>
  el.addEventListener("click", () => showStep(TOTAL_STEPS))
);

// Opt-in tent suggestion button (step 2)
const suggestTentsBtn = document.getElementById("suggestTentsBtn");
if (suggestTentsBtn) suggestTentsBtn.addEventListener("click", suggestCamping);

// Clear inline error highlight as the user corrects the field
form.addEventListener("input", (e) => {
  if (e.target && e.target.classList) e.target.classList.remove("is-error");
});

// Enter в полях опросника: на промежуточных шагах = «Далее» (а не
// преждевременная отправка формы с пустыми контактами). В textarea Enter —
// перенос строки; на финальном шаге — обычная отправка.
form.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target && e.target.tagName === "TEXTAREA") return;
  if (currentStep < TOTAL_STEPS) {
    e.preventDefault();
    nextBtn.click();
  }
});

// Любое изменение полей опросника (степперы, время, количество) обновляет
// предварительную сумму в нижней панели
form.addEventListener("change", () => refreshLiveQuote());

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
    const hasDates = Boolean(answers.arrivalDate && answers.departureDate);
    const payload = {
      website: form.elements.website.value,
      clientType: hasDates ? "full" : "contact",
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
    showSuccess(data.applicationId, data.quote);
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
    quickCalcResult.textContent = "Выберите на календаре дату заезда, а затем дату выезда.";
    document.getElementById("quickCalCal").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  try {
    const quote = await getQuote({
      adults: quickCalcForm.elements.adults.value,
      children: quickCalcForm.elements.children.value,
      arrivalDate,
      departureDate,
      arrivalTime: quickCalcForm.elements.arrivalTime.value,
      departureTime: quickCalcForm.elements.departureTime.value,
      perDay: {},
      fixed: {},
      storeTripPeople: 0,
    });
    const avail = await getAvailability(arrivalDate, departureDate);
    const daysCount = quote.days || quote.nights;
    quickCalcResult.classList.remove("hidden");
    quickCalcResult.innerHTML = `
      <p>Суток: <strong>${daysCount}</strong></p>
      <p>Предварительная стоимость: <strong>${money(quote.total)}</strong></p>
      ${spotsLineHtml(avail)}
      <small>${quote.disclaimer}</small>
    `;
    document.getElementById("calcLead").classList.remove("hidden");
    renderCalcLeadTurnstile();
    document.dispatchEvent(new Event("calcPriceDone"));
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

const SAFE_TAGS = new Set(['strong', 'em', 'br', 'b', 'i', 'u', 'small', 'span', 'sub', 'sup', 'a']);
const SAFE_ATTRS = { a: new Set(['href', 'target', 'rel']) };
function sanitizeHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  function clean(node) {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 3) continue;
      if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (!SAFE_TAGS.has(tag)) {
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          const allowed = SAFE_ATTRS[tag];
          Array.from(child.attributes).forEach(attr => {
            if (allowed && allowed.has(attr.name)) {
              // Validate href: only allow http/https/relative URLs
              if (attr.name === 'href') {
                const v = attr.value.trim();
                if (!/^(https?:\/\/|\/)/.test(v)) child.removeAttribute('href');
              }
            } else {
              child.removeAttribute(attr.name);
            }
          });
          // Ensure external links are safe
          if (tag === 'a') {
            child.setAttribute('rel', 'noopener noreferrer');
          }
          clean(child);
        }
      } else {
        node.removeChild(child);
      }
    }
  }
  clean(tmp);
  return tmp.innerHTML;
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
  const visualStyle = ev.image_url
    ? `background-image:url('${ev.image_url}');background-size:cover;background-position:center`
    : '';
  return `<article class="event-featured">
    <div class="event-featured__visual"${visualStyle ? ` style="${visualStyle}"` : ''}>
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

// Fleet: dynamic loading from API
// Collect all photos of a fleet item: main image_url + extra `images` (one URL per line)
function fleetPhotos(item) {
  const urls = [];
  if (item.image_url) urls.push(item.image_url);
  if (item.images) String(item.images).split('\n').map(s => s.trim()).filter(Boolean).forEach(u => urls.push(u));
  return urls.map(url => ({ url, caption: item.name }));
}

function openFleetDetails(item) {
  if (!item) return;
  openDetailsModal({
    title: item.name,
    photos: fleetPhotos(item),
    specs: [
      ['Тип', item.kind],
      ['Длина', item.length_m],
      ['Парусность', item.sail_area],
      ['Экипаж', item.crew],
    ].filter(([, v]) => v),
    note: item.note,
    icon: '⛵',
  });
}

function updateFleetTitle(items) {
  const title = document.getElementById('fleetTitle');
  if (!title || !items.length) return;
  const total = items.reduce((sum, i) => {
    const n = parseInt(String(i.count).replace(/[^\d]/g, ''), 10);
    return sum + (n > 0 ? n : 1);
  }, 0);
  const labels = items.map(i => i.kind || '').filter(Boolean);
  const unique = [...new Set(labels)];
  title.innerHTML = total + ' ' + (unique.length > 1 ? 'судов' : (unique[0] || 'судов')) + '.<br>Каждый под свою задачу.';
}

// Интерактивная сцена флота: затемнение, подсветка лодки и карточка по hover/tap
function initFleetScene() {
  const scene = document.getElementById('fleetScene');
  if (!scene) return;
  const boats = scene.querySelectorAll('.fleet-scene__boat');
  const cards = scene.querySelectorAll('.fleet-scene__card');
  const clear = () => {
    scene.classList.remove('is-focus');
    boats.forEach(b => b.classList.remove('is-on'));
    cards.forEach(c => c.classList.remove('is-show'));
  };
  const activate = (boat) => {
    clear();
    scene.classList.add('is-focus');
    boat.classList.add('is-on');
    const card = document.getElementById(boat.dataset.card);
    if (card) card.classList.add('is-show');
  };
  boats.forEach(boat => {
    boat.addEventListener('mouseenter', () => activate(boat));
    boat.addEventListener('focus', () => activate(boat));
    boat.addEventListener('mouseleave', clear);
    boat.addEventListener('blur', clear);
    boat.addEventListener('click', (e) => {
      e.stopPropagation();
      // Данные подгружены — открываем подробную карточку; иначе фолбэк на подсветку
      if (boat._fleetItem) { clear(); openFleetDetails(boat._fleetItem); return; }
      if (boat.classList.contains('is-on')) clear(); else activate(boat);
    });
  });
  scene.addEventListener('click', clear);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') clear(); });
}

// Заполняет всплывающие карточки сцены данными из /api/fleet (матчинг по имени лодки)
function fillFleetScene(items) {
  const scene = document.getElementById('fleetScene');
  if (!scene || !items.length) return;
  scene.querySelectorAll('.fleet-scene__boat').forEach(boat => {
    const name = (boat.dataset.boat || '').toLowerCase();
    const item = items.find(f => (f.name || '').toLowerCase().includes(name));
    if (!item) return;
    boat._fleetItem = item;
    const card = document.getElementById(boat.dataset.card);
    if (!card) return;
    const specs = [];
    if (item.length_m) specs.push('длина ' + item.length_m + ' м');
    if (item.sail_area) specs.push('парус ' + item.sail_area + ' м²');
    if (item.crew) specs.push('экипаж ' + item.crew);
    const kindLine = [item.kind, specs.join(' · ')].filter(Boolean).join(' · ');
    const kindEl = card.querySelector('[data-field="kind"]');
    const noteEl = card.querySelector('[data-field="note"]');
    if (kindEl && kindLine) kindEl.textContent = kindLine;
    if (noteEl && item.note) noteEl.textContent = item.note;
  });
}

function loadFleet() {
  fetch('/api/fleet')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(items => {
      const list = Array.isArray(items) ? items : [];
      fillFleetScene(list);
      updateFleetTitle(list);
    })
    .catch(() => {});
}

initFleetScene();
loadFleet();

// ── Canopy (tent) cards in the wizard ──────────────────────────────────────
// Заменяют прежний <select name="canopyType">. Клик по карточке = выбор (пишем
// price_key в скрытый input canopyType), кнопка «Подробнее» = модалка с деталями.
// Фоллбэк-список держит калькулятор рабочим, если /api/tents недоступен.
const CANOPY_FALLBACK = [
  { price_key: 'canopySmall',   name: 'Кухня малая',           capacity: 'до 8 чел.',   note: 'от 600 ₽/сутки',   length_m: '', image_url: '', images: '' },
  { price_key: 'canopyMedium',  name: 'Кухня средняя',         capacity: '10–15 чел.',  note: 'от 1 600 ₽/сутки', length_m: '', image_url: '', images: '' },
  { price_key: 'canopyLarge',   name: 'Кухня большая',         capacity: '20–25 чел.',  note: 'от 3 000 ₽/сутки', length_m: '', image_url: '', images: '' },
  { price_key: 'canopyEverest', name: 'Кухня-шатёр «Эверест»', capacity: '30–40 чел.',  note: 'от 4 000 ₽/сутки', length_m: '', image_url: '', images: '' },
];

let canopyItems = [];

function tentPhotos(item) {
  const urls = [];
  if (item.image_url) urls.push(item.image_url);
  if (item.images) String(item.images).split('\n').map(s => s.trim()).filter(Boolean).forEach(u => urls.push(u));
  return urls.map(url => ({ url, caption: item.name }));
}

function renderCanopyCards(items) {
  const wrap = document.getElementById('canopyCards');
  const hidden = form.elements.canopyType;
  if (!wrap || !hidden) return;
  canopyItems = items;
  let selectedKey = hidden.value;
  if (!items.some(it => it.price_key === selectedKey)) {
    selectedKey = items[0] ? items[0].price_key : '';
    hidden.value = selectedKey;
  }

  wrap.innerHTML = items.map((item, i) => {
    const isSel = item.price_key === selectedKey;
    const hasPhotos = tentPhotos(item).length > 0;
    const meta = [item.capacity, item.note].filter(Boolean).join(' · ');
    return `<div class="canopy-card${isSel ? ' is-selected' : ''}" role="button" tabindex="0" data-price-key="${escHtml(item.price_key)}" aria-pressed="${isSel ? 'true' : 'false'}">
      <span class="canopy-card__check" aria-hidden="true"></span>
      <span class="canopy-card__name">${escHtml(item.name)}</span>
      ${meta ? `<span class="canopy-card__meta">${escHtml(meta)}</span>` : ''}
      <button type="button" class="canopy-card__more" data-more="${i}">Подробнее${hasPhotos ? ' · фото' : ''}</button>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.canopy-card').forEach((card) => {
    const select = () => {
      hidden.value = card.dataset.priceKey;
      wrap.querySelectorAll('.canopy-card').forEach((c) => {
        const on = c === card;
        c.classList.toggle('is-selected', on);
        c.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      refreshLiveQuote();
    };
    card.addEventListener('click', (e) => {
      if (e.target.closest('.canopy-card__more')) return;
      select();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
    });
  });
  wrap.querySelectorAll('.canopy-card__more').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTentDetails(canopyItems[Number(btn.dataset.more)]);
    });
  });
}

// Общая модалка деталей (#tentModal): фото-галерея + характеристики.
// Используется и шатрами, и флотом.
function openDetailsModal({ title, photos, specs, note, icon }) {
  const modal = document.getElementById('tentModal');
  const body = document.getElementById('tentModalBody');
  if (!modal || !body) return;
  const gallery = photos.length
    ? `<div class="tent-modal__gallery">${photos.map((p, i) => `<img src="${escHtml(p.url)}" alt="${escHtml(title)}${i === 0 ? '' : ' — фото ' + (i + 1)}" loading="lazy" data-photo="${i}">`).join('')}</div>`
    : `<div class="tent-modal__placeholder"><span class="tent-modal__placeholder-icon">${icon}</span><span>Фотографии скоро появятся</span></div>`;
  body.innerHTML =
    `<h3 class="tent-modal__title">${escHtml(title)}</h3>` +
    gallery +
    (specs.length ? `<dl class="tent-modal__specs">${specs.map(([k, v]) => `<div><dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd></div>`).join('')}</dl>` : '') +
    (note ? `<p class="tent-modal__note">${escHtml(note)}</p>` : '');
  body.querySelectorAll('.tent-modal__gallery img').forEach((img) => {
    img.addEventListener('click', () => Lightbox.open(photos, Number(img.dataset.photo)));
  });
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function openTentDetails(item) {
  if (!item) return;
  openDetailsModal({
    title: item.name,
    photos: tentPhotos(item),
    specs: [['Вместимость', item.capacity], ['Длина', item.length_m]].filter(([, v]) => v),
    note: item.note,
    icon: '⛺',
  });
}

function closeTentDetails() {
  const tentModal = document.getElementById('tentModal');
  if (!tentModal) return;
  tentModal.classList.remove('is-open');
  tentModal.setAttribute('aria-hidden', 'true');
}

(function initTentModal() {
  const tentModal = document.getElementById('tentModal');
  const closeBtn = document.getElementById('tentModalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeTentDetails);
  if (tentModal) tentModal.addEventListener('click', (e) => { if (e.target === tentModal) closeTentDetails(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tentModal && tentModal.classList.contains('is-open')) closeTentDetails();
  });
})();

function loadCanopyCards() {
  fetch('/api/tents')
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((items) => renderCanopyCards(Array.isArray(items) && items.length ? items : CANOPY_FALLBACK))
    .catch(() => renderCanopyCards(CANOPY_FALLBACK));
}

loadCanopyCards();

// Content: dynamic text substitution from /api/content
function applyContent(content) {
  // Simple text content: data-content="key"
  document.querySelectorAll('[data-content]').forEach(el => {
    const key = el.dataset.content;
    if (!content[key]) return;
    el.textContent = content[key];
  });

  // HTML content: data-content-html="key" (sanitized)
  document.querySelectorAll('[data-content-html]').forEach(el => {
    const key = el.dataset.contentHtml;
    if (!content[key]) return;
    el.innerHTML = sanitizeHtml(content[key]);
  });

  // Stat blocks: value|label format -> <strong>value</strong><span>label</span>
  document.querySelectorAll('[data-content^="hero_stat_"]').forEach(el => {
    const key = el.dataset.content;
    if (!content[key]) return;
    const parts = content[key].split('|');
    if (parts.length === 2) {
      el.innerHTML = `<strong>${escHtml(parts[0])}</strong><span>${escHtml(parts[1])}</span>`;
    }
  });

  // Cards: title|text format -> <h3>title</h3><p>text</p>
  document.querySelectorAll('[data-content-card]').forEach(el => {
    const key = el.dataset.contentCard;
    if (!content[key]) return;
    const parts = content[key].split('|');
    if (parts.length === 2) {
      el.querySelector('h3').textContent = parts[0];
      el.querySelector('p').textContent = parts[1];
    }
  });

  // FAQ: question|answer format
  document.querySelectorAll('[data-content-faq]').forEach(el => {
    const key = el.dataset.contentFaq;
    if (!content[key]) return;
    const parts = content[key].split('|');
    if (parts.length >= 2) {
      const summary = el.querySelector('summary');
      const p = el.querySelector('p');
      if (summary) summary.textContent = parts[0];
      if (p) p.innerHTML = sanitizeHtml(parts.slice(1).join('|'));
    }
  });

  // Contacts
  if (content.contact_phone) {
    const phone = content.contact_phone;
    const phoneDigits = phone.replace(/[^\d+]/g, '');
    const headerPhone = document.getElementById('headerPhone');
    if (headerPhone) { headerPhone.textContent = phone; headerPhone.href = 'tel:' + phoneDigits; }
    const contactPhone = document.getElementById('contactPhone');
    if (contactPhone) {
      const a = contactPhone.querySelector('a');
      if (a) { a.textContent = phone; a.href = 'tel:' + phoneDigits; }
    }
  }
  if (content.contact_email) {
    const contactEmail = document.getElementById('contactEmail');
    if (contactEmail) {
      const a = contactEmail.querySelector('a');
      if (a) { a.textContent = content.contact_email; a.href = 'mailto:' + content.contact_email; }
    }
  }
  if (content.contact_vk) {
    const contactVk = document.getElementById('contactVk');
    if (contactVk) {
      const a = contactVk.querySelector('a');
      if (a) {
        a.href = content.contact_vk;
        a.textContent = content.contact_vk.replace('https://', '');
      }
    }
  }
}

fetch('/api/content')
  .then(r => r.json())
  .then(content => { if (content && typeof content === 'object') applyContent(content); })
  .catch(() => {});

// Events filter tabs
const filterTabs = document.querySelectorAll(".filter-tab");
filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    applyEventsFilter(tab.dataset.filter);
  });
});

function ensureTurnstileScript(onReady) {
  if (window.turnstile) { onReady(); return; }
  if (turnstileScriptLoaded) return;
  turnstileScriptLoaded = true;
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.onload = () => onReady();
  document.head.appendChild(script);
}

function renderTurnstile() {
  if (!turnstileSiteKey) return;
  if (turnstileWidgetId != null && window.turnstile) {
    window.turnstile.reset(turnstileWidgetId);
    return;
  }
  ensureTurnstileScript(mountTurnstile);
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

function renderCalcLeadTurnstile() {
  if (!turnstileSiteKey) return;
  if (calcLeadTurnstileWidgetId != null && window.turnstile) {
    window.turnstile.reset(calcLeadTurnstileWidgetId);
    calcLeadTurnstileToken = "";
    return;
  }
  ensureTurnstileScript(mountCalcLeadTurnstile);
}

function mountCalcLeadTurnstile() {
  if (!window.turnstile || calcLeadTurnstileWidgetId != null) return;
  calcLeadTurnstileWidgetId = window.turnstile.render("#calcLeadTurnstile", {
    sitekey: turnstileSiteKey,
    callback: (token) => { calcLeadTurnstileToken = token; },
    "expired-callback": () => { calcLeadTurnstileToken = ""; },
    "error-callback": () => { calcLeadTurnstileToken = ""; },
  });
}

const calcLeadTurnstileContainer = document.getElementById("calcLeadTurnstile");

fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    turnstileSiteKey = cfg.turnstileSiteKey || "";
    prepayEnabled = Boolean(cfg.prepayEnabled);
    if (cfg.prepayPercent) prepayPercent = Number(cfg.prepayPercent);
    if (!turnstileSiteKey) {
      const placeholder = "Turnstile можно включить через TURNSTILE_SITE_KEY и TURNSTILE_SECRET_KEY.";
      turnstileContainer.textContent = placeholder;
      if (calcLeadTurnstileContainer) calcLeadTurnstileContainer.textContent = placeholder;
    }
  })
  .catch(() => {
    const errMsg = "Не удалось загрузить конфигурацию безопасности.";
    turnstileContainer.textContent = errMsg;
    if (calcLeadTurnstileContainer) calcLeadTurnstileContainer.textContent = errMsg;
  });

// --- Lead form after quick calculator ---
const calcLeadForm = document.getElementById("calcLeadForm");
const calcLeadMsg  = document.getElementById("calcLeadMsg");
applyPhoneMask(calcLeadForm.elements.phone);

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
        turnstileToken: calcLeadTurnstileToken,
        answers: {
          adults: quickCalcForm.elements.adults.value,
          children: quickCalcForm.elements.children.value,
          arrivalDate: document.getElementById("qcArrival").value,
          departureDate: document.getElementById("qcDeparture").value,
          arrivalTime: quickCalcForm.elements.arrivalTime.value,
          departureTime: quickCalcForm.elements.departureTime.value,
          perDay: {},
          fixed: {},
          storeTripPeople: 0,
        },
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (window.turnstile && calcLeadTurnstileWidgetId != null) {
        window.turnstile.reset(calcLeadTurnstileWidgetId);
        calcLeadTurnstileToken = "";
      }
      throw new Error(data.error || "Ошибка отправки.");
    }
    calcLeadForm.classList.add("hidden");
    if (calcLeadTurnstileContainer) calcLeadTurnstileContainer.classList.add("hidden");
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

// --- Lead popup: показывать после расчёта цены, если FAQ читают > 30 сек; повтор раз в 3 мин ---
(function initLeadPopup() {
  const popup        = document.getElementById("leadPopup");
  const closeBtn     = document.getElementById("leadPopupClose");
  const popupForm    = document.getElementById("leadPopupForm");
  const popupMsg     = document.getElementById("leadPopupMsg");
  const faqSection   = document.getElementById("faq");
  if (!popup || !faqSection) return;
  if (popupForm) applyPhoneMask(popupForm.elements.phone);

  let calcDone        = false;   // пользователь посчитал цену
  let faqTimer        = null;    // таймер 30 сек
  let cooldownTimer   = null;    // таймер 3 мин до следующего показа
  let onCooldown      = false;
  let popupShown      = false;   // был ли показан хоть раз (для сброса таймера)
  let leadPopupTurnstileToken = "";
  let leadPopupTurnstileWidgetId = null;

  function openPopup(force) {
    if (onCooldown && !force) return;
    popup.classList.remove("hidden");
    popup.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    popupShown = true;
    mountLeadPopupTurnstile();
    ymGoal("lead_popup_open");
  }

  function closePopup() {
    popup.classList.add("hidden");
    popup.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    onCooldown = true;
    cooldownTimer = setTimeout(() => {
      onCooldown = false;
      // если FAQ всё ещё в видимости — покажем снова
      if (faqVisible) startFaqTimer();
    }, 3 * 60 * 1000);
  }

  // Глобальный доступ + ссылки .js-open-lead-popup + хэш #lead-popup
  window.openLeadPopup = () => openPopup(true);

  closeBtn.addEventListener("click", closePopup);
  popup.addEventListener("click", (e) => { if (e.target === popup) closePopup(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popup.classList.contains("hidden")) closePopup();
  });

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest(".js-open-lead-popup");
    if (!trigger) return;
    e.preventDefault();
    openPopup(true);
  });

  const checkHash = () => {
    if (location.hash === "#lead-popup") { openPopup(true); history.replaceState(null, "", location.pathname + location.search); }
  };
  checkHash();
  window.addEventListener("hashchange", checkHash);

  let faqVisible = false;

  function startFaqTimer() {
    if (faqTimer || onCooldown) return;
    faqTimer = setTimeout(() => {
      faqTimer = null;
      if (faqVisible && calcDone) openPopup();
    }, 30 * 1000);
  }

  function stopFaqTimer() {
    if (faqTimer) { clearTimeout(faqTimer); faqTimer = null; }
  }

  const obs = new IntersectionObserver((entries) => {
    faqVisible = entries[0].isIntersecting;
    if (faqVisible && calcDone && !onCooldown) {
      startFaqTimer();
    } else {
      stopFaqTimer();
    }
  }, { threshold: 0.15 });
  obs.observe(faqSection);

  // Сигнал от калькулятора: цена посчитана
  document.addEventListener("calcPriceDone", () => {
    calcDone = true;
    if (faqVisible && !onCooldown) startFaqTimer();
  });

  // Turnstile для поп-апа
  function mountLeadPopupTurnstile() {
    if (!turnstileSiteKey || leadPopupTurnstileWidgetId != null) return;
    ensureTurnstileScript(() => {
      if (!window.turnstile || leadPopupTurnstileWidgetId != null) return;
      leadPopupTurnstileWidgetId = window.turnstile.render("#leadPopupTurnstile", {
        sitekey: turnstileSiteKey,
        callback: (t) => { leadPopupTurnstileToken = t; },
        "expired-callback": () => { leadPopupTurnstileToken = ""; },
        "error-callback":   () => { leadPopupTurnstileToken = ""; },
      });
    });
  }

  popupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name  = popupForm.elements.name.value.trim();
    const phone = popupForm.elements.phone.value.trim();
    if (!name || !validatePhone(phone)) {
      popupMsg.textContent = "Введите имя и корректный телефон (не менее 10 цифр).";
      return;
    }
    const btn = popupForm.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Отправляем…";
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          turnstileToken: leadPopupTurnstileToken,
          answers: {
            adults:        quickCalcForm.elements.adults.value,
            children:      quickCalcForm.elements.children.value,
            arrivalDate:   document.getElementById("qcArrival").value,
            departureDate: document.getElementById("qcDeparture").value,
            arrivalTime:   quickCalcForm.elements.arrivalTime.value,
            departureTime: quickCalcForm.elements.departureTime.value,
            perDay: {}, fixed: {}, storeTripPeople: 0,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка отправки.");
      popupForm.classList.add("hidden");
      document.getElementById("leadPopupTurnstile").classList.add("hidden");
      popupMsg.style.color = "var(--brand-leaf-700)";
      popupMsg.textContent = `Заявка #${data.applicationId} принята. Перезвоним в ближайшее время!`;
      ymGoal("lead_popup_submit", { applicationId: data.applicationId });
      onCooldown = true; // больше не показывать после успешной отправки
    } catch (err) {
      popupMsg.textContent = err.message;
      if (window.turnstile && leadPopupTurnstileWidgetId != null) {
        window.turnstile.reset(leadPopupTurnstileWidgetId);
        leadPopupTurnstileToken = "";
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Получить консультацию";
    }
  });
})();

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
// Shared lightbox controller — used by both the photo gallery and fleet cards.
// open(photos, idx): photos is an array of { url, caption }.
const Lightbox = (function () {
  const lb        = document.getElementById('lightbox');
  const lbImg     = document.getElementById('lightboxImg');
  const lbCaption = document.getElementById('lightboxCaption');
  const lbClose   = document.getElementById('lightboxClose');
  const lbPrev    = document.getElementById('lightboxPrev');
  const lbNext    = document.getElementById('lightboxNext');

  let photos = [];
  let current = 0;

  function show(idx) {
    current = (idx + photos.length) % photos.length;
    lbImg.src = photos[current].url;
    lbImg.alt = photos[current].caption || 'Фото';
    if (lbCaption) lbCaption.textContent = photos[current].caption || '';
  }

  function open(items, idx = 0) {
    if (!lb || !Array.isArray(items) || !items.length) return;
    photos = items;
    const multi = photos.length > 1;
    if (lbPrev) lbPrev.style.display = multi ? '' : 'none';
    if (lbNext) lbNext.style.display = multi ? '' : 'none';
    show(idx);
    lb.classList.add('is-open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!lb) return;
    lb.classList.remove('is-open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (lbClose) lbClose.addEventListener('click', close);
  if (lbPrev)  lbPrev.addEventListener('click', () => show(current - 1));
  if (lbNext)  lbNext.addEventListener('click', () => show(current + 1));
  if (lb) lb.addEventListener('click', e => { if (e.target === lb) close(); });

  document.addEventListener('keydown', e => {
    if (!lb || !lb.classList.contains('is-open')) return;
    if (e.key === 'Escape')      close();
    if (e.key === 'ArrowLeft' && photos.length > 1)   show(current - 1);
    if (e.key === 'ArrowRight' && photos.length > 1)  show(current + 1);
  });

  return { open, close };
})();

(function initGallery() {
  const section = document.getElementById('gallery');
  const grid = document.getElementById('galleryGrid');
  const filters = document.getElementById('galleryFilters');
  if (!section || !grid) return;

  const CAT_LABELS = { all: 'Все фото', regatta: 'Регаты', bonfire: 'Костёр', sunset: 'Закаты' };

  function renderGrid(list) {
    grid.innerHTML = '';
    list.forEach((photo, idx) => {
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
      item.addEventListener('click', () => Lightbox.open(list, idx));
      grid.appendChild(item);
    });
  }

  fetch('/api/gallery')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(photos => {
      if (!photos.length) { section.hidden = true; return; }
      renderGrid(photos);

      if (!filters) return;
      // Вкладки только для категорий, в которых есть фото
      const present = ['regatta', 'bonfire', 'sunset'].filter(c => photos.some(p => p.category === c));
      if (!present.length) return;

      ['all'].concat(present).forEach((cat, i) => {
        const btn = document.createElement('button');
        btn.className = 'filter-tab' + (i === 0 ? ' is-active' : '');
        btn.dataset.filter = cat;
        btn.setAttribute('role', 'tab');
        btn.textContent = CAT_LABELS[cat];
        btn.addEventListener('click', () => {
          filters.querySelectorAll('.filter-tab').forEach(b => b.classList.toggle('is-active', b === btn));
          renderGrid(cat === 'all' ? photos : photos.filter(p => p.category === cat));
        });
        filters.appendChild(btn);
      });
      filters.hidden = false;
    })
    .catch(() => { section.hidden = true; });
})();

// --- Partner logos: show logo when it loads, fall back to text abbreviation otherwise ---
(function initPartnerLogos() {
  document.querySelectorAll('.friend-card__logo').forEach((img) => {
    const settle = () => {
      if (img.naturalWidth > 0) img.closest('.friend-card')?.classList.add('has-logo');
      else img.remove();
    };
    if (img.complete) settle();
    else {
      img.addEventListener('load', settle);
      img.addEventListener('error', () => img.remove());
    }
  });
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
