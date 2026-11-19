import { format } from 'date-fns'
import { formatHours } from '../lib/hours'

interface MonthHeaderProps {
    month: Date
    totalSeconds: number
    name?: string
    avatar?: string
    onPrev: () => void
    onNext: () => void
}

export function MonthHeader({ month, totalSeconds, name, avatar, onPrev, onNext }: MonthHeaderProps) {
    return (
        <header className="app-header">
            <div className="header-row">
                <h1 className="app-title">Jira timesheet</h1>
                {(name || avatar) && (
                    <span className="user">
                        {avatar && <img className="user-avatar" src={avatar} alt={name ?? ''} />}
                        {name && <span className="user-name">{name}</span>}
                    </span>
                )}
            </div>
            <div className="header-row">
                <nav className="month-nav">
                    <button type="button" className="icon-btn" aria-label="Previous month" onClick={onPrev}>
                        ‹
                    </button>
                    <span className="month-title">{format(month, 'MMMM yyyy')}</span>
                    <button type="button" className="icon-btn" aria-label="Next month" onClick={onNext}>
                        ›
                    </button>
                </nav>
                <span className="month-total">
                    Total <strong>{formatHours(totalSeconds) || '0'}h</strong>
                </span>
            </div>
        </header>
    )
}
