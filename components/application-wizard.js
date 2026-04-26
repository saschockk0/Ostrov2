"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const WEEKEND_DAYS = new Set([5, 6, 0]); // Fri, Sat, Sun

const CANOPY_OPTIONS = [
  {
    id: "canopySmall",
    title: "Малый шатер",
    note: "Фото 1: туристический шатер (6-8 человек).",
  },
  {
    id: "canopyLarge",
    title: "Большой шатер",
    note: "Фото 2: шатер Green Glade (пример большого шатра).",
  },
  {
    id: "canopyEverest",
    title: "Шатер «Эверест»",
    note: "Тот же формат, что большой шатер, но размещение на холме.",
  },
];

const INITIAL_FORM = {
  adults: 2,
  children: 0,
  arrivalDate: "",
  departureDate: "",
  tent1: 0,
  tent2: 0,
  tent3: 0,
  noTent: false,
  sleepingSet: 0,
  needCanopy: null,
  canopyType: "canopySmall",
  canopyPreference: "",
  needEquipment: true,
  name: "",
  phone: "",
  messenger: "",
  email: "",
  comment: "",
  website: "",
};

const STEP_TITLES = [
  "Гости и даты",
  "Шатер",
  "Снаряжение",
  "Контакты",
  "Подтверждение",
];

const QUANTITY_ITEMS = [
  { key: "tent1", label: "Палатка 1-местная", isTent: true },
  { key: "tent2", label: "Палатка 2-местная", isTent: true },
  { key: "tent3", label: "Палатка 3-местная", isTent: true },
  { key: "sleepingSet", label: "Спальные комплекты", isTent: false },
];

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ru-RU");
}

function getPeriodBranch(arrivalDate, departureDate) {
  if (!arrivalDate || !departureDate) return "unknown";
  const start = new Date(arrivalDate);
  const end = new Date(departureDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return "unknown";

  const cursor = new Date(start);
  while (cursor < end) {
    if (WEEKEND_DAYS.has(cursor.getDay())) return "weekendOrMore";
    cursor.setDate(cursor.getDate() + 1);
  }
  return "weekday";
}

export function ApplicationWizard({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);
  const [review, setReview] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileInfo, setTurnstileInfo] = useState("");
  const turnstileHostRef = useRef(null);
  const turnstileWidgetIdRef = useRef(null);
  const turnstileScriptPromiseRef = useRef(null);

  const periodBranch = useMemo(
    () => getPeriodBranch(form.arrivalDate, form.departureDate),
    [form.arrivalDate, form.departureDate]
  );
  const autoTransferQty = periodBranch === "weekday" ? 1 : 0;

  useEffect(() => {
    let alive = true;
    fetch("/api/config")
      .then((response) => response.json())
      .then((config) => {
        if (!alive) return;
        const siteKey = config?.turnstileSiteKey || "";
        setTurnstileSiteKey(siteKey);
        if (!siteKey) {
          setTurnstileInfo("Проверка Turnstile отключена: ключ не задан.");
        }
      })
      .catch(() => {
        if (!alive) return;
        setTurnstileInfo("Не удалось загрузить конфигурацию безопасности.");
      });
    return () => {
      alive = false;
    };
  }, []);

  function ensureTurnstileScript() {
    if (typeof window === "undefined") return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstileScriptPromiseRef.current) return turnstileScriptPromiseRef.current;

    turnstileScriptPromiseRef.current = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.turnstile || null);
      script.onerror = () => reject(new Error("TURNSTILE_SCRIPT_LOAD_FAILED"));
      document.head.appendChild(script);
    });

    return turnstileScriptPromiseRef.current;
  }

  useEffect(() => {
    if (!open || step !== 3 || !turnstileSiteKey || !turnstileHostRef.current) return;
    let cancelled = false;

    ensureTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !turnstile || turnstileWidgetIdRef.current !== null) return;
        turnstileWidgetIdRef.current = turnstile.render(turnstileHostRef.current, {
          sitekey: turnstileSiteKey,
          callback: (token) => {
            setTurnstileToken(token);
            setTurnstileInfo("Проверка безопасности пройдена.");
          },
          "expired-callback": () => {
            setTurnstileToken("");
            setTurnstileInfo("Срок действия проверки истек. Подтвердите заново.");
          },
          "error-callback": () => {
            setTurnstileToken("");
            setTurnstileInfo("Ошибка Turnstile. Обновите проверку.");
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setTurnstileInfo("Не удалось загрузить Turnstile. Обновите страницу.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, step, turnstileSiteKey]);

  function patchField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function adjustQty(name, delta) {
    setForm((prev) => {
      const current = Number(prev[name] || 0);
      const next = Math.max(0, current + delta);
      return {
        ...prev,
        noTent: name.startsWith("tent") ? false : prev.noTent,
        [name]: next,
      };
    });
  }

  function setNoTent(value) {
    setForm((prev) => ({
      ...prev,
      noTent: value,
      tent1: value ? 0 : prev.tent1,
      tent2: value ? 0 : prev.tent2,
      tent3: value ? 0 : prev.tent3,
    }));
  }

  function setNeedEquipment(value) {
    setForm((prev) => ({
      ...prev,
      needEquipment: value,
      tent1: value ? prev.tent1 : 0,
      tent2: value ? prev.tent2 : 0,
      tent3: value ? prev.tent3 : 0,
      sleepingSet: value ? prev.sleepingSet : 0,
      noTent: value ? prev.noTent : false,
    }));
  }

  function handleCanopyDecision(decision) {
    if (!decision) {
      setForm((prev) => ({
        ...prev,
        needCanopy: false,
        canopyPreference: "",
      }));
      setMessage("");
      setStep(2);
      return;
    }

    setForm((prev) => ({
      ...prev,
      needCanopy: true,
      canopyType: prev.canopyType || "canopySmall",
    }));
    setMessage("");
  }

  function continueAfterCanopy() {
    if (form.needCanopy === null) {
      setMessage("Выберите: нужен шатер или нет.");
      return;
    }
    if (form.needCanopy && !form.canopyType) {
      setMessage("Выберите вариант шатра.");
      return;
    }
    setMessage("");
    setStep(2);
  }

  function moveBack() {
    if (step === 2 && form.needCanopy === false) {
      setStep(0);
      return;
    }
    setStep((prev) => Math.max(prev - 1, 0));
  }

  function getStepTitle(index) {
    if (index === 2 && form.needCanopy === false) return "Снаряжение";
    return STEP_TITLES[index];
  }

  function getVisibleStepNumber() {
    if (step >= 2 && form.needCanopy === false) return step;
    return step + 1;
  }

  function getVisibleTotalSteps() {
    if (form.needCanopy === false) return STEP_TITLES.length - 1;
    return STEP_TITLES.length;
  }

  function getProgressPercent() {
    return (getVisibleStepNumber() / getVisibleTotalSteps()) * 100;
  }

  function canMoveBack() {
    return !(step === 0 || (step === 2 && form.needCanopy === false));
  }

  function shouldShowActions() {
    return step !== 1;
  }

  function isFinalStep() {
    return step === 4;
  }

  function canMoveNext() {
    return step < 4;
  }

  function handleNext() {
    nextStep();
  }

  function renderQtyRow(item) {
    const value = Number(form[item.key] || 0);
    const disabled = item.isTent && form.noTent;
    return (
      <div key={item.key} className={`qty-row ${disabled ? "qty-row--disabled" : ""}`}>
        <span>{item.label}</span>
        <div className="qty-controls">
          <button
            type="button"
            className="qty-btn"
            onClick={() => adjustQty(item.key, -1)}
            disabled={disabled || value === 0}
            aria-label={`Уменьшить: ${item.label}`}
          >
            -
          </button>
          <strong>{value}</strong>
          <button
            type="button"
            className="qty-btn"
            onClick={() => adjustQty(item.key, 1)}
            disabled={disabled}
            aria-label={`Увеличить: ${item.label}`}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  function buildAnswers() {
    return {
      adults: form.adults,
      children: form.children,
      arrivalDate: form.arrivalDate,
      departureDate: form.departureDate,
      canopyPreference: form.canopyPreference,
      periodBranch,
      perDay: {
        tent1: form.needEquipment && !form.noTent ? form.tent1 : 0,
        tent2: form.needEquipment && !form.noTent ? form.tent2 : 0,
        tent3: form.needEquipment && !form.noTent ? form.tent3 : 0,
        sleepingSet: form.needEquipment ? form.sleepingSet : 0,
        canopySmall: form.needCanopy && form.canopyType === "canopySmall" ? 1 : 0,
        canopyLarge: form.needCanopy && form.canopyType === "canopyLarge" ? 1 : 0,
        canopyEverest: form.needCanopy && form.canopyType === "canopyEverest" ? 1 : 0,
        stove: 0,
        tableSet: 0,
        gasCanister: 0,
        transfer: autoTransferQty,
      },
      fixed: {},
      storeTripPeople: 0,
    };
  }

  async function loadReview() {
    const response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAnswers()),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Ошибка расчета");
    setReview(data);
    return data;
  }

  function validateCurrentStep() {
    if (step === 0) {
      if (!form.arrivalDate || !form.departureDate) {
        setMessage("Укажите даты заезда и выезда.");
        return false;
      }
      if (new Date(form.departureDate) <= new Date(form.arrivalDate)) {
        setMessage("Дата выезда должна быть позже даты заезда.");
        return false;
      }
      if (Number(form.adults) + Number(form.children) < 1) {
        setMessage("Укажите хотя бы одного гостя.");
        return false;
      }
    }
    if (step === 3) {
      if (!form.name.trim() || !form.phone.trim()) {
        setMessage("Имя и телефон обязательны.");
        return false;
      }
      if (turnstileSiteKey && !turnstileToken) {
        setMessage("Подтвердите проверку безопасности Turnstile.");
        return false;
      }
    }
    setMessage("");
    return true;
  }

  async function nextStep() {
    if (!validateCurrentStep()) return;
    if (step === 3) {
      try {
        setLoading(true);
        await loadReview();
      } catch (error) {
        setMessage(error.message);
        return;
      } finally {
        setLoading(false);
      }
    }
    setStep((prev) => Math.min(prev + 1, STEP_TITLES.length - 1));
  }

  async function submitApplication(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          website: form.website,
          clientType: "individual",
          name: form.name.trim(),
          phone: form.phone.trim(),
          messenger: form.messenger.trim(),
          email: form.email.trim(),
          comment: form.comment.trim(),
          turnstileToken,
          answers: buildAnswers(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось отправить заявку");
      setMessage(
        `Заявка #${data.applicationId} отправлена. Также доступны доп. услуги: нажмите «Ознакомиться» в разделе доп. услуг.`
      );
      setTurnstileToken("");
      if (window.turnstile && turnstileWidgetIdRef.current !== null) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
      setForm(INITIAL_FORM);
      setReview(null);
      setStep(0);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="wizard-backdrop" onClick={onClose}>
      <div className="wizard" onClick={(event) => event.stopPropagation()}>
        <button className="wizard__close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
        <h3>Опросник заявки</h3>
        <p className="wizard__step-title">
          Шаг {getVisibleStepNumber()} из {getVisibleTotalSteps()}: {getStepTitle(step)}
        </p>
        <div className="progress">
          <div style={{ width: `${getProgressPercent()}%` }} />
        </div>

        <form onSubmit={submitApplication}>
          <input
            className="honeypot"
            tabIndex="-1"
            autoComplete="off"
            value={form.website}
            onChange={(event) => patchField("website", event.target.value)}
          />

          {step === 0 ? (
            <div className="wizard-grid">
              <label>
                Взрослые
                <input
                  type="number"
                  min="1"
                  value={form.adults}
                  onChange={(event) => patchField("adults", Number(event.target.value))}
                />
              </label>
              <label>
                Дети 7-14
                <input
                  type="number"
                  min="0"
                  value={form.children}
                  onChange={(event) => patchField("children", Number(event.target.value))}
                />
              </label>
              <label>
                Заезд
                <input
                  type="date"
                  value={form.arrivalDate}
                  onChange={(event) => patchField("arrivalDate", event.target.value)}
                />
              </label>
              <label>
                Выезд
                <input
                  type="date"
                  value={form.departureDate}
                  onChange={(event) => patchField("departureDate", event.target.value)}
                />
              </label>
              {periodBranch === "weekday" ? (
                <p className="wizard-note full">
                  Будни: стоимость трансфера добавляется автоматически.
                </p>
              ) : null}
              {periodBranch === "weekendOrMore" ? (
                <p className="wizard-note full">Выходные или больше: расчет без автодобавления трансфера.</p>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="wizard-grid">
              <p className="full wizard-note">Нужен шатер на компанию?</p>
              <div className="full wizard-toggle">
                <button
                  type="button"
                  className={`btn ${form.needCanopy === true ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => handleCanopyDecision(true)}
                >
                  Да, нужен шатер
                </button>
                <button
                  type="button"
                  className={`btn ${form.needCanopy === false ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => handleCanopyDecision(false)}
                >
                  Нет, не нужен
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
                  Изменить даты
                </button>
              </div>
              {form.needCanopy === true ? (
                <>
                  <div className="canopy-options full">
                    {CANOPY_OPTIONS.map((option) => (
                      <label
                        key={option.id}
                        className={`canopy-card ${form.canopyType === option.id ? "canopy-card--selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="canopyType"
                          value={option.id}
                          checked={form.canopyType === option.id}
                          onChange={(event) => patchField("canopyType", event.target.value)}
                        />
                        <strong>{option.title}</strong>
                        <small>{option.note}</small>
                      </label>
                    ))}
                  </div>
                  <label className="full">
                    Предпочтения по месту размещения шатра (опционально)
                    <textarea
                      rows="2"
                      value={form.canopyPreference}
                      onChange={(event) => patchField("canopyPreference", event.target.value)}
                    />
                  </label>
                  <div className="full wizard-inline-action">
                    <button type="button" className="btn btn-primary" onClick={continueAfterCanopy}>
                      Перейти к снаряжению
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="wizard-grid">
              <p className="full wizard-note">Нужно снаряжение?</p>
              <div className="full wizard-toggle">
                <button
                  type="button"
                  className={`btn ${form.needEquipment ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setNeedEquipment(true)}
                >
                  Да, хочу выбрать
                </button>
                <button
                  type="button"
                  className={`btn ${!form.needEquipment ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setNeedEquipment(false)}
                >
                  Нет, всё своё
                </button>
              </div>

              {form.needEquipment ? (
                <>
                  <div className="full qty-list">{QUANTITY_ITEMS.map((item) => renderQtyRow(item))}</div>
                  <div className="full wizard-inline-action">
                    <button
                      type="button"
                      className={`btn ${form.noTent ? "btn-primary" : "btn-ghost"}`}
                      onClick={() => setNoTent(!form.noTent)}
                    >
                      Палатка не нужна, выберу другое
                    </button>
                  </div>
                </>
              ) : (
                <p className="full wizard-note">Принято: используем ваше снаряжение, доп. позиции не добавляем.</p>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="wizard-grid">
              <label>
                Имя*
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => patchField("name", event.target.value)}
                />
              </label>
              <label>
                Телефон*
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => patchField("phone", event.target.value)}
                />
              </label>
              <label>
                Мессенджер
                <input
                  type="text"
                  value={form.messenger}
                  onChange={(event) => patchField("messenger", event.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => patchField("email", event.target.value)}
                />
              </label>
              <label>
                Комментарий
                <textarea
                  rows="3"
                  value={form.comment}
                  onChange={(event) => patchField("comment", event.target.value)}
                />
              </label>
              {turnstileSiteKey ? (
                <div className="full">
                  <div ref={turnstileHostRef} />
                  {turnstileInfo ? <small className="turnstile-info">{turnstileInfo}</small> : null}
                </div>
              ) : (
                <small className="full turnstile-info">{turnstileInfo}</small>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="result-card">
              {!review ? <p>Загружаем итоговый расчет...</p> : null}
              <p>
                Даты отдыха:{" "}
                <strong>
                  {formatDate(form.arrivalDate)} - {formatDate(form.departureDate)}
                </strong>
              </p>
              {review ? (
                <p>
                  Ночей: <strong>{review.nights}</strong>, гостей: <strong>{review.guests}</strong>
                </p>
              ) : null}
              {review?.breakdown?.map((row) => (
                <p key={row.label}>
                  {row.label}: <strong>{money(row.amount)}</strong>
                </p>
              ))}
              {review ? (
                <p>
                  <strong>Итого: {money(review.total)}</strong>
                </p>
              ) : null}
              {review?.disclaimer ? <small>{review.disclaimer}</small> : null}
            </div>
          ) : null}

          {message ? <p className="info">{message}</p> : null}

          {shouldShowActions() ? (
            <div className="wizard-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={moveBack}
                disabled={!canMoveBack() || loading}
              >
                Назад
              </button>
              {canMoveNext() ? (
                <button className="btn btn-primary" type="button" onClick={handleNext} disabled={loading}>
                  {loading ? "Подождите..." : "Далее"}
                </button>
              ) : null}
              {isFinalStep() ? (
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? "Отправка..." : "Отправить заявку"}
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
