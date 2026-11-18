import { useState } from 'react'
import { addMonths, format, startOfMonth, subMonths } from 'date-fns'
import { Cell } from './components/Cell'
import { Grid } from './components/Grid'
import { MonthHeader } from './components/MonthHeader'
import { StatusScreen } from './components/StatusScreen'
import { useMonth } from './data/queries'
import { sumSeconds } from './lib/grid'

export default function App() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const { issues, worklogs, cells, isLoading, error } = useMonth(month)

  if (error) {
    return (
      <StatusScreen>
        Can't reach Jira. Check <code>.env.local</code> (JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN)
        and restart <code>npm run dev</code>.
      </StatusScreen>
    )
  }
  if (isLoading) return <StatusScreen>Loading {format(month, 'MMMM yyyy')}…</StatusScreen>

  return (
    <div className="app">
      <MonthHeader
        month={month}
        totalSeconds={sumSeconds(worklogs)}
        onPrev={() => setMonth((m) => subMonths(m, 1))}
        onNext={() => setMonth((m) => addMonths(m, 1))}
      />
      {issues.length === 0 ? (
        <StatusScreen>No worklogs in {format(month, 'MMMM yyyy')}.</StatusScreen>
      ) : (
        <Grid
          month={month}
          issues={issues}
          cells={cells}
          renderCell={(issue, day, list) => (
            // onOpenDetails is wired to the popover in Task 8
            <Cell issue={issue} day={day} worklogs={list} onOpenDetails={() => {}} />
          )}
        />
      )}
    </div>
  )
}
