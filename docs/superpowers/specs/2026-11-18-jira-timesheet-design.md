# Jira Timesheet — Design

## Intent

Jira Cloud has no built-in "my month at a glance" worklog view; getting one means a Marketplace app or a custom Forge build. This is a small personal app that shows and edits **my own** worklogs as a monthly grid. Single user, runs locally.

## Goals

- Monthly grid: **rows** = tickets I logged time on that month, **columns** = days of the month, **cells** = my hours on that ticket that day.
- Cells are editable and save straight to Jira.
- Navigate between months.
- Totals per row, per day, and for the month.

## Non-goals (v1)

- Other people's worklogs, team views, approvals.
- Exports, reports, charts.
- Deployment / multi-user / hosted mode.
- Arrow-key grid navigation (Tab/Shift+Tab is enough for v1).
- Editing a worklog's start time (kept as-is on edit).

## Anti-goals (failure even if it "works")

- Jira token reaches the browser bundle, the browser, or git.
- Silently losing worklog data or comments (e.g. merging several worklogs into one, deleting a commented worklog without asking).
- Touching worklogs authored by anyone else.

## Constraints

- **Jira Cloud**, auth = Atlassian account email + API token (HTTP Basic).
- Jira Cloud blocks browser calls from other origins (CORS), so calls must go through a local proxy.
- Jira Cloud rejects some write requests from browser-like origins with "XSRF check failed": the proxy must strip `Origin`/`Referer` (or set `X-Atlassian-Token: no-check`).
- Stack: **React + TypeScript**, **plain CSS** (no Tailwind).

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Vite React app; Vite's dev/preview server proxies `/jira/*` to the Jira site and injects the auth header from `.env.local`. | No backend to write; one project, one command. Local only — fine for personal use. |
| B | React app + small Node (Express/Hono) proxy server. | Deployable later, but a second program for no current benefit. |
| C | Forge Custom UI app inside Jira. | No token, lives in Jira, but Forge CLI, developer console app, sandboxed UI and redeploy per change — the overhead the user wants to avoid. |

User picked **A**, with plain CSS instead of Tailwind.

## Decided design

### Run & config

- `npm run dev` (also `npm run build && npm run preview`, same proxy config) → open localhost.
- `.env.local` (gitignored), with `.env.example` committed:
  ```
  JIRA_BASE_URL=https://<site>.atlassian.net
  JIRA_EMAIL=me@example.com
  JIRA_API_TOKEN=...
  ```
- Vars are **not** `VITE_`-prefixed, so Vite never exposes them to client code. `vite.config.ts` reads them with `loadEnv` and configures `server.proxy` and `preview.proxy`: `/jira` → `JIRA_BASE_URL`, `changeOrigin: true`, path rewrite stripping `/jira`, adds `Authorization: Basic base64(email:token)`, strips `Origin`/`Referer`.
- If config is missing or Jira returns 401, the app shows a clear "check `.env.local`" message instead of the grid.

### Auth

- **Classic** Atlassian API token (id.atlassian.com → Security → API tokens → "Create API token"), Basic auth against the site URL. Scoped tokens are not supported (they need the `api.atlassian.com` gateway). README gets the token-creation steps.

### Jira API (REST v3 — comments are ADF)

v3 is used because v2 flattens rich comments to plain text, which would make it impossible to tell whether a comment is safe to edit.

- Me: `GET /rest/api/3/myself` → `accountId`, used to filter worklogs.
- Tickets for month: `POST /rest/api/3/search/jql` with
  `worklogAuthor = currentUser() AND worklogDate >= "YYYY-MM-01" AND worklogDate <= "YYYY-MM-<last>"`, fields `summary`, paginate via `nextPageToken`. (Old `/search` endpoint is deprecated.)
- Worklogs per ticket: `GET /rest/api/3/issue/{key}/worklog?startedAfter=<ms>&startedBefore=<ms>`, paginate, keep only `author.accountId === me`. Fetch tickets with small concurrency (~5). (Builder may widen the range by a day each side and filter by local date.)
- Create: `POST /rest/api/3/issue/{key}/worklog` `{ started, timeSpentSeconds, comment? }`.
- Update: `PUT /rest/api/3/issue/{key}/worklog/{id}` `{ timeSpentSeconds, comment? }` — `comment` sent **only** when the user edited a plain comment.
- Delete: `DELETE /rest/api/3/issue/{key}/worklog/{id}`.
- Remaining estimate: Jira default (`adjustEstimate=auto`), same as Jira's own UI.
- Ticket search for "Add ticket": `GET /rest/api/3/issue/picker?query=...` (also accepts a typed key directly).

### Comments (plain-text only editing)

- A comment is **plain** if its ADF doc contains only `paragraph` nodes whose children are unmarked `text` nodes or `hardBreak`. Plain comments → converted to a string, editable in the popover.
- Anything else (marks, links, mentions, lists, emoji, …) → shown read-only as flattened text with an "edit in Jira" link. Never written back.
- Writing: text → ADF doc, one `paragraph` per line block, `hardBreak` for single newlines. Empty text → no comment.
- New worklogs (popover "+ add worklog") may include a comment.

### Grid

```
          November 2026          ◀ ▶            Total 142.5h
Ticket                 │ 1 │ 2 │ 3 │ … │ 30 │ Σ
PROJ-123 Login bug     │   │ 2 │ 3•│   │    │ 5
PROJ-140 Code review   │   │ 1 │   │   │  1 │ 2
+ Add ticket…          │
Σ per day              │ 0 │ 3 │ 3 │   │  1 │
                          (• = several worklogs, click to see them)
```

- Header: month name, prev/next buttons, month total. Opens on current month.
- Rows sorted by issue key; ticket cell shows key (link to Jira issue) + truncated summary. Sticky first column and header row.
- Weekends and today visually distinguished.
- Worklogs grouped into cells by the **local calendar date** of `started`.
- Hours shown as decimals, up to 2 places, no trailing zeros (`1.5`, `0.25`).
- "Add ticket" row: search/key input; the added ticket appears as an empty row for the current month. Added rows are in-memory only — if no time is logged, they disappear on reload/month change. (shortcut: not persisted; add localStorage if this annoys.)

### Editing a cell (approach C: direct when simple, popover when several)

- **0 or 1 worklog** → cell is an inline input.
  - Commit on blur / Enter / Tab; Escape reverts.
  - Empty cell + value > 0 → **create** worklog, `started` = that day 09:00 local, no comment.
  - One worklog + new value > 0 → **update** `timeSpentSeconds`, comment untouched.
  - One worklog + cleared or 0 → **delete**.
  - Unchanged value → no request.
- **2+ worklogs** → cell shows total with a marker; click/Enter opens the popover (not inline-editable).
- **Every cell** (any count) shows a small `⋯` button on hover/focus, and `Alt+Enter` on a focused cell, to open the popover. This is how a 0/1-worklog cell gets a comment or a second worklog.
- **Popover**: lists each worklog (hours, comment) with edit, delete, and "+ add worklog" (hours + optional comment, started = that day 09:00 local). Comment editing follows the plain-text rule above.
- **Every write asks first.** Each create, update, or delete (inline or from the popover) opens a confirmation dialog describing it, e.g. "Log 2h on PROJ-123 for Thu 12 Nov?" / "Change 1.5h → 2h on PROJ-123, 12 Nov?" / "Delete 1h worklog ('standup') on PROJ-123, 12 Nov?". Confirm sends it, Cancel/Escape reverts the cell. Enter confirms; focus returns to the cell afterwards. (Radix `@radix-ui/react-alert-dialog`.)
- Input parsing: decimal hours, `.` or `,` as separator (`1.5`, `1,5`). Converted to whole minutes; minimum 1 minute (Jira requires ≥ 60 s). Invalid input → cell marked invalid, nothing sent.
- Save feedback: per-cell saving / saved / error state; on error the cell reverts to the server value and shows the error message.
- After any successful write, refetch that ticket's worklogs (totals follow).

### Libraries

- **Vite** + React + TypeScript.
- **TanStack Query** — fetching, mutations, invalidation.
- **date-fns** — month/day math.
- **Radix UI primitives** (unstyled, e.g. `@radix-ui/react-popover`) for the accessible popover; styled with plain CSS.
- **Vitest** for tests.
- Plain CSS: one global stylesheet with CSS custom properties for tokens. Visual design (palette, typography, spacing, states) done with the **ui-ux-pro-max** skill.

### Tests (Vitest, logic only)

- Hours input parsing (`.`/`,`, invalid, rounding, minimum).
- Grouping worklogs into `ticket × local day` cells, including timezone-offset `started` values near midnight.
- ADF plain-text detection and text ⇄ ADF conversion.
- Cell commit decision: given cell worklogs + new value → `create | update | delete | noop | invalid` (each non-noop goes through the confirmation dialog).

## Left to the builder

- File/module layout, component breakdown, query keys.
- Exact styling and visual tokens (via ui-ux-pro-max).
- Loading skeleton/spinner style; empty-month message wording.
- Concurrency limit details for worklog fetching.
