import { useCallback, useEffect, useState } from 'react';
import { api, auth, money, STATUSES } from './api.js';

const EMPTY = { name: '', description: '', price: '', category: 'Coffee', available: true };

export default function Staff() {
  const [authed, setAuthed] = useState(!!auth.get());
  const logout = () => { auth.clear(); setAuthed(false); };
  return authed ? <Dashboard onLogout={logout} /> : <Login onDone={() => setAuthed(true)} />;
}

function Login({ onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { token } = await api.login(username, password);
      auth.set(token);
      onDone();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Staff sign in</h1>
      <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button className="btn primary" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

function Dashboard({ onLogout }) {
  const [tab, setTab] = useState('orders');
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const handle = useCallback((err) => {
    if (err.status === 401) onLogout(); else setError(err.message);
  }, [onLogout]);

  const loadOrders = useCallback(() => {
    Promise.all([api.getOrders(), api.getSummary()])
      .then(([o, s]) => { setOrders(o); setSummary(s); setError(''); })
      .catch(handle);
  }, [handle]);
  const loadMenu = useCallback(() => api.getMenu().then(setMenu).catch(handle), [handle]);

  useEffect(() => { loadOrders(); loadMenu(); }, [loadOrders, loadMenu]);
  useEffect(() => {
    const t = setInterval(loadOrders, 15000);
    return () => clearInterval(t);
  }, [loadOrders]);

  return (
    <div className="dash">
      <div className="dash-head">
        <h1>Staff dashboard</h1>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'orders'} onClick={() => setTab('orders')}>Orders</button>
          <button role="tab" aria-selected={tab === 'menu'} onClick={() => setTab('menu')}>Menu</button>
          <button className="link" onClick={onLogout}>Sign out</button>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {tab === 'orders'
        ? <Orders orders={orders} summary={summary} reload={loadOrders} onError={handle} />
        : <MenuManager menu={menu} reload={loadMenu} onError={handle} />}
    </div>
  );
}

function Orders({ orders, summary, reload, onError }) {
  async function change(id, status) {
    try { await api.setStatus(id, status); reload(); } catch (e) { onError(e); }
  }
  return (
    <>
      {summary && (
        <section className="summary" aria-label="Daily summary">
          <div><b>{summary.orderCount}</b><span>orders today</span></div>
          <div><b>{money(summary.revenue)}</b><span>total sales</span></div>
          {STATUSES.map((s) => <div key={s}><b>{summary.byStatus[s]}</b><span>{s}</span></div>)}
          {summary.topItems.length > 0 && <div className="wide"><b>{summary.topItems[0].name}</b><span>top seller ({summary.topItems[0].quantity} sold)</span></div>}
        </section>
      )}
      <div className="bar"><h2>Orders</h2><button className="btn small" onClick={reload}>Refresh</button></div>
      {!orders.length ? <p className="muted">No orders yet.</p> : (
        <ul className="orders">
          {orders.map((o) => (
            <li key={o.id}>
              <div className="order-top">
                <b>#{o.orderNumber}</b> <span>{o.customerName}</span>
                <span className="muted">{new Date(o.createdAt).toLocaleString()}</span>
                <span className="price">{money(o.total)}</span>
              </div>
              <p>{o.items.map((l) => `${l.quantity} x ${l.name}`).join(', ')}</p>
              {o.notes && <p className="muted">Note: {o.notes}</p>}
              <label className="inline">Status
                <select value={o.status} onChange={(e) => change(o.id, e.target.value)} className={`status-${o.status}`}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MenuManager({ menu, reload, onError }) {
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setMsg('');
    try {
      const body = { ...form, price: Number(form.price) };
      if (editing) await api.updateMenuItem(editing, body); else await api.addMenuItem(body);
      setMsg(editing ? 'Item updated' : 'Item added');
      setForm(EMPTY); setEditing(null); reload();
    } catch (err) { onError(err); }
  }
  async function toggle(m) {
    try { await api.updateMenuItem(m.id, { available: !m.available }); reload(); } catch (err) { onError(err); }
  }
  async function remove(m) {
    if (!window.confirm(`Delete ${m.name}? This cannot be undone.`)) return;
    try { await api.deleteMenuItem(m.id); reload(); } catch (err) { onError(err); }
  }
  const edit = (m) => { setEditing(m.id); setForm({ name: m.name, description: m.description, price: m.price, category: m.category, available: m.available }); setMsg(''); };

  return (
    <>
      <form className="item-form" onSubmit={save}>
        <h2>{editing ? 'Edit item' : 'Add menu item'}</h2>
        <label>Name<input value={form.name} onChange={set('name')} required maxLength={80} /></label>
        <label>Price (M)<input type="number" step="0.01" min="0" value={form.price} onChange={set('price')} required /></label>
        <label>Category<input list="cats" value={form.category} onChange={set('category')} required />
          <datalist id="cats"><option>Coffee</option><option>Tea</option><option>Pastries</option><option>Other</option></datalist></label>
        <label>Description<input value={form.description} onChange={set('description')} maxLength={300} /></label>
        <label className="check"><input type="checkbox" checked={form.available} onChange={set('available')} /> Available</label>
        <div className="actions">
          <button className="btn primary">{editing ? 'Save changes' : 'Add item'}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel</button>}
        </div>
        {msg && <p className="ok" role="status">{msg}</p>}
      </form>

      <h2>Current menu</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Available</th><th><span className="sr">Actions</span></th></tr></thead>
          <tbody>
            {menu.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td><td>{m.category}</td><td>{money(m.price)}</td>
                <td><button className="link" onClick={() => toggle(m)}>{m.available ? 'Yes - mark sold out' : 'No - mark available'}</button></td>
                <td><button className="link" onClick={() => edit(m)}>Edit</button> <button className="link danger" onClick={() => remove(m)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
