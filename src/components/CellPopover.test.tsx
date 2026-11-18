// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWorklog, deleteWorklog, updateWorklog } from '../api/jira'
import { textToAdf } from '../lib/adf'
import type { Worklog } from '../lib/types'
import { DetailsPopover } from './CellPopover'

vi.mock('../api/jira', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/jira')>()),
  createWorklog: vi.fn(),
  updateWorklog: vi.fn(),
  deleteWorklog: vi.fn(),
}))

beforeAll(() => {
  // Popper (Radix popover positioning) needs ResizeObserver, which jsdom lacks.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const issue = { key: 'P-1', summary: 'Login bug' }
const day = '2026-11-12'

const plain: Worklog = {
  id: '1',
  issueKey: 'P-1',
  started: '2026-11-12T09:00:00.000+0100',
  timeSpentSeconds: 3600,
  comment: textToAdf('standup + review'),
  authorAccountId: 'me',
}
const formatted: Worklog = {
  id: '2',
  issueKey: 'P-1',
  started: '2026-11-12T13:00:00.000+0100',
  timeSpentSeconds: 7200,
  comment: {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'strong' }] }] },
    ],
  },
  authorAccountId: 'me',
}

function renderPopover(worklogs: Worklog[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DetailsPopover open onOpenChange={() => {}} issue={issue} day={day} worklogs={worklogs}>
        <div>anchor</div>
      </DetailsPopover>
    </QueryClientProvider>,
  )
}

const itemFor = (text: string) => screen.getByText(text).closest('li')!

describe('worklog list', () => {
  it('shows each worklog with its hours and comment', () => {
    renderPopover([plain, formatted])
    expect(screen.getByText('standup + review')).toBeTruthy()
    expect(itemFor('standup + review').textContent).toContain('1')
    expect(screen.getByText('2', { selector: '.worklog-hours' })).toBeTruthy()
  })
})

describe('editing', () => {
  it('a plain comment is editable and is sent with the edit', async () => {
    vi.mocked(updateWorklog).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPopover([plain, formatted])

    await user.click(within(itemFor('standup + review')).getByRole('button', { name: 'Edit' }))
    const hours = screen.getByRole('textbox', { name: 'Hours' })
    const comment = screen.getByRole('textbox', { name: 'Comment' })
    await user.clear(hours)
    await user.type(hours, '2')
    await user.clear(comment)
    await user.type(comment, 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Change 1h → 2h and comment on P-1, 12 Nov?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(updateWorklog).toHaveBeenCalledTimes(1))
    expect(updateWorklog).toHaveBeenCalledWith('P-1', '1', 7200, textToAdf('x'))
  })

  it('an hours-only edit never sends the comment', async () => {
    vi.mocked(updateWorklog).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPopover([plain, formatted])

    await user.click(within(itemFor('standup + review')).getByRole('button', { name: 'Edit' }))
    const hours = screen.getByRole('textbox', { name: 'Hours' })
    await user.clear(hours)
    await user.type(hours, '2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(updateWorklog).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateWorklog).mock.calls[0][3]).toBeUndefined()
  })

  it('a formatted comment is read-only, links to Jira, and is never sent', async () => {
    vi.mocked(updateWorklog).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPopover([plain, formatted])

    await user.click(within(itemFor('bold')).getByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('textbox', { name: 'Comment' })).toBeNull()
    expect(screen.getByRole('link', { name: 'edit in Jira' }).getAttribute('href')).toContain(
      '/browse/P-1?focusedWorklogId=2',
    )
    const hours = screen.getByRole('textbox', { name: 'Hours' })
    await user.clear(hours)
    await user.type(hours, '3')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(updateWorklog).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateWorklog).mock.calls[0][3]).toBeUndefined()
  })
})

describe('deleting', () => {
  it('asks with the comment in the message, then deletes', async () => {
    vi.mocked(deleteWorklog).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPopover([plain, formatted])

    await user.click(within(itemFor('standup + review')).getByRole('button', { name: 'Delete' }))
    expect(screen.getByText("Delete 1h worklog ('standup + review') on P-1, 12 Nov?")).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(deleteWorklog).toHaveBeenCalledWith('P-1', '1'))
  })
})

describe('adding', () => {
  it('logs a new worklog with a comment after confirmation', async () => {
    vi.mocked(createWorklog).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderPopover([plain, formatted])

    await user.click(screen.getByRole('button', { name: '+ Add worklog' }))
    await user.type(screen.getByRole('textbox', { name: 'Hours' }), '1,5')
    await user.type(screen.getByRole('textbox', { name: 'Comment' }), 'y')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Log 1.5h on P-1 for Thu 12 Nov?')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(createWorklog).toHaveBeenCalledTimes(1))
    expect(createWorklog).toHaveBeenCalledWith('P-1', '2026-11-12', 5400, textToAdf('y'))
  })
})
