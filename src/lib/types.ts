import type { AdfDoc } from './adf'

export interface Worklog {
  id: string
  issueKey: string
  // ISO 8601 with offset, e.g. 2026-11-12T09:00:00.000+0100 (Jira's format)
  started: string
  timeSpentSeconds: number
  comment?: AdfDoc
  authorAccountId: string
}

export interface Issue {
  key: string
  summary: string
}
