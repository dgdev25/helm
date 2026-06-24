# Deathstar — Primer State
<!-- Maintained by the /primers skill. AUTO blocks are regenerated each run; edit CARRY blocks freely. -->

## At a glance  <!-- AUTO -->
- **Purpose:** Dashboard for tracking GitHub repos and local git projects — AI synopses, primers, analytics, crate library, and context-aware project chat in one UI
- **Stack:** Node.js (Fastify 5) + React 19 + PostgreSQL + Vite + Tailwind v4 + Zustand
- **Dev loop:** `bash start.sh` (Fastify :47821, Vite :47621) · `node --test server/*.test.js server/routes/*.test.js`
- **Last primed:** 2026-06-24 · HEAD `9e98235` on `main`

## Structure  <!-- AUTO -->
- `server/index.js` — Fastify bootstrap, boot-time local scan, scheduler start
- `server/routes/` — projects, repos, repoLinks, crates, crateLinks (all scoped by slug)
- `server/lib/aiSlot.js` — 2-slot AI concurrency cap (`withAISlot`); all AI routes must go through it
- `server/primer.js` / `synopsis.js` — AI generation via `claude -p` subprocess
- `server/github.js` — GitHub sync + `disambiguateSlug` (3-way collision handled with counter)
- `server/launcher.js` — opens terminal via CDP with roadmap context (POSIX `'\''` escaping)
- `src/pages/` — Dashboard, ProjectDetail, Analytics, Crates, Repos, Settings
- `src/components/` — ChatPanel (markdown, streaming), BulkPrimerBanner, RelatedCrates/Repos
- `src/utils/markdown.jsx` — shared `renderMarkdown` (used by ProjectDetail + ChatPanel)
- `src/store.js` — Zustand: projects, chat (`chatProject`), bulkPrimer, appName

## In flight  <!-- AUTO -->
- `main` branch, clean working tree
- Two untracked plan docs: `docs/superpowers/plans/2026-06-24-crate-project-relevance.md` and `...-github-repo-discovery.md` — commit or discard

## Drift / distrust  <!-- AUTO -->
- README references stale ports — actual ports are 47821 (API) and 47621 (Vite dev)
- No other doc-vs-code contradictions found

## Roadmap — next steps  <!-- AUTO -->
1. **Commit or discard untracked plan docs** — `git clean -f docs/superpowers/plans/` or `git add` them; eliminates `git status` noise — *trivial effort*
2. **Auth layer** — server is localhost-only by design, but no enforcement; `HOST=0.0.0.0` would expose AI endpoints publicly — add token header check before any remote deploy — *medium effort, must-have before deployment*
3. **README update** — ports and setup steps are stale — *trivial*
4. **E2E test for chat + streaming SSE** — `ChatPanel → /chat → SSE` path is manual-only; no automated test — *medium effort, high value*
5. **Per-minute AI rate limit** — `withAISlot` caps concurrency but not request rate; a script could queue 100 requests and burn API quota — *small effort*
<!-- For the exhaustive prioritized worklist, run /audit. -->

## Locked decisions & invariants  <!-- AUTO -->
- All AI routes MUST go through `withAISlot()` — bypass = uncapped quota burn
- Shell injection: macOS/Linux uses POSIX `'\''`; Windows uses `\"` inside double-quoted cmd arg
- `disambiguateSlug` callers must write `slugTaken[result] = identityKey` after each call
- `crateLinks` and `repoLinks` PATCH/DELETE must include `AND project_slug = ${slug}` in WHERE
- `CRATE_SCAN_ROOTS` is env-configurable via `process.env.CRATE_SCAN_ROOTS` (comma-separated)

## Open threads & decisions  <!-- CARRY: never auto-clobbered; only [ ]→[x] when a commit resolves it -->
- [x] Decide whether `.primer/` should be tracked in git or gitignored — tracked as of `f32fb88`
- [x] Harden the `claude -p` subprocess paths — done in `61da9bd`
- [x] Commit launcher WIP — shipped across `32db597`→`a5a814c`
- [x] Tests for `primer.js` and `synopsis.js` — shipped in `138883d`
- [x] Commit bulk-primer feature (`BulkPrimerModal.jsx` + 6 modified files) — shipped `9c46982`→`ab1ae59`
- [x] Commit 4 remaining modified frontend files — landed in repo library feature wave
- [x] Security audit remediation (26 items) — completed in `bbff5b5`→`9e98235` (9 commits)
- [ ] Review 2 untracked plan docs in `docs/superpowers/plans/` — commit or discard

## Session log  <!-- append-only -->
- 2026-06-23 `c3bcd9c` — quick prime
- 2026-06-24 `c3bcd9c` — standard prime; rebuilt ledger into full template
- 2026-06-24 `6c20baa` — post-audit prime; 7 commits landed, CARRY threads ticked
- 2026-06-24 `6c20baa` — restructured to Executive Summary format; markdown rendering added to UI
- 2026-06-24 `f81b768` — primer markdown rendering shipped; WIP launcher + route/detail changes in tree
- 2026-06-24 `f81b768` — launcher feature identified: terminal cdp spawn with roadmap context; all 3 WIP files coherent and ready to commit
- 2026-06-24 `a5a814c` — launcher fully shipped (4 commits); tests added; 6 new uncommitted changes across frontend + routes
- 2026-06-24 `a5a814c` — bulk-primer feature identified: BulkPrimerModal.jsx (new) + 6 modified files; ready to review and commit
- 2026-06-24 `ab1ae59` — bulk-primer fully shipped (3 commits); 4 modified frontend files remain uncommitted
- 2026-06-24 `53b0bc6` — repo library fully shipped (10 commits): scorer, AI discoverer, link routes, star toggle, library page, RelatedRepos; 2 untracked plan docs pending review
- 2026-06-24 `9e98235` — security audit remediation complete (9 commits, 26 items); Analytics charts, ChatPanel markdown, bulk primer banner, syncGitHub parallelised, 24 new route tests
