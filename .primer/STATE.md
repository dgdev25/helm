# Deathstar — Primer State
<!-- Maintained by the /primers skill. AUTO blocks are regenerated each run; edit CARRY blocks freely. -->

## Executive Summary  <!-- AUTO -->
- **Project:** Dashboard for tracking GitHub repos and local git projects — AI-generated synopses, project primers, and commit history in a single UI
- **Last session:** Completed a full /audit remediation — security (localhost bind), slug collision guard, settings persistence to DB, schema bootstrap on boot, AI concurrency cap, dead row cleanup, and boot-time local scan (7 commits, `6c20baa`)
- **What's next:** Write tests for `primer.js` / `synopsis.js` (only uncovered server modules); add an auth layer before any remote deploy

## At a glance  <!-- AUTO -->
- **Stack:** Node.js (Fastify 5) + React 19 + PostgreSQL + Vite 8 + Tailwind v4 + Zustand
- **Dev loop:** `bash start.sh` (Fastify :47821, Vite :47621) · `npm run build` · `node --test server/*.test.js`
- **Last primed:** 2026-06-24 · HEAD `6c20baa` on `main`

## Structure  <!-- AUTO -->
- `server/index.js` — Fastify bootstrap, settings load, scheduler start
- `server/routes/projects.js` — all project routes (primers, synopsis, 2-slot AI cap)
- `server/primer.js` / `synopsis.js` — AI generation via `claude -p` subprocess
- `server/sync.js` / `localscanner.js` / `github.js` — scheduler, local scan, GitHub sync
- `server/db.js`, `schema.sql` — Postgres connection + idempotent schema bootstrap
- `src/pages/` / `src/components/` / `src/store.js` — React SPA + Zustand

## In flight  <!-- AUTO -->
Clean tree at `6c20baa`. Natural checkpoint post-audit — nothing mid-flight.

## Drift / distrust  <!-- AUTO -->
None found.

## Roadmap — next steps  <!-- AUTO -->
1. Tests for `primer.js` and `synopsis.js` — only server modules without `.test.js` — small effort, high safety
2. Auth layer if `HOST=0.0.0.0` is ever set — localhost-only by design; remote exposure needs auth first
3. Synopsis prompt-injection hardening (LOW) — README content interpolated into the `claude` prompt; confined impact today

## Locked decisions & invariants  <!-- AUTO -->
- New server logic = own module + matching `.test.js` (Node built-in test runner)
- AI calls via `execFile('claude', ['-p', ...])` subprocess — not an SDK; capped at 2 concurrent
- Settings: non-secrets in `settings` table; GitHub token is env-only
- App binds `127.0.0.1` by default — set `HOST=0.0.0.0` + auth only for intentional remote deploy
- After backend changes, run `bash start.sh` (never ask the user)

## Open threads & decisions  <!-- CARRY: never auto-clobbered; only [ ]→[x] when a commit resolves it -->
- [x] Decide whether `.primer/` should be tracked in git or gitignored — tracked as of `f32fb88`
- [x] Harden the `claude -p` subprocess paths — done in `61da9bd`

## Session log  <!-- append-only -->
- 2026-06-23 `c3bcd9c` — quick prime
- 2026-06-24 `c3bcd9c` — standard prime; rebuilt ledger into full template
- 2026-06-24 `6c20baa` — post-audit prime; 7 commits landed, CARRY threads ticked
- 2026-06-24 `6c20baa` — restructured to Executive Summary format; markdown rendering added to UI
