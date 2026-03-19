# FleetPulse Dispatcher MVP

## Quick Start (Local Development)

### Prerequisites
- Python 3.13+
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Set Up Supabase

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project.
2. Wait for the project to finish provisioning (~2 minutes).
3. Go to **Settings → API** and copy these values:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (under "Project API keys") → `SUPABASE_KEY`
   - **JWT Secret** (scroll down) → `JWT_SECRET`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4. Go to **SQL Editor** and run the migration files in order:
   ```
   supabase/migrations/20260317_init_schema.sql
   supabase/migrations/20260318_expand_schema.sql
   supabase/migrations/20260319_add_new_columns.sql
   supabase/migrations/20260317_init_rls.sql
   ```
   Copy-paste each file's contents into the SQL editor and click **Run**.

5. Go to **Authentication → Settings**:
   - Under **Email Auth**, make sure **Enable Email Signup** is ON.
   - Under **Email Auth**, set **Confirm Email** to OFF for development (or ON for production — users will need to verify email before login).

### 2. Configure Backend

```bash
cd fleetpulse-dispatcher/backend
cp .env.example .env
```

Edit `.env` with your Supabase values:
```
SUPABASE_URL=https://YOUR_REF.supabase.co
SUPABASE_KEY=eyJ...your-service-role-key
JWT_SECRET=your-jwt-secret-from-supabase
ANTHROPIC_KEY=           # optional — AI works with threshold fallback
FMCSA_API_KEY=           # optional — mock data used without it
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

Install dependencies and start:
```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

### 3. Configure Frontend

```bash
cd fleetpulse-dispatcher/frontend
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-anon-key
```

Install dependencies and start:
```bash
npm install
npm run dev
```

Open http://localhost:3000 → Sign up → Start dispatching.

---

## Deployment

### Option A: Render (Backend) + Vercel (Frontend) — Recommended

#### Backend on Render

1. Push your code to GitHub.
2. Go to [render.com](https://render.com), create a **Web Service**.
3. Connect your GitHub repo, set:
   - **Root Directory**: `fleetpulse-dispatcher/backend`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (same as your `.env`):
   - `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`
   - `CORS_ORIGINS` = `https://your-app.vercel.app` (your frontend URL)
   - `ANTHROPIC_KEY`, `FMCSA_API_KEY` (optional)
5. Deploy. Note the URL (e.g. `https://fleetpulse-api.onrender.com`).

#### Frontend on Vercel

1. Go to [vercel.com](https://vercel.com), import your GitHub repo.
2. Set:
   - **Root Directory**: `fleetpulse-dispatcher/frontend`
   - **Framework Preset**: Next.js
3. Add environment variables:
   - `NEXT_PUBLIC_API_BASE` = `https://fleetpulse-api.onrender.com/api/v1`
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
4. Deploy. Share the URL with your dispatcher!

### Option B: Railway (Full Stack)

1. Go to [railway.app](https://railway.app), create a new project.
2. Add a service from GitHub → select the backend folder.
   - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Add env vars as above.
3. Add another service for the frontend.
   - Build: `npm run build`, Start: `npm start`
   - Add env vars pointing to the backend service URL.

### Option C: Fly.io (Docker)

Both backend and frontend can be deployed as Docker containers on Fly.io. Create `Dockerfile`s for each and deploy with `fly launch`.

---

## Security Notes

- The backend uses the **service_role** key to bypass RLS — this key must NEVER be exposed to the frontend or committed to git.
- The frontend only uses the **anon** key (public, safe to expose).
- All API requests from the frontend include a Supabase JWT in the `Authorization: Bearer` header.
- Passwords are handled entirely by Supabase Auth (bcrypt hashing, no plaintext storage).
- The `.env` file is gitignored — never commit real credentials.

## API Conventions

- All backend endpoints are prefixed with `/api/v1`.
- All responses use the envelope `{ data, error, meta }`.
- AI endpoints return strict JSON object payloads validated on the server.

## FMCSA Normalization

- DOT lookup not-found responses are normalized to `{ "found": false }`.
- FMCSA CSA pulls use a 30-day cache refresh policy to reduce latency and cost.

## JSON Guarantees

- AI load analysis returns one of `GO`, `NEGOTIATE`, or `PASS`.
- Insurance playbook responses return ranked action arrays and are cached by carrier.
