import { describe, expect, it } from 'vitest'
import { adfToText, isPlainAdf, textToAdf, type AdfDoc } from './adf'

const doc = (content: AdfDoc['content']): AdfDoc => ({ type: 'doc', version: 1, content })
const para = (...content: AdfDoc['content']) => ({ type: 'paragraph', content })

describe('isPlainAdf', () => {
  it('treats a missing comment as plain', () => {
    expect(isPlainAdf(undefined)).toBe(true)
  })

  it('accepts paragraphs of unmarked text and hard breaks', () => {
    expect(isPlainAdf(doc([para({ type: 'text', text: 'hi' })]))).toBe(true)
    expect(
      isPlainAdf(doc([para({ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' })])),
    ).toBe(true)
    expect(isPlainAdf(doc([para({ type: 'text', text: 'hi', marks: [] })]))).toBe(true)
  })

  it.each([
    ['marked text', doc([para({ type: 'text', text: 'hi', marks: [{ type: 'strong' }] })])],
    ['a mention', doc([para({ type: 'mention', attrs: { id: '1', text: '@Jo' } })])],
    ['a bullet list', doc([{ type: 'bulletList', content: [] }])],
    ['an inline card', doc([para({ type: 'inlineCard', attrs: { url: 'https://x' } })])],
  ])('rejects %s', (_name, comment) => {
    expect(isPlainAdf(comment)).toBe(false)
  })
})

describe('adfToText', () => {
  it('separates paragraphs with a blank line', () => {
    expect(adfToText(doc([para({ type: 'text', text: 'a' }), para({ type: 'text', text: 'b' })]))).toBe(
      'a\n\nb',
    )
  })

  it('turns a hard break into a newline', () => {
    expect(
      adfToText(doc([para({ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' })])),
    ).toBe('a\nb')
  })

  it('shows a mention as its display text', () => {
    expect(adfToText(doc([para({ type: 'mention', attrs: { id: '1', text: '@Jo' } })]))).toContain('@Jo')
  })
})

describe('textToAdf', () => {
  it('returns undefined for empty or blank text', () => {
    expect(textToAdf('')).toBeUndefined()
    expect(textToAdf('  ')).toBeUndefined()
  })

  it('makes a paragraph per blank-line block and a hard break per newline', () => {
    expect(textToAdf('a\nb\n\nc')).toEqual(
      doc([
        para({ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }),
        para({ type: 'text', text: 'c' }),
      ]),
    )
  })

  it('round-trips through adfToText', () => {
    expect(adfToText(textToAdf('a\nb\n\nc'))).toBe('a\nb\n\nc')
  })
})
