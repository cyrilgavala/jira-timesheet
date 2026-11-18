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

  describe('request gate', () => {
    const gate = (url: string, headers: Record<string, string>) => {
      const p = buildJiraProxy(env)!
      const res = { statusCode: 200, end: vi.fn(), writableEnded: false }
      const result = (p['/jira'].bypass as (...args: unknown[]) => unknown)(
        { url, headers },
        res,
        {},
      )
      return { res, result }
    }

    it('rejects requests without the app header (blocks cross-site forgery)', () => {
      const { res } = gate('/jira/rest/api/3/issue/P-1/worklog', {})
      expect(res.statusCode).toBe(403)
      expect(res.end).toHaveBeenCalled()
    })

    it('rejects paths outside the Jira REST v3 API', () => {
      const { res } = gate('/jira/secure/Dashboard.jspa', { 'x-timesheet': '1' })
      expect(res.statusCode).toBe(403)
      expect(res.end).toHaveBeenCalled()
    })

    it('lets app requests to the REST v3 API through', () => {
      const { res, result } = gate('/jira/rest/api/3/myself?x=1', { 'x-timesheet': '1' })
      expect(res.end).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })
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
