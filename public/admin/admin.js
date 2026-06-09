'use strict';

const BASE = '/ostrov-admin';

const STATUS_LABELS = {
  new: 'Новая', in_progress: 'В работе', confirmed: 'Подтверждена', rejected: 'Отказ',
};
const STATUS_ORDER = ['new', 'in_progress', 'confirmed', 'rejected'];

const PAYMENT_STATUS_LABELS = {
  pending: 'Ожидает оплаты', waiting_for_capture: 'Удержан',
  succeeded: 'Оплачено', canceled: 'Отменён', refunded: 'Возврат',
};

const SEASON_LABELS = {
  maySept: 'Май, Сентябрь', june: 'Июнь', julyAug: 'Июль–Август', child: 'Дети 7–14',
};

// План острова — категории точек (должны совпадать с public/js/island-plan.js)
const MAP_CAT_COLORS = {
  nav: '#e67e22', infra: '#2980b9', camp: '#27ae60',
  food: '#f39c12', safety: '#e74c3c', leisure: '#8e44ad', transfer: '#16a085',
};
const MAP_CAT_LABELS = {
  nav: 'Навигация', infra: 'Инфраструктура', camp: 'Жильё',
  food: 'Питание', safety: 'Безопасность', leisure: 'Отдых', transfer: 'Трансфер',
};
const SAT_TILES = 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}';
const SAT_ATTR = 'Спутник © <a href="https://www.google.com/maps">Google</a>';

// Leaflet-объекты держим вне state, чтобы перерисовка SPA их не сериализовала
let adminMap = { instance: null, markers: {} };

// ── State ─────────────────────────────────────────────────────────────────

let state = {
  view: 'loading',
  user: null,
  stats: null,
  apps: [], selectedApp: null, appPayments: [],
  filters: { status: 'all', search: '' },
  events: [], selectedEvent: null, eventForm: null,
  fleet: [], fleetForm: null,
  tents: [], tentForm: null,
  prices: null, pricesDirty: false,
  content: null, contentLabels: null, contentDirty: false,
  gallery: [], galleryPhotoForm: null,
  mapPoints: [], mapPointForm: null,
  availability: null, inventory: [], blocks: [], availFrom: '', availTo: '', invDirty: false,
  dashAvail: null,
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
  setState({ view: 'login', user: null, apps: [], stats: null, selectedApp: null, appPayments: [], events: [], fleet: [], fleetForm: null, tents: [], tentForm: null, prices: null, content: null, gallery: [], galleryPhotoForm: null, mapPoints: [], mapPointForm: null, availability: null, inventory: [], blocks: [], dashAvail: null });
}

// ── Loaders ───────────────────────────────────────────────────────────────

async function loadStats() {
  try { setState({ stats: await api('GET', '/api/stats') }); } catch { /* non-critical */ }
  loadDashAvail();
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

async function loadTents() {
  try { setState({ tents: await api('GET', '/api/tents'), view: 'tents' }); }
  catch (err) { setState({ error: err.message, view: 'tents', tents: [] }); }
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

async function loadMapPoints() {
  try {
    const data = await api('GET', '/api/map-points');
    setState({ mapPoints: Array.isArray(data) ? data : [], view: 'map', error: null });
  }
  catch (err) { setState({ error: err.message, view: 'map', mapPoints: [] }); }
}

// ── Availability ──────────────────────────────────────────────────────────

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDaysStr(s, n) { const d = new Date(s); d.setDate(d.getDate() + n); return ymd(d); }

async function loadAvailability() {
  if (!state.availFrom || !state.availTo) {
    const today = new Date();
    state.availFrom = ymd(today);
    state.availTo = addDaysStr(state.availFrom, 35); // ~5 ближайших выходных
  }
  state.view = 'availability';
  try {
    const qs = `from=${state.availFrom}&to=${state.availTo}`;
    const [availability, inventory, blocks] = await Promise.all([
      api('GET', `/api/availability?${qs}`),
      api('GET', '/api/inventory'),
      api('GET', `/api/blocks?${qs}`),
    ]);
    setState({ availability, inventory, blocks, invDirty: false, error: null });
  } catch (err) { setState({ error: err.message, availability: null }); }
}

// Виджет загрузки на дашборде: ближайшие ~3 недели.
async function loadDashAvail() {
  try {
    const from = ymd(new Date());
    const to = addDaysStr(from, 21);
    setState({ dashAvail: await api('GET', `/api/availability?from=${from}&to=${to}`) });
  } catch { /* виджет не критичен */ }
}

function updateInvCapacity(key, value) {
  const row = state.inventory.find(r => r.resource_key === key);
  if (!row) return;
  row.capacity = Math.max(0, Math.floor(Number(value) || 0));
  state.invDirty = true;
  const hint = document.getElementById('inv-dirty-hint');
  if (hint) hint.style.visibility = 'visible';
}

async function saveInventoryAction() {
  setState({ saving: true });
  try {
    const items = state.inventory.map(r => ({ resource_key: r.resource_key, capacity: r.capacity }));
    await api('PUT', '/api/inventory', { items });
    state.saving = false; state.invDirty = false; state.successMsg = 'Ёмкости сохранены';
    await loadAvailability();
    setTimeout(() => setState({ successMsg: null }), 3000);
  } catch (err) { setState({ saving: false, error: err.message }); }
}

async function addBlockAction() {
  const resource_key = document.getElementById('blk-resource').value;
  const start_date = document.getElementById('blk-from').value;
  const end_date = document.getElementById('blk-to').value;
  const qty = Number(document.getElementById('blk-qty').value) || 0;
  const reason = document.getElementById('blk-reason').value.trim();
  if (!start_date || !end_date || start_date >= end_date) { setState({ error: 'Укажите корректный период (начало < конец)' }); return; }
  if (resource_key !== 'all' && qty < 1) { setState({ error: 'Укажите количество ≥ 1' }); return; }
  try {
    await api('POST', '/api/blocks', { resource_key, start_date, end_date, qty, reason });
    setState({ successMsg: 'Блокировка добавлена', error: null });
    await loadAvailability();
    setTimeout(() => setState({ successMsg: null }), 3000);
  } catch (err) { setState({ error: err.message }); }
}

async function removeBlockAction(id) {
  if (!confirm('Удалить блокировку?')) return;
  try {
    await api('DELETE', `/api/blocks/${id}`);
    await loadAvailability();
  } catch (err) { setState({ error: err.message }); }
}

function applyAvailRange() {
  const from = document.getElementById('avail-from').value;
  const to = document.getElementById('avail-to').value;
  if (!from || !to || from >= to) { setState({ error: 'Укажите корректный период (начало < конец)' }); return; }
  state.availFrom = from; state.availTo = to;
  loadAvailability();
}

// ── Application actions ───────────────────────────────────────────────────

async function openApp(id) {
  try {
    setState({ selectedApp: await api('GET', `/api/applications/${id}`), noteText: '', appPayments: [] });
    loadAppPayments(id);
  }
  catch { /* ignore */ }
}

async function loadAppPayments(id) {
  try { setState({ appPayments: await api('GET', `/api/applications/${id}/payments`) }); }
  catch { /* non-critical */ }
}

async function createManagerPayment() {
  if (!state.selectedApp) return;
  const amountRub = Number(document.getElementById('pay-amount')?.value);
  const sendToClient = !!document.getElementById('pay-send-email')?.checked;
  if (!amountRub || amountRub <= 0) { setState({ error: 'Введите сумму счёта' }); return; }
  const btn = document.getElementById('create-payment-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Создаём…'; }
  try {
    const r = await api('POST', `/api/applications/${state.selectedApp.id}/payment`, { amountRub, sendToClient });
    if (r.confirmationUrl) { try { await navigator.clipboard.writeText(r.confirmationUrl); } catch {} }
    await loadAppPayments(state.selectedApp.id);
    let msg = 'Счёт создан, ссылка скопирована в буфер.';
    if (r.emailed) msg = 'Счёт создан и отправлен клиенту на email.';
    setState({ successMsg: msg, error: null });
    setTimeout(() => setState({ successMsg: null }), 4000);
  } catch (err) {
    setState({ error: err.message });
    if (btn) { btn.disabled = false; btn.textContent = 'Выставить счёт'; }
  }
}

async function refundPayment(id) {
  if (!confirm('Оформить возврат по этому платежу?')) return;
  try {
    await api('POST', `/api/payments/${id}/refund`);
    await loadAppPayments(state.selectedApp.id);
    setState({ successMsg: 'Возврат оформлен', error: null });
    setTimeout(() => setState({ successMsg: null }), 3000);
  } catch (err) { setState({ error: err.message }); }
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

// ── Tents actions ─────────────────────────────────────────────────────────

function openTentForm(item = null) {
  setState({
    tentForm: item ? { ...item } : { name: '', price_key: 'canopySmall', image_url: '', images: '', length_m: '', capacity: '', note: '', active: true, sort_order: 0 },
  });
}

async function saveTentItem() {
  const f = state.tentForm;
  if (!f?.name) { setState({ error: 'Введите название шатра' }); return; }
  setState({ saving: true });
  try {
    let item;
    if (f.id) item = await api('PATCH', `/api/tents/${f.id}`, f);
    else       item = await api('POST', '/api/tents', f);
    const tents = f.id ? state.tents.map(e => e.id === f.id ? item : e) : [item, ...state.tents];
    setState({ tents, tentForm: null, saving: false });
  } catch (err) { setState({ saving: false, error: err.message }); }
}

async function toggleTentActive(id, active) {
  try {
    const item = await api('PATCH', `/api/tents/${id}`, { active });
    setState({ tents: state.tents.map(e => e.id === id ? item : e) });
  } catch (err) { setState({ error: err.message }); }
}

async function deleteTentItem(id) {
  if (!confirm('Удалить шатёр?')) return;
  try {
    await api('DELETE', `/api/tents/${id}`);
    setState({ tents: state.tents.filter(e => e.id !== id), tentForm: null });
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
  // Capture the button to show saving state without full re-render
  const btn = document.getElementById('save-content-btn');
  const dirtyHint = document.querySelector('.dirty-hint');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }
  try {
    await api('PUT', '/api/content', state.content);
    state.contentDirty = false;
    state.saving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить контент'; }
    if (dirtyHint) dirtyHint.remove();
    // Show success inline without full re-render
    const area = document.querySelector('.content-area');
    const msg = document.createElement('div');
    msg.className = 'alert alert-success content-save-msg';
    msg.style.cssText = 'margin-bottom:16px';
    msg.textContent = 'Контент сохранён';
    const anchor = document.querySelector('.content-nav') || document.querySelector('.content-section');
    if (anchor) anchor.before(msg);
    setTimeout(() => msg.remove(), 3000);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить контент'; }
    setState({ saving: false, error: err.message });
  }
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

// ── Map points (план острова) ───────────────────────────────────────────────

function fmtCoord(lat, lng) {
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

function makeMapIcon(p) {
  const color = MAP_CAT_COLORS[p.category] || '#2980b9';
  return L.divIcon({
    className: '',
    html: `<div class="mp-pin" style="background:${color}">${esc(p.num)}</div>`,
    iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16],
  });
}

function showMapToast(msg) {
  let t = document.getElementById('map-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'map-toast';
    t.className = 'map-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showMapToast._timer);
  showMapToast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Полностью пересоздаём карту после каждого render() (SPA заменяет innerHTML).
function initAdminMap() {
  const el = document.getElementById('admin-map');
  if (!el || typeof L === 'undefined') return;
  if (adminMap.instance) { try { adminMap.instance.remove(); } catch (e) {} adminMap.instance = null; }
  adminMap.markers = {};

  const pts = state.mapPoints || [];
  const map = L.map('admin-map').setView([56.6915, 36.3878], 16);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
  L.tileLayer(SAT_TILES, { attribution: SAT_ATTR, maxZoom: 20 }).addTo(map);

  const group = L.featureGroup().addTo(map);
  pts.forEach(p => {
    const m = L.marker([p.lat, p.lng], { icon: makeMapIcon(p), draggable: true })
      .addTo(group)
      .bindTooltip(`${p.num}. ${p.name}`);
    m.on('dragend', () => {
      const ll = m.getLatLng();
      saveMapPointPosition(p.id, ll.lat, ll.lng);
    });
    m.on('click', () => {
      const fresh = state.mapPoints.find(x => x.id === p.id);
      if (fresh) openMapPointForm(fresh);
    });
    adminMap.markers[p.id] = m;
  });
  if (pts.length > 1) map.fitBounds(group.getBounds().pad(0.2));
  else if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 16);

  adminMap.instance = map;
}

// Перетаскивание маркера: сохраняем позицию без полного ре-рендера (карта не мигает).
async function saveMapPointPosition(id, lat, lng) {
  try {
    const updated = await api('PATCH', `/api/map-points/${id}`, { lat, lng });
    state.mapPoints = state.mapPoints.map(p => p.id === id ? updated : p);
    const coordEl = document.querySelector(`[data-coord-for="${id}"]`);
    if (coordEl) coordEl.textContent = fmtCoord(updated.lat, updated.lng);
    showMapToast(`№${updated.num} «${updated.name}» — позиция сохранена`);
  } catch (err) { setState({ error: err.message }); }
}

function openMapPointForm(point = null) {
  const nextNum = state.mapPoints.length ? Math.max(...state.mapPoints.map(p => Number(p.num) || 0)) + 1 : 1;
  setState({
    mapPointForm: point ? { ...point } : {
      num: nextNum, name: '', category: 'infra', description: '',
      image_url: '', lat: 56.6915, lng: 36.3878, active: true, sort_order: nextNum,
    },
    error: null,
  });
}

function collectMapPointForm() {
  const f = state.mapPointForm;
  if (!f) return;
  f.num = Number(document.getElementById('mp-num').value) || 0;
  f.name = document.getElementById('mp-name').value.trim();
  f.category = document.getElementById('mp-cat').value;
  f.description = document.getElementById('mp-desc').value;
  f.image_url = document.getElementById('mp-image').value.trim();
  f.lat = Number(document.getElementById('mp-lat').value);
  f.lng = Number(document.getElementById('mp-lng').value);
  f.sort_order = Number(document.getElementById('mp-order').value) || 0;
  f.active = Number(document.getElementById('mp-active').value) === 1;
}

async function saveMapPoint() {
  collectMapPointForm();
  const f = state.mapPointForm;
  if (!f?.name) { setState({ error: 'Введите название точки' }); return; }
  setState({ saving: true });
  try {
    let item;
    if (f.id) item = await api('PATCH', `/api/map-points/${f.id}`, f);
    else       item = await api('POST', '/api/map-points', f);
    const list = f.id ? state.mapPoints.map(p => p.id === f.id ? item : p) : [...state.mapPoints, item];
    setState({ mapPoints: list, mapPointForm: null, saving: false });
  } catch (err) { setState({ saving: false, error: err.message }); }
}

async function deleteMapPoint(id) {
  if (!confirm('Удалить точку с карты?')) return;
  try {
    await api('DELETE', `/api/map-points/${id}`);
    setState({ mapPoints: state.mapPoints.filter(p => p.id !== id), mapPointForm: null });
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
  else if (view === 'tents')        content = renderTentsView();
  else if (view === 'availability') content = renderAvailabilityView();
  else if (view === 'prices')       content = renderPricesView();
  else if (view === 'content')      content = renderContentView();
  else if (view === 'gallery')      content = renderGalleryView();
  else if (view === 'map')          content = renderMapView();

  const drawerHtml   = state.selectedApp ? renderAppDrawer(state.selectedApp) : '';
  const drawerOpen   = state.selectedApp ? ' open' : '';
  const overlayOpen  = state.selectedApp ? ' open' : '';
  const eventModal        = state.eventForm        ? renderEventModal()       : '';
  const fleetModal        = state.fleetForm         ? renderFleetModal()       : '';
  const tentModal         = state.tentForm          ? renderTentModal()        : '';
  const newAppModal       = state.showNewAppModal  ? renderNewAppModal()      : '';
  const galleryPhotoModal = state.galleryPhotoForm ? renderGalleryPhotoModal() : '';
  const mapPointModal     = state.mapPointForm     ? renderMapPointModal()     : '';

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
          ${navItem('tents',        'Шатры')}
          ${navItem('availability', 'Загрузка')}
          ${navItem('prices',       'Цены')}
          ${navItem('content',      'Контент')}
          ${navItem('gallery',      'Галерея')}
          ${navItem('map',          'План острова')}
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
    ${eventModal}${fleetModal}${tentModal}${newAppModal}${galleryPhotoModal}${mapPointModal}`;
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
      ${renderDashAvailWidget()}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" data-nav="applications">Заявки →</button>
        <button class="btn btn-secondary" data-nav="availability">Загрузка →</button>
        <button class="btn btn-secondary" data-nav="events">Мероприятия →</button>
        <button class="btn btn-secondary" data-nav="prices">Цены →</button>
        <button class="btn btn-secondary" data-nav="content">Контент →</button>
      </div>
    </div>`;
}

// Виджет «загрузка ближайших выходных» на дашборде.
function renderDashAvailWidget() {
  const a = state.dashAvail;
  if (!a || !a.weekends || !a.weekends.length) return '';
  const resByKey = Object.fromEntries(a.resources.map(r => [r.key, r]));
  const cards = a.weekends.slice(0, 3).map(w => {
    const c = w.resources.campSpots || { free: 0, capacity: 0 };
    const tents = a.resources.filter(r => r.kind === 'tent').map(r => {
      const cell = w.resources[r.key] || { free: r.capacity };
      return `${esc(r.label.replace('Палатка ', ''))}: <b>${cell.free}</b>`;
    }).join(' · ');
    return `
      <div class="avail-card">
        <div class="avail-card__head">
          <span class="avail-card__title">${esc(w.label)}</span>
          <span class="avail-card__pct">${w.loadPct}%</span>
        </div>
        <div class="load-bar"><div class="load-bar__fill ${loadBarClass(w.loadPct)}" style="width:${Math.min(100, w.loadPct)}%"></div></div>
        <div class="avail-card__camp">Места: <b>${c.free}</b> своб. из ${c.capacity}</div>
        <div class="avail-card__mini" style="color:var(--muted)">${tents}</div>
      </div>`;
  }).join('');
  return `
    <div style="margin:8px 0 20px">
      <h3 style="font-size:15px;margin-bottom:10px;color:var(--blue-dark)">Загрузка ближайших выходных</h3>
      <div class="avail-cards">${cards}</div>
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
      ${renderPaymentsSection(app, quote)}
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

function renderPaymentsSection(app, quote) {
  const list = Array.isArray(state.appPayments) ? state.appPayments : [];
  const paid = list.filter(p => p.status === 'succeeded').reduce((s, p) => s + (p.amount_kopecks || 0), 0);
  const suggested = quote && quote.total ? Math.round(quote.total * 0.3) : '';

  const rows = list.length ? `<table class="breakdown-table"><tbody>${list.map(p => {
    const canCopy = p.confirmation_url && p.status !== 'succeeded' && p.status !== 'refunded' && p.status !== 'canceled';
    return `<tr>
      <td>${fmtMoney((p.amount_kopecks || 0) / 100)}
        <div style="font-size:11px;color:var(--muted)">${p.source === 'manager' ? 'счёт менеджера' : 'онлайн'} · ${fmtDate(p.created_at)}</div></td>
      <td class="amount">
        <span class="badge ${p.status === 'succeeded' ? 'badge-confirmed' : (p.status === 'canceled' || p.status === 'refunded' ? 'badge-rejected' : '')}">${esc(PAYMENT_STATUS_LABELS[p.status] || p.status)}</span>
        ${canCopy ? `<button class="btn btn-sm btn-secondary" data-copy-pay="${esc(p.confirmation_url)}" style="margin-left:6px">Ссылка</button>` : ''}
        ${p.status === 'succeeded' ? `<button class="btn btn-sm" style="margin-left:6px;background:#fee2e2;color:#991b1b;border:none" data-refund-pay="${p.id}">Возврат</button>` : ''}
      </td>
    </tr>`;
  }).join('')}</tbody></table>` : '<div style="color:var(--muted);font-size:13px">Платежей пока нет</div>';

  return `
    <div class="info-section"><h4>Платежи (СБП)</h4>
      ${paid > 0 ? `<div class="breakdown-total" style="margin-bottom:8px"><span>Оплачено</span><span>${fmtMoney(paid / 100)}</span></div>` : ''}
      ${rows}
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div class="field" style="flex:1;min-width:130px;margin:0">
          <label style="font-size:12px">Сумма счёта, ₽</label>
          <input id="pay-amount" type="number" min="1" step="1" placeholder="напр. 5000" value="${suggested}">
        </div>
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;white-space:nowrap">
          <input type="checkbox" id="pay-send-email" ${app.email ? 'checked' : 'disabled'}>На email
        </label>
        <button class="btn btn-primary btn-sm" id="create-payment-btn">Выставить счёт</button>
      </div>
      ${app.email ? '' : '<div style="font-size:12px;color:var(--muted);margin-top:6px">У заявки нет email — ссылку отправьте клиенту вручную (она копируется автоматически).</div>'}
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

// ── Tents (шатры) ───────────────────────────────────────────────────────────

// price_key → как считается цена (ключи из data/prices.json)
const TENT_PRICE_KEYS = {
  canopySmall:   'Кухня малая',
  canopyMedium:  'Кухня средняя',
  canopyLarge:   'Кухня большая',
  canopyEverest: 'Кухня-шатёр «Эверест»',
};

function renderTentsView() {
  const { tents } = state;
  const rows = tents.length ? tents.map(e => `
    <tr>
      <td>${e.image_url ? `<img src="${esc(e.image_url)}" style="height:36px;width:52px;border-radius:4px;object-fit:cover">` : '<span style="color:var(--muted)">—</span>'}</td>
      <td><strong>${esc(e.name)}</strong></td>
      <td>${esc(TENT_PRICE_KEYS[e.price_key] || e.price_key || '—')}</td>
      <td>${esc(e.length_m || '—')}</td>
      <td>${esc(e.capacity || '—')}</td>
      <td><span class="badge ${e.active ? 'badge-confirmed' : 'badge-rejected'}">${e.active ? 'Активно' : 'Скрыто'}</span></td>
      <td>
        <button class="btn btn-sm btn-secondary" data-edit-tent="${e.id}">Изменить</button>
        <button class="btn btn-sm" style="background:var(--bg);border:1px solid var(--border)" data-toggle-tent="${e.id}" data-tent-active="${e.active ? 0 : 1}">${e.active ? 'Скрыть' : 'Показать'}</button>
        <button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none" data-delete-tent="${e.id}">✕</button>
      </td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="7">Шатров нет. Добавьте первый.</td></tr>`;

  return `
    <div>
      <div class="page-header"><h2>Шатры</h2>
        <button class="btn btn-primary" id="add-tent-btn">+ Добавить шатёр</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Фото</th><th>Название</th><th>Вариант цены</th><th>Длина</th><th>Вместимость</th><th>Статус</th><th>Действия</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>
    </div>`;
}

function renderTentModal() {
  const f = state.tentForm;
  const isEdit = !!f.id;
  const priceOpts = Object.entries(TENT_PRICE_KEYS).map(([key, label]) =>
    `<option value="${key}" ${f.price_key === key ? 'selected' : ''}>${label}</option>`).join('');
  return `
    <div class="modal-overlay" id="tent-modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? 'Редактировать' : 'Новый'} шатёр</h3><button class="btn-icon" id="close-tent-modal">✕</button></div>
        <div class="modal-body">
          ${state.error ? `<div class="alert alert-error">${esc(state.error)}</div>` : ''}
          <div class="fields-row">
            <div class="field"><label>Название *</label><input id="tf-name" type="text" value="${esc(f.name)}" placeholder="Кухня малая"></div>
            <div class="field"><label>Вариант цены</label>
              <select id="tf-pricekey">${priceOpts}</select>
            </div>
          </div>
          <div class="field">
            <label>Фотография</label>
            <div style="display:flex;gap:8px;align-items:flex-end">
              <input id="tf-image" type="text" value="${esc(f.image_url || '')}" placeholder="/images/uploads/tent.jpg" style="flex:1">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">
                Загрузить<input type="file" id="tf-file" accept="image/*" style="display:none">
              </label>
            </div>
            ${f.image_url ? `<img src="${esc(f.image_url)}" style="margin-top:8px;max-height:80px;border-radius:6px;object-fit:cover">` : ''}
          </div>
          <div class="field">
            <label>Доп. фото (по одному URL на строку)</label>
            <textarea id="tf-images" rows="3" placeholder="/images/uploads/tent-2.jpg&#10;/images/uploads/tent-3.jpg">${esc(f.images || '')}</textarea>
          </div>
          <div class="fields-row">
            <div class="field"><label>Длина</label><input id="tf-length" type="text" value="${esc(f.length_m || '')}" placeholder="4 × 4 м"></div>
            <div class="field"><label>Вместимость</label><input id="tf-capacity" type="text" value="${esc(f.capacity || '')}" placeholder="до 8 чел."></div>
          </div>
          <div class="field"><label>Примечание / описание</label><textarea id="tf-note" rows="2" placeholder="от 600 ₽/сутки">${esc(f.note || '')}</textarea></div>
          <div class="fields-row">
            <div class="field"><label>Порядок сортировки</label><input id="tf-order" type="number" value="${f.sort_order || 0}"></div>
            <div class="field"><label>Статус</label>
              <select id="tf-active">
                <option value="1" ${f.active ? 'selected' : ''}>Активно</option>
                <option value="0" ${!f.active ? 'selected' : ''}>Скрыто</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${isEdit ? `<button class="btn btn-danger" id="delete-tent-btn">Удалить</button>` : ''}
          <button class="btn btn-secondary" id="cancel-tent-modal">Отмена</button>
          <button class="btn btn-primary" id="save-tent-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить'}</button>
        </div>
      </div>
    </div>`;
}

// ── Availability (Загрузка) ─────────────────────────────────────────────────

const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const BLOCK_RESOURCE_OPTS = [
  ['all', 'Вся дата (полное закрытие)'],
  ['campSpots', 'Места в лагере'],
  ['tent1', 'Палатка 1-местная'], ['tent2', 'Палатка 2-местная'], ['tent3', 'Палатка 3-местная'],
  ['canopyEverest', 'Кухня-шатёр «Эверест»'], ['canopyLarge', 'Кухня большая'],
  ['canopyMedium', 'Кухня средняя'], ['canopySmall', 'Кухня малая'],
];

function loadCellClass(occupied, capacity, closed) {
  if (closed) return 'cell-closed';
  if (!capacity) return 'cell-ok';
  if (occupied >= capacity) return 'cell-full';
  const pct = occupied / capacity;
  if (pct >= 0.9) return 'cell-hot';
  if (pct >= 0.6) return 'cell-warm';
  return 'cell-ok';
}
function loadBarClass(pct) {
  if (pct >= 100) return 'is-full';
  if (pct >= 90) return 'is-hot';
  if (pct >= 60) return 'is-warm';
  return 'is-ok';
}
function fmtDayCol(dk) {
  const d = new Date(dk);
  return `${WD_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function renderAvailabilityView() {
  const a = state.availability;
  const from = state.availFrom, to = state.availTo;
  const rangeBar = `
    <div class="page-header"><h2>Загрузка</h2>
      <div class="page-actions" style="gap:8px;align-items:center">
        <input type="date" id="avail-from" value="${esc(from)}" style="max-width:160px">
        <span style="color:var(--muted)">—</span>
        <input type="date" id="avail-to" value="${esc(to)}" style="max-width:160px">
        <button class="btn btn-primary" id="avail-apply">Показать</button>
      </div>
    </div>`;

  if (!a) return `<div>${rangeBar}<div class="loading"><div class="spinner"></div>Загрузка данных...</div></div>`;

  const resByKey = Object.fromEntries(a.resources.map(r => [r.key, r]));
  const labelFor = k => k === 'all' ? 'Вся дата' : (resByKey[k]?.label || k);
  const camp = resByKey.campSpots;
  const tents = a.resources.filter(r => r.kind === 'tent');
  const canopies = a.resources.filter(r => r.kind === 'canopy');

  // 1. Карточки по выходным
  const miniRow = (list, wRes) => list.map(r => {
    const cell = wRes[r.key] || { free: r.capacity, capacity: r.capacity };
    return `<span class="avail-mini ${cell.free <= 0 ? 'is-zero' : ''}">${esc(r.label.replace(/^Кухня[\s-]?/, '').replace(/^Палатка /, ''))}: <b>${cell.free}</b>/${cell.capacity}</span>`;
  }).join('');

  const weekendCards = a.weekends.length ? a.weekends.map(w => {
    const c = w.resources.campSpots || { free: 0, capacity: 0, occupied: 0 };
    return `
      <div class="avail-card">
        <div class="avail-card__head">
          <span class="avail-card__title">${esc(w.label)}</span>
          <span class="avail-card__pct">${w.loadPct}%</span>
        </div>
        <div class="load-bar"><div class="load-bar__fill ${loadBarClass(w.loadPct)}" style="width:${Math.min(100, w.loadPct)}%"></div></div>
        <div class="avail-card__camp">Места: <b>${c.free}</b> своб. из ${c.capacity}</div>
        <div class="avail-card__mini">${miniRow(tents, w.resources)}</div>
        <div class="avail-card__mini">${miniRow(canopies, w.resources)}</div>
      </div>`;
  }).join('') : `<div class="table-empty" style="padding:16px">В выбранном периоде нет выходных (пт–вс).</div>`;

  // 2. Таблица по дням
  const dayCols = a.days.map(dk => {
    const d = new Date(dk);
    const we = [5, 6, 0].includes(d.getDay());
    return `<th class="${we ? 'col-weekend' : ''}">${fmtDayCol(dk)}</th>`;
  }).join('');
  const dayRows = a.resources.map(r => {
    const cells = a.days.map(dk => {
      const cell = r.byDay[dk];
      const cls = loadCellClass(cell.occupied, r.capacity, cell.closed);
      const content = cell.closed ? '×' : cell.free;
      return `<td class="avail-cell ${cls}" title="занято ${cell.occupied} из ${r.capacity}">${content}</td>`;
    }).join('');
    return `<tr><td class="avail-rowlabel">${esc(r.label)} <span class="avail-cap">(${r.capacity})</span></td>${cells}</tr>`;
  }).join('');

  const dayTable = `
    <div class="price-section">
      <h3 class="price-section-title">Свободно по дням</h3>
      <div class="avail-legend">
        <span><i class="lg cell-ok"></i>свободно</span>
        <span><i class="lg cell-warm"></i>&ge;60%</span>
        <span><i class="lg cell-hot"></i>&ge;90%</span>
        <span><i class="lg cell-full"></i>занято</span>
        <span><i class="lg cell-closed"></i>закрыто</span>
      </div>
      <div class="table-wrap">
        <table class="avail-table"><thead><tr><th class="avail-rowlabel">Ресурс</th>${dayCols}</tr></thead>
        <tbody>${dayRows}</tbody></table>
      </div>
    </div>`;

  // 3. Редактор вместимости — три понятные группы (места / палатки / шатры)
  const TENT_LABELS = { tent1: '1-местная', tent2: '2-местная', tent3: '3-местная' };
  const capLabel = r => TENT_LABELS[r.resource_key] || r.label;
  const capRow = (r, big) => `
    <div class="cap-row">
      <span class="cap-row__label">${esc(capLabel(r))}</span>
      <input class="price-input inv-input${big ? ' cap-input--big' : ''}" type="number" min="0" inputmode="numeric"
             data-inv-key="${esc(r.resource_key)}" value="${r.capacity}">
    </div>`;
  const capGroup = (title, hint, list, unit, big) => list.length ? `
    <div class="cap-group">
      <div class="cap-group__title">${esc(title)} <span class="cap-group__unit">${esc(unit)}</span></div>
      <div class="cap-group__hint">${esc(hint)}</div>
      ${list.map(r => capRow(r, big)).join('')}
    </div>` : '';
  const campRes = state.inventory.filter(r => r.kind === 'camp');
  const tentRes = state.inventory.filter(r => r.kind === 'tent');
  const canopyRes = state.inventory.filter(r => r.kind === 'canopy');
  const invEditor = `
    <div class="price-section">
      <h3 class="price-section-title">Вместимость
        <span id="inv-dirty-hint" style="color:var(--yellow);font-size:12px;font-weight:400;visibility:${state.invDirty ? 'visible' : 'hidden'}">● не сохранено</span>
      </h3>
      <p class="cap-intro">Укажите, сколько у вас всего ресурсов. Эти числа задают предел бронирования —
        на их основе считается, сколько мест свободно на каждый день и выходные ниже.</p>
      <div class="cap-groups">
        ${capGroup('Места для гостей', 'Сколько всего человек можно разместить на острове.', campRes, 'чел.', true)}
        ${capGroup('Палатки в аренду', 'Сколько палаток каждого типа вы сдаёте гостям.', tentRes, 'шт.')}
        ${capGroup('Шатры', 'Сколько шатров каждого вида доступно.', canopyRes, 'шт.')}
      </div>
      <button class="btn btn-primary" id="save-inv-btn" style="margin-top:14px" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить вместимость'}</button>
    </div>`;

  // 4. Ручные блокировки
  const blockRows = state.blocks.length ? state.blocks.map(b => `
    <tr>
      <td>${esc(labelFor(b.resource_key))}</td>
      <td>${esc(fmtDate(b.start_date))} – ${esc(fmtDate(b.end_date))}</td>
      <td>${b.resource_key === 'all' ? '—' : esc(String(b.qty))}</td>
      <td>${esc(b.reason || '—')}</td>
      <td><button class="btn btn-sm" style="background:#fee2e2;color:#991b1b;border:none" data-del-block="${b.id}">✕</button></td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="5">Блокировок нет.</td></tr>`;
  const blockResOpts = BLOCK_RESOURCE_OPTS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  const blocksManager = `
    <div class="price-section">
      <h3 class="price-section-title">Ручные блокировки</h3>
      <div class="table-wrap">
        <table><thead><tr><th>Ресурс</th><th>Период</th><th>Кол-во</th><th>Причина</th><th></th></tr></thead>
        <tbody>${blockRows}</tbody></table>
      </div>
      <div class="block-form">
        <select id="blk-resource">${blockResOpts}</select>
        <input type="date" id="blk-from" title="Начало (включительно)">
        <input type="date" id="blk-to" title="Конец (исключительно)">
        <input type="number" id="blk-qty" min="0" value="1" placeholder="Кол-во" style="max-width:90px">
        <input type="text" id="blk-reason" placeholder="Причина (ремонт, бронь по телефону)" style="flex:1;min-width:160px">
        <button class="btn btn-primary" id="add-block-btn">Добавить</button>
      </div>
      <p style="color:var(--muted);font-size:12px;margin-top:8px">Конец периода — исключительно (на ночь с пятницы на воскресенье укажите пт → вс). «Вся дата» закрывает все ресурсы.</p>
    </div>`;

  return `
    <div>
      ${rangeBar}
      ${invEditor}
      <div class="avail-cards" style="margin-top:20px">${weekendCards}</div>
      <div class="prices-grid" style="margin-top:8px">
        ${dayTable}
      </div>
      <div class="prices-grid">
        ${blocksManager}
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

const CONTENT_SECTIONS = [
  { id: 'hero',      title: 'Hero-блок',        icon: '🎬', match: k => k.startsWith('hero_') },
  { id: 'about',     title: 'О лагере',         icon: '🏕️', match: k => k.startsWith('about_') },
  { id: 'events',    title: 'Мероприятия',      icon: '⛵', match: k => k.startsWith('events_') },
  { id: 'faq',       title: 'Вопросы и ответы', icon: '❓', match: k => k.startsWith('faq_') },
  { id: 'editorial', title: 'Блок «Закаты»',    icon: '🌅', match: k => k.startsWith('editorial_') },
  { id: 'contact',   title: 'Контакты',         icon: '📍', match: k => k.startsWith('contact_') },
];

const capFirst = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

// Разбираем подпись вида "FAQ: вопрос 1 (вопрос|ответ)" → чистый заголовок + части + флаг HTML
function parseContentLabel(rawLabel, key) {
  let label = rawLabel || key;
  const colon = label.indexOf(': ');
  if (colon !== -1) label = label.slice(colon + 2);
  let parts = null;
  const m = label.match(/\(([^)]*\|[^)]*)\)\s*$/);
  if (m) {
    parts = m[1].split('|').map(s => s.trim());
    label = label.slice(0, m.index).trim();
  }
  const html = /html/i.test(rawLabel || '');
  label = label.replace(/\s*\(можно html\)\s*/i, '').trim();
  return { label: capFirst(label), parts, html };
}

// Один контрол: короткое значение → input, длинное / с HTML → textarea
function contentControl(key, value, partIndex) {
  const v = value == null ? '' : String(value);
  const dataPart = partIndex != null ? ` data-part="${partIndex}"` : '';
  const isLong = v.length > 55 || /<[a-z!/]/i.test(v);
  if (isLong) {
    const rows = Math.max(2, Math.min(10, Math.ceil(v.length / 60)));
    return `<textarea class="content-field content-input content-input--area" data-key="${key}"${dataPart} rows="${rows}">${esc(v)}</textarea>`;
  }
  return `<input class="content-field content-input" type="text" data-key="${key}"${dataPart} value="${esc(v)}">`;
}

function renderContentField(key, value, rawLabel) {
  const { label, parts, html } = parseContentLabel(rawLabel, key);
  if (parts) {
    const vals = String(value == null ? '' : value).split('|');
    const cols = parts.length === 2 ? ' cf-parts--2' : '';
    const partsHtml = parts.map((pl, i) => `
        <div class="cf-part">
          <label>${esc(capFirst(pl))}</label>
          ${contentControl(key, vals[i] ?? '', i)}
        </div>`).join('');
    return `
      <div class="cf">
        <label>${esc(label)}</label>
        <div class="cf-parts${cols}">${partsHtml}</div>
      </div>`;
  }
  const badge = html ? ' <span class="html-badge">HTML</span>' : '';
  return `
      <div class="cf">
        <label>${esc(label)}${badge}</label>
        ${contentControl(key, value, null)}
      </div>`;
}

function renderContentView() {
  if (!state.content) return `<div class="loading"><div class="spinner"></div>Загрузка...</div>`;
  const labels = state.contentLabels || {};
  const entries = Object.entries(state.content);

  const sections = [];
  const used = new Set();
  for (const sec of CONTENT_SECTIONS) {
    const items = entries.filter(([k]) => sec.match(k));
    items.forEach(([k]) => used.add(k));
    if (items.length) sections.push({ sec, items });
  }
  const rest = entries.filter(([k]) => !used.has(k));
  if (rest.length) sections.push({ sec: { id: 'other', title: 'Прочее', icon: '⚙️' }, items: rest });

  const nav = sections.map(({ sec }) =>
    `<span class="content-nav__item" data-jump="csec-${sec.id}">${sec.icon} ${esc(sec.title)}</span>`).join('');

  const body = sections.map(({ sec, items }) => {
    const fields = items.map(([key, value]) => renderContentField(key, value, labels[key])).join('');
    return `
      <section class="content-section" id="csec-${sec.id}">
        <div class="content-section__head" data-collapse>
          <span class="content-section__icon">${sec.icon}</span>
          <h3>${esc(sec.title)}</h3>
          <span class="content-section__count">${items.length}</span>
          <span class="content-section__chevron">⌄</span>
        </div>
        <div class="content-section__body">${fields}</div>
      </section>`;
  }).join('');

  return `
    <div>
      <div class="page-header"><h2>Контент сайта</h2>
        <div class="page-actions">
          ${state.contentDirty ? '<span class="dirty-hint" style="color:var(--yellow);font-size:13px;align-self:center">● Есть несохранённые изменения</span>' : ''}
          <button class="btn btn-primary" id="save-content-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить контент'}</button>
        </div>
      </div>
      <p class="content-html-hint">Поля с пометкой <span class="html-badge">HTML</span> понимают теги: <code>&lt;a href="..."&gt;ссылка&lt;/a&gt;</code>, <code>&lt;strong&gt;</code>, <code>&lt;em&gt;</code>, <code>&lt;br&gt;</code>. Заголовки секций можно сворачивать.</p>
      <nav class="content-nav">${nav}</nav>
      ${body}
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

// ── Map points (план острова) ───────────────────────────────────────────────

function renderMapView() {
  const pts = state.mapPoints || [];
  const rows = pts.length ? pts.map(p => {
    const color = MAP_CAT_COLORS[p.category] || '#2980b9';
    return `
    <div class="mp-row">
      <span class="mp-row__badge" style="background:${color}">${esc(p.num)}</span>
      <div class="mp-row__main">
        <div class="mp-row__name">${esc(p.name)} ${p.active ? '' : '<span class="badge badge-rejected" style="font-size:10px">скрыта</span>'}</div>
        <div class="mp-row__coord" data-coord-for="${p.id}">${fmtCoord(p.lat, p.lng)}</div>
      </div>
      <button class="btn btn-sm btn-secondary" data-edit-point="${p.id}">Изменить</button>
    </div>`;
  }).join('') : '<p style="color:var(--muted);padding:16px">Точек нет. Добавьте первую.</p>';

  return `
    <div>
      <div class="page-header"><h2>План острова <span style="font-size:14px;font-weight:400;color:var(--muted)">(${pts.length} точек)</span></h2>
        <div class="page-actions"><button class="btn btn-primary" id="add-point-btn">+ Точка</button></div>
      </div>
      <p class="content-html-hint">Перетаскивайте маркеры по карте — новое расположение сохраняется автоматически. Нажмите на маркер или «Изменить», чтобы отредактировать карточку (название, описание, фото).</p>
      <div class="map-editor">
        <div id="admin-map" class="map-editor__map"></div>
        <div class="map-editor__list">${rows}</div>
      </div>
    </div>`;
}

function renderMapPointModal() {
  const f = state.mapPointForm;
  const isEdit = !!f.id;
  const catOptions = Object.entries(MAP_CAT_LABELS).map(([k, label]) =>
    `<option value="${k}" ${f.category === k ? 'selected' : ''}>${label}</option>`).join('');
  return `
    <div class="modal-overlay" id="mp-modal-overlay">
      <div class="modal">
        <div class="modal-head"><h3>${isEdit ? 'Редактировать' : 'Новая'} точка</h3><button class="btn-icon" id="close-mp-modal">✕</button></div>
        <div class="modal-body">
          ${state.error ? `<div class="alert alert-error">${esc(state.error)}</div>` : ''}
          <div class="fields-row">
            <div class="field" style="max-width:110px"><label>Номер</label><input id="mp-num" type="number" min="0" value="${esc(f.num ?? 0)}"></div>
            <div class="field"><label>Название *</label><input id="mp-name" type="text" value="${esc(f.name || '')}" placeholder="Баня"></div>
          </div>
          <div class="field"><label>Категория</label>
            <select id="mp-cat">${catOptions}</select>
          </div>
          <div class="field"><label>Описание карточки <span class="html-badge">HTML</span></label>
            <textarea id="mp-desc" rows="4" placeholder="Текст, который откроется при клике на маркер. Можно вставлять &lt;a&gt;, &lt;strong&gt;, &lt;br&gt;…">${esc(f.description || '')}</textarea>
          </div>
          <div class="field">
            <label>Фото в карточке</label>
            <div style="display:flex;gap:8px;align-items:flex-end">
              <input id="mp-image" type="text" value="${esc(f.image_url || '')}" placeholder="/images/uploads/photo.jpg" style="flex:1">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer;white-space:nowrap">
                Загрузить<input type="file" id="mp-file" accept="image/*" style="display:none">
              </label>
            </div>
            ${f.image_url ? `<img src="${esc(f.image_url)}" style="margin-top:8px;max-height:100px;border-radius:6px;object-fit:cover">` : ''}
          </div>
          <div class="fields-row">
            <div class="field"><label>Широта (lat)</label><input id="mp-lat" type="number" step="0.0001" value="${esc(f.lat ?? '')}"></div>
            <div class="field"><label>Долгота (lng)</label><input id="mp-lng" type="number" step="0.0001" value="${esc(f.lng ?? '')}"></div>
          </div>
          <p style="font-size:12px;color:var(--muted);margin-top:-6px">Координаты удобнее задавать перетаскиванием маркера на карте.</p>
          <div class="fields-row">
            <div class="field"><label>Порядок сортировки</label><input id="mp-order" type="number" value="${esc(f.sort_order ?? 0)}"></div>
            <div class="field"><label>Статус</label>
              <select id="mp-active">
                <option value="1" ${f.active ? 'selected' : ''}>Показывать</option>
                <option value="0" ${!f.active ? 'selected' : ''}>Скрыть</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          ${isEdit ? `<button class="btn btn-danger" id="delete-mp-btn">Удалить</button>` : ''}
          <button class="btn btn-secondary" id="cancel-mp-modal">Отмена</button>
          <button class="btn btn-primary" id="save-mp-btn" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохранение...' : 'Сохранить'}</button>
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
      else if (v === 'tents')        { setState({ view: 'tents', tentForm: null });           loadTents(); }
      else if (v === 'availability') { setState({ view: 'availability', error: null });        loadAvailability(); }
      else if (v === 'prices')       { setState({ view: 'prices' }); loadPrices(); }
      else if (v === 'content')      { setState({ view: 'content' }); loadContent(); }
      else if (v === 'gallery')      { setState({ view: 'gallery', galleryPhotoForm: null }); loadGallery(); }
      else if (v === 'map')          { setState({ view: 'map', mapPointForm: null }); loadMapPoints(); }
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
  // Payments
  document.getElementById('create-payment-btn')?.addEventListener('click', createManagerPayment);
  root.querySelectorAll('[data-copy-pay]').forEach(btn =>
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copyPay)
        .then(() => { const t = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(() => { btn.textContent = t; }, 1500); })
        .catch(() => setState({ error: 'Не удалось скопировать ссылку' }));
    }));
  root.querySelectorAll('[data-refund-pay]').forEach(btn =>
    btn.addEventListener('click', () => refundPayment(Number(btn.dataset.refundPay))));
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

  // Tents handlers
  document.getElementById('add-tent-btn')?.addEventListener('click', () => openTentForm());
  root.querySelectorAll('[data-edit-tent]').forEach(btn =>
    btn.addEventListener('click', () => {
      const item = state.tents.find(e => e.id === Number(btn.dataset.editTent));
      if (item) openTentForm(item);
    }));
  root.querySelectorAll('[data-toggle-tent]').forEach(btn =>
    btn.addEventListener('click', () => toggleTentActive(Number(btn.dataset.toggleTent), Number(btn.dataset.tentActive) === 1)));
  root.querySelectorAll('[data-delete-tent]').forEach(btn =>
    btn.addEventListener('click', () => deleteTentItem(Number(btn.dataset.deleteTent))));

  // Tent modal handlers
  document.getElementById('close-tent-modal')?.addEventListener('click', () => setState({ tentForm: null, error: null }));
  document.getElementById('cancel-tent-modal')?.addEventListener('click', () => setState({ tentForm: null, error: null }));
  document.getElementById('tent-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) setState({ tentForm: null, error: null });
  });
  document.getElementById('save-tent-btn')?.addEventListener('click', () => {
    if (!state.tentForm) return;
    state.tentForm.name = document.getElementById('tf-name').value.trim();
    state.tentForm.price_key = document.getElementById('tf-pricekey').value;
    state.tentForm.image_url = document.getElementById('tf-image').value.trim();
    state.tentForm.images = document.getElementById('tf-images').value.trim();
    state.tentForm.length_m = document.getElementById('tf-length').value.trim();
    state.tentForm.capacity = document.getElementById('tf-capacity').value.trim();
    state.tentForm.note = document.getElementById('tf-note').value.trim();
    state.tentForm.sort_order = Number(document.getElementById('tf-order').value) || 0;
    state.tentForm.active = Number(document.getElementById('tf-active').value) === 1;
    saveTentItem();
  });
  document.getElementById('delete-tent-btn')?.addEventListener('click', () => {
    if (state.tentForm?.id) deleteTentItem(state.tentForm.id);
  });
  document.getElementById('tf-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      document.getElementById('tf-image').value = url;
      state.tentForm.image_url = url;
      const preview = document.querySelector('#tent-modal-overlay img');
      if (preview) { preview.src = url; } else {
        const imgContainer = document.getElementById('tf-image').parentElement;
        const img = document.createElement('img');
        img.src = url; img.style.cssText = 'margin-top:8px;max-height:80px;border-radius:6px;object-fit:cover';
        imgContainer.parentElement.appendChild(img);
      }
    } catch (err) { setState({ error: err.message }); }
  });

  // Availability handlers
  document.getElementById('avail-apply')?.addEventListener('click', applyAvailRange);
  root.querySelectorAll('.inv-input').forEach(input =>
    input.addEventListener('change', e => updateInvCapacity(e.target.dataset.invKey, e.target.value)));
  document.getElementById('save-inv-btn')?.addEventListener('click', saveInventoryAction);
  document.getElementById('add-block-btn')?.addEventListener('click', addBlockAction);
  root.querySelectorAll('[data-del-block]').forEach(btn =>
    btn.addEventListener('click', () => removeBlockAction(Number(btn.dataset.delBlock))));

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
    el.addEventListener('input', e => {
      const { key, part } = e.target.dataset;
      if (part != null && part !== '') {
        const parts = String(state.content[key] ?? '').split('|');
        parts[Number(part)] = e.target.value;
        updateContentField(key, parts.join('|'));
      } else {
        updateContentField(key, e.target.value);
      }
    });
  });
  root.querySelectorAll('.content-section__head[data-collapse]').forEach(h =>
    h.addEventListener('click', () => h.parentElement.classList.toggle('collapsed')));
  root.querySelectorAll('.content-nav__item[data-jump]').forEach(a =>
    a.addEventListener('click', () => {
      const sec = document.getElementById(a.dataset.jump);
      if (sec) { sec.classList.remove('collapsed'); sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }));

  // Map points handlers
  document.getElementById('add-point-btn')?.addEventListener('click', () => openMapPointForm());
  root.querySelectorAll('[data-edit-point]').forEach(btn =>
    btn.addEventListener('click', () => {
      const p = state.mapPoints.find(x => x.id === Number(btn.dataset.editPoint));
      if (p) openMapPointForm(p);
    }));
  document.getElementById('close-mp-modal')?.addEventListener('click', () => setState({ mapPointForm: null, error: null }));
  document.getElementById('cancel-mp-modal')?.addEventListener('click', () => setState({ mapPointForm: null, error: null }));
  document.getElementById('mp-modal-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) setState({ mapPointForm: null, error: null });
  });
  document.getElementById('save-mp-btn')?.addEventListener('click', saveMapPoint);
  document.getElementById('delete-mp-btn')?.addEventListener('click', () => {
    if (state.mapPointForm?.id) deleteMapPoint(state.mapPointForm.id);
  });
  document.getElementById('mp-file')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFile(file);
      document.getElementById('mp-image').value = url;
      state.mapPointForm.image_url = url;
      const preview = document.querySelector('#mp-modal-overlay img');
      if (preview) { preview.src = url; } else {
        const imgContainer = document.getElementById('mp-image').parentElement;
        const img = document.createElement('img');
        img.src = url; img.style.cssText = 'margin-top:8px;max-height:100px;border-radius:6px;object-fit:cover';
        imgContainer.parentElement.appendChild(img);
      }
    } catch (err) { setState({ error: err.message }); }
  });

  // Карту инициализируем после вставки DOM (innerHTML заменяется каждый render)
  if (state.view === 'map') initAdminMap();
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
