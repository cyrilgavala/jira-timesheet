import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createWorklog,
  deleteWorklog,
  getMyself,
  getMyWorklogs,
  JiraError,
  pickIssues,
  searchMonthIssues,
  updateWorklog,
} from './jira'

function stubFetch(...responses: Array<{ status?: number; body?: unknown }>) {
  const fetchMock = vi.fn()
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requests', () => {
  it('send the app header so the proxy accepts them', async () => {
    const f = stubFetch({ body: { accountId: 'me' } })
    await getMyself()
    const headers = new Headers((f.mock.calls[0][1] as RequestInit).headers)
    expect(headers.get('x-timesheet')).toBe('1')
  })
})

describe('searchMonthIssues', () => {
  it('uses the month JQL and follows nextPageToken', async () => {
    const f = stubFetch(
      { body: { issues: [{ key: 'P-1', fields: { summary: 'A' } }], nextPageToken: 't2' } },
      { body: { issues: [{ key: 'P-2', fields: { summary: 'B' } }] } },
    )
    const issues = await searchMonthIssues('2026-11-01', '2026-11-30')

    expect(issues).toEqual([
      { key: 'P-1', summary: 'A' },
      { key: 'P-2', summary: 'B' },
    ])
    expect(bodyOf(f.mock.calls[0])).toMatchObject({
      jql: 'worklogAuthor = currentUser() AND worklogDate >= "2026-11-01" AND worklogDate <= "2026-11-30"',
    })
    expect(bodyOf(f.mock.calls[1])).toMatchObject({ nextPageToken: 't2' })
  })
})

describe('getMyWorklogs', () => {
  it('keeps only my worklogs and reads past the first page', async () => {
    const other = { id: '1', started: '2026-11-02T09:00:00.000+0100', timeSpentSeconds: 60, author: { accountId: 'other' } }
    const mine1 = { id: '2', started: '2026-11-03T09:00:00.000+0100', timeSpentSeconds: 3600, author: { accountId: 'me' } }
    const other2 = { id: '3', started: '2026-11-04T09:00:00.000+0100', timeSpentSeconds: 60, author: { accountId: 'other' } }
    const mine2 = { id: '4', started: '2026-11-05T09:00:00.000+0100', timeSpentSeconds: 1800, author: { accountId: 'me' } }
    const f = stubFetch(
      { body: { startAt: 0, maxResults: 2, total: 4, worklogs: [other, mine1] } },
      { body: { startAt: 2, maxResults: 2, total: 4, worklogs: [other2, mine2] } },
    )

    const worklogs = await getMyWorklogs(
      'P-1',
      new Date(2026, 10, 1),
      new Date(2026, 11, 1),
      'me',
    )

    expect(worklogs.map((w) => w.id)).toEqual(['2', '4'])
    expect(worklogs[0]).toMatchObject({ issueKey: 'P-1', timeSpentSeconds: 3600 })
    expect(String(f.mock.calls[1][0])).toContain('startAt=2')
  })
})

describe('writes', () => {
  it('createWorklog starts the entry at 09:00 local with a Jira-format offset', async () => {
    const f = stubFetch({ body: {} })
    await createWorklog('P-1', '2026-11-12', 7200)

    expect((f.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(bodyOf(f.mock.calls[0])).toEqual({
      started: '2026-11-12T09:00:00.000+0100',
      timeSpentSeconds: 7200,
    })
  })

  it('updateWorklog omits comment unless one is given', async () => {
    const f = stubFetch({ body: {} }, { body: {} })
    await updateWorklog('P-1', '10', 3600)
    expect(bodyOf(f.mock.calls[0])).toEqual({ timeSpentSeconds: 3600 })
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('PUT')

    await updateWorklog('P-1', '10', 3600, { type: 'doc', version: 1, content: [] })
    expect(bodyOf(f.mock.calls[1])).toHaveProperty('comment')
  })

  it('deleteWorklog sends DELETE and accepts an empty 204', async () => {
    const f = stubFetch({ status: 204 })
    await deleteWorklog('P-1', '10')
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
    expect(String(f.mock.calls[0][0])).toContain('/rest/api/3/issue/P-1/worklog/10')
  })
})

describe('errors', () => {
  it('turns a 401 into a JiraError with Jira\'s message', async () => {
    stubFetch({ status: 401, body: { errorMessages: ['nope'] } })
    const err = await searchMonthIssues('2026-11-01', '2026-11-30').catch((e) => e)
    expect(err).toBeInstanceOf(JiraError)
    expect(err).toMatchObject({ status: 401, message: 'nope' })
  })
})

describe('pickIssues', () => {
  it('flattens picker sections and dedupes by key', async () => {
    stubFetch({
      body: {
        sections: [
          { issues: [{ key: 'P-1', summaryText: 'Login bug' }] },
          { issues: [{ key: 'P-1', summaryText: 'Login bug' }, { key: 'P-2', summaryText: 'Review' }] },
        ],
      },
    })
    expect(await pickIssues('login')).toEqual([
      { key: 'P-1', summary: 'Login bug' },
      { key: 'P-2', summary: 'Review' },
    ])
  })
})
