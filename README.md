# FilmTracker

Tracks prices for popular **35mm film** from **Canadian stores** and displays the **lowest 3 in-stock prices** per film.

## Quickstart (local)

### 1) Start Postgres

```bash
docker compose up -d db
```

### 2) Configure environment

```bash
cp server/.env.example server/.env
```

### 3) Install dependencies

```bash
npm install
```

### 4) Run migrations

```bash
npm run db:migrate
```

### 5) Start dev servers

```bash
npm run dev
```

- API: `http://localhost:4000/api/health`
- Web: `http://localhost:5173`

## Docs
- Plan: `PLAN.md`

