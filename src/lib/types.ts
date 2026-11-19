import type { AdfDoc } from './adf'

export interface Worklog {
    id: string
    issueKey: string
    started: string
    timeSpentSeconds: number
    comment?: AdfDoc
    authorAccountId: string
}

export interface Issue {
    key: string
    summary: string
}
