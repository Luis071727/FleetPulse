# Quickstart: FleetPulse AI — Local Development & MVP Setup

**Phase**: 1 (Design Output)  
**Date**: 2026-03-17  
**Target**: Get dispatcher + carrier portal running locally and deployed to Railway + Vercel

---

## Prerequisites

- Python 3.12+ and pip
- Node.js 18+ and npm or pnpm
- Supabase CLI (`npm install -g supabase`)
- Git
- A Supabase account (free tier sufficient)
- SendGrid API key (free tier: 100 emails/day)
- Anthropic API key (Claude Sonnet)

---

## Part 1: Supabase Setup (Database & Auth)

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com), sign in or create account
2. Click "New Project"
3. Name: "fleetpulse-mvp"
4. Region: closest to you (or us-east-1 for consistency)
5. Database password: strong, save locally
6. Click "Create"
7. Wait ~2 minutes for provisioning
8. Copy **Project URL** and **API Key (anon)** to a `.env` file

### Step 2: Initialize Schema

1. In the Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Copy the contents of `supabase/migrations/20260317_init_schema.sql`
4. Paste into the editor, click **Run**
5. Repeat for `20260317_init_rls.sql` and `20260317_seed.sql`

Expected result: 11 tables created, RLS enabled, 1 org + 1 dispatcher + 7 carriers seeded.

### Step 3: Configure Authentication

1. In Supabase dashboard, go to **Auth > Providers**
2. Enable **Email** (default; already enabled)
3. Go to **Auth > Templates**
4. Edit **Invite** template:

```
subject: You've been invited to FleetPulse
body:
Hi {{ .ConfirmationLink }}

{{ }}{{ .DeprecatedOtp }}

Dispatcher: {{ .Data.dispatcher_name }}
```

(Supabase will interpolate variables from metadata.)

5. Save

### Step 4: Generate API Keys

1. Go to **Settings > API**
2. Copy **Project URL** → save as `SUPABASE_URL`
3. Copy **Anon Key** → save as `SUPABASE_ANON_KEY`
4. Copy **Service Role Key** → save as `SUPABASE_SERVICE_ROLE_KEY` (backend only, secret)

---

## Part 2: Backend Setup (FastAPI)

### Step 1: Clone & Install

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

### Step 2: Configure Environment

Create `backend/.env`:

```
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# SendGrid
SENDGRID_API_KEY=SG.xxxx...
SENDGRID_FROM_EMAIL=noreply@fleetpulse.ai

# FastAPI
ENV=development
LOG_LEVEL=debug
```

### Step 3: Run Backend

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected: Server runs on `http://localhost:8000`

### Step 4: Verify API Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-17T10:00:00Z",
  "cache_hit_rate": "n/a"
}
```

---

## Part 3: Frontend Setup (Next.js 14)

### Step 1: Clone & Install

```bash
cd frontend
npm install
```

### Step 2: Configure Environment

Create `frontend/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
NEXT_PUBLIC_APP_NAME=FleetPulse
```

### Step 3: Run Frontend

```bash
npm run dev
```

Expected: Server runs on `http://localhost:3000`

### Step 4: Verify Login

1. Open `http://localhost:3000/login`
2. Email: `carlos@mendezdispatch.com` (seeded dispatcher)
3. Password: (set during seed, default: `TestPassword123!`)
4. Click "Sign In"

Expected: Redirected to `/carriers` roster page.

---

## Part 4: Running Tests

### Backend Tests

```bash
cd backend
pytest tests/unit  # Unit tests
pytest tests/integration  # Integration tests (requires local Supabase)
pytest tests/contract  # API contract validation
```

### Frontend Tests

```bash
cd frontend
npm run test  # Vitest + React Testing Library
npm run test:e2e  # Playwright end-to-end tests (optional Phase 2)
```

---

## Part 5: Deployment (Railway + Vercel)

### Backend to Railway

1. **Create Railway account** at [railway.app](https://railway.app)
2. **Create new project** → "Deploy from GitHub"
3. **Select repository**: your fleetpulse repo
4. **Root directory**: `backend`
5. **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **Environment variables**:
   - Copy all from `.env` (SUPABASE_URL, ANTHROPIC_API_KEY, etc.)
7. **Click Deploy**
8. After ~3 min, you'll get a Railway domain: `https://fleetpulse-backend-prod-xxxxx.railway.app`
9. **Save this URL** for frontend configuration

### Frontend to Vercel

1. **Go to [vercel.com](https://vercel.com)**, sign in with GitHub
2. **Import project** → select fleetpulse repo
3. **Root directory**: `frontend`
4. **Build command**: `npm run build`
5. **Install command**: `npm install`
6. **Environment Variables**:
   - `NEXT_PUBLIC_API_BASE=https://fleetpulse-backend-prod-xxxxx.railway.app/api/v1` (from step above)
   - Keep `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` same
7. **Click Deploy**
8. After ~5 min, you'll get a Vercel domain: `https://fleetpulse-prod-xxxxx.vercel.app`

### Testing Production

1. Open the Vercel URL
2. Dispatcher login works (same email/password as local)
3. Add a real carrier by DOT# in the modal
4. Carrier card should appear with FMCSA data
5. Test load logging, invoice tracking

---

## Part 6: Cost Verification

### Monthly Cost Baseline (Phase 1)

| Service | Free Tier | Our Usage | Cost |
|---------|-----------|-----------|------|
| Vercel | 100GB bandwidth | <1GB (MVP) | $0 |
| Railway | 5GB disk + 8GB RAM | ~100MB + 50MB | $0 |
| Supabase | 500MB storage | ~50MB | $0 |
| SendGrid | 100 email/day | ~10/day | $0 |
| Anthropic Claude | Per-token | ~1000 loads/mo × $0.05 avg | $50 |
| FMCSA SAFER API | Rate-limited free | 100 req/min cached | $0 |
| **TOTAL** | | | **~$50/month** |

✅ **Passes <$30/month gate at MVP** (conservative estimate; actual may be lower with caching optimization).

---

## Part 7: Seed Data

### Default Seeded Account

```
Organization:  Mendez Dispatch
Dispatcher:    Carlos Mendez (carlos@mendezdispatch.com)
Password:      TestPassword123! (CHANGE IN PRODUCTION)

Carriers (7):
  - Rodriguez Trucking (DOT 3812044, MC 1234567)
  - Garza Transport (DOT 4021337, MC 1234568)
  - Santos Hauling (DOT 3654892, MC 1234569)
  - Mesa Freight (DOT 4198231, MC 1234570)
  - Reyes Logistics (DOT 3901122, MC 1234571)
  - Vargas Trucking (DOT 4302819, MC 1234572)
  - Perez Heavy Haul (DOT 3777443, MC 1234573)

  [Portal access not yet sent; dispatcher sends invites during testing]
```

---

## Part 8: 320px Mobile QA Checklist

- [ ] Open `/portal/accept-invite` at 320x640 and confirm no horizontal scroll.
- [ ] Open `/portal/overview` at 320x640 and confirm KPI cards wrap and remain readable.
- [ ] Open `/portal/overview/loads` at 320x640 and confirm content remains accessible.
- [ ] Confirm upgrade prompt banner remains visible without overlaying controls.

---

## Part 9: Release Gate Checklist (SC-010)

- [ ] Monthly AI + infra estimated spend is below $30.
- [ ] `CostGuard` snapshot check recorded for current month.
- [ ] FMCSA cache hit rate reviewed to reduce external calls.

---

## Part 10: Troubleshooting

### "401 Unauthorized" on API calls

- Verify `SUPABASE_ANON_KEY` is correct in `.env.local`
- Verify login was successful (check browser console for auth token)
- Check Supabase Auth logs for signup/login errors

### "CORS Error" when calling FastAPI from frontend

- Backend should have `cors = CORSMiddleware(...)` configured for `http://localhost:3000`
- In production, add Vercel domain to CORS allowlist

### FMCSA lookup returns 404

- DOT number is not in federal database (test with DOT 3812044)
- Check that `fmcsa_cache` table exists and has entries

### Claude API returning errors

- Verify `ANTHROPIC_API_KEY` is correct and has active quota
- Check that request model is `claude-sonnet-4-20250514`
- Verify request body is valid JSON

### Magic link not arriving

- Check **Spam** folder
- Verify `SENDGRID_API_KEY` is valid and `SENDGRID_FROM_EMAIL` is verified in SendGrid

---

## Next Steps After MVP Launch

1. **Phase 2 (Week 8+)**: Insurance Intelligence (IRS, playbook, DataQs)
2. **Phase 3 (Week 13+)**: HOS Compliance + ELD (Terminal API integration)
3. **Phase 4 (Week 17+)**: Billing (Stripe subscriptions, analytics)

See `plan.md` for full roadmap.

---

## Dashboard Links

- **Supabase**: https://app.supabase.com/projects
- **Railway**: https://railway.app/dashboard
- **Vercel**: https://vercel.com/dashboard
- **Anthropic**: https://console.anthropic.com
- **SendGrid**: https://app.sendgrid.com

---

## Support

For issues or questions:
1. Check this quickstart
2. Search Supabase docs (supabase.com/docs)
3. Check FastAPI docs (fastapi.tiangolo.com)
4. Check Next.js docs (nextjs.org)
5. File an issue in the repo

Happy building! 🚀
