/* Виджет погоды для деревни Видогощи (Конаковский р-н, Тверская обл.)
   Источник данных: Open-Meteo (бесплатно, без ключа). */
(function () {
  'use strict';

  var LAT = 56.70175;
  var LON = 36.38616;
  var API =
    'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + LAT +
    '&longitude=' + LON +
    '&current=temperature_2m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
    '&timezone=Europe%2FMoscow&forecast_days=7';

  // WMO weather codes -> emoji + краткое описание
  var CODES = {
    0:  ['☀️', 'Ясно'],
    1:  ['🌤️', 'Малооблачно'],
    2:  ['⛅', 'Переменно'],
    3:  ['☁️', 'Облачно'],
    45: ['🌫️', 'Туман'],
    48: ['🌫️', 'Изморозь'],
    51: ['🌦️', 'Морось'],
    53: ['🌦️', 'Морось'],
    55: ['🌦️', 'Морось'],
    56: ['🌧️', 'Морось'],
    57: ['🌧️', 'Морось'],
    61: ['🌧️', 'Дождь'],
    63: ['🌧️', 'Дождь'],
    65: ['🌧️', 'Ливень'],
    66: ['🌧️', 'Дождь'],
    67: ['🌧️', 'Дождь'],
    71: ['🌨️', 'Снег'],
    73: ['🌨️', 'Снег'],
    75: ['❄️', 'Снегопад'],
    77: ['🌨️', 'Снег'],
    80: ['🌦️', 'Ливни'],
    81: ['🌧️', 'Ливни'],
    82: ['⛈️', 'Ливень'],
    85: ['🌨️', 'Снег'],
    86: ['❄️', 'Снегопад'],
    95: ['⛈️', 'Гроза'],
    96: ['⛈️', 'Гроза'],
    99: ['⛈️', 'Гроза']
  };

  var WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  function describe(code) {
    return CODES[code] || ['🌡️', '—'];
  }

  function round(n) {
    return Math.round(n);
  }

  function fmtTemp(n) {
    var r = round(n);
    return (r > 0 ? '+' : '') + r + '°';
  }

  function render(data) {
    var list = document.getElementById('weatherDays');
    var nowEl = document.getElementById('weatherNow');
    if (!list || !data || !data.daily) return;

    if (nowEl && data.current) {
      var c = describe(data.current.weather_code);
      nowEl.textContent = c[0] + ' ' + fmtTemp(data.current.temperature_2m);
    }

    var d = data.daily;
    var html = '';
    for (var i = 0; i < d.time.length; i++) {
      var date = new Date(d.time[i] + 'T00:00:00');
      var label = i === 0 ? 'Сегодня' : WEEKDAYS[date.getDay()];
      var meta = describe(d.weather_code[i]);
      html +=
        '<li class="weather-day">' +
          '<span class="weather-day__name">' + label + '</span>' +
          '<span class="weather-day__icon" title="' + meta[1] + '">' + meta[0] + '</span>' +
          '<span class="weather-day__desc">' + meta[1] + '</span>' +
          '<span class="weather-day__temp">' +
            '<b>' + fmtTemp(d.temperature_2m_max[i]) + '</b>' +
            '<span class="weather-day__min">' + fmtTemp(d.temperature_2m_min[i]) + '</span>' +
          '</span>' +
        '</li>';
    }
    list.innerHTML = html;
  }

  function fail() {
    var list = document.getElementById('weatherDays');
    if (list) {
      list.innerHTML =
        '<li class="weather-widget__loading">Не удалось загрузить прогноз</li>';
    }
  }

  function load() {
    if (!document.getElementById('weatherDays')) return;
    fetch(API)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(render)
      .catch(fail);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
