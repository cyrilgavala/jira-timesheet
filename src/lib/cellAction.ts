import { format } from 'date-fns'
import { adfToText } from './adf'
import { parseHours, formatHours } from './hours'
import type { Worklog } from './types'

export type CellAction =
  | { kind: 'noop' }
  | { kind: 'invalid' }
  | { kind: 'create'; seconds: number }
  | { kind: 'update'; worklog: Worklog; seconds: number }
  | { kind: 'delete'; worklog: Worklog }

// Only for cells with 0 or 1 worklog. Cells with more use the popover.
export function decideCellCommit(worklogs: Worklog[], input: string): CellAction {
  if (worklogs.length > 1) throw new Error('decideCellCommit only handles 0 or 1 worklogs')
  const parsed = parseHours(input)
  if (parsed.kind === 'invalid') return { kind: 'invalid' }

  const current = worklogs[0]
  if (parsed.kind === 'empty') return current ? { kind: 'delete', worklog: current } : { kind: 'noop' }
  if (!current) return { kind: 'create', seconds: parsed.seconds }
  if (parsed.seconds === current.timeSpentSeconds) return { kind: 'noop' }
  return { kind: 'update', worklog: current, seconds: parsed.seconds }
}

// Popover edits can change hours, the comment, or both. The message names only what changes.
export function describeEdit(
  worklog: Worklog,
  seconds: number,
  commentChanged: boolean,
  issueKey: string,
  day: string,
): string {
  const date = format(new Date(`${day}T00:00:00`), 'd MMM')
  const parts: string[] = []
  if (seconds !== worklog.timeSpentSeconds) {
    parts.push(`${formatHours(worklog.timeSpentSeconds)}h → ${formatHours(seconds)}h`)
  }
  if (commentChanged) parts.push('comment')
  return `Change ${parts.join(' and ')} on ${issueKey}, ${date}?`
}

const COMMENT_LIMIT = 40

// Exact confirmation copy. `day` is yyyy-MM-dd.
export function describeAction(
  action: Exclude<CellAction, { kind: 'noop' | 'invalid' }>,
  issueKey: string,
  day: string,
): string {
  const date = format(new Date(`${day}T00:00:00`), 'd MMM')
  const weekday = format(new Date(`${day}T00:00:00`), 'EEE d MMM')

  if (action.kind === 'create') {
    return `Log ${formatHours(action.seconds)}h on ${issueKey} for ${weekday}?`
  }
  if (action.kind === 'update') {
    return `Change ${formatHours(action.worklog.timeSpentSeconds)}h → ${formatHours(action.seconds)}h on ${issueKey}, ${date}?`
  }
  const text = adfToText(action.worklog.comment).trim()
  const comment = text
    ? ` ('${text.length > COMMENT_LIMIT ? `${text.slice(0, COMMENT_LIMIT)}…` : text}')`
    : ''
  return `Delete ${formatHours(action.worklog.timeSpentSeconds)}h worklog${comment} on ${issueKey}, ${date}?`
}
