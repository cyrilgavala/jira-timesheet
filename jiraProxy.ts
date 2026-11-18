import type { ProxyOptions } from 'vite'

export const APP_HEADER = 'x-timesheet'

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
      // Only the app's own fetch calls (which set this header) may use the credentials.
      // A cross-site page cannot add a custom header without a preflight, which this rejects.
      bypass: (req, res) => {
        const path = (req.url ?? '').split('?')[0]
        if (req.headers[APP_HEADER] === '1' && path.startsWith('/jira/rest/api/3/')) return undefined
        if (!res) return false // websocket upgrade: refuse
        res.statusCode = 403
        res.end()
        return ''
      },
      headers: { Authorization: `Basic ${auth}` },
      // Jira answers 403 to writes that carry a browser user-agent (not to other clients).
      configure: (proxy) => {
        proxy.on('proxyReq', (proxyReq) => {
          proxyReq.removeHeader('origin')
          proxyReq.removeHeader('referer')
          proxyReq.setHeader('User-Agent', 'jira-timesheet')
        })
      },
    },
  }
}
