import { describe, expect, it } from 'vitest'
import { formatHours, parseHours } from './hours'

describe('parseHours', () => {
  it('accepts a dot or comma decimal separator', () => {
    expect(parseHours('1.5')).toEqual({ kind: 'ok', seconds: 5400 })
    expect(parseHours('1,5')).toEqual({ kind: 'ok', seconds: 5400 })
  })

  it('trims surrounding whitespace', () => {
    expect(parseHours(' 2 ')).toEqual({ kind: 'ok', seconds: 7200 })
  })

  it('rounds to whole minutes', () => {
    expect(parseHours('0.333')).toEqual({ kind: 'ok', seconds: 1200 })
  })

  it('rejects a non-zero value that rounds below one minute', () => {
    expect(parseHours('0.001')).toEqual({ kind: 'invalid' })
  })

  it('treats empty or zero as no time', () => {
    expect(parseHours('')).toEqual({ kind: 'empty' })
    expect(parseHours('  ')).toEqual({ kind: 'empty' })
    expect(parseHours('0')).toEqual({ kind: 'empty' })
  })

  it.each(['2h', '1:30', '-1', 'abc', '1.2.3'])('rejects %s', (input) => {
    expect(parseHours(input)).toEqual({ kind: 'invalid' })
  })
})

describe('formatHours', () => {
  it('shows up to two decimals without trailing zeros', () => {
    expect(formatHours(5400)).toBe('1.5')
    expect(formatHours(900)).toBe('0.25')
    expect(formatHours(7200)).toBe('2')
    expect(formatHours(1200)).toBe('0.33')
  })

  it('shows zero as an empty string', () => {
    expect(formatHours(0)).toBe('')
  })
})
