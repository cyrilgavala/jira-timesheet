import { useEffect, useState, type ReactNode } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { format } from 'date-fns'
import { useWorklogMutations } from '../data/queries'
import { adfToText, isPlainAdf, textToAdf } from '../lib/adf'
import { describeAction, describeEdit } from '../lib/cellAction'
import { formatHours, parseHours } from '../lib/hours'
import { getJiraSite } from '../lib/config'
import type { Issue, Worklog } from '../lib/types'
import { ConfirmDialog } from './ConfirmDialog'

interface DetailsPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  issue: Issue
  day: string
  worklogs: Worklog[]
  children: ReactNode
}

// Anchors the worklog list to a cell. Stays open while a confirmation is showing.
export function DetailsPopover({ open, onOpenChange, issue, day, worklogs, children }: DetailsPopoverProps) {
  const [confirming, setConfirming] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={(next) => !(confirming && !next) && onOpenChange(next)}>
      <Popover.Anchor asChild>{children}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="popover"
          align="start"
          sideOffset={6}
          onInteractOutside={(e) => confirming && e.preventDefault()}
        >
          <WorklogDetails issue={issue} day={day} worklogs={worklogs} onConfirmingChange={setConfirming} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

interface WorklogDetailsProps {
  issue: Issue
  day: string
  worklogs: Worklog[]
  onConfirmingChange: (confirming: boolean) => void
}

interface EditState {
  id: string
  hours: string
  comment: string
  original: string
  plain: boolean
}

function WorklogDetails({ issue, day, worklogs, onConfirmingChange }: WorklogDetailsProps) {
  const { create, update, remove } = useWorklogMutations()
  const [editing, setEditing] = useState<EditState | null>(null)
  const [siteUrl, setSiteUrl] = useState('')
  useEffect(() => {
    getJiraSite().then(setSiteUrl)
  }, [])
  const [adding, setAdding] = useState<{ hours: string; comment: string } | null>(null)
  const [pending, setPending] = useState<{ message: string; run: () => void } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ask = (message: string, run: () => void) => {
    setPending({ message, run })
    onConfirmingChange(true)
  }
  const close = () => {
    setPending(null)
    onConfirmingChange(false)
  }
  const confirm = () => {
    const run = pending?.run
    close()
    run?.()
  }
  const onError = (err: unknown) => setError(err instanceof Error ? err.message : 'Save failed')

  const startEdit = (w: Worklog) => {
    const text = adfToText(w.comment)
    setEditing({
      id: w.id,
      hours: formatHours(w.timeSpentSeconds),
      comment: text,
      original: text,
      plain: isPlainAdf(w.comment),
    })
    setAdding(null)
    setError(null)
  }

  const saveEdit = (w: Worklog) => {
    if (!editing) return
    const parsed = parseHours(editing.hours)
    if (parsed.kind !== 'ok') {
      setError(parsed.kind === 'empty' ? 'Use Delete to remove a worklog' : 'Enter hours like 1.5')
      return
    }
    const commentChanged = editing.plain && editing.comment.trim() !== editing.original.trim()
    if (commentChanged && !editing.comment.trim()) {
      setError('A comment can not be emptied here. Clear it in Jira.')
      return
    }
    if (parsed.seconds === w.timeSpentSeconds && !commentChanged) {
      setEditing(null)
      return
    }
    // Comment is sent only when a plain comment was changed, so formatting is never lost.
    const comment = commentChanged ? textToAdf(editing.comment) : undefined
    ask(describeEdit(w, parsed.seconds, commentChanged, issue.key, day), () =>
      update.mutate(
        { issueKey: issue.key, id: w.id, seconds: parsed.seconds, comment },
        { onSuccess: () => setEditing(null), onError },
      ),
    )
  }

  const askDelete = (w: Worklog) =>
    ask(describeAction({ kind: 'delete', worklog: w }, issue.key, day), () =>
      remove.mutate({ issueKey: issue.key, id: w.id }, { onError }),
    )

  const saveAdd = () => {
    if (!adding) return
    const parsed = parseHours(adding.hours)
    if (parsed.kind !== 'ok') {
      setError('Enter hours like 1.5')
      return
    }
    const comment = textToAdf(adding.comment)
    ask(describeAction({ kind: 'create', seconds: parsed.seconds }, issue.key, day), () =>
      create.mutate(
        { issueKey: issue.key, day, seconds: parsed.seconds, comment },
        { onSuccess: () => setAdding(null), onError },
      ),
    )
  }

  return (
    <div>
      <h3>
        {issue.key} · {format(new Date(`${day}T00:00:00`), 'EEE d MMM')}
      </h3>
      <ul className="worklog-list">
        {worklogs.map((w) =>
          editing?.id === w.id ? (
            <li key={w.id} className="worklog-item" style={{ display: 'block' }}>
              <label className="field">
                <span>Hours</span>
                <input value={editing.hours} onChange={(e) => setEditing({ ...editing, hours: e.target.value })} />
              </label>
              {editing.plain ? (
                <label className="field">
                  <span>Comment</span>
                  <textarea value={editing.comment} onChange={(e) => setEditing({ ...editing, comment: e.target.value })} />
                </label>
              ) : (
                <p className="readonly-note">
                  Formatted comment ·{' '}
                  <a href={`${siteUrl}/browse/${issue.key}?focusedWorklogId=${w.id}`} target="_blank" rel="noreferrer">
                    edit in Jira
                  </a>
                </p>
              )}
              <div className="dialog-actions">
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={() => saveEdit(w)}>
                  Save
                </button>
              </div>
            </li>
          ) : (
            <li key={w.id} className="worklog-item">
              <span className="worklog-hours">{formatHours(w.timeSpentSeconds)}</span>
              <span className="worklog-comment">{adfToText(w.comment) || '—'}</span>
              <button type="button" className="btn btn-ghost" onClick={() => startEdit(w)}>
                Edit
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => askDelete(w)}>
                Delete
              </button>
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <div>
          <label className="field">
            <span>Hours</span>
            <input value={adding.hours} onChange={(e) => setAdding({ ...adding, hours: e.target.value })} />
          </label>
          <label className="field">
            <span>Comment</span>
            <textarea value={adding.comment} onChange={(e) => setAdding({ ...adding, comment: e.target.value })} />
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setAdding(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={saveAdd}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => {
            setAdding({ hours: '', comment: '' })
            setEditing(null)
            setError(null)
          }}
        >
          + Add worklog
        </button>
      )}

      {error && (
        <p role="alert" className="readonly-note">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={pending !== null}
        message={pending?.message ?? ''}
        danger={pending?.message.startsWith('Delete')}
        onConfirm={confirm}
        onCancel={close}
      />
    </div>
  )
}
