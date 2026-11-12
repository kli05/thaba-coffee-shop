import { useEffect, useMemo, useState } from 'react';
import { api, money } from './api.js';

export default function Customer() {
  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cart, setCart] = useState({});
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    api.getMenu().then(setMenu).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  // After ordering, poll so the customer sees the status change when staff update it.
  useEffect(() => {
    if (!order) return undefined;
    const t = setInterval(() => api.getOrder(order.id).then(setOrder).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [order?.id]);

  const groups = useMemo(() => {
    const g = {};
    menu.forEach((m) => { (g[m.category] ||= []).push(m); });
    return Object.entries(g);
  }, [menu]);

  const lines = menu.filter((m) => cart[m.id]).map((m) => ({ ...m, qty: cart[m.id] }));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  const setQty = (id, q) => setCart((c) => {
    const next = { ...c };
    if (q <= 0) delete next[id]; else next[id] = Math.min(q, 50);
    return next;
  });

  async function submit(e) {
    e.preventDefault();
    setError('');
    setPlacing(true);
    try {
      const created = await api.placeOrder({
        customerName: name,
        notes,
        items: lines.map((l) => ({ menuId: l.id, quantity: l.qty })),
      });
      setOrder(created);
      setCart({});
      setNotes('');
    } catch (err) {
      setError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  if (order) {
    return (
      <section className="confirm" aria-live="polite">
        <p className="muted">Order received, {order.customerName}</p>
        <h1>#{order.orderNumber}</h1>
        <p className={`status status-${order.status}`}>{order.status}</p>
        <ul className="receipt">
          {order.items.map((l) => (
            <li key={l.menuId}><span>{l.quantity} x {l.name}</span><span>{money(l.lineTotal)}</span></li>
          ))}
          <li className="sum"><span>Total</span><span>{money(order.total)}</span></li>
        </ul>
        <p className="muted">This page updates when the baristas change your order status.</p>
        <button className="btn" onClick={() => { setOrder(null); setName(''); }}>Start a new order</button>
      </section>
    );
  }

  return (
    <div className="layout">
      <section aria-labelledby="menu-h">
        <h1 id="menu-h">Today's menu</h1>
        {loading && <p className="muted">Loading menu...</p>}
        {!loading && !menu.length && !error && <p className="muted">The menu is empty right now. Check back soon.</p>}
        {groups.map(([cat, items]) => (
          <div key={cat} className="group">
            <h2>{cat}</h2>
            <ul className="menu">
              {items.map((m) => (
                <li key={m.id} className={m.available ? '' : 'off'}>
                  <div className="row">
                    <span className="name">{m.name}</span>
                    <span className="leader" aria-hidden="true" />
                    <span className="price">{money(m.price)}</span>
                  </div>
                  <div className="row sub">
                    <span className="muted">{m.description}</span>
                    {m.available
                      ? <button className="btn small" onClick={() => setQty(m.id, (cart[m.id] || 0) + 1)} aria-label={`Add ${m.name} to order`}>Add</button>
                      : <span className="tag">Sold out</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <aside className="cart" aria-labelledby="cart-h">
        <h2 id="cart-h">Your order</h2>
        {!lines.length ? <p className="muted">Nothing yet. Add something from the menu.</p> : (
          <form onSubmit={submit}>
            <ul className="receipt">
              {lines.map((l) => (
                <li key={l.id}>
                  <span>{l.name}</span>
                  <span className="qty">
                    <button type="button" aria-label={`Remove one ${l.name}`} onClick={() => setQty(l.id, l.qty - 1)}>-</button>
                    <b>{l.qty}</b>
                    <button type="button" aria-label={`Add one ${l.name}`} onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                  </span>
                  <span>{money(l.price * l.qty)}</span>
                </li>
              ))}
              <li className="sum"><span>Total</span><span>{money(total)}</span></li>
            </ul>
            <label>Your name
              <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="given-name" />
            </label>
            <label>Notes for the barista (optional)
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} rows={2} />
            </label>
            <button className="btn primary" disabled={placing || !name.trim()}>{placing ? 'Placing order...' : 'Place order'}</button>
          </form>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </aside>
    </div>
  );
}
