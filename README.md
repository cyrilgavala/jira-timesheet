# Jira Timesheet

A personal, local monthly grid of my Jira Cloud worklogs: tickets × days, with editable hours.

## Setup

1. Create a classic API token: id.atlassian.com → Security → API tokens → **Create API token**. Scoped tokens are not supported.
2. Copy `.env.example` to `.env.local` and fill in:
   - `JIRA_BASE_URL` — your site, e.g. `https://your-site.atlassian.net`
   - `JIRA_EMAIL` — your Atlassian account email
   - `JIRA_API_TOKEN` — the token from step 1
3. Install and run:

   ```sh
   npm install
   npm run dev
   ```

   Then open the printed localhost URL.

`.env.local` is git-ignored. The token is read only by the Vite dev/preview server and is never sent to the browser.

## Scripts

- `npm run dev` — dev server with the Jira proxy
- `npm run build` / `npm run preview` — production build, served with the same proxy
- `npm test` — unit tests (Vitest)
