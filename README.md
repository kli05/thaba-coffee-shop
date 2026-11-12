# Thaba Coffee - Coffee Shop Management System

Full-stack coffee shop app for BIWA2110 (Web Application Development).

| Layer | Tech | Hosting |
|---|---|---|
| Frontend | React 18 + Vite, Fetch API | Netlify |
| Backend | Node.js + Express REST API (JWT staff auth) | Render |
| Database | Redis (key-value, persistent) via `ioredis` | Upstash |

## Features
**Customers:** browse menu (name, description, price, availability), cart with quantities, place order with name and notes, confirmation with order number, live status updates.
**Staff** (`/#/staff`): sign in, add/edit/delete menu items, toggle availability, view orders, update status (Pending, Preparing, Ready, Collected), daily summary (orders, sales, per-status counts, top seller).

## Data model (Redis keys)
| Key | Value |
|---|---|
| `menu:{uuid}` | JSON menu item |
| `menu:ids` | set of menu item ids |
| `order:{uuid}` | JSON order (items are price snapshots) |
| `orders:ids` | set of order ids |
| `order:counter` | integer; `INCR` gives order numbers (#1001, #1002, ...) |

## API
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | /api/health | - | Backend availability |
| POST | /api/auth/login | - | Staff login, returns JWT |
| GET | /api/menu | - | All menu items |
| GET | /api/menu/:id | - | One menu item |
| POST | /api/menu | staff | Add item (201) |
| PUT | /api/menu/:id | staff | Update item |
| DELETE | /api/menu/:id | staff | Delete item (204) |
| POST | /api/orders | - | Place order; prices are calculated on the server |
| GET | /api/orders/:id | - | One order (unguessable UUID) |
| GET | /api/orders | staff | All orders (`?status=`, `?date=YYYY-MM-DD`) |
| PATCH | /api/orders/:id/status | staff | Update status |
| GET | /api/summary | staff | Daily summary (`?date=`) |

Errors are JSON: `{ "error": "...", "details": [...] }` with 400 / 401 / 404 / 500.

## Run locally
```bash
# backend
cd server
cp .env.example .env        # fill in values
npm install
npm run seed                # one-time: adds sample menu to Redis
npm run dev                 # http://localhost:4000

# frontend (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```
If `REDIS_URL` is empty the API uses a temporary in-memory store (sample menu auto-loaded, data lost on restart). Use Redis for anything you submit.

## Deploy
1. **Upstash:** create a Redis database, copy the `rediss://...` connection URL.
2. **Render (Web Service):** root directory `server`, build `npm install`, start `npm start`. Environment variables: `NODE_ENV=production`, `REDIS_URL`, `STAFF_USERNAME`, `STAFF_PASSWORD`, `JWT_SECRET` (long random string), `CLIENT_ORIGIN` (your Netlify URL, no trailing slash). Then run `npm run seed` once (Render shell, or locally with the production `REDIS_URL`). Check `/api/health`.
3. **Netlify:** base directory `client`, build `npm run build`, publish `client/dist`. Environment variable: `VITE_API_URL` = your Render URL.

## Team contributions
| Member | Contribution |
|---|---|
| (name) | (what they built) |
