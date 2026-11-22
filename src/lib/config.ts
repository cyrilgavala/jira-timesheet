// The Jira site URL for "open in Jira" links is served at runtime by the Pages
// function (/jira/config) so the build stays environment-agnostic. Falls back to
// the build-time __JIRA_SITE__ (used for local dev, which still uses the Vite proxy).
let cached: string | undefined

export async function getConfig(): Promise<{ baseUrl: string }> {
  const res = await fetch('/jira/config')
  if (!res.ok) throw new Error(`Failed to load config: ${res.status}`)
  return await res.json()
}

export async function getJiraSite(): Promise<string> {
  if (cached) return cached
  cached = ''
  let baseUrl = ''
  try {
    const { baseUrl: configured } = await getConfig()
    baseUrl = configured
  } catch {
    // dev proxy doesn't serve /jira/config; fall back to the build-time value.
  }
  cached = baseUrl || (typeof __JIRA_SITE__ !== 'undefined' ? __JIRA_SITE__ : '')
  return cached
}
