// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { pickIssues } from '../api/jira'
import { AddTicket } from './AddTicket'

vi.mock('../api/jira', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/jira')>()),
  pickIssues: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderAdd(existingKeys: string[], onAdd = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AddTicket existingKeys={existingKeys} onAdd={onAdd} />
    </QueryClientProvider>,
  )
  return { onAdd }
}

describe('AddTicket', () => {
  it('searches as you type and adds the chosen ticket', async () => {
    vi.mocked(pickIssues).mockResolvedValue([{ key: 'P-1', summary: 'Login bug' }])
    const user = userEvent.setup()
    const { onAdd } = renderAdd([])

    await user.type(screen.getByRole('combobox'), 'lo')
    const option = await screen.findByRole('option', { name: /P-1/ })
    await user.click(option)

    expect(onAdd).toHaveBeenCalledWith({ key: 'P-1', summary: 'Login bug' })
  })

  it('does not offer tickets already in the grid', async () => {
    vi.mocked(pickIssues).mockResolvedValue([{ key: 'P-2', summary: 'Review' }])
    const user = userEvent.setup()
    const { onAdd } = renderAdd(['P-2'])

    await user.type(screen.getByRole('combobox'), 'rev')
    const option = await screen.findByRole('option', { name: /P-2/ })
    expect(option.getAttribute('aria-disabled')).toBe('true')
    await user.click(option)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('does not search for fewer than two characters', async () => {
    const user = userEvent.setup()
    renderAdd([])
    await user.type(screen.getByRole('combobox'), 'a')
    await waitFor(() => expect(pickIssues).not.toHaveBeenCalled())
  })
})
