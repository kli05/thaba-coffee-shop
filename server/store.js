import Redis from 'ioredis';

// Minimal in-memory stand-in so the app runs locally before Redis is configured.
class MemoryStore {
  constructor() { this.kv = new Map(); this.sets = new Map(); }
  async get(k) { return this.kv.get(k) ?? null; }
  async set(k, v) { this.kv.set(k, v); return 'OK'; }
  async del(k) { return this.kv.delete(k) ? 1 : 0; }
  async mget(keys) { return keys.map((k) => this.kv.get(k) ?? null); }
  async sadd(k, m) { if (!this.sets.has(k)) this.sets.set(k, new Set()); this.sets.get(k).add(m); return 1; }
  async srem(k, m) { return this.sets.get(k)?.delete(m) ? 1 : 0; }
  async smembers(k) { return [...(this.sets.get(k) ?? [])]; }
  async incr(k) { const n = Number(this.kv.get(k) ?? 0) + 1; this.kv.set(k, String(n)); return n; }
  async quit() {}
}

export const storageType = process.env.REDIS_URL ? 'redis' : 'memory';

export const store = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 })
  : new MemoryStore();

if (storageType === 'memory') {
  console.warn('[store] REDIS_URL not set -> using IN-MEMORY storage. Data will be lost on restart.');
} else {
  store.on('error', (e) => console.error('[redis]', e.message));
}
