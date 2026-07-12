# Deploying the CPQ app to Render

The app is one repo → one Render **Web Service** (Express serves the API + the built
React client) + one Render **Postgres**. `render.yaml` wires both automatically.

## 1. Push to GitHub
Create a new **empty** repo on github.com (no README/.gitignore). Then, from `cpq-app/`:

```
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

(The repo is already initialized and committed on branch `main`. `.env` is gitignored,
so no secrets are pushed.)

## 2. Create the Render services from the blueprint
1. Render dashboard → **New +** → **Blueprint**.
2. Connect the GitHub repo you just pushed.
3. Render reads `render.yaml` and proposes a **web service (`cpq-app`)** + a
   **Postgres (`cpq-db`)**. Approve.
4. `DATABASE_URL` is injected into the web service automatically from `cpq-db` — you
   don't set it by hand.
5. Click **Apply** / **Create**.

## 3. What happens on deploy
- **Build:** `npm install --include=dev && npm run build` (Prisma client + Vite build → `dist/`).
- **Start:** `npm start` → `prisma migrate deploy` (creates the tables from
  `prisma/migrations/`) then launches the server on Render's `PORT`.
- On first load the app seeds the 5 default labor rates. Parts/quotes start empty —
  use **Import Price List** / the parts editor to load data (or Excel import).
- Health check: `GET /api/health`.

## 4. Notes / gotchas
- **Free tier:** the free web service spins down when idle (first request after idle is
  slow to wake); the free Postgres has a storage cap and expires after ~90 days. Upgrade
  the plans in `render.yaml` (`plan: starter`) when ready for always-on.
- **Schema changes later:** edit `prisma/schema.prisma`, run `npx prisma migrate dev
  --name <change>` locally, commit the new folder under `prisma/migrations/`, and push —
  Render applies it via `prisma migrate deploy` on the next deploy.
- **Local dev** uses a separate Postgres on port 5433 (see project notes); production
  uses the Render database. They never mix.
