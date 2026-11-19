import { format } from 'date-fns'
import type { AdfDoc } from '../lib/adf'
import type { Issue, Worklog } from '../lib/types'

// Every call goes through the Vite proxy, which adds auth and checks X-Timesheet.
const BASE = '/jira/rest/api/3'

export class JiraError extends Error {
    status: number

    constructor(message: string, status: number) {
        super(message)
        this.name = 'JiraError'
        this.status = status
    }
}

async function errorMessage(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { errorMessages?: string[]; errors?: Record<string, string> }
        const messages = [...(data.errorMessages ?? []), ...Object.values(data.errors ?? {})]
        if (messages.length) return messages.join('; ')
    } catch {
        // not JSON; fall through
    }
    return res.statusText || `HTTP ${res.status}`
}

async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            Accept: 'application/json',
            'X-Timesheet': '1',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new JiraError(await errorMessage(res), res.status)
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
}

interface RawWorklog {
    id: string
    started: string
    timeSpentSeconds: number
    comment?: AdfDoc
    author?: { accountId: string }
}

function toWorklog(issueKey: string, w: RawWorklog): Worklog {
    return {
        id: w.id,
        issueKey,
        started: w.started,
        timeSpentSeconds: w.timeSpentSeconds,
        comment: w.comment,
        authorAccountId: w.author?.accountId ?? '',
    }
}

// Jira's /myself returns many fields; we only need the name and avatar for the header.
export interface Me {
    accountId: string
    displayName?: string
    avatarUrls?: Record<string, string>
}

export async function getMyself(): Promise<Me> {
    return request('GET', '/myself')
}

export async function searchMonthIssues(firstDay: string, lastDay: string): Promise<Issue[]> {
    const jql = `worklogAuthor = currentUser() AND worklogDate >= "${firstDay}" AND worklogDate <= "${lastDay}"`
    const out: Issue[] = []
    let nextPageToken: string | undefined
    do {
        const page = await request<{
            issues: { key: string; fields: { summary: string } }[]
            nextPageToken?: string
        }>('POST', '/search/jql', { jql, fields: ['summary'], maxResults: 100, nextPageToken })
        out.push(...page.issues.map((i) => ({ key: i.key, summary: i.fields.summary })))
        nextPageToken = page.nextPageToken
    } while (nextPageToken)
    return out
}

// Jira returns everyone's worklogs on an issue, so keep only mine and read every page.
export async function getMyWorklogs(
    issueKey: string,
    start: Date,
    end: Date,
    accountId: string,
): Promise<Worklog[]> {
    const out: Worklog[] = []
    let startAt = 0
    for (; ;) {
        const page = await request<{ total: number; worklogs: RawWorklog[] }>(
            'GET',
            `/issue/${issueKey}/worklog?startedAfter=${start.getTime()}&startedBefore=${end.getTime()}&startAt=${startAt}&maxResults=5000`,
        )
        for (const w of page.worklogs) {
            if (w.author?.accountId === accountId) out.push(toWorklog(issueKey, w))
        }
        startAt += page.worklogs.length
        if (page.worklogs.length === 0 || startAt >= page.total) break
    }
    return out
}

export async function createWorklog(
    issueKey: string,
    day: string,
    seconds: number,
    comment?: AdfDoc,
): Promise<void> {
    // Local 09:00 on that day, with Jira's offset format (+0100).
    const started = format(new Date(`${day}T09:00:00`), "yyyy-MM-dd'T'HH:mm:ss.SSSxx")
    await request('POST', `/issue/${issueKey}/worklog`, { started, timeSpentSeconds: seconds, comment })
}

// `comment` is only sent when given, so an hours-only edit never rewrites the comment.
export async function updateWorklog(
    issueKey: string,
    id: string,
    seconds: number,
    comment?: AdfDoc,
): Promise<void> {
    await request('PUT', `/issue/${issueKey}/worklog/${id}`, { timeSpentSeconds: seconds, comment })
}

export async function deleteWorklog(issueKey: string, id: string): Promise<void> {
    await request('DELETE', `/issue/${issueKey}/worklog/${id}`)
}

export async function pickIssues(query: string): Promise<Issue[]> {
    const page = await request<{ sections?: { issues: { key: string; summaryText: string }[] }[] }>(
        'GET',
        `/issue/picker?query=${encodeURIComponent(query)}`,
    )
    const seen = new Map<string, Issue>()
    for (const section of page.sections ?? []) {
        for (const i of section.issues) {
            if (!seen.has(i.key)) seen.set(i.key, { key: i.key, summary: i.summaryText })
        }
    }
    return [...seen.values()]
}
