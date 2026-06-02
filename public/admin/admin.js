'use strict';

const BASE = '/ostrov-admin';

const STATUS_LABELS = {
  new: 'Новая', in_progress: 'В работе', confirmed: 'Подтверждена', rejected: 'Отказ',
};
const STATUS_ORDER = ['new', 'in_progress', 'confirmed', 'rejected'];

const SEASON_LABELS = {
  maySept: 'Май, Сентябрь', june: 'Июнь', julyAug: 'Июль–Август', child: 'Дети 7–14',
};

// ── State ─────────────────────────────────────────────────────────────────

let state = {
  view: 'loading',
  user: null,
  stats: null,
  apps: [], selectedApp: null,
  filters: { status: 'all', search: '' },
  events: [], selectedEvent: null, eventForm: null,
  fleet: [], fleetForm: null,
  prices: null, pricesDirty: false,
  content: null, contentLabels: null, contentDirty: false,
  gallery: [], galleryPhotoForm: null,
  showNewAppModal: false,
  saving: false, savingNote: false, noteText: '',
  error: null, successMsg: null,
};

function setState(patch) { Object.assign(state, patch); render(); }

// ── API ───────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function uploadFile(file) {
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch(BASE + '/api/upload', { method: 'POST', body: fd, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  catch { return iso; }
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}
function fmtMoney(n) { return n ? Number(n).toLocaleString('ru-RU') + ' ₽' : '0 ₽'; }
function statusBadge(s) { return `<span class="badge badge-${esc(s)}">${esc(STATUS_LABELS[s] || s)}</span>`; }

// ── Auth ──────────────────────────────────────────────────────────────────

async function init() {
  try {
    const me = await api('GET', '/api/me');
    setState({ view: 'dashboard', user: me });
    loadStats();
  } catch { setState({ view: 'login' }); }
}

async function doLogin(login, password) {
  try {
    await api('POST', '/api/login', { login, password });
    const me = await api('GET', '/api/me');
    setState({ view: 'dashboard', user: me, error: null });
    loadStats();
  } catch (err) { setState({ error: err.message }); }
}

async function doLogout() {
  await api('POST', '/api/logout').catch(() => {});
  setState({ view: 'login', user: null, apps: [], stats: null, selectedApp: null, events: [], fleet: [], fleetForm: null, prices: null, content: null, gallery: [], galleryPhotoForm: null });
}

// ── Loaders ───────────────────────────────────────────────────────────────

async function loadStats() {
  try { setState({ stats: await api('GET', '/api/stats') }); } catch { /* non-critical */ }
}

let searchTimer = null;
function scheduleSearch(val) {
  clearTimeout(searchTimer);
  state.filters.search = val;
  searchTimer = setTimeout(loadApps, 380);
}

async function loadApps() {
  const { status, search } = state.filters;
  const qs = new URLSearchParams();
  if (status && status !== 'all') qs.set('status', status);
  if (search) qs.set('search', search);
  try { setState({ apps: await api('GET', `/api/applications?${qs}`), view: 'applications' }); }
  catch (err) { setState({ error: err.message, view: 'applications', apps: [] }); }
}

async function loadEvents() {
  try { setState({ events: await api('GET', '/api/events'), view: 'events' }); }
  catch (err) { setState({ error: err.message, view: 'events', events: [] }); }
}

async function loadFleet() {
  try { setState({ fleet: await api('GET', '/api/fleet'), view: 'fleet' }); }
  catch (err) { setState({ error: err.message, view: 'fleet', fleet: [] }); }
}

async function loadPrices() {
  try { setState({ prices: await api('GET', '/api/prices'), view: 'prices' }); }
  catch (err) { setState({ error: err.message, view: 'prices' }); }
}

async function loadContent() {
  try {
    const [content, contentLabels] = await Promise.all([
      api('GET', '/api/content'), api('GET', '/api/content/labels'),
    ]);
    setState({ content, contentLabels, view: 'content' });
  } catch (err) { setState({ error: err.message, view: 'content' }); }
}

async function loadGallery() {
  try {
    const data = await api('GET', '/api/gallery');
    setState({ gallery: Array.isArray(data) ? data : [], view: 'gallery', error: null });
  }
  catch (err) { setState({ error: err.message, view: 'gallery', gallery: [] }); }
}

// ── Application actions ───────────────────────────────────────────────────

async function openApp(id) {
  try { setState({ selectedApp: await api('GET', `/api/applications/${id}`), noteText: '' }); }
  catch { /* ignore */ }
}

async function saveStatus(id, status) {
  try {
    const app = await api('PATCH', `/api/applications/${id}`, { status });
    setState({ apps: state.apps.map(a => a.id === id ? app : a), selectedApp: app });
    loadStats();
  } catch (err) { setState({ error: err.message }); }
}

async function saveNote(id) {
  setState({ savingNote: true });
  try {
    const app = await api('PATCH', `/api/applications/${id}`, { manager_note: state.noteText });
    setState({ apps: state.apps.map(a => a.id === id ? app : a), selectedApp: app, savingNote: false });
  } catch (err) { setState({ savingNote: false, error: err.message }); }
}

async function createApp(data) {
  try {
    let quote = { isValid: true, total: 0, nights: 0, breakdown: [] };
    if (data.answers?.arrivalDate && data.answers?.departureDate) {
      try { quote = await api('POST', '/api/quote', data.answers); } catch { /* use empty */ }
    }
    const app = await api('POST', '/api/applications', { ...data, quote });
    setState({ apps: [app, ...state.apps], showNewAppModal: false });
    loadStats(); openApp(app.id);
  } catch (err) { setState({ error: err.message }); }
}

// ── Event actions ─────────────────────────────────────────────────────────

function openEventForm(event = null) {
  setState({
    eventForm: event ? { ...event } : { title: '', description: '', date: '', end_date: '', image_url: '', kind: 'season', spots: '', active: true, sort_order: 0 },
    selectedEvent: event,
  });
}

async function saveEvent() {
  const f = state.eventForm;
  if (!f?.title) { setState({ error: 'Введите название мероприятия' }); return; }
  setState({ saving: true });
  try {
    let event;
    if (f.id) event = await api('PATCH', `/api/events/${f.id}`, f);
    else       event = await api('POST', '/api/events', f);
    const events = f.id ? state.events.map(e => e.id === f.id ? event : e) : [event, ...state.events];
    setState({ events, eventForm: null, selectedEvent: null, saving: false });
  } catch (err) { setState({ saving: false, error: err.message }); }
}

async function toggleEventActive(id, active) {
  try {
    const event = await api('PATCH', `/api/events/${id}`, { active });
    setState({ events: state.events.map(e => e.id === id ? event : e) });
  } catch (err) { setState({ error: err.message }); }
}

async function deleteEvent(id) {
  if (!confirm('Удалить мероприятие?')) return;
  try {
    await api('DELETE', `/api/events/${id}`);
    setState({ events: state.events.filter(e => e.id !== id), eventForm: null });
  } catch (err) { setState({ error: err.message }); }
}

// ── Fleet actions ─────────────────────────────────────────────────────────

function openFleetForm(item = null) {
  setState({
    fleetForm: item ? { ...item } : { name: '', kind: '', image_url: '', images: '', count: '', length_m: '', sail_area: '', crew: '', note: '', active: true, sort_order: 0 },
  });
}

async function saveFleetItem() {
  const f = state.fleetForm;
  if (!f?.name) { setState({ error: 'Введите название судна' }); return; }
  setState({ saving: true });
  try {
    let item;
    if (f.id) item = await api('PATCH', `/api/fleet/${f.id}`, f);
    else       item = await api('POST', '/api/fleet', f);
    const fleet = f.id ? state.fleet.map(e => e.id === f.id ? item : e) : [item, ...state.fleet];
    setState({ fleet, fleetForm: null, saving: false });
  } catch (err) { setState({ saving: false, error: err.message }); }
}

async function toggleFleetActive(id, active) {
  try {
    const item = await api('PATCH', `/api/fleet/${id}`, { active });
    setState({ fleet: state.fleet.map(e => e.id === id ? item : e) });
  } catch (err) { setState({ error: err.message }); }
}

async function deleteFleetItem(id) {
  if (!confirm('Удалить судно из флота?')) return;
  try {
    await api('DELETE', `/api/fleet/${id}`);
    setState({ fleet: state.fleet.filter(e => e.id !== id), fleetForm: null });
  } catch (err) { setState({ error: err.message }); }
}

// ── Prices actions ────────────────────────────────────────────────────────

function updatePriceField(section, key, field, value) {
  if (!state.prices[section] || !state.prices[section][key]) return;
  state.prices[section][key][field] = field === 'label' ? value : (Number(value) || 0);
  if (!state.pricesDirty) {
    state.pricesDirty = true;
    const header = document.querySelector('.page-header .page-actions');
    if (header && !header.querySelector('.dirty-hint')) {
      const hint = document.createElement('span');
      hint.className = 'dirty-hint';
      hint.style.cssText = 'color:var(--yellow);font-size:13px;align-self:center';
      hint.textContent = '● Есть несохранённые изменения';
      header.prepend(hint);
    }
  }
}

async function savePricesAction() {
  setState({ saving: true });
  try {
    const result = await api('PUT', '/api/prices', state.prices);
    setState({ prices: result.prices, pricesDirty: false, saving: false, successMsg: 'Цены сохранены' });
    setTimeout(() => setState({ successMsg: null }), 3000);
  } catch (err) { setState({ saving: false, error: err.message }); }
}

// ── Content actions ───────────────────────────────────────────────────────

function updateContentField(key, value) {
  state.content[key] = value;
  if (!state.contentDirty) {
    state.contentDirty = true;
    // Show unsaved indicator without full re-render
    const header = document.querySelector('.page-header .page-actions');
    if (header && !header.querySelector('.dirty-hint')) {
      const hint = document.createElement('span');
      hint.className = 'dirty-hint';
      hint.style.cssText = 'color:var(--yellow);font-size:13px;align-self:center';
      hint.textContent = '● Есть несохранённые изменения';
      header.prepend(hint);
    }
  }
}

async function saveContentAction() {
  setState({ saving: true });
  try {
    const result = await api('PUT', '/api/content', state.content);
    setState({ content: result.content, contentDirty: false, saving: false, successMsg: 'Контент сохранён' });
    setTimeout(() => setState({ successMsg: null }), 3000);
  } catch (err) { setState({ saving: false, error: err.message }); }
}

// ── Gallery actions ───────────────────────────────────────────────────────

function openGalleryPhotoForm(photo = null) {
  setState({
    galleryPhotoForm: photo
      ? { ...photo }
      : { url: '', caption: '', active: true, sort_order: 0 },
  });
}

async function saveGalleryPhoto() {
  const f = state.galleryPhotoForm;
  if (!f?.url) { setState({ error: 'Загрузите фото или укажите URL' }); return; }
  setState({ saving: true });
  try {
    let photo;
    if (f.id) photo = await api('PATCH', `/api/gallery/${f.id}`, f);
    else       photo = await api('POST', '/api/gallery', f);
    const current = Array.isArray(state.gallery) ? state.gallery : [];
    const gallery = f.id
      ? current.map(p => p.id === f.id ? photo : p)
      : [photo, ...current];
    setState({ gallery, galleryPhotoForm: null, saving: false, error: null });
  } catch (err) { setState({ saving: false, error: err.message }); }
}

async function togglePhotoActive(id, active) {
  try {
    const photo = await api('PATCH', `/api/gallery/${id}`, { active });
    const current = Array.isArray(state.gallery) ? state.gallery : [];
    setState({ gallery: current.map(p => p.id === id ? photo : p) });
  } catch (err) { setState({ error: err.message }); }
}

async function deleteGalleryPhoto(id) {
  if (!confirm('Удалить фото из галереи?')) return;
  try {
    await api('DELETE', `/api/gallery/${id}`);
    const current = Array.isArray(state.gallery) ? state.gallery : [];
    setState({ gallery: current.filter(p => p.id !== id), galleryPhotoForm: null });
  } catch (err) { setState({ error: err.message }); }
}

// ── Render ────────────────────────────────────────────────────────────────

function render() {
  const root = document.getElementById('app');
  if (!root) return;
  if (state.view === 'loading') { root.innerHTML = `<div class="loading"><div class="spinner"></div>Загрузка...</div>`; return; }
  if (state.view === 'login')   { root.innerHTML = renderLoginPage(); attachLoginHandlers(); return; }
  root.innerHTML = renderShell();
  attachShellHandlers();
}

function renderLoginPage() {
  return `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">⛵</div>
        <h1>Остров — Администратор</h1>
        ${state.error ? `<div class="login-error">${esc(state.error)}</div>` : '<div class="login-error"></div>'}
        <form id="login-form">
          <div class="field" style="margin-bottom:14px"><label>Логин</label><input id="li" type="text" name="login" autocomplete="username" autofocus></div>
          <div class="field" style="margin-bottom:20px"><label>Пароль</label><input id="pw" type="password" name="password" autocomplete="current-password"></div>
          <button type="submit" class="btn btn-primary btn-full">Войти</button>
        </form>
      </div>
    </div>`;
}

function renderShell() {
  const { view, stats } = state;
  const newCount = stats?.new || 0;
  const navItem = (v, label, badge = '') => {
    const active = view === v ? ' active' : '';
    return `<div class="nav-item${active}" data-nav="${v}">${label}${badge}</div>`;
  };
  const badgeHtml = newCount ? `<span class="nav-badge">${newCount}</span>` : '';

  let content = '';
  if      (view === 'dashboard')    content = renderDashboard();
  else if (view === 'applications') content = renderApplicationsList();
  else if (view === 'events')       content = renderEventsView();
  else if (view === 'fleet')        content = renderFleetView();
  else if (view === 'prices')       content = renderPricesView();
  else if (view === 'content')      content = renderContentView();
  else if (view === 'gallery')      content = renderGalleryView();

  const drawerHtml   = state.selectedApp ? renderAppDrawer(state.selectedApp) : '';
  const drawerOpen   = state.selectedApp ? ' open' : '';
  const overlayOpen  = state.selectedApp ? ' open' : '';
  const eventModal        = state.eventForm        ? renderEventModal()       : '';
  const fleetModal        = state.fleetForm         ? renderFleetModal()       : '';
  const newAppModal       = state.showNewAppModal  ? renderNewAppModal()      : '';
  const galleryPhotoModal = state.galleryPhotoForm ? renderGalleryPhotoModal() : '';

  return `
    <div class="layout">
      <header class="header">
        <div class="header-logo">⛵ Остров <span>Панель управления</span></div>
        <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3)" id="logout-btn">Выйти</button>
      </header>
      <div class="layout-body">
        <nav class="sidebar">
          ${navItem('dashboard',    'Дашборд')}
          ${navItem('applications', 'Заявки', badgeHtml)}
          ${navItem('events',       'Мероприятия')}
          ${navItem('fleet',        'Флот')}
          ${navItem('prices',       'Цены')}
          ${navItem('content',      'Контент')}
          ${navItem('gallery',      'Галерея')}
        </nav>
        <main class="content" id="content-area">
          ${state.error   ? `<div class="alert alert-error" style="margin-bottom:16px">${esc(state.error)} <span style="cursor:pointer;float:right" data-clear-error>✕</span></div>` : ''}
          ${state.successMsg ? `<div class="alert alert-success" style="margin-bottom:16px">${esc(state.successMsg)}</div>` : ''}
          ${content}
        </main>
      </div>
    </div>
    <div class="drawer-overlay${overlayOpen}" id="drawer-overlay"></div>
    <aside class="detail-drawer${drawerOpen}" id="detail-drawer">${drawerHtml}</aside>
    ${eventModal}${fleetModal}${newAppModal}${galleryPhotoModal}`;
}

// ── Dashboard ─────────────────────────────────────────────────────────────

function renderDashboard() {
  const s = state.stats;
  const stat = (val, label, mod = '') =>
    `<div class="stat-card${mod}"><div class="stat-value">${val ?? '—'}</div><div class="stat-label">${label}</div></div>`;
  return `
    <div>
      <div class="page-header"><h2>Дашборд</h2></div>
      <div class="stats-grid">
        ${stat(s?.total, 'Всего заявок')}
        ${stat(s?.new, 'Новых', ' stat-card--blue')}
        ${stat(s?.in_progress, 'В работе', ' stat-card--yellow')}
        ${stat(s?.confirmed, 'Подтверждено', ' stat-card--green')}
        ${stat(s?.confirmedRevenue ? fmtMoney(s.confirmedRevenue) : '0 ₽', 'Выручка (подтв.)', ' stat-card--green')}
        ${stat(s?.rejected, 'Отказов', ' stat-card--red')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" data-nav="applications">Заявки →</button>
        <button class="btn btn-secondary" data-nav="events">Мероприятия →</button>
        <button class="btn btn-secondary" data-nav="prices">Цены →</button>
        <button class="btn btn-secondary" data-nav="content">Контент →</button>
      </div>
    </div>`;
}

// ── Applications ──────────────────────────────────────────────────────────

function renderApplicationsList() {
  const { apps, filters, stats } = state;
  const filterBtn = (st, label) => {
    const cnt = st === 'all' ? (stats?.total || '') : (stats?.[st] || '');
    const active = filters.status === st ? ' active' : '';
    return `<button class="filter-btn${active}" data-status-filter="${st}">${label}${cnt ? ` <span class="cnt">${cnt}</span>` : ''}</button>`;
  };
  const rows = apps.length ? apps.map(a => {
    const arr = a.answers?.arrivalDate ? fmtDate(a.answers.arrivalDate) : '—';
    const guests = ((a.answers?.adults || 0) + (a.answers?.children || 0)) || '—';
    return `<tr>
      <td style="color:var(--muted);font-size:12px">#${a.id}</td>
      <td class="created-at">${fmtDate(a.created_at)}</td>
      <td><strong>${esc(a.name)}</strong></td>
      <td><a class="phone-link" href="tel:${esc(a.phone)}">${esc(a.phone)}</a></td>
      <td>${arr}</td><td style="text-align:center">${guests}</td>
      <td style="text-align:right;font-weight:600">${fmtMoney(a.quote?.total)}</td>
      <td>${statusBadge(a.status)}</td>
      <td><button class="btn btn-sm btn-secondary" data-open-app="${a.id}">Открыть</button></td>
    </tr>`;
  }).join('') : `<tr><td class="table-empty" colspan="9">Заявок не найдено</td></tr>`;

  return `
    <div>
      <div class="page-header"><h2>Заявки</h2>
        <div class="page-actions">
          <button class="btn btn-primary" id="new-app-btn">+ Добавить</button>
          <a class="btn btn-secondary" href="${BASE}/api/applications/export.csv${filters.status !== 'all' ? '?status=' + filters.status : ''}">↓ CSV</a>
        </div>
      </div>
      <div class="filter-bar">
        <div class="status-filters">
          ${filterBtn('all','Все')}${filterBtn('new','Новые')}${filterBtn('in_progress','В работе')}${filterBtn('confirmed','Подтверждены')}${filterBtn('rejected','Отказ')}
        </div>
        <input class="search-input" type="search" placeholder="Поиск по имени / телефону" value="${esc(filters.search)}" id="search-input">
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>#</th><th>Дата</th><th>Имя</th><th>Телефон</th><th>Приезд</th><th>Гостей</th><th>Сумма</th><th>Статус</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function renderAppDrawer(app) {
  const answers = app.answers || {}, quote = app.quote || {};
  const infoRow = (l, v) => `<div class="info-row"><div class="info-label">${l}</div><div class="info-value">${v}</div></div>`;
  const breakdownRows = (quote.breakdown || []).map(b =>
    `<tr><td>${esc(b.label)}</td><td class="amount">${fmtMoney(b.amount)}</td></tr>`).join('');
  const statusBtns = STATUS_ORDER.map(s => {
    const active = app.status === s ? ` active-${s}` : '';
    return `<button class="status-btn${active}" data-set-status="${s}">${esc(STATUS_LABELS[s])}</button>`;
  }).join('');
  return `
    <div class="drawer-head">
      <button class="btn-icon" id="close-drawer">←</button>
      <h3>Заявка #${app.id}</h3>${statusBadge(app.status)}
    </div>
    <div class="drawer-body">
      <div class="info-section"><h4>Контакт</h4>
        <div class="info-grid">
          ${infoRow('Имя', esc(app.name))}
          ${infoRow('Телефон', `<a class="phone-link" href="tel:${esc(app.phone)}">${esc(app.phone)}</a>`)}
          ${infoRow('Мессенджер', esc(app.messenger) || '—')}
          ${infoRow('Email', app.email ? `<a class="phone-link" href="mailto:${esc(app.email)}">${esc(app.email)}</a>` : '—')}
          ${infoRow('Дата заявки', fmtDateTime(app.created_at))}
        </div>
        ${app.comment ? `<div style="margin-top:10px"><div class="info-label">Комментарий</div><div class="comment-text">${esc(app.comment)}</div></div>` : ''}
      </div>
      ${answers.arrivalDate ? `
      <div class="info-section"><h4>Поездка</h4>
        <div class="info-grid">
          ${infoRow('Приезд',  fmtDate(answers.arrivalDate))}
          ${infoRow('Отъезд',  fmtDate(answers.departureDate))}
          ${infoRow('Взрослых', answers.adults ?? '—')}
          ${infoRow('Детей',   answers.children ?? '—')}
          ${infoRow('Ночей',   quote.nights ?? '—')}
        </div>
      </div>` : ''}
      ${breakdownRows ? `
      <div class="info-section"><h4>Расчёт</h4>
        <table class="breakdown-table"><tbody>${breakdownRows}</tbody></table>
        <div class="breakdown-total"><span>Итого</span><span>${fmtMoney(quote.total)}</span></div>
      </div>` : ''}
      <div class="info-section"><h4>Статус</h4>
        <div class="status-buttons">${statusBtns}</div>
      </div>
      <div class="info-section"><h4>Заметка менеджера</h4>
        <textarea class="note-textarea" id="note-textarea" placeholder="Добавьте заметку...">${esc(state.noteText !== undefined ? state.noteText : (app.manager_note || ''))}</textarea>
        <div class="note-actions">
          <button class="btn btn-secondary btn-sm" id="save-note-btn" ${state.savingNote ? 'disabled' : ''}>${state.savingNote ? 'Сохранение...' : 'Сохранить заметку'}</button>
        </div>
      </div>
    </div>`;
}

// ── Events ────────────────────────────────────────────────────────────────

function renderEventsView() {
  const { events } = state;
  const KIND_LABELS = { regatta: 'Регата', school: 'Школа', promo: 'Акция', corp: 'Корп.', season: 'Сезон' };
  const rows = events.length ? events.map(e => `
    <tr>
      <td>${esc(e.title)}</td>
      <td><span class="badge" style="background:#e8f0fe;color:#1a56db">${esc(KIND_LABELS[e.kind] || e.kind || 'Сезон')}</span></td>
      <td>${e.date ? fmtDate(e.date) : '—'}${e.end_date ? ' — ' + fmtDate(e.end_date) : ''}</td>
      <td>${esc(e.spots || '—')}</td>
      <td><span class="badge ${e.active ? 'badge-confirmed' : 'badge-rejected'}">${e.active ? 'Активно' : 'Скрыто'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" data-edit-event="${e.id}">Изменить</button>
        <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)" data-toggle-event="${e.id}" data-active="${e.active ? 0 : 1}">${e.active ? 'Скрыть' : 'Показать'}</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none" data-delete-event="${e.id}">✕</button>
      </td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="7">Мероприятий нет</td></tr>`;

  return `
    <div>
      <div class="page-header"><h2>Мероприятия</h2>
        <button class="btn btn-primary" id="add-event-btn">+ Добавить</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Название</th><th>Тип</th><th>Дата</th><th>Места</th><th>Статус</th><th>Действия</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function renderEventModal() {
  const f = state.eventForm;
  const isEdit = !!f.id;
  return `
    <div class="modal-overlay" id="event-modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? 'Редактировать' : 'Новое'} мероприятие</h3><button class="btn-icon" id="close-event-modal">✕</button></div>
        <div class="modal-body">
          ${state.error ? `<div class="alert alert-error">${esc(state.error)}</div>` : ''}
          <div class="field"><label>Название *</label><input id="ef-title" type="text" value="${esc(f.title)}"></div>
          <div class="field"><label>Описание</label><textarea id="ef-desc" rows="3">${esc(f.description)}</textarea></div>
          <div class="fields-row">
            <div class="field"><label>Тип</label>
              <select id="ef-kind">
                <option value="season" ${f.kind === 'season' ? 'selected' : ''}>Сезон</option>
                <option value="regatta" ${f.kind === 'regatta' ? 'selected' : ''}>Регата</option>
                <option value="school" ${f.kind === 'school' ? 'selected' : ''}>Школа / Сборы</option>
                <option value="promo" ${f.kind === 'promo' ? 'selected' : ''}>Акция</option>
                <option value="corp" ${f.kind === 'corp' ? 'selected' : ''}>Корпоратив</option>
              </select>
            </div>
            <div class="field"><label>Места / статус</label><input id="ef-spots" type="text" value="${esc(f.spots || '')}" placeholder="напр. 3 места, набор открыт"></div>
          </div>
          <div class="fields-row">
            <div class="field"><label>Дата начала</label><input id="ef-date" type="date" value="${esc(f.date || '')}"></div>
            <div class="field"><label>Дата конца</label><input id="ef-enddate" type="date" value="${esc(f.end_date || '')}"></div>
          </div>
          <div class="field">
            <label>Изображение</label>
            <div style="display:flex;gap:8px;align-items:flex-end">
              <input id="ef-image" type="text" value="${esc(f.image_url || '')}" placeholder="/images/uploads/photo.jpg" style="flex:1">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">
                Загрузить<input type="file" id="ef-file" accept="image/*" style="display:none">
              </label>
            </div>
            ${f.image_url ? `<img src="${esc(f.image_url)}" style="margin-top:8px;max-height:100px;border-radius:6px;object-fit:cover">` : ''}
          </div>
          <div class="fields-row">
            <div class="field"><label>Порядок сортировки</label><input id="ef-order" type="number" value="${f.sort_order || 0}"></div>
            <div class="field"><label>Статус</label>
              <select id="ef-active">
                <option value="1" ${f.active ? 'selected' : ''}>Активно</option>
                <option value="0" ${!f.active ? 'selected' : ''}>Скрыто</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${isEdit ? `<button class="btn btn-danger" id="delete-event-btn">Удалить</button>` : ''}
          <button class="btn btn-secondary" id="cancel-event-modal">Отмена</button>
          <button class="btn btn-primary" id="save-event-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>`;
}

// ── Fleet ─────────────────────────────────────────────────────────────────

function renderFleetView() {
  const { fleet } = state;
  const rows = fleet.length ? fleet.map(e => `
    <tr>
      <td>${e.image_url ? `<img src="${esc(e.image_url)}" style="height:36px;width:52px;border-radius:4px;object-fit:cover">` : '<span style="color:var(--muted)">—</span>'}</td>
      <td><strong>${esc(e.name)}</strong></td>
      <td>${esc(e.kind || '—')}</td>
      <td style="text-align:center">${esc(e.count || '—')}</td>
      <td>${esc(e.length_m || '—')}</td>
      <td>${esc(e.sail_area || '—')}</td>
      <td>${esc(e.crew || '—')}</td>
      <td><span class="badge ${e.active ? 'badge-confirmed' : 'badge-rejected'}">${e.active ? 'Активно' : 'Скрыто'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" data-edit-fleet="${e.id}">Изменить</button>
        <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)" data-toggle-fleet="${e.id}" data-fleet-active="${e.active ? 0 : 1}">${e.active ? 'Скрыть' : 'Показать'}</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none" data-delete-fleet="${e.id}">✕</button>
      </td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="9">Флот пуст. Добавьте первое судно.</td></tr>`;

  return `
    <div>
      <div class="page-header"><h2>Флот</h2>
        <button class="btn btn-primary" id="add-fleet-btn">+ Добавить судно</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Фото</th><th>Название</th><th>Тип</th><th>Кол-во</th><th>Длина</th><th>Парусность</th><th>Экипаж</th><th>Статус</th><th>Действия</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function renderFleetModal() {
  const f = state.fleetForm;
  const isEdit = !!f.id;
  return `
    <div class="modal-overlay" id="fleet-modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? 'Редактировать' : 'Новое'} судно</h3><button class="btn-icon" id="close-fleet-modal">✕</button></div>
        <div class="modal-body">
          ${state.error ? `<div class="alert alert-error">${esc(state.error)}</div>` : ''}
          <div class="fields-row">
            <div class="field"><label>Название *</label><input id="ff-name" type="text" value="${esc(f.name)}" placeholder="«Ветер»"></div>
            <div class="field"><label>Тип</label><input id="ff-kind" type="text" value="${esc(f.kind)}" placeholder="Парусный катамаран"></div>
          </div>
          <div class="field">
            <label>Фотография</label>
            <div style="display:flex;gap:8px;align-items:flex-end">
              <input id="ff-image" type="text" value="${esc(f.image_url || '')}" placeholder="/images/fleet/photo.jpg" style="flex:1">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">
                Загрузить<input type="file" id="ff-file" accept="image/*" style="display:none">
              </label>
            </div>
            ${f.image_url ? `<img src="${esc(f.image_url)}" style="margin-top:8px;max-height:80px;border-radius:6px;object-fit:cover">` : ''}
          </div>
          <div class="field">
            <label>Доп. фото (по одному URL на строку)</label>
            <textarea id="ff-images" rows="3" placeholder="/images/fleet/veter-2.jpg&#10;/images/fleet/veter-3.jpg">${esc(f.images || '')}</textarea>
          </div>
          <div class="fields-row">
            <div class="field"><label>Количество</label><input id="ff-count" type="text" value="${esc(f.count || '')}" placeholder="×10"></div>
            <div class="field"><label>Длина</label><input id="ff-length" type="text" value="${esc(f.length_m || '')}" placeholder="5,0 м"></div>
          </div>
          <div class="fields-row">
            <div class="field"><label>Парусность / мощность</label><input id="ff-sail" type="text" value="${esc(f.sail_area || '')}" placeholder="10 м²"></div>
            <div class="field"><label>Экипаж</label><input id="ff-crew" type="text" value="${esc(f.crew || '')}" placeholder="2–4 чел."></div>
          </div>
          <div class="field"><label>Примечание</label><textarea id="ff-note" rows="2">${esc(f.note || '')}</textarea></div>
          <div class="fields-row">
            <div class="field"><label>Порядок сортировки</label><input id="ff-order" type="number" value="${f.sort_order || 0}"></div>
            <div class="field"><label>Статус</label>
              <select id="ff-active">
                <option value="1" ${f.active ? 'selected' : ''}>Активно</option>
                <option value="0" ${!f.active ? 'selected' : ''}>Скрыто</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${isEdit ? `<button class="btn btn-danger" id="delete-fleet-btn">Удалить</button>` : ''}
          <button class="btn btn-secondary" id="cancel-fleet-modal">Отмена</button>
          <button class="btn btn-primary" id="save-fleet-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>`;
}

// ── Prices ────────────────────────────────────────────────────────────────

function renderPricesView() {
  if (!state.prices) return `<div class="loading"><div class="spinner"></div>Загрузка цен...</div>`;
  const { seasonalStayRates, perDayItems, fixedItems } = state.prices;

  const stayRows = Object.entries(SEASON_LABELS).map(([key, label]) => {
    const r = seasonalStayRates[key] || {};
    return `<tr>
      <td>${label}</td>
      <td><input class="price-input" type="number" min="0" data-section="seasonalStayRates" data-key="${key}" data-field="weekend" value="${r.weekend ?? 0}"></td>
      <td><input class="price-input" type="number" min="0" data-section="seasonalStayRates" data-key="${key}" data-field="weekday" value="${r.weekday ?? 0}"></td>
    </tr>`;
  }).join('');

  const perDayRows = Object.entries(perDayItems).map(([key, item]) => `<tr>
    <td><input class="label-input" type="text" data-section="perDayItems" data-key="${key}" data-field="label" value="${esc(item.label)}"></td>
    <td><input class="price-input" type="number" min="0" data-section="perDayItems" data-key="${key}" data-field="weekend" value="${item.weekend ?? 0}"></td>
    <td><input class="price-input" type="number" min="0" data-section="perDayItems" data-key="${key}" data-field="weekday" value="${item.weekday ?? 0}"></td>
  </tr>`).join('');

  const fixedRows = Object.entries(fixedItems).map(([key, item]) => `<tr>
    <td><input class="label-input" type="text" data-section="fixedItems" data-key="${key}" data-field="label" value="${esc(item.label)}"></td>
    <td colspan="2"><input class="price-input" type="number" min="0" data-section="fixedItems" data-key="${key}" data-field="price" value="${item.price ?? 0}"></td>
  </tr>`).join('');

  return `
    <div>
      <div class="page-header"><h2>Цены</h2>
        <div class="page-actions">
          ${state.pricesDirty ? '<span style="color:var(--yellow);font-size:13px;align-self:center">● Есть несохранённые изменения</span>' : ''}
          <button class="btn btn-primary" id="save-prices-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить цены'}</button>
        </div>
      </div>
      <div class="prices-grid">
        <div class="price-section">
          <h3 class="price-section-title">Проживание (₽ / ночь)</h3>
          <div class="table-wrap">
            <table><thead><tr><th>Период</th><th>Выходные</th><th>Будни</th></tr></thead>
            <tbody>${stayRows}</tbody></table>
          </div>
        </div>
        <div class="price-section">
          <h3 class="price-section-title">Аренда посуточно (₽ / ед.)</h3>
          <div class="table-wrap">
            <table><thead><tr><th>Позиция</th><th>Выходные</th><th>Будни</th></tr></thead>
            <tbody>${perDayRows}</tbody></table>
          </div>
        </div>
        <div class="price-section">
          <h3 class="price-section-title">Разовые услуги (₽)</h3>
          <div class="table-wrap">
            <table><thead><tr><th>Услуга</th><th colspan="2">Цена</th></tr></thead>
            <tbody>${fixedRows}</tbody></table>
          </div>
        </div>
      </div>
    </div>`;
}

// ── Content ───────────────────────────────────────────────────────────────

function renderContentView() {
  if (!state.content) return `<div class="loading"><div class="spinner"></div>Загрузка...</div>`;
  const labels = state.contentLabels || {};
  const fields = Object.entries(state.content).map(([key, value]) => {
    const label = labels[key] || key;
    const rows = Math.max(2, Math.min(12, Math.ceil(String(value).length / 70)));
    return `
      <div class="field">
        <label>${esc(label)} <span class="html-badge">HTML</span></label>
        <textarea class="content-field content-field--code" data-key="${key}" rows="${rows}">${esc(value)}</textarea>
      </div>`;
  }).join('');

  return `
    <div>
      <div class="page-header"><h2>Контент сайта</h2>
        <div class="page-actions">
          ${state.contentDirty ? '<span style="color:var(--yellow);font-size:13px;align-self:center">● Есть несохранённые изменения</span>' : ''}
          <button class="btn btn-primary" id="save-content-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить контент'}</button>
        </div>
      </div>
      <p class="content-html-hint">Во всех полях поддерживается HTML — можно вставлять <code>&lt;a href="..."&gt;ссылку&lt;/a&gt;</code>, <code>&lt;strong&gt;</code>, <code>&lt;em&gt;</code> и другие теги.</p>
      <div class="content-editor">${fields}</div>
    </div>`;
}

// ── Gallery ───────────────────────────────────────────────────────────────

function renderGalleryView() {
  const gallery = Array.isArray(state.gallery) ? state.gallery : [];
  const activeCount = gallery.filter(p => p.active).length;

  const cards = gallery.length ? gallery.map(p => `
    <div class="gallery-admin-card">
      <div class="gallery-admin-card__thumb">
        <img src="${esc(p.url)}" alt="${esc(p.caption)}" loading="lazy">
      </div>
      <div class="gallery-admin-card__body">
        <div class="gallery-admin-card__caption">${esc(p.caption) || '<em style="color:var(--muted)">без подписи</em>'}</div>
        <div class="gallery-admin-card__meta">
          <span class="badge ${p.active ? 'badge-confirmed' : 'badge-rejected'}">${p.active ? 'Активно' : 'Скрыто'}</span>
          <span style="font-size:12px;color:var(--muted)">порядок: ${p.sort_order}</span>
        </div>
        <div class="gallery-admin-card__actions">
          <button class="btn btn-sm btn-secondary" data-edit-photo="${p.id}">Изменить</button>
          <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)" data-toggle-photo="${p.id}" data-photo-active="${p.active ? 0 : 1}">${p.active ? 'Скрыть' : 'Показать'}</button>
          <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none" data-delete-photo="${p.id}">✕</button>
        </div>
      </div>
    </div>`).join('') : '<p style="color:var(--muted);margin-top:16px">Фотографий пока нет. Добавьте первое фото.</p>';

  return `
    <div>
      <div class="page-header">
        <h2>Галерея <span style="font-size:14px;font-weight:400;color:var(--muted)">(${activeCount} из ${gallery.length} показываются)</span></h2>
        <button class="btn btn-primary" id="add-photo-btn">+ Добавить фото</button>
      </div>
      <div class="gallery-admin-grid">${cards}</div>
    </div>`;
}

function renderGalleryPhotoModal() {
  const f = state.galleryPhotoForm;
  const isEdit = !!f.id;
  return `
    <div class="modal-overlay" id="gallery-modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? 'Редактировать фото' : 'Добавить фото'}</h3><button class="btn-icon" id="close-gallery-modal">✕</button></div>
        <div class="modal-body">
          ${state.error ? `<div class="alert alert-error">${esc(state.error)}</div>` : ''}
          <div class="field">
            <label>Фотография</label>
            <div style="display:flex;gap:8px;align-items:flex-end">
              <input id="gf-url" type="text" value="${esc(f.url || '')}" placeholder="/images/uploads/photo.jpg" style="flex:1">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">
                Загрузить<input type="file" id="gf-file" accept="image/*" style="display:none">
              </label>
            </div>
            ${f.url ? `<img src="${esc(f.url)}" style="margin-top:10px;max-height:140px;border-radius:8px;object-fit:cover;display:block">` : ''}
          </div>
          <div class="field"><label>Подпись</label><input id="gf-caption" type="text" value="${esc(f.caption || '')}" placeholder="Регата 2024 — закат"></div>
          <div class="fields-row">
            <div class="field"><label>Порядок сортировки</label><input id="gf-order" type="number" value="${f.sort_order ?? 0}"></div>
            <div class="field"><label>Статус</label>
              <select id="gf-active">
                <option value="1" ${f.active ? 'selected' : ''}>Показывать</option>
                <option value="0" ${!f.active ? 'selected' : ''}>Скрыть</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${isEdit ? `<button class="btn btn-danger" id="delete-photo-btn">Удалить</button>` : ''}
          <button class="btn btn-secondary" id="cancel-gallery-modal">Отмена</button>
          <button class="btn btn-primary" id="save-gallery-photo-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>`;
}

// ── New App Modal ─────────────────────────────────────────────────────────

function renderNewAppModal() {
  return `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>Новая заявка</h3><button class="btn-icon" id="close-modal">✕</button></div>
        <div class="modal-body">
          ${state.error ? `<div class="alert alert-error">${esc(state.error)}</div>` : ''}
          <div class="fields-row">
            <div class="field"><label>Имя *</label><input id="m-name" type="text"></div>
            <div class="field"><label>Телефон *</label><input id="m-phone" type="tel"></div>
          </div>
          <div class="fields-row">
            <div class="field"><label>Мессенджер</label>
              <select id="m-messenger"><option value="">—</option><option>WhatsApp</option><option>Telegram</option><option>Viber</option></select>
            </div>
            <div class="field"><label>Email</label><input id="m-email" type="email"></div>
          </div>
          <div class="fields-row">
            <div class="field"><label>Тип</label><select id="m-type"><option value="individual">Частное лицо</option><option value="group">Группа</option></select></div>
            <div class="field"><label>Статус</label><select id="m-status">${STATUS_ORDER.map(s => `<option value="${s}">${STATUS_LABELS[s]}</option>`).join('')}</select></div>
          </div>
          <div class="fields-row">
            <div class="field"><label>Приезд</label><input id="m-arrival" type="date"></div>
            <div class="field"><label>Отъезд</label><input id="m-departure" type="date"></div>
          </div>
          <div class="fields-row">
            <div class="field"><label>Взрослых</label><input id="m-adults" type="number" min="0" value="2"></div>
            <div class="field"><label>Детей</label><input id="m-children" type="number" min="0" value="0"></div>
          </div>
          <div class="field"><label>Комментарий</label><textarea id="m-comment" rows="2"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="cancel-modal">Отмена</button>
          <button class="btn btn-primary" id="submit-modal">Создать заявку</button>
        </div>
      </div>
    </div>`;
}

// ── Event Handlers ────────────────────────────────────────────────────────

function attachLoginHandlers() {
  document.getElementById('login-form')?.addEventListener('submit', e => {
    e.preventDefault();
    doLogin(document.getElementById('li').value.trim(), document.getElementById('pw').value);
  });
}

function attachShellHandlers() {
  const root = document.getElementById('app');

  document.getElementById('logout-btn')?.addEventListener('click', doLogout);

  // Nav
  root.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => {
      const v = el.dataset.nav;
      if      (v === 'applications') { setState({ view: 'applications', selectedApp: null }); loadApps(); }
      else if (v === 'events')       { setState({ view: 'events', eventForm: null });         loadEvents(); }
      else if (v === 'fleet')        { setState({ view: 'fleet', fleetForm: null });          loadFleet(); }
      else if (v === 'prices')       { setState({ view: 'prices' }); loadPrices(); }
      else if (v === 'content')      { setState({ view: 'content' }); loadContent(); }
      else if (v === 'gallery')      { setState({ view: 'gallery', galleryPhotoForm: null }); loadGallery(); }
      else if (v === 'dashboard')    { setState({ view: 'dashboard', selectedApp: null }); loadStats(); }
    });
  });

  root.querySelector('[data-clear-error]')?.addEventListener('click', () => setState({ error: null }));

  // Applications handlers
  root.querySelectorAll('[data-status-filter]').forEach(btn =>
    btn.addEventListener('click', () => { state.filters.status = btn.dataset.statusFilter; loadApps(); }));
  document.getElementById('search-input')?.addEventListener('input', e => scheduleSearch(e.target.value));
  root.querySelectorAll('[data-open-app]').forEach(btn =>
    btn.addEventListener('click', () => openApp(Number(btn.dataset.openApp))));
  document.getElementById('close-drawer')?.addEventListener('click', () => setState({ selectedApp: null }));
  document.getElementById('drawer-overlay')?.addEventListener('click', () => setState({ selectedApp: null }));
  root.querySelectorAll('[data-set-status]').forEach(btn =>
    btn.addEventListener('click', () => state.selectedApp && saveStatus(state.selectedApp.id, btn.dataset.setStatus)));
  document.getElementById('note-textarea')?.addEventListener('input', e => { state.noteText = e.target.value; });
  document.getElementById('save-note-btn')?.addEventListener('click', () => state.selectedApp && saveNote(state.selectedApp.id));
  document.getElementById('new-app-btn')?.addEventListener('click', () => setState({ showNewAppModal: true, error: null }));
  document.getElementById('close-modal')?.addEventListener('click', () => setState({ showNewAppModal: false, error: null }));
  document.getElementById('cancel-modal')?.addEventListener('click', () => setState({ showNewAppModal: false, error: null }));
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) setState({ showNewAppModal: false, error: null });
  });
  document.getElementById('submit-modal')?.addEventListener('click', submitNewApp);

  // Events handlers
  document.getElementById('add-event-btn')?.addEventListener('click', () => openEventForm());
  root.querySelectorAll('[data-edit-event]').forEach(btn =>
    btn.addEventListener('click', () => {
      const ev = state.events.find(e => e.id === Number(btn.dataset.editEvent));
      if (ev) openEventForm(ev);
    }));
  root.querySelectorAll('[data-toggle-event]').forEach(btn =>
    btn.addEventListener('click', () => toggleEventActive(Number(btn.dataset.toggleEvent), Number(btn.dataset.active) === 1)));
  root.querySelectorAll('[data-delete-event]').forEach(btn =>
    btn.addEventListener('click', () => deleteEvent(Number(btn.dataset.deleteEvent))));

  // Event modal handlers
  document.getElementById('close-event-modal')?.addEventListener('click', () => setState({ eventForm: null, error: null }));
  document.getElementById('cancel-event-modal')?.addEventListener('click', () => setState({ eventForm: null, error: null }));
  document.getElementById('event-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) setState({ eventForm: null, error: null });
  });
  document.getElementById('save-event-btn')?.addEventListener('click', () => {
    if (!state.eventForm) return;
    state.eventForm.title = document.getElementById('ef-title').value.trim();
    state.eventForm.description = document.getElementById('ef-desc').value.trim();
    state.eventForm.kind = document.getElementById('ef-kind').value;
    state.eventForm.spots = document.getElementById('ef-spots').value.trim();
    state.eventForm.date = document.getElementById('ef-date').value || null;
    state.eventForm.end_date = document.getElementById('ef-enddate').value || null;
    state.eventForm.image_url = document.getElementById('ef-image').value.trim();
    state.eventForm.sort_order = Number(document.getElementById('ef-order').value) || 0;
    state.eventForm.active = Number(document.getElementById('ef-active').value) === 1;
    saveEvent();
  });
  document.getElementById('delete-event-btn')?.addEventListener('click', () => {
    if (state.eventForm?.id) deleteEvent(state.eventForm.id);
  });
  document.getElementById('ef-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      document.getElementById('ef-image').value = url;
      state.eventForm.image_url = url;
      // Re-render modal preview without closing
      const preview = document.querySelector('#event-modal-overlay img');
      if (preview) { preview.src = url; } else {
        const imgContainer = document.getElementById('ef-image').parentElement;
        const img = document.createElement('img');
        img.src = url; img.style.cssText = 'margin-top:8px;max-height:100px;border-radius:6px;object-fit:cover';
        imgContainer.parentElement.appendChild(img);
      }
    } catch (err) { setState({ error: err.message }); }
  });

  // Prices handlers
  document.getElementById('save-prices-btn')?.addEventListener('click', savePricesAction);
  root.querySelectorAll('.price-input, .label-input').forEach(input => {
    input.addEventListener('change', e => {
      const { section, key, field } = e.target.dataset;
      updatePriceField(section, key, field, e.target.value);
    });
  });

  // Fleet handlers
  document.getElementById('add-fleet-btn')?.addEventListener('click', () => openFleetForm());
  root.querySelectorAll('[data-edit-fleet]').forEach(btn =>
    btn.addEventListener('click', () => {
      const item = state.fleet.find(e => e.id === Number(btn.dataset.editFleet));
      if (item) openFleetForm(item);
    }));
  root.querySelectorAll('[data-toggle-fleet]').forEach(btn =>
    btn.addEventListener('click', () => toggleFleetActive(Number(btn.dataset.toggleFleet), Number(btn.dataset.fleetActive) === 1)));
  root.querySelectorAll('[data-delete-fleet]').forEach(btn =>
    btn.addEventListener('click', () => deleteFleetItem(Number(btn.dataset.deleteFleet))));

  // Fleet modal handlers
  document.getElementById('close-fleet-modal')?.addEventListener('click', () => setState({ fleetForm: null, error: null }));
  document.getElementById('cancel-fleet-modal')?.addEventListener('click', () => setState({ fleetForm: null, error: null }));
  document.getElementById('fleet-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) setState({ fleetForm: null, error: null });
  });
  document.getElementById('save-fleet-btn')?.addEventListener('click', () => {
    if (!state.fleetForm) return;
    state.fleetForm.name = document.getElementById('ff-name').value.trim();
    state.fleetForm.kind = document.getElementById('ff-kind').value.trim();
    state.fleetForm.image_url = document.getElementById('ff-image').value.trim();
    state.fleetForm.images = document.getElementById('ff-images').value.trim();
    state.fleetForm.count = document.getElementById('ff-count').value.trim();
    state.fleetForm.length_m = document.getElementById('ff-length').value.trim();
    state.fleetForm.sail_area = document.getElementById('ff-sail').value.trim();
    state.fleetForm.crew = document.getElementById('ff-crew').value.trim();
    state.fleetForm.note = document.getElementById('ff-note').value.trim();
    state.fleetForm.sort_order = Number(document.getElementById('ff-order').value) || 0;
    state.fleetForm.active = Number(document.getElementById('ff-active').value) === 1;
    saveFleetItem();
  });
  document.getElementById('delete-fleet-btn')?.addEventListener('click', () => {
    if (state.fleetForm?.id) deleteFleetItem(state.fleetForm.id);
  });
  document.getElementById('ff-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      document.getElementById('ff-image').value = url;
      state.fleetForm.image_url = url;
      const preview = document.querySelector('#fleet-modal-overlay img');
      if (preview) { preview.src = url; } else {
        const imgContainer = document.getElementById('ff-image').parentElement;
        const img = document.createElement('img');
        img.src = url; img.style.cssText = 'margin-top:8px;max-height:80px;border-radius:6px;object-fit:cover';
        imgContainer.parentElement.appendChild(img);
      }
    } catch (err) { setState({ error: err.message }); }
  });

  // Gallery handlers
  document.getElementById('add-photo-btn')?.addEventListener('click', () => openGalleryPhotoForm());
  root.querySelectorAll('[data-edit-photo]').forEach(btn =>
    btn.addEventListener('click', () => {
      const ph = state.gallery.find(p => p.id === Number(btn.dataset.editPhoto));
      if (ph) openGalleryPhotoForm(ph);
    }));
  root.querySelectorAll('[data-toggle-photo]').forEach(btn =>
    btn.addEventListener('click', () => togglePhotoActive(Number(btn.dataset.togglePhoto), Number(btn.dataset.photoActive) === 1)));
  root.querySelectorAll('[data-delete-photo]').forEach(btn =>
    btn.addEventListener('click', () => deleteGalleryPhoto(Number(btn.dataset.deletePhoto))));

  // Gallery photo modal handlers
  document.getElementById('close-gallery-modal')?.addEventListener('click', () => setState({ galleryPhotoForm: null, error: null }));
  document.getElementById('cancel-gallery-modal')?.addEventListener('click', () => setState({ galleryPhotoForm: null, error: null }));
  document.getElementById('gallery-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) setState({ galleryPhotoForm: null, error: null });
  });
  document.getElementById('delete-photo-btn')?.addEventListener('click', () => {
    if (state.galleryPhotoForm?.id) deleteGalleryPhoto(state.galleryPhotoForm.id);
  });
  document.getElementById('save-gallery-photo-btn')?.addEventListener('click', () => {
    if (!state.galleryPhotoForm) return;
    state.galleryPhotoForm.url     = document.getElementById('gf-url').value.trim();
    state.galleryPhotoForm.caption = document.getElementById('gf-caption').value.trim();
    state.galleryPhotoForm.sort_order = Number(document.getElementById('gf-order').value) || 0;
    state.galleryPhotoForm.active  = Number(document.getElementById('gf-active').value) === 1;
    saveGalleryPhoto();
  });
  document.getElementById('gf-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      document.getElementById('gf-url').value = url;
      state.galleryPhotoForm.url = url;
      const existing = document.querySelector('#gallery-modal-overlay img');
      if (existing) { existing.src = url; } else {
        const wrap = document.getElementById('gf-url').parentElement.parentElement;
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = 'margin-top:10px;max-height:140px;border-radius:8px;object-fit:cover;display:block';
        wrap.appendChild(img);
      }
    } catch (err) { setState({ error: err.message }); }
  });

  // Content handlers
  document.getElementById('save-content-btn')?.addEventListener('click', saveContentAction);
  root.querySelectorAll('.content-field').forEach(el => {
    el.addEventListener('input', e => updateContentField(e.target.dataset.key, e.target.value));
  });
}

function submitNewApp() {
  const name = document.getElementById('m-name').value.trim();
  const phone = document.getElementById('m-phone').value.trim();
  if (!name || !phone) { setState({ error: 'Введите имя и телефон' }); return; }
  const arrival = document.getElementById('m-arrival').value;
  const departure = document.getElementById('m-departure').value;
  createApp({
    name, phone,
    messenger: document.getElementById('m-messenger').value,
    email: document.getElementById('m-email').value.trim(),
    clientType: document.getElementById('m-type').value,
    status: document.getElementById('m-status').value,
    comment: document.getElementById('m-comment').value.trim(),
    answers: arrival && departure ? {
      arrivalDate: arrival, departureDate: departure,
      adults: Number(document.getElementById('m-adults').value) || 0,
      children: Number(document.getElementById('m-children').value) || 0,
    } : {},
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', init);
