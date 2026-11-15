# IceQ Sole

A complete sneaker shop for Cambodia: an online store (installable as a phone app), an in-store
point of sale, an admin dashboard, and a backend that handles stock, orders and **KHQR payments that
confirm themselves**. English and Khmer, light and dark mode.

> Built as a real, launchable shop on **free-tier services**. Everything below is running today.

## Try it live

| What | Link | Notes |
|---|---|---|
| **Online store** | https://iceq-sole-store.onrender.com | Open it on a phone and "Add to Home Screen" to install it as an app |
| **Telegram Mini App** | https://t.me/IceQ_Sole_MiniApp_Bot/iceqsole | The same store inside Telegram, with one-tap sign-in |
| **API documentation** | https://iceq-sole-api.onrender.com/api/docs | Interactive reference (Swagger) |
| **Admin dashboard** | https://iceq-sole-dashboard.onrender.com | Needs a staff account, so it is not open to the public |

**Testing the store:** browse, add to bag, sign in with Google or Telegram (or register), and check out as a guest.
Please choose **Cash on delivery** when testing. The **ABA KHQR** option shows a real merchant QR, so don't pay it.
Search "keychain" for the $0.50 test item.

> The API runs on a free plan and sleeps when idle. If the first load takes about a minute, that is it waking up.
> A scheduled ping keeps it awake most of the time.

## What it does

**For customers:** product catalogue with real photos and brand logos, colour and size picking, bag, discount codes,
guest or account checkout, order tracking, ABA KHQR / bank transfer / cash on delivery, receipts by email,
sign in with Google or Telegram, wish list, reviews, an auto-answering support chat, Khmer and English, dark mode.

**For the owner (admin dashboard):** orders, products, inventory, customers, discounts and banners, **sales reports** with
Excel export, **data backups** (Excel / JSON), printable A4 invoices, staff accounts (admin, staff, cashier), and a
**point of sale** for the physical shop (barcode scan, cash with change in USD and riel, KHQR, 80 mm receipts, daily summary).

**Automation:** a KHQR payment is matched to its order and confirmed with no human step, the customer's page turns
"Paid" by itself, and the owner gets a Telegram message.

## How it is built

```
                     ┌────────────────────┐       ┌─────────────────────┐
  Customer ─────────►│  Store (React PWA) │       │ Dashboard (React)   │◄──── Owner / cashier
  (web, phone,       │  Render static site│       │ Render static site  │
   Telegram app)     └─────────┬──────────┘       └──────────┬──────────┘
                               │        HTTPS / JSON          │
                               └──────────────┬───────────────┘
                                   ┌──────────▼───────────┐
                                   │  API (FastAPI)       │──► Neon Postgres (data)
                                   │  Render web service  │──► Cloudflare R2 (images)
                                   └──────────┬───────────┘──► Brevo (email)
                                              │              ──► Cloudflare Turnstile (bot check)
                  Telegram bot (alerts, buttons) ◄────────────┤──► Google / Telegram sign-in
                  PayWay listener (reads ABA payments) ───────┘
```

| Part | Language and tools | Why this choice |
|---|---|---|
| **Backend API** | **Python 3.13**, **FastAPI**, SQLAlchemy 2, Alembic, Pydantic | FastAPI is fast, validates every request automatically, and generates the API docs for free. Python is also readable for a small team. SQLAlchemy and Alembic give safe, versioned database changes, which matters when real orders exist. |
| **Store** | **JavaScript**, **React 18**, Vite, Tailwind CSS, React Router, PWA | React suits an interactive shop. Vite builds quickly. Tailwind keeps the design consistent in light and dark mode. A PWA gives an installable, offline-friendly app without an app-store fee. |
| **Dashboard** | React 18, Vite, Tailwind, Recharts | Same tools as the store, so one skill set covers both. Recharts draws the sales charts. |
| **Database** | **PostgreSQL on Neon** (SQLite for local development) | Real relational data with transactions, which stock and money need. Neon's free tier doesn't expire, unlike Render's free database. |
| **Hosting** | **Render** (API and two static sites) | Free, deploys straight from GitHub, simple for beginners. Singapore region is the closest to Cambodia. |
| **Images** | **Cloudflare R2** | S3-compatible with no charge for downloads, so photos stay free however much traffic comes. |
| **Email** | **Brevo** (HTTPS API) | Render's free plan blocks normal email ports, so mail goes over HTTPS. 300 emails a day are free. |
| **Bot check** | **Cloudflare Turnstile** | Free, usually invisible, and more private than CAPTCHA. |
| **Sign-in** | Google Identity + Telegram Login | Free and expected by Cambodian users, who mostly use Telegram. Apple sign-in costs $99 a year, so it is not included. |
| **Payments** | ABA KHQR, bank transfer, cash | See below. |
| **Alerts** | **Telegram bot** | Cambodia lives on Telegram, and bots are free. |
| **Keep-awake** | Cloudflare Worker cron + GitHub Action | Free scheduled pings stop the free API sleeping. |

## Payments, and why they work this way

Official payment APIs (Bakong, ABA PayWay checkout, card gateways) need a registered company and fees.
This project reaches the same result for a small shop without them:

1. The shop uploads its own **ABA merchant QR**. The API reads it and builds a **new KHQR for every order** with the exact amount
   and the order number, keeping the bank's own routing fields (EMVCo format with CRC-16).
2. When the customer pays, ABA's **PayWay** bot posts "$X paid by … Trx ID …" in a private Telegram group.
3. A **listener** (a Telegram user account, because bots cannot read other bots' messages in a group) passes that message to the matcher.
4. The matcher confirms an order only when: the sender is really the PayWay bot, the transaction ID is new, the amount and currency
   match **exactly one** unpaid order whose QR was still valid, and otherwise it asks the owner with a button. No "cents trick" is needed.

Cards (Visa / Mastercard) are **not** included: they need a paid gateway. Everything else is free.

## Security

- Passwords hashed with **bcrypt**; short-lived JWT access tokens with **rotating refresh tokens** (reuse revokes the session).
- **Role-based access** enforced on the server: customer, cashier (point of sale only), staff, admin.
- **Rate limits** on sign-in, registration, checkout and password reset; request-size limit; **Turnstile** bot check on public forms.
- Google and Telegram sign-ins are **verified with the provider's signatures** before anyone is signed in.
- Stock is reserved with an **atomic database update** so two buyers can never take the last pair; checkout is idempotent (double taps make one order).
- Payment confirmation happens **only on the server**, from a verified PayWay message or a staff action. The browser can never mark an order paid.
- Backups never contain password hashes or tokens. **No secrets are in this repository**: they are Render environment variables, and `.env` files are git-ignored.

## Quality

- **100+ automated tests** (`backend/tests`) cover checkout, stock, payments, the PayWay matcher, the listener, point of sale, permissions, reports, backups and sign-in.
- Database changes go through **Alembic migrations**, which run automatically on deploy.
- The API reports health at `/api/health` (no database call) and `/api/health/db`.

## Project layout

```
backend/    FastAPI app: app/routers (HTTP), app/services (business rules), migrations, tests
store/      Customer web app and PWA (React)
dashboard/  Admin, reports and point of sale (React)
ops/        Cloudflare Worker that keeps the API awake
design/     Scripts that generated the logo variants and merch images
docs/       SETUP.md - the long step-by-step setup and deployment guide
render.yaml Render blueprint (services and environment variable names)
```

## Run it on your computer

```bash
# API
cd backend
python -m venv .venv && .venv\Scripts\activate        # Windows (use source .venv/bin/activate on Mac/Linux)
pip install -r requirements.txt
alembic upgrade head && python seed.py                # creates tables and demo products
uvicorn app.main:app --reload                         # http://localhost:8000/api/docs

# Store and dashboard (two terminals)
cd store      && npm install && npm run dev           # http://localhost:5173
cd dashboard  && npm install && npm run dev           # http://localhost:5174

# Tests
cd backend && pytest
```

Copy `backend/.env.example` to `backend/.env` and fill in only what you need; every outside service
(email, Telegram, Google, Turnstile, R2) is optional locally. Full guide: [docs/SETUP.md](docs/SETUP.md).

## Honest limits

- On free plans the API can sleep, so the first request after quiet time is slow. Render's paid plan removes that.
- Demo photos come from Unsplash and Pexels with credits; brand names and logos belong to their owners. The keychain and lace charm images are original drawings.
- PayWay auto-confirm depends on a Telegram user account staying signed in to the payment group.
- Apple sign-in, card payments and delivery-courier integration are not included.

## Credits

Built by the shop owner with Claude (Anthropic). Photos: Unsplash and Pexels contributors. Brand marks: Simple Icons (CC0) and Wikimedia Commons.
