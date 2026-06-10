(function () {
  var scene = document.getElementById("fleetScene");
  if (!scene) return;
  var boats = scene.querySelectorAll(".fleet-boat");
  var cards = scene.querySelectorAll(".fleet-card");

  function clear() {
    scene.classList.remove("focus");
    boats.forEach(function (b) { b.classList.remove("on"); });
    cards.forEach(function (c) { c.classList.remove("show"); });
  }

  function activate(boat) {
    clear();
    scene.classList.add("focus");
    boat.classList.add("on");
    var card = document.getElementById(boat.dataset.card);
    if (card) card.classList.add("show");
  }

  boats.forEach(function (boat) {
    boat.addEventListener("mouseenter", function () { activate(boat); });
    boat.addEventListener("focus", function () { activate(boat); });
    boat.addEventListener("click", function (e) {
      e.stopPropagation();
      if (boat.classList.contains("on")) { clear(); } else { activate(boat); }
    });
    boat.addEventListener("mouseleave", clear);
    boat.addEventListener("blur", clear);
  });

  scene.addEventListener("click", clear);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") clear();
  });

  function specsLine(item) {
    var parts = [];
    if (item.length_m) parts.push("длина " + item.length_m + " м");
    if (item.sail_area) parts.push("парус " + item.sail_area + " м²");
    if (item.crew) parts.push("экипаж " + item.crew);
    return parts.join(" · ");
  }

  function fillCard(boat, item) {
    var card = document.getElementById(boat.dataset.card);
    if (!card) return;
    var kindEl = card.querySelector('[data-field="kind"]');
    var noteEl = card.querySelector('[data-field="note"]');
    var kind = item.kind || "";
    var specs = specsLine(item);
    if (kindEl && (kind || specs)) {
      kindEl.textContent = [kind, specs].filter(Boolean).join(" · ");
    }
    if (noteEl && item.note) noteEl.textContent = item.note;
  }

  fetch("/api/fleet")
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (list) {
      if (!Array.isArray(list) || !list.length) return;
      boats.forEach(function (boat) {
        var name = (boat.dataset.boat || "").toLowerCase();
        var item = list.find(function (f) {
          return (f.name || "").toLowerCase().indexOf(name) !== -1;
        });
        if (item) fillCard(boat, item);
      });
    })
    .catch(function () { /* нет сети или пустая БД — остаются дефолтные тексты */ });
})();
