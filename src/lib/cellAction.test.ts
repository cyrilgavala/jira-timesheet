import { describe, expect, it } from 'vitest'
import { describeAction, decideCellCommit } from './cellAction'
import { textToAdf } from './adf'
import type { Worklog } from './types'

const w = (timeSpentSeconds: number, extra: Partial<Worklog> = {}): Worklog => ({
  id: '10',
  issueKey: 'P-1',
  started: '2026-11-12T09:00:00.000+0100',
  timeSpentSeconds,
  authorAccountId: 'me',
  ...extra,
})

describe('decideCellCommit', () => {
  it('does nothing for an empty cell left empty', () => {
    expect(decideCellCommit([], '')).toEqual({ kind: 'noop' })
  })

  it('creates a worklog for an empty cell with a value', () => {
    expect(decideCellCommit([], '2')).toEqual({ kind: 'create', seconds: 7200 })
  })

  it('does nothing when the rounded value is unchanged', () => {
    expect(decideCellCommit([w(3600)], '1')).toEqual({ kind: 'noop' })
    expect(decideCellCommit([w(3600)], '1,0')).toEqual({ kind: 'noop' })
  })

  it('updates the single worklog to a new value', () => {
    expect(decideCellCommit([w(3600)], '2')).toEqual({ kind: 'update', worklog: w(3600), seconds: 7200 })
  })

  it('deletes the single worklog when the cell is cleared or set to zero', () => {
    expect(decideCellCommit([w(3600)], '')).toEqual({ kind: 'delete', worklog: w(3600) })
    expect(decideCellCommit([w(3600)], '0')).toEqual({ kind: 'delete', worklog: w(3600) })
  })

  it('rejects invalid input without any action', () => {
    expect(decideCellCommit([], '2h')).toEqual({ kind: 'invalid' })
    expect(decideCellCommit([w(3600)], '2h')).toEqual({ kind: 'invalid' })
  })

  it('refuses cells with several worklogs (those use the popover)', () => {
    expect(() => decideCellCommit([w(60), w(60)], '2')).toThrow()
  })
})

describe('describeAction', () => {
  const day = '2026-11-12'

  it('describes a create', () => {
    expect(describeAction({ kind: 'create', seconds: 7200 }, 'PROJ-123', day)).toBe(
      'Log 2h on PROJ-123 for Thu 12 Nov?',
    )
  })

  it('describes an update', () => {
    expect(describeAction({ kind: 'update', worklog: w(5400), seconds: 7200 }, 'PROJ-123', day)).toBe(
      'Change 1.5h → 2h on PROJ-123, 12 Nov?',
    )
  })

  it('describes a delete with its comment, truncated to 40 characters', () => {
    const long = 'x'.repeat(60)
    const action = { kind: 'delete' as const, worklog: w(3600, { comment: textToAdf(long) }) }
    expect(describeAction(action, 'PROJ-123', day)).toBe(
      `Delete 1h worklog ('${'x'.repeat(40)}…') on PROJ-123, 12 Nov?`,
    )
  })

  it('describes a delete without a comment', () => {
    expect(describeAction({ kind: 'delete', worklog: w(3600) }, 'PROJ-123', day)).toBe(
      'Delete 1h worklog on PROJ-123, 12 Nov?',
    )
  })
})
