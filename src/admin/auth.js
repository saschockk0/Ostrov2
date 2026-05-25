const crypto = require('crypto');

const COOKIE_NAME = 'ostrov_admin_sid';
const SESSION_TTL = 8 * 60 * 60 * 1000;
const sessions = new Map();

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const [k, ...v] = part.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=');
  });
  return cookies;
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

function validateSession(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(token); return false; }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

function checkCredentials(login, password) {
  const adminLogin = process.env.ADMIN_LOGIN;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminLogin || !adminPassword) {
    console.error('[Admin] ADMIN_LOGIN or ADMIN_PASSWORD not set in .env');
    return false;
  }
  const secret = process.env.ADMIN_SESSION_SECRET || 'ostrov-admin-secret';
  const hmac = (val) => crypto.createHmac('sha256', secret).update(val).digest();
  try {
    const loginOk = crypto.timingSafeEqual(hmac(login || ''), hmac(adminLogin));
    const pwOk = crypto.timingSafeEqual(hmac(password || ''), hmac(adminPassword));
    return loginOk && pwOk;
  } catch {
    return false;
  }
}

function requireAuth(req, res, next) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (validateSession(token)) return next();
  res.status(401).json({ error: 'Не авторизован' });
}

module.exports = { COOKIE_NAME, SESSION_TTL, createSession, destroySession, checkCredentials, requireAuth, parseCookies, validateSession };
