import type { ReactNode } from 'react'
import { format, getDay, isToday } from 'date-fns'
import { dayKey, dayTotal, monthDays, monthTotal, rowTotal, type Cells } from '../lib/grid'
import { formatHours } from '../lib/hours'
import type { Issue, Worklog } from '../lib/types'

interface GridProps {
  month: Date
  issues: Issue[]
  cells: Cells
  renderCell: (issue: Issue, day: string, worklogs: Worklog[]) => ReactNode
  footer?: ReactNode
}

const dayClass = (d: Date) => {
  const weekend = getDay(d) === 0 || getDay(d) === 6
  return [weekend && 'is-weekend', isToday(d) && 'is-today'].filter(Boolean).join(' ')
}

export function Grid({ month, issues, cells, renderCell, footer }: GridProps) {
  const days = monthDays(month)
  const sorted = [...issues].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
  const siteUrl = __JIRA_SITE__

  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th className="col-ticket" scope="col">
              Ticket
            </th>
            {days.map((d) => (
              <th key={dayKey(d)} scope="col" className={dayClass(d)}>
                {format(d, 'd')}
                <small>{format(d, 'EEEEE')}</small>
              </th>
            ))}
            <th className="col-total" scope="col">
              Σ
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((issue) => (
            <tr key={issue.key}>
              <th className="col-ticket" scope="row">
                <a className="ticket-key" href={`${siteUrl}/browse/${issue.key}`} target="_blank" rel="noreferrer">
                  {issue.key}
                </a>
                <span className="ticket-summary">{issue.summary}</span>
              </th>
              {days.map((d) => {
                const day = dayKey(d)
                const list = cells.get(issue.key)?.get(day) ?? []
                return (
                  <td key={day} className={`cell ${dayClass(d)}`}>
                    {renderCell(issue, day, list)}
                  </td>
                )
              })}
              <td className="col-total">{formatHours(rowTotal(cells, issue.key))}</td>
            </tr>
          ))}
          {footer}
        </tbody>
        <tfoot>
          <tr>
            <th className="col-ticket" scope="row">
              Per day
            </th>
            {days.map((d) => (
              <td key={dayKey(d)} className={dayClass(d)}>
                {formatHours(dayTotal(cells, dayKey(d)))}
              </td>
            ))}
            <td className="col-total">{formatHours(monthTotal(cells))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
