# Deathstar — Primer State
<!-- Maintained by the /primers skill. AUTO blocks are regenerated each run; edit CARRY blocks freely. -->

## At a glance  <!-- AUTO -->
- **Purpose:** Dashboard for tracking GitHub repos and local git projects, with AI-generated synopses and primers per project
- **Stack:** Node.js (Fastify 5) + React 19 + PostgreSQL (`postgres`) + Vite 8 + Tailwind v4 + Zustand
- **Dev loop:** build `npm run build` · test `node --test server/*.test.js` · run `npm run dev` (Fastify :7337 + Vite :7338) or `bash start.sh` (prod)
- **Last primed:** 2026-06-24 · HEAD `c3bcd9c` on `main`

## Structure  <!-- AUTO -->
- `server/index.js` — Fastify bootstrap, registers route plugins
- `server/routes/projects.js` — all project routes (incl. `/primers`, `/synopsis`)
- `server/primer.js` — generates project primer via `claude -p` subprocess
- `server/synopsis.js` — one-line AI synopsis per project card via `claude -p`
- `server/sync.js`, `server/github.js`, `server/localscanner.js` — data ingest (GitHub API + local dir scan)
- `server/db.js`, `server/schema.sql` — Postgres connection + schema
- `src/pages/` — Dashboard, ProjectDetail, Analytics, Settings, NotFound, ServerError
- `src/components/` — ProjectCard, Sidebar, GlassCard, StatusPill, CommitList, DirList, …
- `src/store.js` — Zustand store; `src/utils/` — safeHref, time
- `start.sh` — production launcher

## In flight  <!-- AUTO -->
Nothing mid-flight: HEAD unchanged (`c3bcd9c`) since last prime. Working tree has only `.gitignore` modified and `.primer/` untracked — no code changes in progress. The primers feature (Run /primers button, DB-persisted `primer_state`, focused quick-prime prompt) is the last thing that landed. Natural "what's next" checkpoint.

## Drift / distrust  <!-- AUTO -->
None found. Note: `server/primer.js:33` contains a line that looks like a TODO but is a placeholder *inside the prompt template string*, not a real code marker.

## Roadmap — next steps  <!-- AUTO -->
1. Error/retry UX for primer & synopsis — both shell out to `claude -p`, failures silent to user — small effort, high impact
2. Tests for `primer.js` and `synopsis.js` — only server modules missing a `.test.js` — small effort
3. Surface primer output more prominently (expandable section or tab on ProjectDetail) — medium effort
4. Decide on `.primer/`: track it (portable) or gitignore it (private) — near-zero effort
<!-- For the exhaustive prioritized worklist, run /audit. -->

## Locked decisions & invariants  <!-- AUTO -->
- New server logic = own module + matching `.test.js`, run via Node's built-in test runner
- AI calls are subprocess-based (`execFile('claude', ['-p', ...])`), not an SDK — depends on local `claude` binary on PATH
- After backend changes, run `bash start.sh` (auto-restart convention; don't ask the user)

## Open threads & decisions  <!-- CARRY: never auto-clobbered; only [ ]→[x] when a commit resolves it -->
- [ ] Decide whether `.primer/` should be tracked in git or gitignored
- [ ] Harden the `claude -p` subprocess paths (primer + synopsis) with user-visible errors/retry

## Session log  <!-- append-only -->
- 2026-06-23 `c3bcd9c` — quick prime
- 2026-06-24 `c3bcd9c` — standard prime; no git delta, rebuilt ledger into full template, harvested roadmap
