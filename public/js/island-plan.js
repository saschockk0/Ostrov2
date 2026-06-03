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

  function makeIcon(item) {
    var color = CAT_COLORS[catOf(item)] || '#2980b9';
    return L.divIcon({
      className: '',
      html: '<div class="iplan-marker" style="background:' + color + '">' + numOf(item) + '</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }

  function popupHtml(item) {
    var html = '<div class="iplan-popup">';
    html += '<div class="iplan-popup__title">' + esc(numOf(item)) + '. ' + esc(item.name) + '</div>';
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
          '<span class="legend-badge" style="background:' + color + '">' + esc(numOf(item)) + '</span>' +
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
