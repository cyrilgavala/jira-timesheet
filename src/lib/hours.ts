export type ParsedHours =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'ok'; seconds: number }

// Accepts decimal hours with "." or ",". Empty or zero means "no time".
export function parseHours(input: string): ParsedHours {
  const s = input.trim()
  if (s === '') return { kind: 'empty' }
  if (!/^\d+([.,]\d+)?$/.test(s)) return { kind: 'invalid' }

  const hours = Number(s.replace(',', '.'))
  if (hours === 0) return { kind: 'empty' }

  const minutes = Math.round(hours * 60)
  if (minutes < 1) return { kind: 'invalid' } // Jira requires at least 60 s
  return { kind: 'ok', seconds: minutes * 60 }
}

export function formatHours(seconds: number): string {
  if (seconds === 0) return ''
  return String(Number((seconds / 3600).toFixed(2)))
}
