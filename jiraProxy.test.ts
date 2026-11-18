import { describe, expect, it, vi } from 'vitest'
import { buildJiraProxy } from './jiraProxy'

const env = {
  JIRA_BASE_URL: 'https://x.atlassian.net',
  JIRA_EMAIL: 'a@b.c',
  JIRA_API_TOKEN: 'tok',
}

describe('buildJiraProxy', () => {
  it('returns null when JIRA_API_TOKEN is missing', () => {
    expect(
      buildJiraProxy({ JIRA_BASE_URL: env.JIRA_BASE_URL, JIRA_EMAIL: env.JIRA_EMAIL }),
    ).toBeNull()
  })

  it('targets the base url and rewrites the /jira prefix', () => {
    const p = buildJiraProxy(env)!
    expect(p['/jira'].target).toBe('https://x.atlassian.net')
    expect(p['/jira'].changeOrigin).toBe(true)
    expect((p['/jira'].rewrite as (path: string) => string)('/jira/rest/api/3/myself')).toBe(
      '/rest/api/3/myself',
    )
  })

  it('sets the basic auth header from email and token', () => {
    const p = buildJiraProxy(env)!
    expect(p['/jira'].headers?.Authorization).toBe(
      'Basic ' + Buffer.from('a@b.c:tok').toString('base64'),
    )
  })

  it('strips Origin and Referer before the request is sent', () => {
    const p = buildJiraProxy(env)!
    const on = vi.fn()
    const fakeProxy = { on }
    ;(p['/jira'].configure as (proxy: unknown) => void)(fakeProxy)

    const handler = on.mock.calls.find(([event]) => event === 'proxyReq')?.[1] as (
      proxyReq: { removeHeader: (name: string) => void },
    ) => void
    expect(handler).toBeTypeOf('function')

    const proxyReq = { removeHeader: vi.fn() }
    handler(proxyReq)
    expect(proxyReq.removeHeader).toHaveBeenCalledWith('origin')
    expect(proxyReq.removeHeader).toHaveBeenCalledWith('referer')
  })
})
