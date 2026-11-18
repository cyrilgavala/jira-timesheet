import type { ProxyOptions } from 'vite'

// Forwards /jira/* to the Jira site with Basic auth added server-side, so the
// token never reaches the browser. Returns null when config is incomplete.
export function buildJiraProxy(
  env: Record<string, string>,
): Record<string, ProxyOptions> | null {
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN } = env
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) return null

  const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')
  return {
    '/jira': {
      target: JIRA_BASE_URL,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/jira/, ''),
      headers: { Authorization: `Basic ${auth}` },
      // Jira's XSRF check rejects requests carrying a browser origin.
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('origin')
          proxyReq.removeHeader('referer')
        })
      },
    },
  }
}
