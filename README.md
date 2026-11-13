# IceQ Sole — Premium Sneaker Store

A complete, production-ready sneaker e-commerce platform for Cambodia: an editorial
storefront (installable as a phone app), a secure admin dashboard, and a FastAPI backend
with real inventory, checkout, KHQR / bank-transfer / cash-on-delivery payments, and
cloud image storage.

| Part | Tech | Local URL |
|---|---|---|
| **Storefront** (`store/`) | React 18, Vite, Tailwind CSS, React Router, PWA | http://localhost:5173 |
| **Language, theme and accounts**
- Full **English / Khmer (ខ្មែរ)** interface on the storefront and dashboard, with the Kantumruy Pro font, Khmer product descriptions, category names and banners, and translated API error messages (`Accept-Language`). The choice is remembered.
- **Light / dark mode** on both apps: follows the device setting until the visitor picks one, remembered in `localStorage`, applied before first paint (no flash).
- Accounts: register (name, email, phone, password + confirmation, terms), sign in with "remember me", password eye toggles and strength meter, forgot/reset password by email (single-use links that expire after 60 minutes and sign out every session), profile, change password, protected pages and admin/staff/customer roles.

**Product photography**
- Demo products use **real photographs from Unsplash** (Unsplash License), each checked by eye against the exact model and colour, with the photographer credited on the site. The list with source pages is in [`backend/seed_assets/photos.json`](backend/seed_assets/photos.json).
- A colourway only shows its own photos. Models or colours without a verified photo show a "photo coming soon" tile, and the dashboard lists them under **Products → Needs photo**, so you can upload your own product shots.
- No AI-generated or unrelated shoe images are used for branded products.

**Admin dashboard** (`dashboard/`) | React 18, Vite, Tailwind CSS, Recharts | http://localhost:5174 |
| **API** (`backend/`) | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, JWT | http://localhost:8000/api/docs |
| **Database** | SQLite (development) · PostgreSQL (production) | — |
| **Images** | Local disk (dev) · **Cloudflare R2** or Firebase Storage (prod) | — |

---

## Contents
1. [Features](#features)
2. [Quick start on Windows](#quick-start-on-windows-beginner-friendly)
3. [Manual setup (any OS)](#manual-setup-any-os)
4. [Using the store](#using-the-store-first-admin-adding-products-testing-checkout)
5. [Payments: ABA KHQR, bank transfer, COD](#payments-aba-khqr-bank-transfer-cash-on-delivery)
6. [Image storage: Cloudflare R2 or Firebase](#image-storage-cloudflare-r2-recommended-or-firebase)
7. [Deployment](#deployment)
8. [Environment variables](#environment-variables)
9. [Security](#security)
10. [Testing](#testing)
11. [Project structure](#project-structure)
12. [Credentials you must supply](#credentials-you-must-supply-before-going-live)

---

## Features

**Storefront**
- Editorial homepage: campaign hero slider, trust bar, new arrivals, best sellers, trending, shop by category / brand, promo banner, featured picks, brand story, customer reviews, newsletter.
- Shop with sorting and filters for brand, category, gender, EU size, colour, price range, availability and sale, with URL-synced filters and a mobile filter sheet.
- Product pages: multi-image gallery with hover zoom and a full-screen swipe/zoom viewer, colour and size pickers, live per-variant stock, quantity, Add to bag, Buy now, wishlist, size guide, reviews, related and recently viewed products.
- Quick View from any product card.
- Persistent bag stored on the server (guest token or account), with change size/colour in the bag, discount codes, a free-delivery progress bar, and USD totals with a KHR reference.
- Mobile-first checkout with Cambodian phone validation, all 25 provinces, saved addresses, delivery notes, guest checkout, and protection against duplicate orders.
- Order page with a status timeline, dynamic **KHQR** payment, bank details, receipt/screenshot submission, tracking info, and cancellation of unpaid orders.
- Account: profile, order history and details, wishlist (synced from guest), saved addresses, change password.
- Guest order tracking by order number plus phone or email.
- PWA: installable, standalone display, app icons, offline-cached assets, native-style bottom tab bar on phones.

**Language, theme and accounts**
- Full **English / Khmer (ខ្មែរ)** interface on the storefront and dashboard, with the Kantumruy Pro font, Khmer product descriptions, category names and banners, and translated API error messages (`Accept-Language`). The choice is remembered.
- **Light / dark mode** on both apps: follows the device setting until the visitor picks one, remembered in `localStorage`, applied before first paint (no flash).
- Accounts: register (name, email, phone, password + confirmation, terms), sign in with "remember me", password eye toggles and strength meter, forgot/reset password by email (single-use links that expire after 60 minutes and sign out every session), profile, change password, protected pages and admin/staff/customer roles.

**Product photography**
- Demo products use **real photographs from Unsplash** (Unsplash License), each checked by eye against the exact model and colour, with the photographer credited on the site. The list with source pages is in [`backend/seed_assets/photos.json`](backend/seed_assets/photos.json).
- A colourway only shows its own photos. Models or colours without a verified photo show a "photo coming soon" tile, and the dashboard lists them under **Products → Needs photo**, so you can upload your own product shots.
- No AI-generated or unrelated shoe images are used for branded products.

**Admin dashboard**
- Overview with real database KPIs: revenue, orders, products, customers, pending/completed orders, payments to verify, low stock, sales and orders charts (Phnom Penh time), recent transactions, best sellers.
- Orders: search, status/payment/date filters, status workflow (Pending → Confirmed → Processing → Shipped → Delivered, Cancelled, Refunded), payment verification with screenshot preview, carrier and tracking, internal notes, timeline, printable invoice.
- Products: create, edit, delete or archive, labels (featured, best seller, new, trending), visibility, prices and discounts, and a **colour × size stock matrix**.
- Image manager: multi-upload with preview, upload progress, drag & drop, set main image, reorder, assign to a colour, photo credit, replace, delete. Images are optimised to WebP in several widths.
- Brands, categories (with logos and images), colours and sizes.
- Inventory: stock per variant, low/out/reserved filters, adjustments with reasons, full stock-movement history.
- Customers: list, profile, contact info, addresses, order history, enable/disable.
- Marketing: discount codes (percent or fixed, minimum spend, cap, usage limit, start/expiry dates), homepage banners (desktop and mobile images), newsletter export to CSV.
- Review moderation and featuring.
- Settings: store info and logo, social links, delivery fees with per-province overrides, payment methods, KHQR and bank details, currency/KHR rate, tax, low-stock threshold, staff accounts and roles.
- Notifications for new orders, payments to verify, and low stock.

**Inventory rules (no overselling)**
- Every colour + size is its own variant with its own stock.
- Checkout **reserves** pairs with an atomic database update, so two customers can never buy the last pair.
- Confirming an order (manually, or automatically once payment is verified) **deducts** the stock.
- Cancelling **releases** the reservation or **restores** deducted stock, exactly once. Refunds can optionally restock.
- Every change is written to the stock-movement log.

---

## Quick start on Windows (beginner-friendly)

### 1. Install the tools (one time)
1. **Python 3.13**: https://www.python.org/downloads/. In the installer, tick **"Add python.exe to PATH"**.
2. **Node.js 20 LTS or newer**: https://nodejs.org/
3. **Git**: https://git-scm.com/download/win

### 2. Get the code
```bash
git clone https://github.com/Horth168/iceq-sole.git
```
```bash
cd iceq-sole
```

### 3. Run the setup script
```bash
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```
The script:
- creates the Python environment and installs packages
- creates `backend\.env` with a random `SECRET_KEY`
- builds the database
- loads demo products, banners and sample orders
- installs the storefront and dashboard packages
- asks you for an **admin email and password**

### 4. Start everything
```bash
powershell -ExecutionPolicy Bypass -File scripts\start.ps1
```
Three windows open: API, storefront and dashboard. Then visit:
- Storefront: http://localhost:5173
- Dashboard: http://localhost:5174 (sign in with the admin account you just created)
- API documentation: http://localhost:8000/api/docs

To stop, close the three windows (or press `Ctrl+C` in each).

---

## Manual setup (any OS)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env            # macOS/Linux: cp .env.example .env
```
Open `backend/.env` and set `SECRET_KEY`. Generate one with:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```
Then create the tables, load demo data and create an admin:
```bash
alembic upgrade head
python seed.py --demo-orders
python create_admin.py
uvicorn app.main:app --reload --port 8000
```
In two more terminals:
```bash
cd store && npm install && npm run dev
```
```bash
cd dashboard && npm install && npm run dev
```

Useful commands:
- `python seed.py --reset --demo-orders` wipes and reloads the **development** database (refuses in production).
- `alembic revision --autogenerate -m "describe change"` creates a new migration after editing `app/models.py`. Apply it with `alembic upgrade head`.

---

## Using the store (first admin, adding products, testing checkout)

**Create or reset an admin** (the password is typed hidden):
```bash
cd backend && .venv\Scripts\python create_admin.py
```
Admins can add more **staff** in Dashboard → Settings → Staff. Staff manage orders, products and inventory; only admins can change settings.

**Add a product**
1. Dashboard → **Products → New product**.
2. Fill in name, brand, category, price and (optionally) a sale price.
3. Pick the **colours** and **sizes**, then type the stock for every colour × size cell. **Fill** sets a whole row at once.
4. **Save**. The photo uploader then appears: drag in photos, check the preview, choose which colour they show, and click **Upload**. The first photo is the main image. Use ← → to reorder, ★ to make one the main image, ↻ to replace, and 🗑 to delete.
5. The product is live on the storefront immediately while **Visible in store** is on.

**Test a checkout**
1. On the storefront, open a product, pick a size, and click **Add to bag** (or **Buy now**).
2. Go to checkout. Use a valid Cambodian number such as `012 345 678` and pick a province.
3. Choose **Cash on delivery** (always available), or **Bank transfer** / **KHQR** once configured (see below).
4. On the order page, submit a test transaction reference.
5. In the dashboard, open **Orders**. The order shows *Verifying payment*. Click **Confirm payment received**: the order becomes *Confirmed* and stock is deducted. Add tracking and mark it *Shipped*. The customer's order page updates.

Demo discount codes from the seed: `WELCOME10` (10%, max $30), `ICEQ5` ($5 off over $60), `FREEZE20` (20% off over $120, expires in 30 days).

> **Product images and authenticity.** The demo catalogue lists real brands with clearly
> labelled **illustrations** ("Illustration · product photo coming soon"), not photos. Before
> selling, upload **genuine product photography you are licensed to use** for each listing.
> Verify every model name, price and description too. The demo text is generic and makes no
> technical claims. The *IceQ Originals* label and all campaign artwork are original IceQ Sole
> artwork (see `design/art.py`) and contain no third-party logos.

---

## Payments: ABA KHQR, bank transfer, cash on delivery

The store only offers a method once it can actually be paid. Dashboard → Settings → Payments shows what's missing.

| Method | How it works | What you need |
|---|---|---|
| **KHQR, automatic (recommended)** | The API builds a **dynamic KHQR** (EMVCo + CRC, valid 30 min) for the exact amount. The customer scans it with ABA or any Bakong bank app. The order page polls the server, which asks the official **Bakong Open API** (`check_transaction_by_md5`). The order is marked paid **only** when Bakong confirms a transaction with the same amount and currency. | `BAKONG_ACCOUNT_ID` (e.g. `yourname@abaa`) and `BAKONG_API_TOKEN` from https://api-bakong.nbc.gov.kh |
| **KHQR, manual** | Only `BAKONG_ACCOUNT_ID` is set, or a static KHQR image is uploaded in Settings. Customers pay and submit a reference or screenshot. Staff verify it in the dashboard. | Bakong account ID, or your printed ABA merchant QR image |
| **Bank transfer** | Bank details are shown. The customer uploads a receipt and staff verify it. | Account name and number in Settings → Payments |
| **Cash on delivery** | Marked paid automatically when the order is marked *Delivered*. | Nothing |

Payments are **never** marked successful from the browser. Every confirmation is server-side, either from the Bakong API or from a staff member.

---

## Image storage: Cloudflare R2 (recommended) or Firebase

Switch providers with one variable. No code changes are needed:
```
STORAGE_PROVIDER=local        # development: backend/uploads
STORAGE_PROVIDER=cloudflare   # Cloudflare R2 (S3-compatible API)
STORAGE_PROVIDER=firebase     # Firebase Storage
```
The database stores only image URLs and object keys, never the image data itself. Uploads are checked with Pillow (real format, max 8 MB, decompression-bomb guard), stripped of EXIF, and re-encoded to WebP at 480/960/1600 px (banners at 768/1440/2400) for responsive `srcset` delivery.

### Which one? (prices checked November 2026, so confirm before relying on them)
| | Cloudflare R2 | Firebase Storage |
|---|---|---|
| Free allowance | 10 GB-month storage, 1M write ops, 10M read ops per month | 5 GB storage, about 100 GB/month egress (Google Cloud "Always Free", US regions) |
| Bandwidth (egress) | **Free, no egress fees** | Charged beyond the free tier (about $0.12/GB) |
| Plan requirement | Cloudflare account (card may be required to enable R2) | **Blaze (pay-as-you-go) billing is now required** to use Storage buckets (since Feb 2026) |
| Paid storage | $0.015/GB-month | about $0.02/GB-month |

**Recommendation: Cloudflare R2.** A sneaker store serves many image views, and R2 charges nothing for bandwidth. 10 GB holds roughly 30,000+ optimised product images. Sources: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Firebase pricing](https://firebase.google.com/pricing).

### Set up Cloudflare R2
1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket** (e.g. `iceq-sole-media`).
2. Public access: either **Settings → Public access → R2.dev subdomain → Allow** (fine for testing), or better, **Connect a custom domain** such as `media.iceqsole.com` (adds caching and your brand).
3. **R2 → Manage API tokens → Create API token** with **Object Read & Write**, limited to this bucket. Copy the *Access Key ID* and *Secret Access Key*. They are shown once.
4. Your **Account ID** is on the R2 overview page.
5. Add them to the **backend** environment (never the frontend):
   ```
   STORAGE_PROVIDER=cloudflare
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET_NAME=iceq-sole-media
   R2_PUBLIC_URL=https://media.iceqsole.com      # or your https://pub-xxxx.r2.dev URL
   ```
6. Restart the API, upload a photo in the dashboard, and check that **Settings → System** says *cloudflare* and that the photo still shows after you refresh.

### Set up Firebase Storage (alternative)
1. Firebase console → your project → **Build → Storage → Get started**. This needs the Blaze plan.
2. Project settings → **Service accounts → Generate new private key**. Keep the JSON **outside the repo**.
3. Deploy the rules in `firebase/storage.rules`. They allow public reads of catalogue images and no client writes.
4. Backend environment:
   ```
   STORAGE_PROVIDER=firebase
   FIREBASE_PROJECT_ID=your-project
   FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   FIREBASE_SERVICE_ACCOUNT=C:\secrets\iceq-firebase.json   # or paste the JSON as a deployment secret
   ```

**Switching providers later:** existing images keep their old URLs and keep working as long as the old bucket stays up. To move them, copy the objects to the new bucket with the same keys (for example `rclone copy`), then update the URL prefix in the `product_images`, `banners`, `brands` and `categories` tables.

---

## Deployment

The repo includes a **Render Blueprint** (`render.yaml`), currently set to Render's **free** plan in Singapore. It sets up PostgreSQL, the API (migrations run at start-up), and the two static sites with SPA rewrites and cache headers.

> **Free plan limits:** the API sleeps after 15 minutes idle (the first request takes about a minute), and free PostgreSQL is **deleted after 30 days**. Before taking real orders, change the API to `plan: starter` and the database to `plan: basic-256mb` (about $13/month total) in `render.yaml`.

1. Push to GitHub (already done for this repo).
2. https://dashboard.render.com → **New → Blueprint** → choose `iceq-sole`.
3. Fill in the secret values Render asks for:
   - `CORS_ORIGINS`: your storefront and dashboard URLs, comma separated
   - `STORE_URL` and `API_PUBLIC_URL`
   - the R2 variables
   - optionally the Bakong variables
   - `VITE_API_URL` (your API URL) for both static sites
   - `VITE_STORE_URL` for the dashboard
4. **First admin:** set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` (10+ characters) on the API service. On start-up the API creates that admin **only if no admin exists yet**, then skips it on every later start. Delete both variables after your first login. On paid plans you can also use the service **Shell** and run `python create_admin.py --email you@yourdomain.com`.
5. Do **not** run `seed.py` in production unless you want the demo catalogue. Add your real products in the dashboard instead.
6. Add your domains (e.g. `iceqsole.com` for the store, `admin.iceqsole.com` for the dashboard, `api.iceqsole.com` for the API), then update `CORS_ORIGINS` and the `VITE_*` variables and redeploy.

Other hosts work too:
- `backend/Dockerfile` runs migrations, then gunicorn + uvicorn on any container host (Railway, Fly.io, a VPS).
- The frontends are static `dist/` folders that can go on Cloudflare Pages, Netlify or Vercel. Add an SPA fallback to `index.html`.
- `docker-compose.yml` runs PostgreSQL and the API locally.

Production checklist:
- `ENVIRONMENT=production`
- a long random `SECRET_KEY`
- PostgreSQL `DATABASE_URL`
- `STORAGE_PROVIDER=cloudflare`
- HTTPS everywhere
- `CORS_ORIGINS` limited to your two sites
- an admin created and payment settings filled in

---

## Environment variables

All backend secrets live in `backend/.env` locally, or in your host's secret store. The full annotated list is in [`backend/.env.example`](backend/.env.example). The frontends only take **public** build values: [`store/.env.example`](store/.env.example) and [`dashboard/.env.example`](dashboard/.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT signing and order access tokens (32+ chars) |
| `DATABASE_URL` | prod | PostgreSQL URL. Empty means SQLite in `backend/data/` |
| `CORS_ORIGINS` | prod | Allowed frontend origins |
| `API_PUBLIC_URL` | prod | Public API URL |
| `STORAGE_PROVIDER` + `R2_*` / `FIREBASE_*` | prod | Image storage |
| `BAKONG_ACCOUNT_ID`, `BAKONG_API_TOKEN` | optional | KHQR generation and automatic verification |
| `ACCESS_TOKEN_EXPIRE_MINUTES`, `REFRESH_TOKEN_EXPIRE_DAYS` | optional | Session lifetimes (30 min / 14 days) |
| `REMEMBER_ME_DAYS`, `PASSWORD_RESET_EXPIRE_MINUTES` | optional | "Remember me" length (30 days) and reset-link lifetime (60 min) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | for password reset | Outgoing email. With Gmail use `smtp.gmail.com`, port `587` and an **App Password** (Google Account → Security → 2-Step Verification → App passwords), never your normal password |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD` | hosts without a shell | Creates the first admin at start-up if none exists; remove after first sign-in |
| `SEED_DEMO_CATALOG` | optional | `true` loads the demo catalogue and photo update; keeps orders and customers |
| `VITE_API_URL` (store, dashboard) | prod | API base URL baked into the frontend build |

---

## Security

- Passwords: bcrypt (cost 12) over SHA-256, so long passphrases are fully used.
- Sessions: short-lived JWT access tokens plus **rotating refresh tokens** stored server-side. Reusing a refresh token revokes all of that user's sessions. Changing the password signs out other devices.
- Roles: `customer`, `staff`, `admin`. Every admin endpoint checks the role on the server. The dashboard login rejects customer accounts.
- Inputs are validated with Pydantic (strict schemas, no unknown fields, Cambodian phone and province checks, HTML stripped from reviews and notes). Prices are always recalculated on the server.
- Uploads are checked by content, size-limited, re-encoded, and SVG uploads are rejected. Payment screenshots are stored under a private prefix.
- Rate limits (slowapi) on login, register, checkout, tracking, reviews, newsletter and payment endpoints, plus a global limit.
- Checkout is protected against duplicates with an idempotency key and a unique index. Stock and discount usage are updated atomically in one transaction.
- CORS allow-list, security headers (HSTS in production, `nosniff`, `DENY` framing), no-store on API responses.
- Guest order pages need an unguessable HMAC token.
- Secrets never reach the frontend. `.env`, databases, uploads and service-account JSON files are git-ignored.

---

## Testing

```bash
cd backend
.venv\Scripts\python -m pytest
```
The 23 automated tests cover:
- registration, login, refresh rotation, token reuse and password change
- role checks
- catalogue filters
- product and variant CRUD with movement logs
- image upload, reorder, replace and delete in storage, plus rejection of bad files
- guest cart and checkout with stock reservation
- **no overselling between two customers**
- duplicate-submit protection
- discount rules and usage limits
- delivery fees and free shipping
- the full order lifecycle with stock deduction and restoration
- customer cancellation
- manual and Bakong-verified KHQR payments, including an amount-mismatch check
- KHQR EMV/CRC validity
- inventory guards
- wishlist, addresses, review moderation, settings, and the health check

Frontend production builds:
```bash
cd store && npm run build
```
```bash
cd dashboard && npm run build
```

---

## Project structure

```
iceq-sole/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, middleware, error handling
│   │   ├── config.py          # settings from environment
│   │   ├── models.py          # SQLAlchemy models (24 tables)
│   │   ├── schemas.py         # request validation
│   │   ├── serializers.py     # response shapes
│   │   ├── security.py        # hashing, JWT, role dependencies
│   │   ├── routers/           # auth, account, catalog, cart, orders, admin_*
│   │   └── services/          # storage, images, inventory, pricing, khqr, orders, cart, settings
│   ├── migrations/            # Alembic migrations
│   ├── seed_assets/           # original artwork used by the demo seed
│   ├── tests/                 # pytest suite
│   ├── seed.py · create_admin.py · Dockerfile · requirements.txt · .env.example
├── store/                     # customer storefront (React + Tailwind + PWA)
├── dashboard/                 # admin dashboard (React + Tailwind)
├── design/art.py              # renders the original campaign art, category banners, icons, logo
├── firebase/storage.rules     # Storage Security Rules (if using Firebase)
├── scripts/setup.ps1 · start.ps1
├── render.yaml · docker-compose.yml
```

Database tables:
- users, refresh_tokens, addresses
- brands, categories, colors, sizes
- products, product_images, product_variants (per colour × size stock), stock_movements
- carts, cart_items
- orders, order_items, order_status_events, payments
- discounts, banners, reviews, wishlist_items
- store_settings, notifications, newsletter_subscribers

Foreign keys, unique constraints, check constraints (stock ≥ reserved ≥ 0, ratings 1–5, positive prices) and indexes are all in the initial migration.

The API reference is generated automatically at **/api/docs** (Swagger) and **/api/redoc**.

---

## Credentials you must supply before going live

| What | Where | Why |
|---|---|---|
| Production `SECRET_KEY` | API env (Render generates it) | Signs sessions |
| PostgreSQL `DATABASE_URL` | API env (Render provides it) | Production data |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | API env | Product, banner and payment-proof images |
| `BAKONG_ACCOUNT_ID` (+ `BAKONG_API_TOKEN` for auto-verify) | API env | KHQR payments |
| Bank account name and number, static KHQR image (optional) | Dashboard → Settings → Payments | Bank transfer, manual KHQR |
| Store phone, email, address, socials, logo, delivery fees | Dashboard → Settings | Shown to customers |
| Genuine, licensed product photos and verified product data | Dashboard → Products | Real listings |
| Admin account | `python create_admin.py` | Dashboard access |

---

*IceQ Sole is an independent retailer. Nike, Air Jordan, Adidas, New Balance, Puma, Converse, Vans and Asics are trademarks of their respective owners, and the demo catalogue does not imply affiliation.*
