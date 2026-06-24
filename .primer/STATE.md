# Deathstar — Primer State
<!-- Maintained by the /primers skill. AUTO blocks are regenerated each run; edit CARRY blocks freely. -->

## At a glance  <!-- AUTO -->
- **Purpose:** Dashboard for tracking GitHub repos and local git projects, with AI-generated synopses and primers per project
- **Stack:** Node.js (Fastify 5) + React 19 + PostgreSQL (`postgres`) + Vite 8 + Tailwind v4 + Zustand
- **Dev loop:** build `npm run build` · test `node --test server/*.test.js` · run `npm run dev` (Fastify :47821, Vite :47621 proxies /api) or `bash start.sh` (prod; uses `node --watch`)
- **Last primed:** 2026-06-24 · HEAD `6c20baa` on `main`

## Structure  <!-- AUTO -->
- `server/index.js` — Fastify bootstrap, settings GET/PATCH, schema load on boot, scheduler start
- `server/settings.js` — key/value settings in the `settings` table (.env as first-run default; token env-only)
- `server/routes/projects.js` — all project routes (incl. `/primers`, `/synopsis`, with a 2-slot AI concurrency cap)
- `server/primer.js` — generates project primer via `claude -p` subprocess (clearer missing-binary/timeout errors)
- `server/synopsis.js` — one-line AI synopsis per project card via `claude -p`
- `server/sync.js` — scheduler; runs a local scan on boot, full sync on interval
- `server/github.js` — GitHub sync + `disambiguateSlug()` (collision guard)
- `server/localscanner.js` — local dir scan
- `server/db.js`, `server/schema.sql` — Postgres connection + schema (applied idempotently on boot)
- `src/pages/`, `src/components/`, `src/store.js` (Zustand), `src/utils/` — React SPA
- `start.sh` — launcher

## In flight  <!-- AUTO -->
Clean tree at `6c20baa`. A full `/audit` just landed: security (localhost bind), bug fix (slug collisions), two gaps closed (settings now persist to DB; schema bootstraps on boot), and hardening (AI concurrency cap + clearer errors, dead `open_prs` row removed, boot-time local scan). Nothing mid-flight — natural checkpoint.

## Drift / distrust  <!-- AUTO -->
None found. `server/primer.js:33` still has a line that looks like a TODO but is a placeholder *inside the prompt template string*, not a real code marker.

## Roadmap — next steps  <!-- AUTO -->
1. Tests for `primer.js` and `synopsis.js` — still the only server modules without a `.test.js` — small effort
2. Surface primer output more prominently (expandable section or dedicated tab on ProjectDetail) — medium effort
3. Auth layer if `HOST=0.0.0.0` is ever set — the app is localhost-only by design; remote exposure needs auth first
4. Synopsis prompt-injection hardening (LOW) — README content is interpolated into the `claude` prompt; impact is confined to escaped text today
<!-- For the exhaustive prioritized worklist, run /audit. -->

## Locked decisions & invariants  <!-- AUTO -->
- New server logic = own module + matching `.test.js`, run via Node's built-in test runner
- AI calls are subprocess-based (`execFile('claude', ['-p', ...])`), not an SDK — depends on local `claude` binary on PATH; capped at 2 concurrent
- Settings: non-secret values in the `settings` table (DB overrides .env); GitHub token is env-only
- App binds `127.0.0.1` by default (no auth) — set `HOST=0.0.0.0` + add auth only for intentional remote deploy
- After backend changes, run `bash start.sh` (auto-restart convention; don't ask the user)

## Open threads & decisions  <!-- CARRY: never auto-clobbered; only [ ]→[x] when a commit resolves it -->
- [x] Decide whether `.primer/` should be tracked in git or gitignored — tracked as of `f32fb88`
- [x] Harden the `claude -p` subprocess paths (primer + synopsis) with user-visible errors/retry — done in `61da9bd` (clearer errors + 2-slot cap; no retry yet)

## Session log  <!-- append-only -->
- 2026-06-23 `c3bcd9c` — quick prime
- 2026-06-24 `c3bcd9c` — standard prime; no git delta, rebuilt ledger into full template, harvested roadmap
- 2026-06-24 `6c20baa` — post-audit prime; /audit remediation landed (7 commits), ledger updated, two CARRY threads ticked
