(function () {
  var CAT_COLORS = {
    nav:      '#e67e22',
    infra:    '#2980b9',
    camp:     '#27ae60',
    food:     '#f39c12',
    safety:   '#e74c3c',
    leisure:  '#8e44ad',
    transfer: '#16a085',
  };

  var CAT_LABELS = {
    nav:      'Навигация',
    infra:    'Инфраструктура',
    camp:     'Жильё',
    food:     'Питание',
    safety:   'Безопасность',
    leisure:  'Отдых',
    transfer: 'Трансфер',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Лёгкая очистка HTML описания (его задаёт администратор в админке).
  function sanitize(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = String(html == null ? '' : html);
    tmp.querySelectorAll('script,style,iframe,object,embed,link').forEach(function (n) { n.remove(); });
    tmp.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var n = a.name.toLowerCase();
        if (n.indexOf('on') === 0) el.removeAttribute(a.name);
        if ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
      });
    });
    return tmp.innerHTML;
  }

  function catOf(item) { return item.category || item.cat || 'infra'; }
  function numOf(item) { return item.num != null ? item.num : item.id; }

  // Иконки — набор Lucide (https://lucide.dev, ISC-лицензия, открытый исходник),
  // встроены инлайном как SVG, чтобы не тянуть внешних зависимостей и не зависеть
  // от сети. Белый штрих на цветном круге категории.
  var ICONS = {
    anchor:   '<circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/>',
    flag:     '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    star:     '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    tent:     '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
    exit:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    stop:     '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
    lifebuoy: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>',
    flame:    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    box:      '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z"/>',
    droplet:  '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
    toilet:   '<path d="M7 12h10"/><path d="M7 12a5 5 0 0 0 5 5 5 5 0 0 0 5-5"/><path d="M9 12V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v7"/><path d="M10 17v4"/><path d="M14 17v4"/>',
    ship:     '<path d="M12 10.2V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.4 20A11.6 11.6 0 0 0 21 14l-8.2-3.6a2 2 0 0 0-1.6 0L3 14a11.6 11.6 0 0 0 2.8 7.8"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    compass:  '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/>',
    sparkles: '<path d="M9.94 14.06A2 2 0 0 0 8.5 12.62l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 8.5a2 2 0 0 0 1.44-1.44l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13A2 2 0 0 0 15.5 8.5l6.13 1.58a.5.5 0 0 1 0 .96L15.5 12.62a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/>',
  };

  // По умолчанию — иконка категории; ниже уточняем по названию элемента.
  var CAT_ICON = {
    nav: 'compass', infra: 'building', camp: 'tent',
    food: 'utensils', safety: 'lifebuoy', leisure: 'sparkles', transfer: 'ship',
  };

  function iconKeyFor(item) {
    var n = String(item.name || '').toLowerCase();
    if (/новомелково|паром|катер|трансфер/.test(n)) return 'ship';
    if (/причал/.test(n))            return 'anchor';
    if (/штаб/.test(n))              return 'flag';
    if (/boss|босс/.test(n))         return 'star';
    if (/шат[её]р|палатк/.test(n))   return 'tent';
    if (/выход/.test(n))             return 'exit';
    if (/стоп/.test(n))              return 'stop';
    if (/жилет|спас/.test(n))        return 'lifebuoy';
    if (/бан[яи]/.test(n))           return 'flame';
    if (/склад/.test(n))             return 'box';
    if (/кухн/.test(n))              return 'utensils';
    if (/вод[аы]/.test(n))           return 'droplet';
    if (/эверест|гор[аы]/.test(n))   return 'mountain';
    if (/туалет|wc/.test(n))         return 'toilet';
    return CAT_ICON[catOf(item)] || 'building';
  }

  function glyph(item, size) {
    var paths = ICONS[iconKeyFor(item)] || ICONS.building;
    return '<svg class="iplan-glyph" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + paths + '</svg>';
  }

  function makeIcon(item) {
    var color = CAT_COLORS[catOf(item)] || '#2980b9';
    return L.divIcon({
      className: '',
      html: '<div class="iplan-marker" style="background:' + color + '">' + glyph(item, 16) + '</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }

  function popupHtml(item) {
    var html = '<div class="iplan-popup">';
    html += '<div class="iplan-popup__title">' + esc(item.name) + '</div>';
    if (item.image_url) {
      html += '<img class="iplan-popup__img" src="' + esc(item.image_url) + '" alt="" loading="lazy">';
    }
    if (item.description) {
      html += '<div class="iplan-popup__desc">' + sanitize(item.description) + '</div>';
    }
    html += '</div>';
    return html;
  }

  function build(points) {
    var container = document.getElementById('island-map');
    if (!container || typeof L === 'undefined' || !points || !points.length) return;

    var map = L.map('island-map', { zoomControl: true });
    // Убираем флаг из стандартного префикса Leaflet, оставляя ссылку
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');

    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      attribution: 'Спутник © <a href="https://www.google.com/maps">Google</a>',
      maxZoom: 20,
    }).addTo(map);

    var markers = {};
    var group = L.featureGroup().addTo(map);

    points.forEach(function (item) {
      var marker = L.marker([item.lat, item.lng], { icon: makeIcon(item) })
        .addTo(group)
        .bindPopup(popupHtml(item), { maxWidth: 260 });
      markers[item.id != null ? item.id : numOf(item)] = { marker: marker, item: item };
    });

    // Кадрируем только по точкам острова — причал (transfer) лежит далеко
    // на материке и иначе «сплющил» бы весь лагерь в кучку.
    var islandLatLngs = points
      .filter(function (p) { return catOf(p) !== 'transfer'; })
      .map(function (p) { return [p.lat, p.lng]; });
    var islandBounds = islandLatLngs.length ? L.latLngBounds(islandLatLngs) : null;

    if (islandLatLngs.length > 1) {
      map.fitBounds(islandBounds.pad(0.2));
    } else if (points.length) {
      map.setView([points[0].lat, points[0].lng], 16);
    }

    var legendEl = document.getElementById('legend-grid');
    if (legendEl) {
      legendEl.innerHTML = '';
      points.forEach(function (item) {
        var color = CAT_COLORS[catOf(item)] || '#2980b9';
        var key = item.id != null ? item.id : numOf(item);
        var row = document.createElement('div');
        row.className = 'legend-item';
        row.title = CAT_LABELS[catOf(item)] || '';
        row.innerHTML =
          '<span class="legend-badge" style="background:' + color + '">' + glyph(item, 14) + '</span>' +
          '<span class="legend-name">' + esc(item.name) + '</span>';
        row.addEventListener('click', function () {
          var entry = markers[key];
          if (!entry) return;
          if (catOf(item) === 'transfer' && islandBounds) {
            // Причал на материке: показываем весь маршрут остров → точка сбора.
            var routeBounds = L.latLngBounds(islandBounds).extend([item.lat, item.lng]);
            map.flyToBounds(routeBounds.pad(0.15), { duration: 0.9 });
            setTimeout(function () { entry.marker.openPopup(); }, 950);
          } else {
            map.flyTo([item.lat, item.lng], 18, { duration: 0.8 });
            setTimeout(function () { entry.marker.openPopup(); }, 850);
          }
        });
        legendEl.appendChild(row);
      });
    }
  }

  function init() {
    var container = document.getElementById('island-map');
    if (!container || typeof L === 'undefined') return;

    // Сначала тянем точки из админ-БД, при ошибке/пустоте — статичный фолбэк.
    fetch('/api/map-points')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (Array.isArray(data) && data.length) build(data);
        else build(window.ISLAND_PLAN || []);
      })
      .catch(function () { build(window.ISLAND_PLAN || []); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
