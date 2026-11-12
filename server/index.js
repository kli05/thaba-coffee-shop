import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { store, storageType } from './store.js';
import { seedIfEmpty } from './seed-data.js';

const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';
for (const v of ['JWT_SECRET', 'STAFF_PASSWORD']) {
  if (isProd && !process.env[v]) throw new Error(`${v} must be set in production`);
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const STAFF_USERNAME = process.env.STAFF_USERNAME || 'staff';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || 'coffee123';
const TZ_OFFSET = Number(process.env.TZ_OFFSET_MINUTES ?? 120);
const STATUSES = ['Pending', 'Preparing', 'Ready', 'Collected'];

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const localDate = (iso) => new Date(new Date(iso).getTime() + TZ_OFFSET * 60000).toISOString().slice(0, 10);
const round2 = (n) => Math.round(n * 100) / 100;

const app = express();
const origins = (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: '50kb' }));

// ---------- helpers ----------
async function getMenuItem(id) {
  const raw = await store.get(`menu:${id}`);
  return raw ? JSON.parse(raw) : null;
}
async function getAll(prefix, idsKey) {
  const ids = await store.smembers(idsKey);
  if (!ids.length) return [];
  const raws = await store.mget(ids.map((id) => `${prefix}:${id}`));
  return raws.filter(Boolean).map((r) => JSON.parse(r));
}

function parseMenuInput(b, partial = false) {
  const out = {}, errors = [];
  if (!b || typeof b !== 'object') throw new HttpError(400, 'Request body must be JSON');
  if (!partial || b.name !== undefined) {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 80) errors.push('name is required (max 80 characters)');
    else out.name = b.name.trim();
  }
  if (b.description !== undefined || !partial) {
    const d = b.description ?? '';
    if (typeof d !== 'string' || d.length > 300) errors.push('description must be text up to 300 characters');
    else out.description = d.trim();
  }
  if (!partial || b.price !== undefined) {
    const p = Number(b.price);
    if (b.price === '' || b.price === null || !Number.isFinite(p) || p < 0 || p > 10000) errors.push('price must be a number between 0 and 10000');
    else out.price = round2(p);
  }
  if (b.category !== undefined || !partial) {
    const c = b.category ?? 'Other';
    if (typeof c !== 'string' || !c.trim() || c.length > 40) errors.push('category must be text up to 40 characters');
    else out.category = c.trim();
  }
  if (b.available !== undefined || !partial) {
    const a = b.available ?? true;
    if (typeof a !== 'boolean') errors.push('available must be true or false');
    else out.available = a;
  }
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);
  return out;
}

function requireStaff(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Staff login required'));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'staff') throw new Error('bad role');
    req.user = payload;
    next();
  } catch {
    next(new HttpError(401, 'Session expired or invalid. Please log in again.'));
  }
}

// ---------- health & auth ----------
app.get('/api/health', (_req, res) => res.json({ status: 'ok', storage: storageType, time: new Date().toISOString() }));

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const ok = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  if (!ok(username, STAFF_USERNAME) || !ok(password, STAFF_PASSWORD)) throw new HttpError(401, 'Wrong username or password');
  const token = jwt.sign({ role: 'staff', sub: STAFF_USERNAME }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ---------- menu ----------
app.get('/api/menu', wrap(async (_req, res) => {
  const items = await getAll('menu', 'menu:ids');
  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  res.json(items);
}));

app.get('/api/menu/:id', wrap(async (req, res) => {
  const item = await getMenuItem(req.params.id);
  if (!item) throw new HttpError(404, 'Menu item not found');
  res.json(item);
}));

app.post('/api/menu', requireStaff, wrap(async (req, res) => {
  const data = parseMenuInput(req.body);
  const item = { id: crypto.randomUUID(), ...data };
  await store.set(`menu:${item.id}`, JSON.stringify(item));
  await store.sadd('menu:ids', item.id);
  res.status(201).json(item);
}));

app.put('/api/menu/:id', requireStaff, wrap(async (req, res) => {
  const existing = await getMenuItem(req.params.id);
  if (!existing) throw new HttpError(404, 'Menu item not found');
  const item = { ...existing, ...parseMenuInput(req.body, true), id: existing.id };
  await store.set(`menu:${item.id}`, JSON.stringify(item));
  res.json(item);
}));

app.delete('/api/menu/:id', requireStaff, wrap(async (req, res) => {
  const existing = await getMenuItem(req.params.id);
  if (!existing) throw new HttpError(404, 'Menu item not found');
  await store.del(`menu:${existing.id}`);
  await store.srem('menu:ids', existing.id);
  res.status(204).end();
}));

// ---------- orders ----------
app.post('/api/orders', wrap(async (req, res) => {
  const b = req.body || {};
  const errors = [];
  const name = typeof b.customerName === 'string' ? b.customerName.trim() : '';
  if (!name || name.length > 60) errors.push('customerName is required (max 60 characters)');
  const notes = b.notes === undefined || b.notes === null ? '' : b.notes;
  if (typeof notes !== 'string' || notes.length > 200) errors.push('notes must be text up to 200 characters');
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50) errors.push('items must be a list of 1 to 50 entries');
  else b.items.forEach((it, i) => {
    if (!it || typeof it.menuId !== 'string') errors.push(`items[${i}].menuId is required`);
    if (!Number.isInteger(it?.quantity) || it.quantity < 1 || it.quantity > 50) errors.push(`items[${i}].quantity must be a whole number from 1 to 50`);
  });
  if (errors.length) throw new HttpError(400, 'Validation failed', errors);

  // Merge duplicate lines, then price everything from the server's own menu (never trust client prices).
  const wanted = new Map();
  for (const it of b.items) wanted.set(it.menuId, (wanted.get(it.menuId) || 0) + it.quantity);
  const lines = [];
  for (const [menuId, quantity] of wanted) {
    const item = await getMenuItem(menuId);
    if (!item) throw new HttpError(400, `Menu item ${menuId} does not exist`);
    if (!item.available) throw new HttpError(400, `${item.name} is currently unavailable`);
    lines.push({ menuId, name: item.name, price: item.price, quantity, lineTotal: round2(item.price * quantity) });
  }
  const number = 1000 + (await store.incr('order:counter'));
  const now = new Date().toISOString();
  const order = {
    id: crypto.randomUUID(), orderNumber: number, customerName: name, notes: notes.trim(),
    items: lines, total: round2(lines.reduce((s, l) => s + l.lineTotal, 0)),
    status: 'Pending', createdAt: now, updatedAt: now,
  };
  await store.set(`order:${order.id}`, JSON.stringify(order));
  await store.sadd('orders:ids', order.id);
  res.status(201).json(order);
}));

app.get('/api/orders', requireStaff, wrap(async (req, res) => {
  let orders = await getAll('order', 'orders:ids');
  if (req.query.status) orders = orders.filter((o) => o.status === req.query.status);
  if (req.query.date) orders = orders.filter((o) => localDate(o.createdAt) === req.query.date);
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(orders);
}));

app.get('/api/summary', requireStaff, wrap(async (req, res) => {
  const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : localDate(new Date().toISOString());
  const orders = (await getAll('order', 'orders:ids')).filter((o) => localDate(o.createdAt) === date);
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const itemCounts = {};
  for (const o of orders) {
    byStatus[o.status] += 1;
    for (const l of o.items) itemCounts[l.name] = (itemCounts[l.name] || 0) + l.quantity;
  }
  const topItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, quantity]) => ({ name, quantity }));
  res.json({ date, orderCount: orders.length, revenue: round2(orders.reduce((s, o) => s + o.total, 0)), byStatus, topItems });
}));

// Order ids are random UUIDs, so customers can safely look up their own order by id.
app.get('/api/orders/:id', wrap(async (req, res) => {
  const raw = await store.get(`order:${req.params.id}`);
  if (!raw) throw new HttpError(404, 'Order not found');
  res.json(JSON.parse(raw));
}));

app.patch('/api/orders/:id/status', requireStaff, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Validation failed', [`status must be one of: ${STATUSES.join(', ')}`]);
  const raw = await store.get(`order:${req.params.id}`);
  if (!raw) throw new HttpError(404, 'Order not found');
  const order = { ...JSON.parse(raw), status, updatedAt: new Date().toISOString() };
  await store.set(`order:${order.id}`, JSON.stringify(order));
  res.json(order);
}));

// ---------- errors ----------
app.use((_req, _res, next) => next(new HttpError(404, 'Route not found')));
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Request body is not valid JSON');
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Something went wrong on the server' : err.message, ...(err.details ? { details: err.details } : {}) });
});

if (storageType === 'memory') await seedIfEmpty();
app.listen(PORT, () => console.log(`API listening on :${PORT} (storage: ${storageType})`));
