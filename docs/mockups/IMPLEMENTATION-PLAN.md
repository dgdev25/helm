# Deathstar UI — Mockup Implementation Plan

Convert `docs/mockups/` into the live React app. Backend API is complete (Tasks 1-7 done). This plan covers only the frontend.

**Goal:** Wire the existing mockup design system into the running React + Vite app at `http://localhost:47621`.

**Architecture:** Single-page app. React Router for navigation. Zustand store for global state (already built). Chart.js for analytics.

**Tech Stack:** React 18, Vite, Tailwind CSS v4, Zustand, react-router-dom v6, chart.js

## Global Constraints

- No TypeScript — plain JS/JSX throughout
- Use CSS custom properties from `docs/mockups/tokens.css` (import in `src/index.css`)
- Tailwind classes for layout/spacing; CSS vars for brand tokens
- All charts via Chart.js (already a CDN dep in mockups; install as npm pkg)
- Dark mode default; `data-theme` toggle stored in localStorage
- `src/utils/time.js` already exists — use `formatDistanceToNow` in all date displays
- Existing files to keep unchanged: `src/store.js`, `src/utils/time.js`
- All API calls use `{ data, error }` envelope — unwrap before storing

---

## Task 1: Install Design Tokens + Router

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.jsx`
- Create: `src/components/Layout.jsx`
- Create: `src/components/Topbar.jsx`

- [ ] Copy token variables from `docs/mockups/tokens.css` into `src/index.css` under `:root`
- [ ] Add light mode overrides under `[data-theme="light"]`
- [ ] Install react-router-dom: `npm install react-router-dom chart.js`
- [ ] Run dev server, confirm no style regressions
- [ ] Wrap `src/App.jsx` in `<BrowserRouter>`, add `<Routes>` with placeholder routes for `/`, `/projects/:slug`, `/analytics`, `/settings`
- [ ] Create `src/components/Layout.jsx` — renders `<Sidebar>` + main content area `<div class="main">` matching mockup structure
- [ ] Create `src/components/Topbar.jsx` — sticky header, accepts `title` prop and `children` for right-side actions
- [ ] Run dev server, navigate to `/` — layout renders without errors

```jsx
// src/components/Layout.jsx
export default function Layout({ children }) {
  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  )
}
```

- [ ] Commit: `feat: add design tokens, router, Layout, Topbar`

---

## Task 2: Shared Atomic Components

**Files:**
- Create: `src/components/GlassCard.jsx`
- Create: `src/components/StatusPill.jsx`
- Create: `src/components/TopicChip.jsx`
- Create: `src/components/StatCard.jsx`
- Create: `src/components/ToggleSwitch.jsx`

- [ ] `GlassCard` — div with `.ds-glass` class, forwards `className` and `children`
- [ ] `StatusPill` — renders colored pill for `'active' | 'paused' | 'archived'` using CSS vars from tokens
- [ ] `TopicChip` — small teal pill for a topic label string
- [ ] `StatCard` — renders label, large mono value, optional sub-line and trend (see mockup stat cards)
- [ ] `ToggleSwitch` — checkbox-backed toggle; props: `checked`, `onChange`, `label`, `description?`
- [ ] Smoke test: render all in a `/dev` route, check visual match against `docs/mockups/styleguide.html`
- [ ] Commit: `feat: add atomic components — GlassCard, StatusPill, TopicChip, StatCard, ToggleSwitch`

---

## Task 3: Update ProjectCard

**Files:**
- Modify: `src/components/ProjectCard.jsx`

The card exists but lacks some mockup details. Add:

- [ ] `is_private` badge next to the name (the `private-pill` from mockup)
- [ ] Topics row using `<TopicChip>` (up to 5, matching mockup)
- [ ] Stats row: language (blue), stars, open_issues (orange), open_prs (purple)
- [ ] Commit footer: `last_commit_at` via `formatDistanceToNow`, commit message in mono, author
- [ ] GitHub link if `html_url` present; "local only" indicator if not
- [ ] Skeleton loading state (8 shimmering divs) when `loading === true`
- [ ] Dim card when `status === 'archived'` (`opacity: 0.6`)
- [ ] Confirm visual match against `docs/mockups/dashboard.html` card examples
- [ ] Commit: `feat: update ProjectCard to match mockup — private badge, topics, stats, commit footer`

---

## Task 4: Dashboard Page Enhancements

**Files:**
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/components/Sidebar.jsx`

- [ ] Add 4 stat cards above the grid: Total, Active, Open Issues, Languages (compute from `projects` array in store)
- [ ] Add filter chips row: All / Active / Paused / Archived — wire to `store.setFilter('status', ...)`
- [ ] Language dropdown in topbar — collect unique languages from projects, wire to `store.setFilter('language', ...)`
- [ ] Update `<Sidebar>` to show counts next to nav items (derive from store)
- [ ] Confirm 404 route renders `<NotFound>` (create `src/pages/NotFound.jsx` matching `docs/mockups/404.html`)
- [ ] Commit: `feat: add dashboard stat cards, filter chips, language filter`

---

## Task 5: Project Detail Page

**Files:**
- Create: `src/pages/ProjectDetail.jsx`
- Create: `src/components/CommitList.jsx`

- [ ] Route: `/projects/:slug` — fetch project from `GET /api/projects/:slug` (add this endpoint to server if missing, or filter from store)
- [ ] Hero section: icon, name, status pill, private badge, description, meta (language, stars, last commit, local path), topics
- [ ] Two-column layout: left = commit activity bar chart + recent commits list + open issues; right = project info sidebar + status select + links + danger zone
- [ ] Commit activity chart: 12-week bar chart via Chart.js — use dummy data for now (real API endpoint is future work)
- [ ] `<CommitList>` component — renders list of commits with dot indicator, message, meta, hash chip
- [ ] Status PATCH: when user changes the `<select>`, call `PATCH /api/projects/:slug` with `{ status }`, update store
- [ ] "Remove from Dashboard" — call `DELETE /api/projects/:slug`, navigate back to `/`
- [ ] Confirm visual match against `docs/mockups/project-detail.html`
- [ ] Commit: `feat: add ProjectDetail page with commit chart, status override, and danger zone`

---

## Task 6: Analytics Page

**Files:**
- Create: `src/pages/Analytics.jsx`

- [ ] Compute stats from store: total, active count, open issues total, language count
- [ ] 12-month commit heatmap (364 cells): placeholder data — all zeros until real commit-history API exists; render heatmap grid matching mockup
- [ ] Language donut chart via Chart.js — aggregate `language` field from `projects` array
- [ ] Weekly commit trend line: placeholder 12-week dummy data for now
- [ ] Status bar chart: count active/paused/archived from store
- [ ] Recent sync log: fetch from `GET /api/sync-log` if endpoint exists; otherwise show static placeholder
- [ ] Route `/analytics` renders page inside `<Layout>`
- [ ] Confirm visual match against `docs/mockups/analytics.html`
- [ ] Commit: `feat: add Analytics page with charts, heatmap placeholder, sync log`

---

## Task 7: Settings Page

**Files:**
- Create: `src/pages/Settings.jsx`
- Create: `src/components/DirList.jsx`
- Create: `src/components/SecretInput.jsx`

- [ ] Read current config from `GET /api/settings` (add endpoint to server if missing — returns `.env` derived values)
- [ ] `<DirList>` — renders list of scan dirs with remove buttons; add-dir triggers text input
- [ ] `<SecretInput>` — password input with reveal/hide toggle button
- [ ] Each section (Local Dirs, GitHub, Sync Schedule, Display) has its own Save button that calls `PATCH /api/settings` with the section's fields
- [ ] Slider for sync interval (1–24h) with live value display
- [ ] Danger zone actions call respective endpoints (or show a confirm dialog before acting)
- [ ] Route `/settings` renders inside `<Layout>`
- [ ] Confirm visual match against `docs/mockups/settings.html`
- [ ] Commit: `feat: add Settings page with all four sections and danger zone`

---

## Task 8: Error Pages + Theme Toggle

**Files:**
- Create: `src/pages/NotFound.jsx`
- Create: `src/pages/ServerError.jsx`
- Create: `src/components/ThemeToggle.jsx`

- [ ] `<NotFound>` — matches `docs/mockups/404.html` (gradient code, path, home/back buttons)
- [ ] `<ServerError>` — matches `docs/mockups/500.html` (shown on API fetch failures via error boundary)
- [ ] `<ThemeToggle>` button — fixed position top-right; toggles `data-theme` on `<html>`, persists to `localStorage`
- [ ] Mount `<ThemeToggle>` in `src/App.jsx` (outside routes so it's always visible)
- [ ] On app init, read `localStorage.getItem('theme')` and apply to `document.documentElement.dataset.theme`
- [ ] Confirm 404 route, and that theme toggle works in dark→light→dark cycle
- [ ] Commit: `feat: add NotFound, ServerError pages and persistent theme toggle`

---

## Smoke Test

After all tasks:

- [ ] `./start.sh` from project root — both servers start
- [ ] Open `http://localhost:47621` — dashboard loads with real data (90 projects)
- [ ] Navigate to a project card → project detail page loads
- [ ] Navigate to `/analytics` → charts render
- [ ] Navigate to `/settings` → form renders, values load from env
- [ ] Hit unknown URL → 404 page
- [ ] Toggle theme — persists on reload
- [ ] Sync Now button → loading spinner, projects refresh

---

## Out of Scope (Future)

- Real per-project commit history API (requires git log pagination endpoint)
- Real sync log endpoint (`GET /api/sync-log`)
- Real settings PATCH (`PATCH /api/settings`)
- Mobile responsive breakpoints (desktop-first is fine for a personal tool)
