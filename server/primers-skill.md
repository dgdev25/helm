---
name: primers
description: >
  Load context for a Claude Code session AND leave behind a self-updating project ledger so the next
  session continues exactly where this one left off. Analyses codebase structure, git activity,
  documentation, and key source files; reports what the project is, what changed since you were last
  here, and a concrete roadmap of what to build next. Use whenever starting work on a project, resuming
  after a break, picking up the next day, or when explicitly asked to "prime", "primer", "prime-deep",
  "prime-quick", "what's next", "what should we build next", "where did we leave off", or "catch me up".
  Picks depth automatically: Quick for subagents/short tasks, Standard for a fresh session (default),
  Deep when a focus area or concern is given.
---

# Project Primer

Read the codebase and report a clear picture of what the project is, how it's structured, **what is in
flight right now**, and **what to do next** — then persist that picture to a ledger so tomorrow's session
starts warm instead of cold. The cheapest, highest-signal source for "what's happening" is git, so this
primer is git-first.

Two things make this skill more than a one-shot summariser:

1. **A self-updating ledger** (`.primer/STATE.md`) that is regenerated every run. Each prime computes the
   git delta *since the last prime* — so "where did we leave off?" has a real answer, not a guess.
2. **An always-on roadmap.** Every Standard/Deep prime ends with a concrete, ranked list of next steps,
   harvested from real signals in the repo (TODOs, stubs, skipped tests, doc "future work" sections,
   commit trajectory), not from vibes.

## Operating rules (apply to every depth)

- **Read the ledger first.** If `.primer/STATE.md` exists, read it before anything else — it is the
  cached base from the last prime and tells you the last-primed commit SHA. This makes every prime a
  cheap *delta* instead of a from-scratch rebuild.
- **Batch in parallel.** Priming is read-only. Run all gather commands and all core-file reads in a
  single parallel tool block — never one at a time.
- **Don't re-read what's already in context.** Claude Code auto-injects `CLAUDE.md` and memory at
  session start. If it's already in the prompt, skip it. If a SessionStart onboarding bundle already
  primed this session, do a Quick top-up (just the git delta) instead of a full prime.
- **Manifests, not lockfiles.** Read `Cargo.toml` / `package.json` / `pyproject.toml`. Never read
  `Cargo.lock` / `package-lock.json` / `pnpm-lock.yaml` / `go.sum` — they're huge and low-signal.
- **Summarise the file tree, don't dump it.** On a large repo, a raw `git ls-files` is thousands of
  tokens. Collapse to directories.
- **`tree` may not be installed.** Always pair it with a `find` fallback.
- **Trust code over narrative.** READMEs, `progress.md`, and roadmap docs drift — they describe what
  someone *intended*, often months ago. When a doc and the code disagree, the code wins, and you flag the
  drift (see *Drift detection*). This is a real failure mode, not a hypothetical.
- **Stop when you can write the report.** Don't read more files than the depth requires.

## Choosing depth

| Signal | Depth |
|---|---|
| Running as a subagent, or a short/one-off task | **Quick** |
| Fresh session, resuming, getting oriented, or "what's next" (default) | **Standard** |
| User named a focus area or concern (`frontend`, `performance`, "the auth flow", …) | **Deep** |

When in doubt, use **Standard**.

---

## Quick Prime

One parallel batch, then a one-paragraph summary. Still updates the ledger's delta line so continuity
isn't lost on short tasks.

```bash
cat .primer/STATE.md 2>/dev/null | head -40            # last-known state, if any
git log --oneline -10                                  # what changed recently
git branch --show-current && git status -s             # branch + uncommitted work
git ls-files | cut -d/ -f1-2 | sort -u                 # structure, collapsed to 2 levels
```

Then read (skip any already in context): `README.md`, the package manifest, and any files the user named.

**Report (one paragraph):** what the project does, its tech stack, the key entry points, and what the
recent commits + branch suggest is currently being worked on. If `.primer/STATE.md` existed, also note in
one line what changed since it was last written.

---

## Standard Prime

### 1. Gather — ONE parallel batch

```bash
cat .primer/STATE.md 2>/dev/null                       # the ledger — read it FIRST
git log --oneline -15                                  # in-flight work (highest signal)
git branch --show-current && git status -s
git ls-files | cut -d/ -f1-2 | sort -u                 # collapsed file tree
tree -L 2 -I 'node_modules|target|dist|build|coverage|.git|__pycache__' 2>/dev/null \
  || find . -maxdepth 2 -type d \
       -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/target/*' | sort
ls -la
# Monorepo? detect the real workspaces, then prime the right layer
cat pnpm-workspace.yaml go.work 2>/dev/null; grep -l '\[workspace\]' Cargo.toml 2>/dev/null
```

If the ledger recorded a last-primed SHA, compute the delta in the same batch:

```bash
git log --oneline <LAST_PRIMED_SHA>..HEAD               # what happened since you were last here
```

### 2. Read core files (same batch where possible; skip what's already in context)

- `CLAUDE.md` / `.claude/CLAUDE.md` — project rules (only if not already in context)
- `README.md` — purpose and setup
- `CONTRIBUTING.md` — workflow/standards (if present)
- The package **manifest** (`Cargo.toml`, `package.json`, `go.mod`, `pyproject.toml`)
- `.env.example` — required config
- `progress.md` / `ROADMAP.md` / `docs/specs/*` / `docs/adr/*` — stated direction (read with the
  *trust-code-over-narrative* rule in mind)
- Any files the user named

### 3. Locate key components

- **Entry points** — read them from the manifest (`[[bin]]` / `scripts` / `main` / `cmd/`), don't just
  glob for `main.*`. Fall back to globbing only if the manifest is silent.
- **Config** — `.*rc`, `*.config.*`, `.env.example`
- **Tests** — `test/`, `tests/`, `spec/`, `__tests__/`
- **Project-specific skills & locked decisions** — a `*-expert` skill, an `ADR`/`decisions` dir, or
  locked decisions in memory/`CLAUDE.md` are gold. Surface them: future work must respect them, and
  there may be a dedicated skill the user should invoke.

### 4. Harvest roadmap signals (the "what's next" inputs)

Run these in the gather batch too — they're cheap and turn "next steps" from guesswork into evidence:

```bash
# Stubs and explicit unfinished markers
grep -rnI -E 'TODO|FIXME|HACK|XXX|todo!\(|unimplemented!\(|unreachable!\("?TODO|NotImplemented' \
  --include='*.rs' --include='*.ts' --include='*.tsx' --include='*.js' --include='*.py' \
  --include='*.go' . 2>/dev/null | head -40
# Tests that are turned off — each one is a known gap
grep -rnI -E '#\[ignore\]|it\.skip|describe\.skip|xit\(|test\.skip|@pytest\.mark\.skip|@unittest\.skip' \
  . 2>/dev/null | head -30
# Stated future work in docs
grep -rniE 'out of scope|future work|not (yet )?implemented|coming soon|phase [0-9]|next steps|TODO' \
  README.md progress.md ROADMAP.md docs/ 2>/dev/null | head -30
# Open issues, if there's a remote
gh issue list -L 20 2>/dev/null
```

### 5. Drift detection

Cross-check the narrative against reality. The narrative often says a thing is unbuilt that the code has
since shipped (or vice-versa). For each "Stage N only" / "out of scope" / "not implemented" claim you
read in step 2, do a quick `grep`/`ls` to see whether the code actually contradicts it. **Report every
contradiction explicitly** — a stale doc that reads as authoritative is how a session starts off in the
wrong mental model.

### 6. Report

**Purpose:** one sentence on what this project does.

**Tech stack:** primary language + main framework + database/storage.

**Structure:**
```
[key folders only — not the full tree]
```

**Key files:** core logic · config · entry point (with paths).

**Dev loop:** how to build / test / run (pull from manifest scripts or README — this is the most useful
thing to know before touching anything).

**Since you were last here:** the `<LAST_PRIMED_SHA>..HEAD` delta in plain language — what shipped, which
open threads from the ledger are now done. Omit on a first-ever prime.

**In flight:** current branch + what the recent commits + uncommitted work suggest is being worked on now.

**Drift / things to distrust:** any doc-vs-code contradiction found in step 5. Say "none found" if clean.

**Roadmap — what's next:** 3–6 concrete next steps, ranked, each with a one-line *why now* and a rough
effort/impact read, plus a recommended order. Ground each item in a harvested signal (a TODO, a skipped
test, a doc gap, the commit trajectory) — not invention. Keep this orientation-level: it's "here's where
this is heading and the obvious moves," **not** an exhaustive worklist. For the full self-challenged,
per-item-approved action list, point the user at `/audit`.

**Key insights:** 2–3 things (incl. locked decisions / invariants / project-specific skills) worth
knowing before editing this codebase.

### 7. Update the ledger

After reporting, write the picture to `.primer/STATE.md` and a one-line pointer to project memory. See
**The ledger** below. Do this every Standard/Deep prime — it's what makes tomorrow cheap.

---

## Deep Prime

Use when a focus area (`frontend` · `backend` · `testing` · `performance` · `security` · `database`) or a
specific concern is given. **Delegate the fan-out to keep the main context clean.**

### 1. Foundation (one parallel batch)

Do everything in **Standard → steps 1, 2, 4 & 5**, plus a 3-level tree:

```bash
tree -L 3 -I 'node_modules|target|dist|build|coverage|.git|__pycache__' 2>/dev/null \
  || find . -maxdepth 3 -type d \( -name src -o -name lib -o -name app \) | head -20
```

### 2. Focus-area fan-out

For each focus area, dispatch an **`Explore` subagent** (parallel) that returns findings, not file dumps —
this is what keeps the main thread's context budget for the actual work. Per area, the agent investigates:

- **frontend / ui** — main components, state management, routing, styling system
- **backend / api** — route definitions, models/schemas, middleware, service layers
- **testing** — test examples, patterns, config, utilities
- **performance** — caching, optimisation configs, monitoring, build config
- **security** — authn, authz, input validation, security configs
- **database** — schema, migrations, ORM setup, query patterns

If no focus area is given, cover all areas briefly in the main thread instead of fanning out.

### 3. Address the specific concern

Search for related keywords, read the nearest existing implementation, and find its tests — so any new
work mirrors an established pattern rather than inventing one.

### 4. Report

**Project type · Architecture · Tech stack · Key patterns** (conventions new code must follow).

**Dev loop:** build / test / run commands.

**Focus-area findings:** how it's structured · key files + purposes · entry points for working here.

**Specific-concern findings:** how it's currently handled · related code locations · the pattern to follow.

**Roadmap — what's next** (focus-area-weighted) and **Drift** — same as Standard steps 5–6.

### 5. Update the ledger

Same as Standard step 7.

---

## The ledger (`.primer/STATE.md`)

The ledger is a single Markdown file at the repo root in `.primer/STATE.md`. It is the durable base that
lets each session continue where the last left off. It has **two zones** so that regenerating it never
destroys human notes:

- **AUTO** sections are fully regenerated every prime from the current repo state.
- **CARRY** sections are preserved verbatim across primes — your parked threads, decisions, and notes.
  The only automated edit allowed to a CARRY item is ticking a `[ ]` → `[x]` when a new commit clearly
  resolves it (mention the commit SHA when you do).
- **Session log** is append-only — one line per prime.

### Update protocol (every Standard/Deep prime)

1. Read the existing `.primer/STATE.md` if present; extract its last-primed SHA and its CARRY + log zones.
2. **Migrate any legacy hand-maintained state file** (see below) — fold its durable bits in, then delete it.
3. Regenerate the AUTO zones from this prime's findings.
4. Preserve the CARRY zone verbatim, except tick any checkbox a new commit resolved.
5. Append one line to the session log: today's date, HEAD SHA, one phrase on what this prime found/did.
   (Dates: use the current date from your context. Don't shell out to a clock if a date is already given.)
6. Record the new last-primed SHA (`git rev-parse --short HEAD`).
7. Write the file. Create the `.primer/` dir if needed. Consider suggesting the user add `.primer/` to
   `.gitignore` if they'd rather keep it private — but default to leaving it tracked so it travels with
   the repo across machines and working copies.

### Migrate legacy state files (one-time, automatic)

Hand-maintained "where we left off" files — most commonly **`progress.md`** (also `STATUS.md`,
`NOTES.md`, `CONTINUE.md`, `HANDOFF.md`) — are exactly what this ledger replaces, and they're the files
most prone to the drift the *trust-code-over-narrative* rule warns about. The ledger should be the single
source of truth, so consolidate them rather than letting two state files diverge.

**Where to look.** These files live at the repo root *or* in a docs folder — check both. Match by name,
not by content, so you never sweep up the durable design docs that sit beside them:

```bash
ls progress.md STATUS.md NOTES.md CONTINUE.md HANDOFF.md \
   docs/progress.md docs/STATUS.md docs/NOTES.md docs/CONTINUE.md docs/HANDOFF.md 2>/dev/null
```

A `docs/` directory full of ADRs, a PRD, roadmaps, and design specs is the normal case — those are
durable references, NOT state files. Migrate *only* the named continuation files above; leave everything
else in `docs/` untouched.

When a prime finds one of these files:

1. **Fold the durable, non-derivable bits into `.primer/STATE.md`.** "Durable" means things a future
   prime *can't* reconstruct from git + code: reuse-source / attribution tables, methodology or
   process maps, locked decisions and their rationale, links to specs/ADRs, and genuinely open
   parking-lot items. Put reference-style material in a `## Reference` block and pending work in
   `## Open threads & decisions` — both `CARRY`, so they survive future regenerations.
2. **Drop the stale, derivable, or superseded bits.** Anything the AUTO zones already cover (current
   structure, in-flight work, "what shipped" logs that git records) or anything the code now
   contradicts (e.g. a "Phase 1 only / out of scope" scope note for features that have since shipped)
   is *not* worth carrying — folding it back in would just re-import the drift.
3. **Delete the legacy file** (`git rm <file>` in a repo, else `rm`) once its keepers are folded in.
4. **Report it:** note the migration in your prime output and add a session-log line
   (`… migrated and deleted progress.md`). Deleting a tracked file is a real change — surface it,
   don't do it silently. If a file is large or ambiguous and you're unsure what's durable, fold what's
   clearly worth keeping and ask the user before deleting rather than guessing.

This runs only until the legacy file is gone; once migrated, there's nothing left to find.

### Template

```markdown
# <Project> — Primer State
<!-- Maintained by the /primers skill. AUTO blocks are regenerated each run; edit CARRY blocks freely. -->

## At a glance  <!-- AUTO -->
- **Purpose:** <one sentence>
- **Stack:** <lang + framework + storage>
- **Dev loop:** build `<cmd>` · test `<cmd>` · run `<cmd>`
- **Last primed:** <YYYY-MM-DD> · HEAD `<sha>` on `<branch>`

## Structure  <!-- AUTO -->
<key folders + one-line roles>

## In flight  <!-- AUTO -->
<branch, uncommitted work, what recent commits suggest>

## Drift / distrust  <!-- AUTO -->
<doc-vs-code contradictions, or "none found">

## Roadmap — next steps  <!-- AUTO -->
1. <step> — *why now* — effort/impact
2. ...
<!-- For the exhaustive prioritized worklist, run /audit. -->

## Locked decisions & invariants  <!-- AUTO -->
<from ADRs / CLAUDE.md / memory / *-expert skill — things future work must not break>

## Open threads & decisions  <!-- CARRY: never auto-clobbered; only [ ]→[x] when a commit resolves it -->
- [ ] <parked thread or pending decision>

## Session log  <!-- append-only -->
- <YYYY-MM-DD> `<sha>` — <what this prime found/did>
```

### Memory pointer (auto-loaded next session)

In addition to the in-repo ledger, drop a one-line pointer into Claude Code's project memory so the next
SessionStart surfaces it automatically. The project memory dir is keyed by the working directory:

```bash
SLUG=$(echo "$PWD" | sed 's#/#-#g')                    # e.g. -mnt-datadisk-dev-foo
MEMDIR="$HOME/.claude/projects/$SLUG/memory"
```

If `$MEMDIR` exists (this user's setup maintains one with a `MEMORY.md` index), write/update a single
memory file there — `primer-state.md` — carrying the current one-line status and a pointer to
`.primer/STATE.md`, and ensure `MEMORY.md` has exactly one pointer line for it (update in place, don't
duplicate). Keep it to the format that dir already uses (frontmatter + body + a `MEMORY.md` line). If
`$MEMDIR` doesn't exist, skip this step silently — the in-repo ledger is the source of truth and works
everywhere.

This gives both surfaces the user asked for: the rich, portable, git-tracked `.primer/STATE.md`, and a
lightweight pointer that the harness auto-injects at the start of the next session.
