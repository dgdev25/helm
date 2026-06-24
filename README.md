# Deathstar — Project Dashboard

A self-hosted dashboard for tracking GitHub repos and local git projects, with AI-powered summaries, commit analytics, a Rust crate library, a GitHub repo library, and context-aware project chat.

## Features

- **Dashboard** — filterable grid of all projects with status, language, last commit, open issues, and star count
- **AI primers** — generate and store a structured technical primer for any project (via `claude -p`)
- **AI synopsis** — one-paragraph project summary auto-generated from code and git history
- **AI chat** — streaming project-scoped chat with full primer context injected automatically
- **Launcher** — open a project in a terminal tab with roadmap context via Chrome DevTools Protocol
- **Analytics** — commit-activity bar charts per project (30-day rolling window)
- **GitHub sync** — fetch repos, commits, issues, and stars from one or more GitHub accounts; runs on a configurable schedule
- **Local scanning** — discover local git repos from configurable directories
- **Bulk primer** — queue and run primers for multiple projects with a live progress banner and cancel
- **Crate library** — browse and search your Rust crate inventory, with per-project relevance links and AI suggestions
- **Repo library** — curate a set of GitHub repos, with per-project relevance links and AI-powered discovery
- **Settings** — configure app name, sync interval, and other options from the UI

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Fastify 5 |
| Frontend | React 19 + Vite 8 |
| State | Zustand 5 |
| Styling | Tailwind CSS v4 |
| Charts | Chart.js 4 |
| Database | PostgreSQL |
| GitHub API | Octokit REST |
| AI | `claude -p` subprocess (Claude Code CLI) |

## Prerequisites

- Node.js 18+
- PostgreSQL
- [Claude Code CLI](https://claude.ai/code) — required for AI features (`claude` must be on `$PATH`)
- GitHub personal access token (scopes: `repo`, `read:user`)

## Setup

### 1. Clone and install

```bash
git clone <repo-url> deathstar
cd deathstar
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string, e.g. `postgres://user:pass@localhost:5432/deathstar` |
| `GITHUB_TOKEN` | yes | Personal access token (scopes: `repo`, `read:user`) |
| `GITHUB_USERNAMES` | yes | Comma-separated GitHub usernames/orgs to sync |
| `LOCAL_SCAN_DIRS` | no | Comma-separated paths to scan for local git repos |
| `CRATE_SCAN_ROOTS` | no | Comma-separated paths to scan for Rust crates |
| `SYNC_INTERVAL_HOURS` | no | Sync frequency in hours (default: `6`) |
| `PORT` | no | API server port (default: `47821`) |

### 3. Initialise the database

```bash
psql $DATABASE_URL -f server/schema.sql
```

### 4. Start

```bash
bash start.sh
```

| Service | URL |
|---|---|
| Frontend (Vite dev server) | http://localhost:47621 |
| API server | http://localhost:47821 |

Logs land in `logs/server.log` and `logs/vite.log`.

## Start Script

`start.sh` handles dependency checks, port cleanup, and service startup.

```bash
bash start.sh              # dev mode (default) — Fastify + Vite with hot reload
bash start.sh --prod       # production build + serve (API only, no Vite)
bash start.sh --stop       # stop all services
bash start.sh --rebuild    # force npm install even if node_modules is current
```

## Development

The API server runs with `node --watch` for auto-restart on file changes. Vite handles hot module replacement on the frontend.

```bash
npm run dev:server   # API only
npm run dev:client   # Vite only
npm run dev          # both concurrently
```

### Tests

```bash
node --test server/*.test.js server/routes/*.test.js
```

Test files live alongside their subjects (`*.test.js`).

## Production

```bash
npm run build   # Vite build → dist/
npm start       # NODE_ENV=production, serves dist/ from the API server
```

Or use `bash start.sh --prod` which does both steps and waits for the health check.

## API Reference

### Projects

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects` | List all projects (query: `search`, `status`, `language`) |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:slug` | Get project details |
| `PATCH` | `/api/projects/:slug` | Update project (status, description, etc.) |
| `DELETE` | `/api/projects/:slug` | Delete a project |
| `DELETE` | `/api/projects` | Bulk delete |
| `GET` | `/api/projects/:slug/commit-activity` | 30-day commit-activity data for charts |

### AI

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/projects/:slug/primer` | Generate or refresh a project primer |
| `POST` | `/api/projects/:slug/synopsis` | Generate a one-paragraph synopsis |
| `POST` | `/api/projects/:slug/description` | AI-generate a short description |
| `POST` | `/api/projects/:slug/chat` | Streaming SSE project chat |
| `POST` | `/api/projects/:slug/launch` | Open project in terminal via CDP |
| `POST` | `/api/fill-descriptions` | Bulk fill missing descriptions |

### Sync

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sync` | Full GitHub + local sync |
| `POST` | `/api/projects/:slug/sync` | Sync a single project |
| `POST` | `/api/scan/local` | Rescan local directories |
| `GET` | `/api/sync/log` | Recent sync history |

### Crate Library

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/crates` | List all crates (query: `search`, `category`, `starred`) |
| `POST` | `/api/crates/scan` | Scan `CRATE_SCAN_ROOTS` for Rust crates |
| `POST` | `/api/crates/import-url` | Import a crate by crates.io URL |
| `PATCH` | `/api/crates/:id` | Update crate (notes, starred, category) |
| `POST` | `/api/crates/:id/copy` | Duplicate a crate entry |
| `DELETE` | `/api/crates/:id` | Delete a crate |

### Project–Crate Links

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects/:slug/crates` | List crates linked to a project |
| `POST` | `/api/projects/:slug/suggest-crates` | AI-suggest relevant crates |
| `POST` | `/api/projects/:slug/crates` | Link a crate to a project |
| `PATCH` | `/api/projects/:slug/crates/:linkId` | Update link (score, pinned) |
| `DELETE` | `/api/projects/:slug/crates/:linkId` | Remove link |

### Repo Library

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/repos` | List all repos (query: `search`, `language`, `starred`) |
| `POST` | `/api/repos/import-url` | Import a GitHub repo by URL |
| `PATCH` | `/api/repos/:id` | Update repo (notes, starred) |
| `DELETE` | `/api/repos/:id` | Delete a repo |

### Project–Repo Links

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/projects/:slug/repos` | List repos linked to a project |
| `POST` | `/api/projects/:slug/suggest-repos` | AI-suggest relevant repos |
| `POST` | `/api/projects/:slug/discover-repos` | AI-discover repos from GitHub |
| `POST` | `/api/projects/:slug/repos` | Link a repo to a project |
| `PATCH` | `/api/projects/:slug/repos/:linkId` | Update link (score, pinned) |
| `DELETE` | `/api/projects/:slug/repos/:linkId` | Remove link |

## Project Structure

```
deathstar/
├── server/
│   ├── index.js            # Fastify bootstrap, route registration, static serving
│   ├── db.js               # PostgreSQL client (postgres library)
│   ├── github.js           # GitHub sync via Octokit; disambiguateSlug
│   ├── localscanner.js     # Local git repo discovery
│   ├── sync.js             # node-cron scheduler
│   ├── primer.js           # AI primer generation (claude -p subprocess)
│   ├── synopsis.js         # AI synopsis generation
│   ├── launcher.js         # Terminal launcher via Chrome DevTools Protocol
│   ├── settings.js         # DB-backed settings read/write
│   ├── schema.sql          # Full PostgreSQL schema
│   └── routes/
│       ├── projects.js     # Project + AI + sync endpoints
│       ├── crates.js       # Crate library CRUD
│       ├── crateLinks.js   # Project–crate link endpoints
│       ├── repos.js        # Repo library CRUD
│       └── repoLinks.js    # Project–repo link endpoints
├── src/
│   ├── App.jsx             # Router setup
│   ├── store.js            # Zustand store (projects, chat, bulkPrimer, appName)
│   ├── main.jsx            # React entry point
│   ├── index.css           # Tailwind base styles
│   ├── pages/
│   │   ├── Dashboard.jsx   # Project grid with filters and search
│   │   ├── ProjectDetail.jsx # Primer, synopsis, chat, analytics, linked crates/repos
│   │   ├── Analytics.jsx   # Commit-activity charts across projects
│   │   ├── Crates.jsx      # Crate library browser
│   │   ├── Repos.jsx       # Repo library browser
│   │   └── Settings.jsx    # App configuration UI
│   ├── components/
│   │   ├── Layout.jsx      # Shell with sidebar navigation
│   │   ├── Sidebar.jsx     # Nav, sync button, bulk primer trigger
│   │   ├── ChatPanel.jsx   # Streaming SSE chat with markdown rendering
│   │   ├── BulkPrimerBanner.jsx  # Live progress banner with cancel
│   │   ├── RelatedCrates.jsx     # Per-project crate suggestions
│   │   ├── RelatedRepos.jsx      # Per-project repo suggestions
│   │   └── ...             # Cards, pills, toggles, stat widgets
│   └── utils/
│       └── markdown.jsx    # Shared renderMarkdown (ProjectDetail + ChatPanel)
├── .primer/
│   └── STATE.md            # Session continuity ledger (updated by /primers)
├── logs/                   # Runtime logs (server.log, vite.log) — gitignored
├── dist/                   # Production build output — gitignored
├── start.sh                # Dev/prod launcher script
├── .env.example            # Environment variable template
├── vite.config.js
└── tailwind.config.js
```

## Database Schema

Six tables:

| Table | Purpose |
|---|---|
| `projects` | All projects — GitHub repos and local git dirs |
| `github_sync_log` | Sync history and status |
| `settings` | Key-value app config (sync interval, app name, …) |
| `crate_library` | Rust crate inventory |
| `project_crate_links` | Many-to-many: projects ↔ crates with score + source |
| `repo_library` | Curated GitHub repo collection |
| `project_repo_links` | Many-to-many: projects ↔ repos with score + source |

See `server/schema.sql` for full DDL.

## Invariants

These constraints are enforced by convention and must not be bypassed:

- **All AI routes must go through `withAISlot()`** (`server/lib/aiSlot.js`) — 2-slot concurrency cap; bypass burns unbounded API quota
- **`disambiguateSlug` callers** must record `slugTaken[result] = identityKey` after each call to prevent collision cascades
- **`crateLinks` and `repoLinks`** PATCH/DELETE queries must include `AND project_slug = $slug` — missing this scopes the mutation to the wrong project

## Troubleshooting

**Port already in use:**
```bash
bash start.sh --stop
# or manually:
lsof -ti tcp:47821 | xargs kill -9
lsof -ti tcp:47621 | xargs kill -9
```

**Server exits immediately:**
```bash
cat logs/server.log
```
Most common causes: `DATABASE_URL` is wrong, PostgreSQL isn't running, or schema hasn't been applied.

**Database connection errors:**
```bash
psql $DATABASE_URL -c "SELECT 1"
```

**AI features return errors:**
Verify `claude` is on your `$PATH` and authenticated:
```bash
claude --version
```

**GitHub API rate limits:**
Check the sync log for rate-limit messages:
```bash
curl http://localhost:47821/api/sync/log
```

## License

MIT
