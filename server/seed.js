import 'dotenv/config';
import { store, storageType } from './store.js';
import { seedIfEmpty } from './seed-data.js';

const n = await seedIfEmpty();
console.log(n ? `Seeded ${n} menu items into ${storageType}.` : 'Menu already has items - nothing seeded.');
await store.quit();
