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
const { listVideos, createVideo, updateVideo, deleteVideo } = require('./video-db');
const { listFleet, getFleetItem, createFleetItem, updateFleetItem, deleteFleetItem } = require('./fleet-db');
const { listTents, createTentItem, updateTentItem, deleteTentItem } = require('./tents-db');
const { listMapPoints, createMapPoint, updateMapPoint, deleteMapPoint } = require('./map-points-db');
const { listInventory, saveInventory } = require('./inventory-db');
const { listBlocks, createBlock, deleteBlock } = require('./blocks-db');
const { computeAvailability } = require('../availability');
const { getPrices, savePrices } = require('../pricing');
const yookassa = require('../payments/yookassa');
const {
  insertPayment, updatePayment, getPaymentById,
  listPaymentsForApplication, recalcPaidAmount,
} = require('../payments/payments-db');
const { sendPaymentLink } = require('../email');

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

// Дата в формате YYYY-MM-DD и валидна как Date.
function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  return !Number.isNaN(new Date(s).getTime());
}

const BLOCK_RESOURCE_KEYS = new Set([
  'all', 'campSpots', 'tent1', 'tent2', 'tent3',
  'canopyEverest', 'canopyLarge', 'canopyMedium', 'canopySmall',
]);

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

// Загрузка видео-роликов: тяжелее картинок, отдельный лимит и mime-фильтр.
// Поле `file` — видео, `poster` — постер-картинка (опционально).
const uploadVideo = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 7)}${ext}`);
    },
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'poster') return cb(null, /image\/(jpeg|png|webp)/.test(file.mimetype));
    cb(null, /video\/(mp4|webm|quicktime)/.test(file.mimetype));
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

  // ── Payments (предоплата по СБП / ЮKassa) ──────────────────────────────

  router.get('/api/applications/:id/payments', async (req, res) => {
    try {
      res.json(await listPaymentsForApplication(db, Number(req.params.id)));
    } catch (err) { console.error('List payments error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // Менеджер выставляет счёт на произвольную сумму.
  router.post('/api/applications/:id/payment', async (req, res) => {
    try {
      if (!yookassa.isConfigured()) return res.status(503).json({ error: 'ЮKassa не настроена (нет ключей).' });
      const appId = Number(req.params.id);
      const application = await getApplication(db, appId);
      if (!application) return res.status(404).json({ error: 'Заявка не найдена' });

      const rub = Number(req.body?.amountRub);
      if (!Number.isFinite(rub) || rub <= 0) return res.status(400).json({ error: 'Введите сумму больше нуля' });
      if (rub > 1000000) return res.status(400).json({ error: 'Слишком большая сумма' });
      const kopecks = Math.round(rub * 100);
      const description = String(req.body?.description || `Предоплата по заявке #${appId} — Парусный Клуб «Остров»`).slice(0, 128);

      const paymentId = await insertPayment(db, {
        applicationId: appId, amountKopecks: kopecks, description, source: 'manager', metadata: { manual: true },
      });

      const returnUrl = `${req.protocol}://${req.get('host')}/payment-result.html?app=${appId}`;
      const yk = await yookassa.createPayment({
        amountKopecks: kopecks, description, returnUrl,
        email: application.email, phone: application.phone,
        metadata: { applicationId: appId, paymentId },
      });

      const confirmationUrl = yk.confirmation?.confirmation_url || null;
      await updatePayment(db, paymentId, { yookassa_id: yk.id, status: yk.status, confirmation_url: confirmationUrl });

      let emailed = false;
      if (req.body?.sendToClient && application.email && confirmationUrl) {
        try {
          const r = await sendPaymentLink({ to: application.email, applicationId: appId, amountKopecks: kopecks, confirmationUrl });
          emailed = !!r.sent;
        } catch (e) { console.error('Payment link email error:', e.message); }
      }
      res.status(201).json({ ok: true, paymentId, confirmationUrl, amount: rub, emailed });
    } catch (err) {
      console.error('Manager create payment error:', err.message);
      res.status(502).json({ error: 'Не удалось создать счёт. Проверьте ключи ЮKassa.' });
    }
  });

  router.post('/api/payments/:id/refund', async (req, res) => {
    try {
      if (!yookassa.isConfigured()) return res.status(503).json({ error: 'ЮKassa не настроена.' });
      const payment = await getPaymentById(db, Number(req.params.id));
      if (!payment) return res.status(404).json({ error: 'Платёж не найден' });
      if (payment.status !== 'succeeded') return res.status(400).json({ error: 'Возврат возможен только по успешному платежу' });

      const refund = await yookassa.createRefund({ paymentId: payment.yookassa_id, amountKopecks: payment.amount_kopecks });
      if (refund.status === 'succeeded') {
        await updatePayment(db, payment.id, { status: 'refunded', refunded_at: new Date().toISOString() });
        await recalcPaidAmount(db, payment.application_id);
      }
      res.json({ ok: true, status: refund.status });
    } catch (err) {
      console.error('Refund error:', err.message);
      res.status(502).json({ error: 'Не удалось оформить возврат.' });
    }
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

  const GALLERY_CATEGORIES = new Set(['', 'regatta', 'bonfire', 'sunset']);
  const cleanCategory = (c) => (GALLERY_CATEGORIES.has(c) ? c : '');

  router.get('/api/gallery', async (req, res) => {
    try { res.json(await listPhotos(db)); }
    catch (err) { console.error('List gallery error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/gallery', async (req, res) => {
    try {
      if (!req.body?.url) return res.status(400).json({ error: 'URL обязателен' });
      if (!isValidUrl(req.body.url)) return res.status(400).json({ error: 'Недопустимый URL изображения' });
      res.status(201).json(await createPhoto(db, { ...req.body, category: cleanCategory(req.body.category) }));
    } catch (err) { console.error('Create photo error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // Массовая загрузка: несколько файлов + одна категория на всю пачку
  router.post('/api/gallery/bulk', upload.array('files', 30), async (req, res) => {
    try {
      if (!req.files?.length) return res.status(400).json({ error: 'Файлы не загружены или неверный формат' });
      const category = cleanCategory(req.body?.category);
      const created = [];
      for (const f of req.files) {
        created.push(await createPhoto(db, { url: `/images/uploads/${f.filename}`, caption: '', category }));
      }
      res.status(201).json(created);
    } catch (err) { console.error('Bulk gallery upload error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/gallery/:id', async (req, res) => {
    try {
      const patch = { ...(req.body || {}) };
      if (patch.category !== undefined) patch.category = cleanCategory(patch.category);
      res.json(await updatePhoto(db, Number(req.params.id), patch));
    } catch (err) { console.error('Update photo error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/gallery/:id', async (req, res) => {
    try { await deletePhoto(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete photo error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Videos ─────────────────────────────────────────────────────────────

  router.get('/api/video', async (req, res) => {
    try { res.json(await listVideos(db)); }
    catch (err) { console.error('List video error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // Загрузка видео-файла → возвращает URL (как /api/upload для картинок, но с видео-лимитом).
  router.post('/api/upload-video', uploadVideo.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен или неверный формат' });
    res.json({ url: `/images/uploads/${req.file.filename}` });
  });

  router.post('/api/video', async (req, res) => {
    try {
      if (!req.body?.url) return res.status(400).json({ error: 'Загрузите видео или укажите URL' });
      if (!isValidUrl(req.body.url)) return res.status(400).json({ error: 'Недопустимый URL видео' });
      if (req.body.poster && !isValidUrl(req.body.poster)) return res.status(400).json({ error: 'Недопустимый URL постера' });
      res.status(201).json(await createVideo(db, {
        url: req.body.url, poster: req.body.poster || '', caption: req.body.caption || '',
        active: req.body.active !== undefined ? req.body.active : true,
        sort_order: req.body.sort_order || 0,
      }));
    } catch (err) { console.error('Create video error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/video/:id', async (req, res) => {
    try { res.json(await updateVideo(db, Number(req.params.id), req.body || {})); }
    catch (err) { console.error('Update video error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/video/:id', async (req, res) => {
    try { await deleteVideo(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete video error:', err); res.status(500).json({ error: GENERIC_ERR }); }
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

  // ── Tents (шатры) ──────────────────────────────────────────────────────

  router.get('/api/tents', async (req, res) => {
    try { res.json(await listTents(db)); }
    catch (err) { console.error('List tents error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/tents', async (req, res) => {
    try {
      if (!req.body?.name) return res.status(400).json({ error: 'Название обязательно' });
      if (!isValidUrl(req.body.image_url)) return res.status(400).json({ error: 'Недопустимый URL изображения' });
      if (!areValidImageUrls(req.body.images)) return res.status(400).json({ error: 'Недопустимый URL в списке доп. фото' });
      res.status(201).json(await createTentItem(db, req.body));
    } catch (err) { console.error('Create tent error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/tents/:id', async (req, res) => {
    try {
      if (req.body?.image_url !== undefined && !isValidUrl(req.body.image_url))
        return res.status(400).json({ error: 'Недопустимый URL изображения' });
      if (req.body?.images !== undefined && !areValidImageUrls(req.body.images))
        return res.status(400).json({ error: 'Недопустимый URL в списке доп. фото' });
      res.json(await updateTentItem(db, Number(req.params.id), req.body || {}));
    }
    catch (err) { console.error('Update tent error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/tents/:id', async (req, res) => {
    try { await deleteTentItem(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete tent error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Map points (план острова) ──────────────────────────────────────────

  router.get('/api/map-points', async (req, res) => {
    try { res.json(await listMapPoints(db)); }
    catch (err) { console.error('List map points error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/map-points', async (req, res) => {
    try {
      if (!req.body?.name) return res.status(400).json({ error: 'Название обязательно' });
      if (!isValidUrl(req.body.image_url)) return res.status(400).json({ error: 'Недопустимый URL изображения' });
      res.status(201).json(await createMapPoint(db, req.body));
    } catch (err) { console.error('Create map point error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.patch('/api/map-points/:id', async (req, res) => {
    try {
      if (req.body?.image_url !== undefined && !isValidUrl(req.body.image_url))
        return res.status(400).json({ error: 'Недопустимый URL изображения' });
      res.json(await updateMapPoint(db, Number(req.params.id), req.body || {}));
    }
    catch (err) { console.error('Update map point error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/map-points/:id', async (req, res) => {
    try { await deleteMapPoint(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete map point error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Inventory (ёмкости) + Availability (загрузка) ──────────────────────

  router.get('/api/inventory', async (req, res) => {
    try { res.json(await listInventory(db)); }
    catch (err) { console.error('List inventory error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.put('/api/inventory', async (req, res) => {
    try {
      const items = Array.isArray(req.body) ? req.body : (req.body?.items || []);
      if (!Array.isArray(items)) return res.status(400).json({ error: 'Неверный формат данных' });
      for (const it of items) {
        if (it && it.capacity !== undefined && (!Number.isFinite(Number(it.capacity)) || Number(it.capacity) < 0))
          return res.status(400).json({ error: 'Ёмкость должна быть числом ≥ 0' });
      }
      res.json(await saveInventory(db, items));
    } catch (err) { console.error('Save inventory error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.get('/api/availability', async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!isValidDateStr(from) || !isValidDateStr(to) || !(new Date(from) < new Date(to)))
        return res.status(400).json({ error: 'Укажите корректный период (from < to, YYYY-MM-DD)' });
      res.json(await computeAvailability(db, { from, to, statuses: ['confirmed'] }));
    } catch (err) { console.error('Availability error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  // ── Manual blocks (ручные блокировки дат) ──────────────────────────────

  router.get('/api/blocks', async (req, res) => {
    try {
      const { from, to } = req.query;
      const range = isValidDateStr(from) && isValidDateStr(to) ? { from, to } : {};
      res.json(await listBlocks(db, range));
    } catch (err) { console.error('List blocks error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.post('/api/blocks', async (req, res) => {
    try {
      const b = req.body || {};
      const resource_key = String(b.resource_key || 'all');
      if (!BLOCK_RESOURCE_KEYS.has(resource_key)) return res.status(400).json({ error: 'Неизвестный ресурс' });
      if (!isValidDateStr(b.start_date) || !isValidDateStr(b.end_date) || !(new Date(b.start_date) < new Date(b.end_date)))
        return res.status(400).json({ error: 'Укажите корректный период (начало < конец)' });
      if (resource_key !== 'all' && (!Number.isFinite(Number(b.qty)) || Number(b.qty) < 1))
        return res.status(400).json({ error: 'Укажите количество ≥ 1' });
      res.status(201).json(await createBlock(db, b));
    } catch (err) { console.error('Create block error:', err); res.status(500).json({ error: GENERIC_ERR }); }
  });

  router.delete('/api/blocks/:id', async (req, res) => {
    try { await deleteBlock(db, Number(req.params.id)); res.json({ ok: true }); }
    catch (err) { console.error('Delete block error:', err); res.status(500).json({ error: GENERIC_ERR }); }
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
