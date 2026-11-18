import { addMonths, eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns'
import type { Worklog } from './types'

export type Cells = Map<string /* issueKey */, Map<string /* yyyy-MM-dd */, Worklog[]>>

export function monthDays(month: Date): Date[] {
  return eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) })
}

export function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function monthBounds(month: Date) {
  const start = startOfMonth(month)
  return {
    start,
    end: addMonths(start, 1),
    firstDay: dayKey(start),
    lastDay: dayKey(endOfMonth(month)),
  }
}

// Jira writes offsets without a colon (+0100); Date needs +01:00.
function parseStarted(started: string): Date {
  return new Date(started.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
}

// Groups by the local calendar date of `started`. Worklogs outside `month` are dropped.
export function groupWorklogs(worklogs: Worklog[], month: Date): Cells {
  const monthPrefix = format(month, 'yyyy-MM')
  const cells: Cells = new Map()
  for (const w of worklogs) {
    const day = dayKey(parseStarted(w.started))
    if (!day.startsWith(monthPrefix)) continue
    const row = cells.get(w.issueKey) ?? new Map<string, Worklog[]>()
    row.set(day, [...(row.get(day) ?? []), w])
    cells.set(w.issueKey, row)
  }
  return cells
}

export const sumSeconds = (list: Worklog[] | undefined) =>
  (list ?? []).reduce((acc, w) => acc + w.timeSpentSeconds, 0)

export function rowTotal(cells: Cells, issueKey: string): number {
  return [...(cells.get(issueKey)?.values() ?? [])].reduce((acc, list) => acc + sumSeconds(list), 0)
}

export function dayTotal(cells: Cells, day: string): number {
  let total = 0
  for (const row of cells.values()) total += sumSeconds(row.get(day))
  return total
}

export function monthTotal(cells: Cells): number {
  let total = 0
  for (const row of cells.values()) for (const list of row.values()) total += sumSeconds(list)
  return total
}
