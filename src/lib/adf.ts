export interface AdfNode {
  type: string
  text?: string
  marks?: unknown[]
  content?: AdfNode[]
  attrs?: Record<string, unknown>
}

export interface AdfDoc {
  type: 'doc'
  version: 1
  content: AdfNode[]
}

// A comment is plain when it is only paragraphs of unmarked text and hard breaks.
// Only plain comments may be edited in the app; anything else is shown read-only.
export function isPlainAdf(doc: AdfDoc | undefined): boolean {
  if (!doc) return true
  return doc.content.every(
    (block) =>
      block.type === 'paragraph' &&
      (block.content ?? []).every(
        (node) =>
          node.type === 'hardBreak' || (node.type === 'text' && !node.marks?.length),
      ),
  )
}

function nodeText(node: AdfNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'mention' || node.type === 'emoji') return String(node.attrs?.text ?? '')
  if (node.type === 'inlineCard') return String(node.attrs?.url ?? '')
  return (node.content ?? []).map(nodeText).join('')
}

// Flattens a comment for display. Blocks are separated by a blank line.
export function adfToText(doc: AdfDoc | undefined): string {
  if (!doc) return ''
  return doc.content.map(nodeText).join('\n\n')
}

// Blank lines separate paragraphs; single newlines become hard breaks.
export function textToAdf(text: string): AdfDoc | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const content = trimmed.split(/\n\n+/).map((block) => ({
    type: 'paragraph',
    content: block.split('\n').flatMap((line, i): AdfNode[] =>
      i === 0 ? [{ type: 'text', text: line }] : [{ type: 'hardBreak' }, { type: 'text', text: line }],
    ),
  }))
  return { type: 'doc', version: 1, content }
}
