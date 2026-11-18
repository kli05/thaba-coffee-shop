import { useEffect, useState } from 'react';
import Customer from './Customer.jsx';
import Staff from './Staff.jsx';

const currentView = () => (window.location.hash.startsWith('#/staff') ? 'staff' : 'customer');

export default function App() {
  const [view, setView] = useState(currentView());
  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <>
      <header className="top">
        <a className="brand" href="#/">Thaba Coffee</a>
        <nav aria-label="Main">
          <a href="#/" aria-current={view === 'customer' ? 'page' : undefined}>Order</a>
          <a href="#/staff" aria-current={view === 'staff' ? 'page' : undefined}>Staff</a>
        </nav>
      </header>
      <main>{view === 'staff' ? <Staff /> : <Customer />}</main>
    </>
  );
}
