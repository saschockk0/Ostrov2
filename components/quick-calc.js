"use client";

import { useState } from "react";

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

export function QuickCalc() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const fd = new FormData(event.currentTarget);
      const payload = {
        adults: fd.get("adults"),
        children: fd.get("children"),
        arrivalDate: fd.get("arrivalDate"),
        departureDate: fd.get("departureDate"),
        perDay: {},
        fixed: {},
        storeTripPeople: 0,
      };

      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ошибка расчета");
      setResult(data);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface section" id="calculator">
      <div className="section-head">
        <h2>Калькулятор стоимости</h2>
        <p>Быстрый расчет перед заполнением полной заявки.</p>
      </div>
      <form className="calc-grid" onSubmit={onSubmit}>
        <label>
          Взрослые
          <input type="number" name="adults" min="1" defaultValue="2" required />
        </label>
        <label>
          Дети 7-14
          <input type="number" name="children" min="0" defaultValue="0" />
        </label>
        <label>
          Дата заезда
          <input type="date" name="arrivalDate" required />
        </label>
        <label>
          Дата выезда
          <input type="date" name="departureDate" required />
        </label>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? "Считаем..." : "Рассчитать"}
        </button>
      </form>

      {result ? (
        <div className="result-card">
          <p>
            Ночей: <strong>{result.nights}</strong>
          </p>
          <p>
            Предварительная стоимость: <strong>{money(result.total)}</strong>
          </p>
          <small>{result.disclaimer}</small>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
