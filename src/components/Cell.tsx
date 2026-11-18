import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { format } from 'date-fns'
import { JiraError } from '../api/jira'
import { useWorklogMutations } from '../data/queries'
import { textToAdf } from '../lib/adf'
import { describeAction, decideCellCommit, type CellAction } from '../lib/cellAction'
import { formatHours } from '../lib/hours'
import { sumSeconds } from '../lib/grid'
import type { Issue, Worklog } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'
import { DetailsPopover } from './CellPopover'

interface CellProps {
  issue: Issue
  day: string
  worklogs: Worklog[]
}

// Cells with 2+ worklogs open the popover; 0 or 1 is typed straight in (Alt+Enter or ⋯ opens the popover).
export function Cell(props: CellProps) {
  return props.worklogs.length > 1 ? <MultiCell {...props} /> : <SingleCell {...props} />
}

function MultiCell({ issue, day, worklogs }: CellProps) {
  const [open, setOpen] = useState(false)
  const total = sumSeconds(worklogs)
  return (
    <DetailsPopover open={open} onOpenChange={setOpen} issue={issue} day={day} worklogs={worklogs}>
      <div className="cell-root">
        <button
          type="button"
          className="cell-multi"
          onClick={() => setOpen(true)}
          aria-label={`${issue.key} ${format(new Date(`${day}T00:00:00`), 'd MMM')}: ${worklogs.length} worklogs, ${formatHours(total)}h`}
        >
          {formatHours(total)}
        </button>
        <button type="button" className="cell-more" aria-label="Details" onClick={() => setOpen(true)}>
          ⋯
        </button>
      </div>
    </DetailsPopover>
  )
}

type Status = { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: string }

function SingleCell({ issue, day, worklogs }: CellProps) {
  const current = worklogs[0]
  const savedText = current ? formatHours(current.timeSpentSeconds) : ''

  const [open, setOpen] = useState(false)
  const [text, setTextState] = useState(savedText)
  const textRef = useRef(savedText) // latest text, read by blur/commit without stale state
  const [invalid, setInvalid] = useState(false)
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const [pending, setPending] = useState<Exclude<CellAction, { kind: 'noop' | 'invalid' }> | null>(null)
  const [comment, setComment] = useState('') // shown only when creating; reset on each new confirmation
  const pendingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { create, update, remove } = useWorklogMutations()

  const setText = (value: string) => {
    textRef.current = value
    setTextState(value)
  }

  // Follow the server when the saved value changes (after a refetch).
  useEffect(() => {
    setText(savedText)
  }, [savedText])

  const commit = () => {
    if (pendingRef.current || status.state === 'saving') return
    const action = decideCellCommit(worklogs, textRef.current)
    setInvalid(action.kind === 'invalid')
    if (action.kind === 'invalid' || action.kind === 'noop') return
    setStatus({ state: 'idle' })
    pendingRef.current = true
    setComment('')
    setPending(action)
  }

  const close = () => {
    pendingRef.current = false
    setPending(null)
  }

  const confirm = () => {
    if (!pending) return
    close()
    setStatus({ state: 'saving' })
    const callbacks = {
      onSuccess: () => setStatus({ state: 'idle' }),
      onError: (err: unknown) => {
        setStatus({ state: 'error', message: err instanceof JiraError ? err.message : 'Save failed' })
        setText(savedText)
      },
    }
    if (pending.kind === 'create') {
      create.mutate({ issueKey: issue.key, day, seconds: pending.seconds, comment: textToAdf(comment) }, callbacks)
    } else if (pending.kind === 'update') {
      update.mutate({ issueKey: issue.key, id: pending.worklog.id, seconds: pending.seconds }, callbacks)
    } else {
      remove.mutate({ issueKey: issue.key, id: pending.worklog.id }, callbacks)
    }
    inputRef.current?.focus()
  }

  const cancel = () => {
    close()
    setInvalid(false)
    setText(savedText)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      setOpen(true)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      setText(savedText)
      setInvalid(false)
      inputRef.current?.blur() // blur commits the saved value, which is a no-op
    }
  }

  return (
    <DetailsPopover open={open} onOpenChange={setOpen} issue={issue} day={day} worklogs={worklogs}>
      <div className="cell-root" data-state={status.state === 'idle' ? undefined : status.state}>
        <input
          ref={inputRef}
          className="cell-input"
          inputMode="decimal"
          aria-label={`${issue.key} ${format(new Date(`${day}T00:00:00`), 'd MMM')} hours`}
          aria-invalid={invalid || undefined}
          value={text}
          disabled={status.state === 'saving'}
          onChange={(e) => {
            setText(e.target.value)
            setInvalid(false)
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="cell-more" aria-label="Details" onClick={() => setOpen(true)}>
          ⋯
        </button>
        {status.state === 'error' && (
          <div className="cell-error" role="alert">
            {status.message}
          </div>
        )}
        <ConfirmDialog
          open={pending !== null}
          message={pending ? describeAction(pending, issue.key, day) : ''}
          danger={pending?.kind === 'delete'}
          onConfirm={confirm}
          onCancel={cancel}
        >
          {pending?.kind === 'create' && (
            <label className="field">
              <span>Comment</span>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          )}
        </ConfirmDialog>
      </div>
    </DetailsPopover>
  )
}
