import { format } from 'date-fns'
import { formatHours } from '../lib/hours'

interface MonthHeaderProps {
  month: Date
  totalSeconds: number
  onPrev: () => void
  onNext: () => void
}

export function MonthHeader({ month, totalSeconds, onPrev, onNext }: MonthHeaderProps) {
  return (
    <header className="app-header">
      <nav className="month-nav">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={onPrev}>
          ‹
        </button>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={onNext}>
          ›
        </button>
      </nav>
      <h1 className="month-title">{format(month, 'MMMM yyyy')}</h1>
      <span className="month-total">
        Total <strong>{formatHours(totalSeconds) || '0'}h</strong>
      </span>
    </header>
  )
}
