# Component Inventory — Helm

Component extraction from `docs/mockups/`. Maps each visual element to a React component and its source file.

## Layout

| Component | File | Props / Notes |
|---|---|---|
| `<Layout>` | `src/components/Layout.jsx` | Wraps sidebar + main content area |
| `<Sidebar>` | `src/components/Sidebar.jsx` | Already exists. Nav items, sync button, last-sync timestamp |
| `<Topbar>` | `src/components/Topbar.jsx` | Sticky header; accepts `title`, `children` (right-side actions) |

## Pages

| Component | Route | File |
|---|---|---|
| `<Dashboard>` | `/` | `src/pages/Dashboard.jsx` — Already exists |
| `<ProjectDetail>` | `/projects/:slug` | `src/pages/ProjectDetail.jsx` |
| `<Analytics>` | `/analytics` | `src/pages/Analytics.jsx` |
| `<Settings>` | `/settings` | `src/pages/Settings.jsx` |
| `<NotFound>` | `*` | `src/pages/NotFound.jsx` |
| `<ServerError>` | internal | `src/pages/ServerError.jsx` |

## Shared Components

| Component | File | Props |
|---|---|---|
| `<ProjectCard>` | `src/components/ProjectCard.jsx` | Already exists. `project: Project` |
| `<SearchBar>` | `src/components/SearchBar.jsx` | `value`, `onChange` |
| `<FilterChips>` | `src/components/FilterChips.jsx` | `active`, `onChange(filter)` |
| `<StatCard>` | `src/components/StatCard.jsx` | `label`, `value`, `sub`, `trend?` |
| `<GlassCard>` | `src/components/GlassCard.jsx` | Wrapper: `className?`, `children` |
| `<StatusPill>` | `src/components/StatusPill.jsx` | `status: 'active' | 'paused' | 'archived'` |
| `<TopicChip>` | `src/components/TopicChip.jsx` | `label: string` |
| `<CommitList>` | `src/components/CommitList.jsx` | `commits: Commit[]` — used on project detail |
| `<LanguageBar>` | `src/components/LanguageBar.jsx` | `lang`, `count`, `pct`, `color` — analytics |
| `<Heatmap>` | `src/components/Heatmap.jsx` | `data: number[]` (364 cells, 0-4 levels) |
| `<SyncButton>` | Part of `<Sidebar>` | No separate component needed |
| `<ToggleSwitch>` | `src/components/ToggleSwitch.jsx` | `checked`, `onChange`, `label`, `description?` |
| `<SecretInput>` | `src/components/SecretInput.jsx` | `value`, `onChange` — reveal/hide toggle |
| `<DirList>` | `src/components/DirList.jsx` | `dirs: string[]`, `onAdd`, `onRemove` |

## Charts (via Chart.js)

| Chart | Used on | Type |
|---|---|---|
| Commit activity bar | Project Detail | `bar` |
| Language donut | Analytics | `doughnut` |
| Commit trend line | Analytics | `line` |
| Status bar | Analytics | `bar` |

All charts are inline in their page components. Extract to `src/components/charts/` only if reused.

## Skeleton States

Every data-fetching component renders skeletons while `loading === true`. Use the `.ds-skeleton` utility class from `tokens.css`.

- `<ProjectCard>` — full card skeleton (8th card in dashboard mockup)
- `<StatCard>` — value and sub-line shimmer
- `<CommitList>` — 5-row skeleton

## Data Shape

```js
// Project (matches DB schema in server/schema.sql)
{
  slug:           string,     // unique key
  name:           string,
  full_name:      string | null,
  description:    string | null,
  language:       string | null,
  topics:         string[],
  stars:          number,
  open_issues:    number,
  open_prs:       number,
  is_private:     boolean,
  status:         'active' | 'paused' | 'archived',
  last_commit_at: string | null,  // ISO 8601
  last_commit_msg:string | null,
  last_commit_author: string | null,
  html_url:       string | null,
  local_path:     string | null,
}
```

## Routing

Add `react-router-dom` v6. Routes in `src/App.jsx`:

```jsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/projects/:slug" element={<ProjectDetail />} />
  <Route path="/analytics" element={<Analytics />} />
  <Route path="/settings" element={<Settings />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```
