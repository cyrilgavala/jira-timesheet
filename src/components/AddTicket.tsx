import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pickIssues } from '../api/jira'
import type { Issue } from '../lib/types'

interface AddTicketProps {
  existingKeys: string[]
  onAdd: (issue: Issue) => void
}

// Search by key or text. Tickets already in the grid are shown but can't be picked again.
export function AddTicket({ existingKeys, onAdd }: AddTicketProps) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const enabled = debounced.length >= 2
  const { data: results = [] } = useQuery({
    queryKey: ['picker', debounced],
    queryFn: () => pickIssues(debounced),
    enabled,
  })
  const showList = open && enabled

  const choose = (issue: Issue) => {
    if (existingKeys.includes(issue.key)) return
    onAdd(issue)
    setQuery('')
    setDebounced('')
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const exact = results.find((i) => i.key === query.trim().toUpperCase())
      const picked = results[active] ?? exact
      if (picked) choose(picked)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="add-ticket">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder="+ Add ticket…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
      />
      {showList && results.length > 0 && (
        <ul id={listId} role="listbox" className="listbox">
          {results.map((issue, i) => {
            const taken = existingKeys.includes(issue.key)
            return (
              <li
                key={issue.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={taken}
                className="option"
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                onClick={() => choose(issue)}
              >
                <strong>{issue.key}</strong> {issue.summary}
                {taken && ' (in grid)'}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
