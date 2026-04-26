const modal = document.getElementById("wizardModal");
const steps = Array.from(document.querySelectorAll(".step"));
const progressBar = document.getElementById("progressBar");
const form = document.getElementById("applicationForm");
const reviewBlock = document.getElementById("reviewBlock");
const formMessage = document.getElementById("formMessage");
const nextBtn = document.getElementById("nextStep");
const prevBtn = document.getElementById("prevStep");
const submitBtn = document.getElementById("submitApp");
const quickCalcForm = document.getElementById("quickCalc");
const quickCalcResult = document.getElementById("quickCalcResult");
const campingBlock = document.getElementById("campingBlock");
const canopyBlock = document.getElementById("canopyBlock");
const turnstileContainer = document.getElementById("turnstileContainer");

let currentStep = 1;
let turnstileSiteKey = "";
let turnstileToken = "";

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function showStep(stepNum) {
  currentStep = stepNum;
  steps.forEach((step) => step.classList.toggle("hidden", Number(step.dataset.step) !== stepNum));
  progressBar.style.width = `${(stepNum / steps.length) * 100}%`;
  prevBtn.classList.toggle("hidden", stepNum === 1);
  nextBtn.classList.toggle("hidden", stepNum === steps.length);
  submitBtn.classList.toggle("hidden", stepNum !== steps.length);
}

function openWizard() {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  formMessage.textContent = "";
  showStep(1);
}

function closeWizard() {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
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

function validateStep() {
  if (currentStep === 1) {
    const adults = Number(form.elements.adults.value || 0);
    const children = Number(form.elements.children.value || 0);
    if (adults + children < 1) {
      formMessage.textContent = "Укажите хотя бы одного гостя.";
      return false;
    }
  }
  if (currentStep === 2) {
    const start = new Date(form.elements.arrivalDate.value);
    const end = new Date(form.elements.departureDate.value);
    if (!form.elements.arrivalDate.value || !form.elements.departureDate.value || end <= start) {
      formMessage.textContent = "Проверьте даты заезда и выезда.";
      return false;
    }
  }
  if (currentStep === 6) {
    if (!form.elements.name.value.trim() || !form.elements.phone.value.trim()) {
      formMessage.textContent = "Имя и телефон обязательны.";
      return false;
    }
  }

  formMessage.textContent = "";
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

document.querySelectorAll(".js-open-wizard").forEach((btn) => btn.addEventListener("click", openWizard));
document.getElementById("closeWizard").addEventListener("click", closeWizard);

prevBtn.addEventListener("click", () => {
  if (currentStep > 1) showStep(currentStep - 1);
});

nextBtn.addEventListener("click", async () => {
  if (!validateStep()) return;

  if (currentStep === 3) {
    const own = form.elements.hasOwnCamping.checked;
    campingBlock.classList.toggle("hidden", own);
  }
  if (currentStep === 4) {
    const needCanopy = form.elements.needCanopy.checked;
    canopyBlock.classList.toggle("hidden", !needCanopy);
  }

  if (currentStep === 6) {
    try {
      await updateReview();
    } catch (error) {
      formMessage.textContent = error.message;
      return;
    }
  }

  if (currentStep < steps.length) showStep(currentStep + 1);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStep()) return;

  try {
    const answers = getAnswersFromForm(form);
    const payload = {
      website: form.elements.website.value,
      clientType: form.elements.clientType.value,
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

    formMessage.textContent = `Заявка #${data.applicationId} отправлена. Мы скоро свяжемся с вами.`;
    form.reset();
    showStep(1);
  } catch (error) {
    formMessage.textContent = error.message;
  }
});

quickCalcForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const quote = await getQuote({
      adults: quickCalcForm.elements.adults.value,
      children: quickCalcForm.elements.children.value,
      arrivalDate: quickCalcForm.elements.arrivalDate.value,
      departureDate: quickCalcForm.elements.departureDate.value,
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
  } catch (error) {
    quickCalcResult.classList.remove("hidden");
    quickCalcResult.textContent = error.message;
  }
});

fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    turnstileSiteKey = cfg.turnstileSiteKey || "";
    if (!turnstileSiteKey) {
      turnstileContainer.textContent =
        "Turnstile можно включить через TURNSTILE_SITE_KEY и TURNSTILE_SECRET_KEY.";
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.turnstile) return;
      window.turnstile.render("#turnstileContainer", {
        sitekey: turnstileSiteKey,
        callback: (token) => {
          turnstileToken = token;
        },
      });
    };
    document.head.appendChild(script);
  })
  .catch(() => {
    turnstileContainer.textContent = "Не удалось загрузить конфигурацию безопасности.";
  });
