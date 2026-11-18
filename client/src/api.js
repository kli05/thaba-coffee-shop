// All backend calls go through the Fetch API here.
const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN_KEY = 'thaba_staff_token';

export const auth = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

async function request(path, { method = 'GET', body, staff = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (staff && auth.get()) headers.Authorization = `Bearer ${auth.get()}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error('Cannot reach the server. If it was idle it may be waking up - wait a moment and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.details?.length ? `${data.error}: ${data.details.join('; ')}` : data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
    getMenu: () => request('/api/menu'),
  placeOrder: (order) => request('/api/orders', { method: 'POST', body: order }),
  getOrder: (id) => request(`/api/orders/${id}`),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  addMenuItem: (item) => request('/api/menu', { method: 'POST', body: item, staff: true }),
  updateMenuItem: (id, item) => request(`/api/menu/${id}`, { method: 'PUT', body: item, staff: true }),
  deleteMenuItem: (id) => request(`/api/menu/${id}`, { method: 'DELETE', staff: true }),
  getOrders: () => request('/api/orders', { staff: true }),
  setStatus: (id, status) => request(`/api/orders/${id}/status`, { method: 'PATCH', body: { status }, staff: true }),
  getSummary: () => request('/api/summary', { staff: true }),
};

export const STATUSES = ['Pending', 'Preparing', 'Ready', 'Collected'];
export const money = (n) => `M${Number(n).toFixed(2)}`;
