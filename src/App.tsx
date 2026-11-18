import { useState } from 'react'
import { addMonths, format, startOfMonth, subMonths } from 'date-fns'
import { AddTicket } from './components/AddTicket'
import { Cell } from './components/Cell'
import { Grid } from './components/Grid'
import { MonthHeader } from './components/MonthHeader'
import { StatusScreen } from './components/StatusScreen'
import { useMonth } from './data/queries'
import { monthDays, sumSeconds } from './lib/grid'
import type { Issue } from './lib/types'

export default function App() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const { issues, worklogs, cells, isLoading, error } = useMonth(month)

  // shortcut: tickets added by hand are in-memory only and cleared on month change; persist to localStorage if that annoys
  const monthKey = format(month, 'yyyy-MM')
  const [added, setAdded] = useState<{ month: string; issues: Issue[] }>({ month: monthKey, issues: [] })
  const addedHere = added.month === monthKey ? added.issues : []
  const rows = [...issues, ...addedHere.filter((a) => !issues.some((i) => i.key === a.key))]

  if (error) {
    return (
      <StatusScreen>
        Can't reach Jira. Check <code>.env.local</code> (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)
        and restart <code>npm run dev</code>.
        <br />
        <small>{error instanceof Error ? error.message : String(error)}</small>
      </StatusScreen>
    )
  }
  if (isLoading) return <StatusScreen>Loading {format(month, 'MMMM yyyy')}…</StatusScreen>

  const addRow = (
    <tr className="add-row">
      <th className="col-ticket" scope="row">
        <AddTicket
          existingKeys={rows.map((r) => r.key)}
          onAdd={(issue) => setAdded({ month: monthKey, issues: [...addedHere, issue] })}
        />
      </th>
      {monthDays(month).map((d) => (
        <td key={format(d, 'yyyy-MM-dd')} />
      ))}
      <td className="col-total" />
    </tr>
  )

  return (
    <div className="app">
      <MonthHeader
        month={month}
        totalSeconds={sumSeconds(worklogs)}
        onPrev={() => setMonth((m) => subMonths(m, 1))}
        onNext={() => setMonth((m) => addMonths(m, 1))}
      />
      {rows.length === 0 && (
        <p className="readonly-note" style={{ padding: '0 24px' }}>
          No worklogs in {format(month, 'MMMM yyyy')} yet. Add a ticket below to log time.
        </p>
      )}
      <Grid
        month={month}
        issues={rows}
        cells={cells}
        renderCell={(issue, day, list) => <Cell issue={issue} day={day} worklogs={list} />}
        footer={addRow}
      />
    </div>
  )
}
