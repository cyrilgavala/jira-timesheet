import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { buildJiraProxy } from './jiraProxy.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = buildJiraProxy(env)
  if (!proxy) {
    console.warn(
      'Jira proxy disabled: set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in .env.local.local',
    )
  }

  return {
    plugins: [react()],
    // Only the non-secret site URL reaches the client (for "open in Jira" links).
    define: { __JIRA_SITE__: JSON.stringify(env.JIRA_BASE_URL ?? '') },
    server: { proxy: proxy ?? undefined },
    preview: { proxy: proxy ?? undefined },
    test: {
      globalSetup: './vitest.globalSetup.ts',
    },
  }
})
