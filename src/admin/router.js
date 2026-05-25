const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
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
const { getPrices, savePrices } = require('../pricing');

const ADMIN_STATIC = path.join(__dirname, '..', '..', 'public', 'admin');
const VALID_STATUSES = new Set(['new', 'in_progress', 'confirmed', 'rejected']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, /image\/(jpeg|png|webp|gif)/.test(file.mimetype));
  },
});

async function uploadFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require('@vercel/blob');
    const blob = await put(`uploads/${filename}`, file.buffer, {
      access: 'public',
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  // Local fallback: save to disk
  const uploadsDir = path.join(__dirname, '..', '..', 'public', 'images', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/images/uploads/${filename}`;
}

function createAdminRouter() {
  const router = express.Router();

  // ── Public auth ────────────────────────────────────────────────────────

  router.post('/api/login', (req, res) => {
    const { login, password } = req.body || {};
    if (!checkCredentials(login, password)) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = createSession();
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${token}; HttpOnly; Path=/ostrov-admin; SameSite=Strict; Max-Age=${SESSION_TTL / 1000}`);
    res.json({ ok: true });
  });

  router.post('/api/logout', (req, res) => {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) destroySession(token);
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=; HttpOnly; Path=/ostrov-admin; SameSite=Strict; Max-Age=0`);
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
    try { res.json(await getStats()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Applications ───────────────────────────────────────────────────────

  router.get('/api/applications/export.csv', async (req, res) => {
    try {
      const apps = await listApplications({ status: req.query.status, search: req.query.search, limit: 10000 });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
      res.send('﻿' + generateCsv(apps));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/api/applications', async (req, res) => {
    try {
      res.json(await listApplications({
        status: req.query.status, search: req.query.search,
        limit: Number(req.query.limit) || 100, offset: Number(req.query.offset) || 0,
      }));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/api/applications/:id', async (req, res) => {
    try {
      const app = await getApplication(Number(req.params.id));
      if (!app) return res.status(404).json({ error: 'Заявка не найдена' });
      res.json(app);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/api/applications/:id', async (req, res) => {
    try {
      const { status, manager_note } = req.body || {};
      if (status !== undefined && !VALID_STATUSES.has(status))
        return res.status(400).json({ error: 'Недопустимый статус' });
      await updateApplication(Number(req.params.id), { status, manager_note });
      res.json(await getApplication(Number(req.params.id)));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/api/applications', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.phone)
        return res.status(400).json({ error: 'Имя и телефон обязательны' });
      const id = await insertManualApplication(body);
      res.status(201).json(await getApplication(id));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Events ─────────────────────────────────────────────────────────────

  router.get('/api/events', async (req, res) => {
    try { res.json(await listEvents()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/api/events', async (req, res) => {
    try {
      if (!req.body?.title) return res.status(400).json({ error: 'Название обязательно' });
      res.status(201).json(await createEvent(req.body));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/api/events/:id', async (req, res) => {
    try { res.json(await updateEvent(Number(req.params.id), req.body || {})); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/api/events/:id', async (req, res) => {
    try { await deleteEvent(Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Prices ─────────────────────────────────────────────────────────────

  router.get('/api/prices', (req, res) => {
    try { res.json(getPrices()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.put('/api/prices', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.seasonalStayRates || !body.perDayItems || !body.fixedItems)
        return res.status(400).json({ error: 'Неверный формат данных' });
      await savePrices(body);
      res.json({ ok: true, prices: getPrices() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Content ────────────────────────────────────────────────────────────

  router.get('/api/content', async (req, res) => {
    try { res.json(await getAllContent()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.get('/api/content/labels', (req, res) => {
    res.json(CONTENT_LABELS);
  });

  router.put('/api/content', async (req, res) => {
    try {
      await setManyContent(req.body || {});
      res.json({ ok: true, content: await getAllContent() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Gallery ────────────────────────────────────────────────────────────

  router.get('/api/gallery', async (req, res) => {
    try { res.json(await listPhotos()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.post('/api/gallery', async (req, res) => {
    try {
      if (!req.body?.url) return res.status(400).json({ error: 'URL обязателен' });
      res.status(201).json(await createPhoto(req.body));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.patch('/api/gallery/:id', async (req, res) => {
    try { res.json(await updatePhoto(Number(req.params.id), req.body || {})); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  router.delete('/api/gallery/:id', async (req, res) => {
    try { await deletePhoto(Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── File upload ────────────────────────────────────────────────────────

  router.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен или неверный формат' });
    try {
      const url = await uploadFile(req.file);
      res.json({ url });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
  });

  // ── Static + SPA ───────────────────────────────────────────────────────

  router.use(express.static(ADMIN_STATIC, { index: false }));
  router.get('/', (req, res) => res.sendFile(path.join(ADMIN_STATIC, 'index.html')));

  return router;
}

module.exports = { createAdminRouter };
