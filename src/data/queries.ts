import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createWorklog,
  deleteWorklog,
  getMyself,
  getMyWorklogs,
  searchMonthIssues,
  updateWorklog,
} from '../api/jira'
import type { AdfDoc } from '../lib/adf'
import { groupWorklogs, monthBounds } from '../lib/grid'
import type { Issue, Worklog } from '../lib/types'

// Runs fn over items with at most `limit` requests in flight.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: getMyself, staleTime: Infinity, retry: false })
}

export function useMonth(month: Date) {
  const { firstDay, lastDay, start, end } = monthBounds(month)
  const me = useMe()
  const accountId = me.data?.accountId

  const issuesQuery = useQuery({
    queryKey: ['issues', firstDay],
    queryFn: () => searchMonthIssues(firstDay, lastDay),
    enabled: !!accountId,
  })

  // One query for the whole month, so the grid and every write share one cache entry.
  const worklogsQuery = useQuery({
    queryKey: ['worklogs', firstDay],
    queryFn: async (): Promise<Worklog[]> => {
      const perIssue = await mapLimit(issuesQuery.data ?? [], 5, (issue) =>
        getMyWorklogs(issue.key, start, end, accountId!),
      )
      return perIssue.flat()
    },
    enabled: !!accountId && !!issuesQuery.data,
  })

  const worklogs = worklogsQuery.data ?? []
  return {
    issues: (issuesQuery.data ?? []) as Issue[],
    worklogs,
    cells: groupWorklogs(worklogs, month),
    isLoading: me.isLoading || issuesQuery.isLoading || worklogsQuery.isLoading,
    error: me.error ?? issuesQuery.error ?? worklogsQuery.error ?? null,
  }
}

// Refreshes every month's worklogs after a write (cheap for a personal tool, and cells need no month prop).
export function useWorklogMutations() {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['worklogs'] })

  return {
    create: useMutation({
      mutationFn: (v: { issueKey: string; day: string; seconds: number; comment?: AdfDoc }) =>
        createWorklog(v.issueKey, v.day, v.seconds, v.comment),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { issueKey: string; id: string; seconds: number; comment?: AdfDoc }) =>
        updateWorklog(v.issueKey, v.id, v.seconds, v.comment),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (v: { issueKey: string; id: string }) => deleteWorklog(v.issueKey, v.id),
      onSuccess: refresh,
    }),
  }
}
