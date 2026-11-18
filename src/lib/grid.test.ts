import { describe, expect, it } from 'vitest'
import {
  dayKey,
  dayTotal,
  groupWorklogs,
  monthBounds,
  monthDays,
  monthTotal,
  rowTotal,
} from './grid'
import type { Worklog } from './types'

const wl = (id: string, issueKey: string, started: string, timeSpentSeconds: number): Worklog => ({
  id,
  issueKey,
  started,
  timeSpentSeconds,
  authorAccountId: 'me',
})

describe('timezone guard', () => {
  it('runs tests in Europe/Bratislava', () => {
    expect(new Date('2026-11-30T23:30:00.000+0100').getHours()).toBe(23)
  })
})

describe('monthDays / dayKey / monthBounds', () => {
  it('lists every local day of the month', () => {
    expect(monthDays(new Date(2026, 1, 10))).toHaveLength(28)
    const nov = monthDays(new Date(2026, 10, 1))
    expect(nov).toHaveLength(30)
    expect(dayKey(nov[0])).toBe('2026-11-01')
  })

  it('gives JQL-ready first and last day plus local bounds', () => {
    const b = monthBounds(new Date(2026, 10, 15))
    expect(b.firstDay).toBe('2026-11-01')
    expect(b.lastDay).toBe('2026-11-30')
    expect(b.start).toEqual(new Date(2026, 10, 1))
    expect(b.end).toEqual(new Date(2026, 11, 1))
  })
})

describe('groupWorklogs', () => {
  const nov = new Date(2026, 10, 1)

  it('groups by the local date of the start time', () => {
    // 23:30 at +01:00 is the same instant as 22:30Z, still 30 Nov locally.
    const cells = groupWorklogs(
      [wl('1', 'P-1', '2026-11-30T23:30:00.000+0100', 60)],
      nov,
    )
    expect(cells.get('P-1')?.get('2026-11-30')).toHaveLength(1)
  })

  it('places a UTC-offset start time on the local day', () => {
    // 22:30Z is 23:30 local on 30 Nov.
    const cells = groupWorklogs([wl('1', 'P-1', '2026-11-30T22:30:00.000+0000', 60)], nov)
    expect(cells.get('P-1')?.get('2026-11-30')).toHaveLength(1)
  })

  it('drops a worklog that is in the next month locally', () => {
    // 23:30Z on 30 Nov is 00:30 on 1 Dec locally.
    const cells = groupWorklogs([wl('1', 'P-1', '2026-11-30T23:30:00.000+0000', 60)], nov)
    expect(cells.size).toBe(0)
  })

  it('keeps several worklogs for one ticket on one day in one cell', () => {
    const cells = groupWorklogs(
      [
        wl('1', 'P-1', '2026-11-12T09:00:00.000+0100', 3600),
        wl('2', 'P-1', '2026-11-12T14:00:00.000+0100', 7200),
      ],
      nov,
    )
    expect(cells.get('P-1')?.get('2026-11-12')).toHaveLength(2)
  })

  it('handles the DST change in October', () => {
    // 01:30Z on 25 Oct 2026 is 02:30 local (CET), still 25 Oct.
    const cells = groupWorklogs(
      [wl('1', 'P-1', '2026-10-25T01:30:00.000+0000', 60)],
      new Date(2026, 9, 1),
    )
    expect(cells.get('P-1')?.get('2026-10-25')).toHaveLength(1)
  })
})

describe('totals', () => {
  const worklogs = [
    wl('1', 'P-1', '2026-11-02T09:00:00.000+0100', 3600),
    wl('2', 'P-1', '2026-11-03T09:00:00.000+0100', 1800),
    wl('3', 'P-2', '2026-11-03T10:00:00.000+0100', 5400),
  ]
  const cells = groupWorklogs(worklogs, new Date(2026, 10, 1))

  it('sums per ticket, per day and per month', () => {
    expect(rowTotal(cells, 'P-1')).toBe(5400)
    expect(dayTotal(cells, '2026-11-03')).toBe(7200)
    expect(monthTotal(cells)).toBe(10800)
  })
})
