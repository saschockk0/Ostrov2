const express = require('express');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const {
  COOKIE_NAME, SESSION_TTL, createSession, destroySession,
  checkCredentials, requireAuth, parseCookies, validateSession,
} = require('./auth');
const {
  listApplications, getApplication, updateApplication,
  insertManualApplication, getStats, generateCsv,
} = require('./db');
const { listEvents, getEvent, createEvent, updateEvent, deleteEvent } = require('./events-db');
const { getAllContent, setManyContent, CONTENT_LABELS } = require('./content-db');
const { listPhotos, getPhoto, createPhoto, updatePhoto, deletePhoto } = require('./gallery-db');
const { listFleet, getFleetItem, createFleetItem, updateFleetItem, deleteFleetItem } = require('./fleet-db');
const { getPrices, savePrices } = require('../pricing');

const ADMIN_STATIC = path.join(__dirname, '..', '..', 'public', 'admin');
const VALID_STATUSES = new Set(['new', 'in_progress', 'confirmed', 'rejected']);

const GENERIC_ERR = 'Ошибка сервера. Попробуйте позже.';
const IS_PROD = process.env.NODE_ENV === 'production';

function cookieFlags() {
  const base = `HttpOnly; Path=/ostrov-admin; SameSite=Strict`;
  return IS_PROD ? `${base}; Secure` : base;
}

function isValidUrl(url) {
  if (!url) return true;
  if (url.startsWith('/')) return true;
  try { const u = new URL(url); return u.protocol === 'https:' || u.protocol === 'http:'; }
  catch { return false; }
}

// Validates a multi-line list of image URLs (one per line); empty is allowed.
function areValidImageUrls(images) {
  if (!images) return true;
  return String(images).split('\n').map(s => s.trim()).filter(Boolean).every(isValidUrl);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
});

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'public', 'images', 'uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`);
    },
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /image\/(jpeg|png|webp|gif)/.test(file.mimetype));
  },
});

function createAdminRouter(db) {
  const router = express.Router();

  // ── Public auth ────────────────────────────────────────────────────────

  router.post('/api/login', loginLimiter, (req, res) => {
    const { login, password } = req.body || {};
    if (!checkCredentials(login, password)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = createSession();
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${token}; ${cookieFlags()}; Max-Age=${SESSION_TTL / 1000}`);
    res.json({ ok: true });
  });

  router.post('/api/logout', (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) destroySession(token);
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=; ${cookieFlags()}; Max-Age=0`);
    res.json({ ok: true });
  });

  router.get('/api/me', (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    if (validateSession(token)) return res.json({ ok: true, login: process.env.ADMIN_LOGIN || 'admin' });
    res.status(401).json({ error: 'Не авторизован' });
  });

  // ── Auth guard ─────────────────────────────────────────────────────────

  router.use('/api', requireAuth);

  // ── Stats ──────────────────────────────────────────────────────────────

  router.get('/api/stats', async (req, res) => {
    try { res.json(await getStats(db)); }
    catch (err) { console.error('Admin stats error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Applications ───────────────────────────────────────────────────────

  router.get('/api/applications/export.csv', async (req, res) => {
    try {
      const apps = await listApplications(db, { status: req.query.status, search: req.query.search, limit: 10000 });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
      res.send('﻿' + generateCsv(apps));
    } catch (err) { console.error('CSV export error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.get('/api/applications', async (req, res) => {
    try {
      res.json(await listApplications(db, {
        status: req.query.status, search: req.query.search,
        limit: Number(req.query.limit) || 100, offset: Number(req.query.offset) || 0,
      }));
    } catch (err) { console.error('List apps error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.get('/api/applications/:id', async (req, res) => {
    try {
      const app = await getApplication(db, Number(req.params.id));
      if (!app) return res.status(404).json({ error: 'Заявка не найдена' });
      res.json(app);
    } catch (err) { console.error('Get app error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/applications/:id', async (req, res) => {
    try {
      const { status, manager_note } = req.body || {};
      if (status !== undefined && !VALID_STATUSES.has(status))
        return res.status(400).json({ error: 'Недопустимый статус' });
      await updateApplication(db, Number(req.params.id), { status, manager_note });
      res.json(await getApplication(db, Number(req.params.id)));
    } catch (err) { console.error('Patch app error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/applications', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.phone)
        return res.status(400).json({ error: 'Имя и телефон обязательны' });
      const id = await insertManualApplication(db, body);
      res.status(201).json(await getApplication(db, id));
    } catch (err) { console.error('Create app error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Events ─────────────────────────────────────────────────────────────

  router.get('/api/events', async (req, res) => {
    try { res.json(await listEvents(db)); }
    catch (err) { console.error('List events error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/events', async (req, res) => {
    try {
      if (!req.body?.title) return res.status(400).json({ error: 'Название обязательно' });
      if (!isValidUrl(req.body.image_url)) return res.status(400).json({ error: 'Недопустимый URL изображения' });
      res.status(201).json(await createEvent(db, req.body));
    } catch (err) { console.error('Create event error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/events/:id', async (req, res) => {
    try {
      if (req.body?.image_url !== undefined && !isValidUrl(req.body.image_url))
        return res.status(400).json({ error: 'Недопустимый URL изображения' });
      res.json(await updateEvent(db, Number(req.params.id), req.body || {}));
    }
    catch (err) { console.error('Update event error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/events/:id', async (req, res) => {
    try { await deleteEvent(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete event error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Prices ─────────────────────────────────────────────────────────────

  router.get('/api/prices', (req, res) => {
    try { res.json(getPrices()); }
    catch (err) { console.error('Get prices error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.put('/api/prices', (req, res) => {
    try {
      const body = req.body || {};
      if (!body.seasonalStayRates || !body.perDayItems || !body.fixedItems)
        return res.status(400).json({ error: 'Неверный формат данных' });
      savePrices(body);
      res.json({ ok: true, prices: getPrices() });
    } catch (err) { console.error('Save prices error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Content ────────────────────────────────────────────────────────────

  router.get('/api/content', async (req, res) => {
    try { res.json(await getAllContent(db)); }
    catch (err) { console.error('Get content error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.get('/api/content/labels', (req, res) => {
    res.json(CONTENT_LABELS);
  });

  router.put('/api/content', async (req, res) => {
    try {
      await setManyContent(db, req.body || {});
      res.json({ ok: true, content: await getAllContent(db) });
    } catch (err) { console.error('Save content error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Gallery ────────────────────────────────────────────────────────────

  router.get('/api/gallery', async (req, res) => {
    try { res.json(await listPhotos(db)); }
    catch (err) { console.error('List gallery error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/gallery', async (req, res) => {
    try {
      if (!req.body?.url) return res.status(400).json({ error: 'URL обязателен' });
      if (!isValidUrl(req.body.url)) return res.status(400).json({ error: 'Недопустимый URL изображения' });
      res.status(201).json(await createPhoto(db, req.body));
    } catch (err) { console.error('Create photo error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/gallery/:id', async (req, res) => {
    try { res.json(await updatePhoto(db, Number(req.params.id), req.body || {})); }
    catch (err) { console.error('Update photo error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/gallery/:id', async (req, res) => {
    try { await deletePhoto(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete photo error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Fleet ──────────────────────────────────────────────────────────────

  router.get('/api/fleet', async (req, res) => {
    try { res.json(await listFleet(db)); }
    catch (err) { console.error('List fleet error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/fleet', async (req, res) => {
    try {
      if (!req.body?.name) return res.status(400).json({ error: 'Название обязательно' });
      if (!isValidUrl(req.body.image_url)) return res.status(400).json({ error: 'Недопустимый URL изображения' });
      if (!areValidImageUrls(req.body.images)) return res.status(400).json({ error: 'Недопустимый URL в списке доп. фото' });
      res.status(201).json(await createFleetItem(db, req.body));
    } catch (err) { console.error('Create fleet error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/fleet/:id', async (req, res) => {
    try {
      if (req.body?.image_url !== undefined && !isValidUrl(req.body.image_url))
        return res.status(400).json({ error: 'Недопустимый URL изображения' });
      if (req.body?.images !== undefined && !areValidImageUrls(req.body.images))
        return res.status(400).json({ error: 'Недопустимый URL в списке доп. фото' });
      res.json(await updateFleetItem(db, Number(req.params.id), req.body || {}));
    }
    catch (err) { console.error('Update fleet error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/fleet/:id', async (req, res) => {
    try { await deleteFleetItem(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete fleet error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── File upload ────────────────────────────────────────────────────────

  router.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен или неверный формат' });
    res.json({ url: `/images/uploads/${req.file.filename}` });
  });

  // ── Static + SPA ───────────────────────────────────────────────────────

  router.use(express.static(ADMIN_STATIC, { index: false }));
  router.get('/', (req, res) => res.sendFile(path.join(ADMIN_STATIC, 'index.html')));

  return router;
}

module.exports = { createAdminRouter };
