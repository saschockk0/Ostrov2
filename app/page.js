"use client";

import { useState } from "react";
import { ApplicationWizard } from "../components/application-wizard";
import { LogoMark } from "../components/logo-mark";
import { QuickCalc } from "../components/quick-calc";

const FLEET = [
  { title: "Катамараны (вид 1)", text: "Стабильные и удобные для обучения и первых выходов." },
  { title: "Катамараны (вид 2)", text: "Более динамичный формат для уверенного катания и регат." },
  { title: "Лодка", text: "Сопровождение, трансфер и маршруты вокруг острова." },
  { title: "Плот", text: "Спокойные прогулки и атмосферные закатные программы." },
];

const EVENTS = [
  { title: "Регаты", text: "Командный формат с инструкторами, азартом и безопасной подготовкой." },
  { title: "Музыкальные вечера", text: "Ненавязчивая программа у воды для семей и компаний друзей." },
];

const FAQ = [
  {
    q: "Кому подходит формат отдыха?",
    a: "Семьям, компаниям друзей и небольшим корпоративным группам.",
  },
  {
    q: "Сколько занимает подтверждение заявки?",
    a: "Обычно до 15 минут в рабочее время. Финальные детали согласует менеджер.",
  },
  {
    q: "Можно приехать со своим снаряжением?",
    a: "Да, в опроснике можно выбрать только нужные услуги и не переплачивать за лишнее.",
  },
];

export default function HomePage() {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <header className="topbar">
        <div className="container topbar__inner">
          <LogoMark />
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            Рассчитать стоимость
          </button>
        </div>
      </header>

      <main>
        <section className="hero container reveal">
          <div className="hero__content">
            <p className="eyebrow">Референс сохранен, стиль обновлен</p>
            <h1>Современный парусный отдых на острове</h1>
            <p>
              Минималистичный интерфейс в фирменной синей гамме, быстрый путь к расчету и понятный
              сценарий заявки без лишних шагов.
            </p>
            <div className="hero__actions">
              <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
                Рассчитать стоимость
              </button>
              <a className="btn btn-ghost" href="#calculator">
                Быстрый калькулятор
              </a>
            </div>
          </div>
          <div className="hero__visual" role="img" aria-label="Паруса на воде" />
        </section>

        <section className="container section reveal">
          <div className="surface">
            <div className="section-head">
              <h2>О лагере</h2>
              <p>
                Формат рассчитан на новичков и опытных гостей: проживание, выходы на воду,
                инструкторы и вечерние активности на одном острове.
              </p>
            </div>
          </div>
        </section>

        <section className="container section reveal">
          <div className="section-head">
            <h2>Наш флот</h2>
          </div>
          <div className="cards-grid cards-grid--4">
            {FLEET.map((item) => (
              <article key={item.title} className="surface hover-rise">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="container section reveal">
          <div className="section-head">
            <h2>Мероприятия</h2>
          </div>
          <div className="cards-grid cards-grid--2">
            {EVENTS.map((item) => (
              <article key={item.title} className="surface hover-rise">
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="container section reveal">
          <div className="surface">
            <div className="section-head section-head--row">
              <h2>Мини-прайс</h2>
              <button className="btn btn-ghost" onClick={() => setWizardOpen(true)}>
                Рассчитать стоимость
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Услуга</th>
                    <th>Выходные</th>
                    <th>Будни</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Май, сентябрь (с чел./день)</td>
                    <td>3000 ₽</td>
                    <td>1300 ₽</td>
                  </tr>
                  <tr>
                    <td>Июнь (с чел./день)</td>
                    <td>4100 ₽</td>
                    <td>1300 ₽</td>
                  </tr>
                  <tr>
                    <td>Июль, август (с чел./день)</td>
                    <td>4700 ₽</td>
                    <td>1300 ₽</td>
                  </tr>
                  <tr>
                    <td>Дети 7-14 (с чел./день)</td>
                    <td>1500 ₽</td>
                    <td>700 ₽</td>
                  </tr>
                  <tr>
                    <td>Палатка 2-местная (в сутки)</td>
                    <td>700 ₽</td>
                    <td>350 ₽</td>
                  </tr>
                  <tr>
                    <td>Кухня-шатер Эверест (в сутки)</td>
                    <td>10000 ₽</td>
                    <td>4000 ₽</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <small>Выходные дни в расчетах: пятница, суббота, воскресенье.</small>
          </div>
        </section>

        <section className="container section reveal">
          <QuickCalc />
        </section>

        <section className="container section reveal">
          <div className="section-head">
            <h2>FAQ</h2>
          </div>
          <div className="faq-list">
            {FAQ.map((item) => (
              <details key={item.q} className="surface">
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="container section reveal">
          <div className="section-head">
            <h2>Фото, видео и отзывы</h2>
          </div>
          <div className="cards-grid cards-grid--3">
            <article className="surface media">Фото 1</article>
            <article className="surface media">Фото 2</article>
            <article className="surface media">Видео</article>
          </div>
          <div className="cards-grid cards-grid--2 mt-12">
            <blockquote className="surface">«Сильные эмоции, отличная организация, хотим вернуться летом.»</blockquote>
            <blockquote className="surface">«Очень комфортно для семьи: и активность, и спокойный отдых у воды.»</blockquote>
          </div>
        </section>

        <section className="container section reveal">
          <div className="surface">
            <div className="section-head">
              <h2>Как добраться</h2>
              <p>
                Ориентир: Конаково, ул. Пригородная 34А. Парковка доступна у отеля «Конаково Ривер
                Клаб» и на охраняемой стоянке по Юбилейной 6.
              </p>
            </div>
            <div className="map-wrap">
              <iframe
                title="Карта проезда"
                src="https://www.openstreetmap.org/export/embed.html?bbox=36.733%2C56.71%2C36.79%2C56.76&layer=mapnik"
                loading="lazy"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer__inner">
          <LogoMark />
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            Рассчитать стоимость
          </button>
        </div>
      </footer>

      <ApplicationWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </>
  );
}
