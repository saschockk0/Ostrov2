/* Блок «Школа капитанов» — компас с 3 вариантами, стрелка указывает на выбранный */
(function () {
  "use strict";

  var PIVOT = { x: 600, y: 600 };
  // [угол наклона стрелки°, тег, описание, текст CTA]
  var OPTIONS = [
    { angle: -52, tag: "Есть опыт", desc: "Закрепим управление и выйдем на воду самостоятельно — с катамараном и инструктором рядом.", cta: "Хочу на практику" },
    { angle: 0, tag: "Новичок", desc: "Начнём с азов: теория на берегу и первый час на воде с инструктором.", cta: "Записаться на обучение" },
    { angle: 52, tag: "В команду", desc: "Тренировки экипажа и участие в регатах «Спасательный круг» и «Осенние ветры».", cta: "Хочу в команду" }
  ];

  var svgNS = "http://www.w3.org/2000/svg";
  var ticks = document.getElementById("ticks");
  var nums = document.getElementById("nums");
  var rings = document.getElementById("rings");
  var dial = document.getElementById("dial");
  var sweep = document.getElementById("sweep");
  var cardTag = document.getElementById("cardTag");
  var cardDesc = document.getElementById("cardDesc");
  var cardCta = document.getElementById("cardCta");
  var optEls = Array.prototype.slice.call(document.querySelectorAll(".opt"));
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce && dial) dial.style.transition = "none";

  // точка на окружности (θ — стандартный угол: 0=вправо, 90=вверх)
  function pt(theta, r) {
    var rad = (theta * Math.PI) / 180;
    return { x: PIVOT.x + r * Math.cos(rad), y: PIVOT.y - r * Math.sin(rad) };
  }

  // концентрические дуги-«радар»
  if (rings) {
    [430, 350, 270].forEach(function (r, i) {
      var a = pt(22, r), b = pt(158, r);
      var p = document.createElementNS(svgNS, "path");
      p.setAttribute("d", "M" + a.x.toFixed(1) + " " + a.y.toFixed(1) + " A " + r + " " + r + " 0 0 1 " + b.x.toFixed(1) + " " + b.y.toFixed(1));
      p.setAttribute("class", "ring");
      p.setAttribute("opacity", (0.16 - i * 0.035).toFixed(2));
      rings.appendChild(p);
    });
  }

  // градусная шкала
  var R_OUT = 470;
  if (ticks) {
    for (var theta = -46; theta <= 226; theta += 2) {
      var bearing = (90 - theta + 360) % 360;
      var major = bearing % 10 === 0;
      var rIn = major ? R_OUT - 26 : R_OUT - 13;
      var a1 = pt(theta, rIn), a2 = pt(theta, R_OUT);
      var ln = document.createElementNS(svgNS, "line");
      ln.setAttribute("x1", a1.x.toFixed(1)); ln.setAttribute("y1", a1.y.toFixed(1));
      ln.setAttribute("x2", a2.x.toFixed(1)); ln.setAttribute("y2", a2.y.toFixed(1));
      ln.setAttribute("class", major ? "tick tick--major" : "tick");
      ln.setAttribute("stroke-width", major ? "2.2" : "1");
      ln.setAttribute("opacity", major ? "0.95" : "0.45");
      ticks.appendChild(ln);

      if (bearing % 20 === 0) {
        var np = pt(theta, R_OUT - 46);
        var t = document.createElementNS(svgNS, "text");
        t.setAttribute("x", np.x.toFixed(1)); t.setAttribute("y", np.y.toFixed(1));
        t.setAttribute("class", "num");
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("dominant-baseline", "middle");
        t.setAttribute("transform", "rotate(" + (90 - theta).toFixed(1) + " " + np.x.toFixed(1) + " " + np.y.toFixed(1) + ")");
        t.textContent = bearing;
        nums.appendChild(t);
      }
    }
  }

  function runSweep() {
    if (!sweep || reduce) return;
    sweep.classList.remove("run");
    void sweep.getBoundingClientRect(); // перезапуск анимации
    sweep.classList.add("run");
  }

  var current = -1;
  function select(i) {
    var o = OPTIONS[i];
    if (i !== current) runSweep();
    current = i;
    if (dial) dial.style.transform = "rotate(" + o.angle + "deg)";
    if (cardTag) cardTag.textContent = o.tag;
    if (cardDesc) cardDesc.textContent = o.desc;
    if (cardCta) cardCta.textContent = o.cta;
    optEls.forEach(function (el) {
      el.classList.toggle("is-active", Number(el.dataset.opt) === i);
    });
  }

  var finePointer = window.matchMedia("(pointer: fine)").matches;
  optEls.forEach(function (el) {
    var i = Number(el.dataset.opt);
    // наведение курсора — роза поворачивает «север» к этому варианту
    if (finePointer) el.addEventListener("mouseenter", function () { select(i); });
    el.addEventListener("focus", function () { select(i); });
    el.addEventListener("click", function () { select(i); });
  });

  select(1); // по умолчанию — «Я новичок» (север вверх)
})();
