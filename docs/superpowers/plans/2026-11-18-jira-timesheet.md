# Jira Timesheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local React app that shows my Jira Cloud worklogs for a month as a ticket × day grid and lets me create, edit and delete them, every write confirmed first.

**Architecture:** Vite React SPA. Vite's dev/preview server proxies `/jira/*` to the Jira site and injects Basic auth from `.env.local`, so the token never reaches the browser. Pure logic (hours parsing, ADF, grouping, cell decisions) lives in `src/lib` with unit tests; Jira calls in `src/api/jira.ts`; TanStack Query hooks in `src/data`; UI components in `src/components`.

**Tech Stack:** Vite, React 18+, TypeScript, TanStack Query v5, date-fns v4, `@radix-ui/react-popover`, `@radix-ui/react-alert-dialog`, Vitest, `@testing-library/react` + jsdom (component tests only), plain CSS.

**Spec:** `docs/superpowers/specs/2026-11-18-jira-timesheet-design.md`

## Global Constraints

- Plain CSS only (one global `src/styles.css` with CSS custom properties). No Tailwind, no CSS-in-JS.
- All visual design (palette, type, spacing, states, focus rings) done by invoking the **ui-ux-pro-max** skill.
- Env vars `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` — never `VITE_`-prefixed; never imported in `src/`. Sole exception: the non-secret site URL is injected as `__JIRA_SITE__` (Task 6) for "open in Jira" links.
- Classic API token, Basic auth against `JIRA_BASE_URL`. Proxy strips `Origin` and `Referer`.
- Jira REST **v3** for every call.
- Only worklogs with `author.accountId === me` are shown or touched.
- Every create/update/delete goes through the confirmation dialog. No write without Confirm.
- New worklogs: `started` = that day 09:00 local, format `yyyy-MM-dd'T'HH:mm:ss.SSSxx` (e.g. `2026-11-12T09:00:00.000+0100`).
- Update never sends `comment` unless the user edited a plain comment.
- Hours: decimals with `.` or `,`; rounded to whole minutes; minimum 60 s; display up to 2 decimals, no trailing zeros.
- Grid grouping by **local** calendar date of `started`.
- Tests run with `TZ=Europe/Bratislava` (set in Vitest global setup).

## Review Focus

1. A worklog started at 23:30 local on the last day of the month (or 00:30 on the first) — lands in the correct local day and month; covered in Task 4.
2. User types `2h`, `1:30`, `-1`, `abc` — cell marked invalid, no dialog, nothing sent; covered in Task 2 + Task 7.
3. Enter followed by blur (focus leaves after commit) — exactly one confirmation dialog / one write; covered in Task 7.
4. Cancel in the confirmation dialog — cell shows the server value again, no request; covered in Task 7.
5. An issue with more than one page of worklogs (others' logs fill page 1) — my worklogs on page 2 still appear; covered in Task 5.

---

### Task 1: Scaffold, proxy config, test setup

**Files:**
- Create: `package.json`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/App.tsx` (placeholder), `src/styles.css` (empty), `vite.config.ts`, `jiraProxy.ts`, `jiraProxy.test.ts`, `vitest.globalSetup.ts`, `.env.example`, `README.md`

**Interfaces:**
- Produces: `buildJiraProxy(env: Record<string,string>): Record<string, ProxyOptions> | null` (from `vite`'s `ProxyOptions`), used by `vite.config.ts` for both `server.proxy` and `preview.proxy`. Returns `null` (and Vite config logs a warning) when any of the three vars is missing.
- Produces: npm scripts `dev`, `build` (`tsc -b && vite build`), `preview`, `test` (`vitest run`).

- [ ] **Step 1:** Scaffold with `npm create vite@latest . -- --template react-ts` (keep existing `.gitignore`, `docs/`), then `npm i @tanstack/react-query date-fns @radix-ui/react-popover @radix-ui/react-alert-dialog` and `npm i -D vitest jsdom @testing-library/react @testing-library/user-event`. Delete template demo assets/CSS.
- [ ] **Step 2:** Vitest config in `vite.config.ts` (`test.globalSetup: './vitest.globalSetup.ts'`, default env `node`); `vitest.globalSetup.ts` sets `process.env.TZ = 'Europe/Bratislava'`.
- [ ] **Step 3: Write failing tests** in `jiraProxy.test.ts`:
  - `returns null when JIRA_API_TOKEN missing` → `expect(buildJiraProxy({JIRA_BASE_URL:'https://x.atlassian.net', JIRA_EMAIL:'a@b.c'})).toBeNull()`
  - `targets base url and rewrites /jira prefix` → `p['/jira'].target === 'https://x.atlassian.net'`, `p['/jira'].changeOrigin === true`, `p['/jira'].rewrite('/jira/rest/api/3/myself') === '/rest/api/3/myself'`
  - `sets basic auth header` → `p['/jira'].headers.Authorization === 'Basic ' + Buffer.from('a@b.c:tok').toString('base64')`
  - `strips Origin and Referer` → call `p['/jira'].configure(fakeProxy)` with a fake emitter; emit `proxyReq` with a fake `{removeHeader: vi.fn()}`; assert called with `'origin'` and `'referer'`.
- [ ] **Step 4:** Run `npx vitest run jiraProxy` → FAIL (module missing).
- [ ] **Step 5:** Implement `buildJiraProxy` in `jiraProxy.ts`; wire into `vite.config.ts` via `loadEnv(mode, process.cwd(), '')`.
- [ ] **Step 6:** Run `npx vitest run` → PASS; `npm run build` → succeeds.
- [ ] **Step 7:** `.env.example` with the three vars (placeholders from spec). `README.md`: create classic token at id.atlassian.com → Security → API tokens → "Create API token", copy `.env.example` to `.env.local`, `npm i`, `npm run dev`.
- [ ] **Step 8: Commit** `git add -A && git commit -m "chore: scaffold vite app with jira proxy"` (verify `.env.local` not staged).

### Task 2: Hours parsing and formatting

**Files:** Create `src/lib/hours.ts`, `src/lib/hours.test.ts`

**Interfaces:**
- Produces: `parseHours(input: string): { kind: 'empty' } | { kind: 'invalid' } | { kind: 'ok'; seconds: number }` and `formatHours(seconds: number): string`.

- [ ] **Step 1: Write failing tests:**
  - `parseHours('1.5')` and `parseHours('1,5')` → `{kind:'ok', seconds:5400}`
  - `parseHours(' 2 ')` → `{kind:'ok', seconds:7200}`
  - `parseHours('0.333')` → `{kind:'ok', seconds:1200}` (rounded to 20 min)
  - `parseHours('0.001')` → `{kind:'invalid'}` (rounds below 1 min)
  - `parseHours('')`, `parseHours('  ')`, `parseHours('0')` → `{kind:'empty'}` (empty/zero = "no time" → delete path)
  - `parseHours('2h')`, `parseHours('1:30')`, `parseHours('-1')`, `parseHours('abc')`, `parseHours('1.2.3')` → `{kind:'invalid'}`
  - `formatHours(5400) === '1.5'`, `formatHours(900) === '0.25'`, `formatHours(7200) === '2'`, `formatHours(1200) === '0.33'`, `formatHours(0) === ''`
- [ ] **Step 2:** `npx vitest run hours` → FAIL.
- [ ] **Step 3:** Implement. Accept `/^\d+([.,]\d+)?$/` after trim; seconds = `Math.round(h*60)*60`.
- [ ] **Step 4:** `npx vitest run hours` → PASS.
- [ ] **Step 5: Commit** `feat: hours parsing`.

### Task 3: ADF comments

**Files:** Create `src/lib/adf.ts`, `src/lib/adf.test.ts`

**Interfaces:**
- Produces: `type AdfDoc = { type: 'doc'; version: 1; content: AdfNode[] }` (`AdfNode` loose: `{type: string; text?: string; marks?: unknown[]; content?: AdfNode[]; attrs?: unknown}`), `isPlainAdf(doc: AdfDoc | undefined): boolean`, `adfToText(doc: AdfDoc | undefined): string`, `textToAdf(text: string): AdfDoc | undefined`.

- [ ] **Step 1: Write failing tests:**
  - `isPlainAdf(undefined) === true`; paragraph with unmarked text → `true`; paragraph with `hardBreak` → `true`
  - text with `marks:[{type:'strong'}]` → `false`; `mention` node → `false`; `bulletList` → `false`; `inlineCard` → `false`; text with `marks: []` → `true`
  - `adfToText` of two paragraphs `['a','b']` → `'a\n\nb'`; hardBreak → `'\n'`; mention `{attrs:{text:'@Jo'}}` → includes `'@Jo'` (read-only display)
  - `textToAdf('')` and `textToAdf('  ')` → `undefined`
  - `textToAdf('a\nb\n\nc')` → paragraphs `[[text a, hardBreak, text b], [text c]]`
  - round trip: `adfToText(textToAdf(s)) === s` for `'a\nb\n\nc'`
- [ ] **Step 2:** `npx vitest run adf` → FAIL.
- [ ] **Step 3:** Implement. Plain = every top-level node is `paragraph` and every child is `hardBreak` or `text` with no/empty `marks`. `adfToText` is a recursive flatten (text, `attrs.text` for mention/emoji, `attrs.url` for cards) joining blocks with `\n\n`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: adf comment helpers`.

### Task 4: Month math and worklog grouping

**Files:** Create `src/lib/types.ts`, `src/lib/grid.ts`, `src/lib/grid.test.ts`

**Interfaces:**
- Produces in `types.ts`: `interface Worklog { id: string; issueKey: string; started: string; timeSpentSeconds: number; comment?: AdfDoc; authorAccountId: string }`, `interface Issue { key: string; summary: string }`.
- Produces in `grid.ts`:
  - `monthDays(month: Date): Date[]` (each local day of the month containing `month`)
  - `dayKey(d: Date): string` → `'yyyy-MM-dd'` local
  - `monthBounds(month: Date): { start: Date; end: Date; firstDay: string; lastDay: string }` (`start` = local 00:00 of day 1, `end` = local 00:00 of next month's day 1; `firstDay`/`lastDay` as `yyyy-MM-dd` for JQL)
  - `type Cells = Map<string /*issueKey*/, Map<string /*dayKey*/, Worklog[]>>`
  - `groupWorklogs(worklogs: Worklog[], month: Date): Cells` — drops worklogs outside the month by local date
  - `rowTotal(cells: Cells, key: string): number`, `dayTotal(cells: Cells, day: string): number`, `monthTotal(cells: Cells): number` (seconds)

- [ ] **Step 1: Write failing tests** (TZ Europe/Bratislava):
  - `monthDays(new Date(2026,1,10)).length === 28`; November 2026 → 30, first `dayKey` `'2026-11-01'`
  - `groupWorklogs`: `started: '2026-11-30T23:30:00.000+0100'` → key `'2026-11-30'`; `'2026-11-30T22:30:00.000+0000'` (= 23:30 local) → `'2026-11-30'`; `'2026-11-30T23:30:00.000+0000'` (= 00:30 Dec 1 local) → dropped from November
  - two worklogs same issue same day → one cell with 2 entries
  - DST: `'2026-10-25T01:30:00.000+0000'` in October grid → `'2026-10-25'`
  - totals: rows/day/month sums of `timeSpentSeconds` match fixture
- [ ] **Step 2:** FAIL. **Step 3:** Implement with date-fns (`parseISO`, `format`, `eachDayOfInterval`, `startOfMonth`, `addMonths`). **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: month grid grouping`.

### Task 5: Jira API client

**Files:** Create `src/api/jira.ts`, `src/api/jira.test.ts`

**Interfaces:**
- Consumes: `Worklog`, `Issue` (Task 4), `AdfDoc` (Task 3).
- Produces:
  - `class JiraError extends Error { status: number }` — message from Jira `errorMessages`/`errors` when present
  - `getMyself(): Promise<{ accountId: string }>`
  - `searchMonthIssues(firstDay: string, lastDay: string): Promise<Issue[]>` — `POST /jira/rest/api/3/search/jql`, body `{ jql, fields: ['summary'], maxResults: 100, nextPageToken? }`, loops while `nextPageToken`
  - `getMyWorklogs(issueKey: string, start: Date, end: Date, accountId: string): Promise<Worklog[]>` — `GET /jira/rest/api/3/issue/{key}/worklog?startedAfter=<ms>&startedBefore=<ms>&startAt=&maxResults=5000`, loops on `startAt + worklogs.length < total`, filters by author
  - `createWorklog(issueKey: string, day: string, seconds: number, comment?: AdfDoc): Promise<void>` — `started` = `day` 09:00 local, format per Global Constraints
  - `updateWorklog(issueKey: string, id: string, seconds: number, comment?: AdfDoc): Promise<void>` — omit `comment` key when `undefined`
  - `deleteWorklog(issueKey: string, id: string): Promise<void>`
  - `pickIssues(query: string): Promise<Issue[]>` — `GET /jira/rest/api/3/issue/picker?query=`, flatten `sections[].issues[]` into `{key, summary: summaryText}`, dedupe by key
  - All requests: `Accept: application/json`, JSON bodies with `Content-Type: application/json`; non-2xx → `JiraError`.

- [ ] **Step 1: Write failing tests** with `vi.stubGlobal('fetch', ...)`:
  - search JQL string equals `worklogAuthor = currentUser() AND worklogDate >= "2026-11-01" AND worklogDate <= "2026-11-30"`; two pages via `nextPageToken` → both pages' issues returned
  - worklogs: page 1 (`total: 3`, 2 others' worklogs), page 2 (1 mine) → returns 1 worklog with `issueKey` set; second request has `startAt=2`
  - `createWorklog('P-1','2026-11-12',7200)` body `{started:'2026-11-12T09:00:00.000+0100', timeSpentSeconds:7200}` (no `comment` key)
  - `updateWorklog('P-1','10',3600)` → method PUT, body has no `comment` key; with comment → body includes it
  - 401 response with `{errorMessages:['nope']}` → rejects `JiraError` with `status 401`, message `'nope'`
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: jira api client`.

### Task 6: Data hooks and read-only grid with styling

**Files:**
- Create: `src/data/queries.ts`, `src/components/MonthHeader.tsx`, `src/components/Grid.tsx`, `src/components/StatusScreen.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: Tasks 4 and 5.
- Produces in `queries.ts`:
  - `useMe()` — query key `['me']`
  - `useMonth(month: Date)` → `{ issues: Issue[]; cells: Cells; isLoading; error }`; issues query `['issues', firstDay]`, worklogs per issue `['worklogs', issueKey, firstDay]` via `useQueries`, fetched with max 5 in flight
  - `useWorklogMutations(month: Date)` → `{ create, update, remove }` (`useMutation` each, args mirror Task 5 functions; `onSuccess` invalidates `['worklogs', issueKey, firstDay]`)
- Produces global `__JIRA_SITE__: string` — `vite.config.ts` adds `define: { __JIRA_SITE__: JSON.stringify(env.JIRA_BASE_URL ?? '') }`, declared in `src/vite-env.d.ts`. Only the site URL; email/token stay server-side.
- Produces `Grid` props: `{ month: Date; issues: Issue[]; cells: Cells; renderCell: (issue: Issue, day: string, worklogs: Worklog[]) => ReactNode; footer?: ReactNode }`. Task 6 passes a read-only renderer; Task 7 replaces it.

- [ ] **Step 1:** Invoke **ui-ux-pro-max** for a dense data-grid timesheet (light theme, optional dark via `prefers-color-scheme`): tokens as CSS custom properties in `styles.css` — grid lines, weekend/today shading, cell states (saving / error / invalid / multi-worklog marker), focus ring, dialog/popover surfaces. Meet WCAG AA contrast.
- [ ] **Step 2:** Implement hooks + `App`: `QueryClientProvider`; month state starting at current month; `useMe` error (any) → `StatusScreen` "Can't reach Jira — check `.env.local` (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN) and restart `npm run dev`."; loading state; empty month → "No worklogs in <Month yyyy>." plus the grid footer (so Add ticket still works later).
- [ ] **Step 3:** `MonthHeader`: `◀`/`▶` buttons (`aria-label` "Previous month"/"Next month"), title `MMMM yyyy`, month total via `formatHours`.
- [ ] **Step 4:** `Grid`: semantic `<table>`, sticky header row and first column; ticket cell = key as link to `${__JIRA_SITE__}/browse/${key}` (opens in new tab). Rows sorted by key (natural: project then number). Weekend and today column classes. Row Σ column and day Σ footer row.
- [ ] **Step 5: Verify:** `npm run build` passes; `npm run dev` with a real `.env.local` shows the current month's worklogs matching Jira; prev/next loads other months; totals add up.
- [ ] **Step 6: Commit** `feat: read-only month grid`.

### Task 7: Inline cell editing with confirmation

**Files:**
- Create: `src/lib/cellAction.ts`, `src/lib/cellAction.test.ts`, `src/components/ConfirmDialog.tsx`, `src/components/Cell.tsx`, `src/components/Cell.test.tsx`
- Modify: `src/App.tsx` (renderCell → `Cell`)

**Interfaces:**
- Consumes: `parseHours`/`formatHours` (Task 2), `Worklog` (Task 4), `useWorklogMutations` (Task 6).
- Produces:
  - `type CellAction = { kind: 'noop' } | { kind: 'invalid' } | { kind: 'create'; seconds: number } | { kind: 'update'; worklog: Worklog; seconds: number } | { kind: 'delete'; worklog: Worklog }`
  - `decideCellCommit(worklogs: Worklog[], input: string): CellAction` — only for 0/1 worklogs (throws if >1)
  - `describeAction(a: Exclude<CellAction, {kind:'noop'|'invalid'}>, issueKey: string, day: string): string` — exact copy: `Log 2h on PROJ-123 for Thu 12 Nov?`, `Change 1.5h → 2h on PROJ-123, 12 Nov?`, `Delete 1h worklog ('standup') on PROJ-123, 12 Nov?` (comment part only when comment text non-empty; use `adfToText`, truncate to 40 chars with `…`)
  - `ConfirmDialog` props `{ open: boolean; message: string; onConfirm(): void; onCancel(): void; busy?: boolean }` (Radix AlertDialog; Confirm is the default/focused action so Enter confirms; Escape cancels)
  - `Cell` props `{ issue: Issue; day: string; worklogs: Worklog[]; onOpenDetails(): void }` — `onOpenDetails` is wired by Task 8 (no-op until then)

- [ ] **Step 1: Write failing tests** `cellAction.test.ts`:
  - `[]` + `''` → noop; `[]` + `'2'` → create 7200; `[w(3600)]` + `'1'` → noop; `[w(3600)]` + `'1,0'` → noop; `[w(3600)]` + `'2'` → update 7200; `[w(3600)]` + `''` / `'0'` → delete; `'2h'` → invalid; 2 worklogs → throws
  - `describeAction` returns the three exact strings above for `day '2026-11-12'`
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5: Write failing component tests** `Cell.test.tsx` (`// @vitest-environment jsdom`, mutations mocked via a test `QueryClientProvider` and `vi.mock('../api/jira')`):
  - type `2` in empty cell, press Enter → dialog shows `Log 2h on P-1 for Thu 12 Nov?`; then blur the input → still exactly one dialog, `createWorklog` not yet called
  - click Confirm → `createWorklog` called once with `('P-1','2026-11-12',7200, undefined)`
  - type `3` over a 1h cell, Enter, click Cancel → input shows `1`, no API call
  - type `2h`, Enter → cell has `aria-invalid="true"`, no dialog, no API call
  - `updateWorklog` rejects `JiraError('Worklog is locked', 400)` → input shows server value `1`, error text `Worklog is locked` visible (role `alert` or `title`)
  - cell with 2 worklogs renders a button (not an input) with total and multi marker; click calls `onOpenDetails`
- [ ] **Step 6:** FAIL. **Step 7:** Implement `Cell` + `ConfirmDialog`. 0/1 worklogs → `<input inputMode="decimal" aria-label="P-1 12 Nov hours">`; commit on Enter/Tab/blur guarded by a "pending action" ref so it fires once; Escape reverts; focus returns to the cell after the dialog closes; per-cell `saving`/`error` state. Also render the `⋯` button (visible on hover/focus-within) and `Alt+Enter` → `onOpenDetails`.
- [ ] **Step 8:** `npx vitest run` → all PASS. Manual: in dev, create/edit/delete a single worklog on a test ticket; check it in Jira.
- [ ] **Step 9: Commit** `feat: inline cell editing with confirmation`.

### Task 8: Worklog details popover

**Files:** Create `src/components/CellPopover.tsx`, `src/components/CellPopover.test.tsx`; Modify `src/components/Cell.tsx` (wrap in Radix `Popover.Root`, `onOpenDetails` opens it)

**Interfaces:**
- Consumes: `isPlainAdf`/`adfToText`/`textToAdf` (Task 3), `ConfirmDialog` (Task 7), `useWorklogMutations` (Task 6), `parseHours`/`formatHours` (Task 2).
- Produces: `CellPopover` props `{ issue: Issue; day: string; worklogs: Worklog[] }`.

- [ ] **Step 1: Write failing tests** (jsdom):
  - lists each worklog with hours and comment text
  - plain comment: Edit → textarea editable; change hours to `2` and comment to `x`, Save → confirm dialog `Change 1h → 2h on P-1, 12 Nov?` → Confirm → `updateWorklog('P-1', id, 7200, textToAdf('x'))`
  - edit hours only on a plain comment → `updateWorklog` called with `comment === undefined`
  - non-plain comment (has `strong` mark): comment shown read-only + link "Edit in Jira" to `${__JIRA_SITE__}/browse/P-1?focusedWorklogId=<id>`; Save sends `comment === undefined`
  - delete → dialog `Delete 1h worklog ('standup') on P-1, 12 Nov?` → Confirm → `deleteWorklog('P-1', id)`
  - "+ add worklog" with `1,5` and comment `y` → dialog `Log 1.5h on P-1 for Thu 12 Nov?` → `createWorklog('P-1','2026-11-12',5400, textToAdf('y'))`
- [ ] **Step 2:** FAIL. **Step 3:** Implement (reuse `describeAction` with the matching `CellAction`). **Step 4:** PASS; manual check against Jira with a 2-worklog day.
- [ ] **Step 5: Commit** `feat: worklog details popover`.

### Task 9: Add ticket row

**Files:** Create `src/components/AddTicket.tsx`; Modify `src/App.tsx` (extra in-memory issues for the displayed month, merged into rows, reset on month change)

**Interfaces:**
- Consumes: `pickIssues` (Task 5), `Grid.footer` (Task 6).
- Produces: `AddTicket` props `{ existingKeys: string[]; onAdd(issue: Issue): void }`.

- [ ] **Step 1:** Implement: text input with ~250 ms debounced `pickIssues` (min 2 chars), results list as an accessible listbox (arrow keys + Enter, `aria-activedescendant`); already-present keys shown disabled. Comment in `App.tsx`: `// shortcut: added tickets are in-memory only, persist to localStorage if that annoys`.
- [ ] **Step 2: Verify:** dev app — search a ticket by key and by text, add it, log time via its empty cell (confirm dialog), reload → row stays because it now has a worklog.
- [ ] **Step 3:** `npx vitest run` and `npm run build` → PASS.
- [ ] **Step 4: Commit** `feat: add ticket row`.
