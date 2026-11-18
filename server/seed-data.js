import crypto from 'node:crypto';
import { store } from './store.js';

const ITEMS = [
  ['Espresso', 'Double shot, short and strong', 18, 'Coffee'],
  ['Americano', 'Espresso lengthened with hot water', 22, 'Coffee'],
  ['Cappuccino', 'Espresso, steamed milk, thick foam', 28, 'Coffee'],
  ['Latte', 'Espresso with a lot of silky milk', 30, 'Coffee'],
  ['Flat White', 'Ristretto and microfoam', 28, 'Coffee'],
  ['Rooibos Tea', 'Caffeine-free, served with honey', 18, 'Tea'],
  ['Iced Tea', 'Black tea, lemon, mint', 20, 'Tea'],
  ['Hot Chocolate', 'Dark chocolate and whole milk', 30, 'Other'],
  ['Butter Croissant', 'Baked fresh each morning', 25, 'Pastries'],
  ['Blueberry Muffin', 'Studded with blueberries', 20, 'Pastries'],
  ['Magwinya', 'Fried dough, plain or with mince', 15, 'Pastries'],
];

export async function seedIfEmpty() {
  const ids = await store.smembers('menu:ids');
  if (ids.length) return 0;
  for (const [name, description, price, category] of ITEMS) {
    const id = crypto.randomUUID();
    await store.set(`menu:${id}`, JSON.stringify({ id, name, description, price, category, available: true }));
    await store.sadd('menu:ids', id);
  }
  return ITEMS.length;
}
