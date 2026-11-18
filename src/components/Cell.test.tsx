// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWorklog, deleteWorklog, JiraError, updateWorklog } from '../api/jira'
import { Cell } from './Cell'
import type { Worklog } from '../lib/types'

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
const worklog = (timeSpentSeconds: number, id = '10'): Worklog => ({
  id,
  issueKey: 'P-1',
  started: '2026-11-12T09:00:00.000+0100',
  timeSpentSeconds,
  authorAccountId: 'me',
})

function renderCell(worklogs: Worklog[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Cell issue={issue} day={day} worklogs={worklogs} />
    </QueryClientProvider>,
  )
}

describe('single-value cell', () => {
  it('asks before creating, and a blur after Enter does not ask twice', async () => {
    const user = userEvent.setup()
    renderCell([])
    const input = screen.getByRole('textbox', { name: /P-1 .* hours/ })

    await user.type(input, '2{Enter}')
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
    expect(screen.getByText('Log 2h on P-1 for Thu 12 Nov?')).toBeTruthy()

    fireEvent.blur(input)
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
    expect(createWorklog).not.toHaveBeenCalled()
  })

  it('creates the worklog only after Confirm', async () => {
    vi.mocked(createWorklog).mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderCell([])
    await user.type(screen.getByRole('textbox'), '2{Enter}')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(createWorklog).toHaveBeenCalledTimes(1))
    expect(createWorklog).toHaveBeenCalledWith('P-1', '2026-11-12', 7200, undefined)
  })

  it('Cancel reverts to the saved value and sends nothing', async () => {
    const user = userEvent.setup()
    renderCell([worklog(3600)])
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '3{Enter}')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('1')
    expect(updateWorklog).not.toHaveBeenCalled()
    expect(deleteWorklog).not.toHaveBeenCalled()
  })

  it('marks invalid input and sends nothing', async () => {
    const user = userEvent.setup()
    renderCell([])
    const input = screen.getByRole('textbox')
    await user.type(input, '2h{Enter}')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(createWorklog).not.toHaveBeenCalled()
  })

  it('shows the server value and the Jira message when a save fails', async () => {
    vi.mocked(updateWorklog).mockRejectedValue(new JiraError('Worklog is locked', 400))
    const user = userEvent.setup()
    renderCell([worklog(3600)])
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '2{Enter}')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Worklog is locked')
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('1')
  })
})

describe('multi-value cell', () => {
  it('is a button, not an input, and clicking it opens the worklog list', async () => {
    const user = userEvent.setup()
    renderCell([worklog(3600, '1'), worklog(7200, '2')])
    expect(screen.queryByRole('textbox')).toBeNull()
    await user.click(screen.getByRole('button', { name: /2 worklogs/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
