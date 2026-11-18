import type { ReactNode } from 'react'

export function StatusScreen({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <div className="status-screen" role="status">
        <div>{children}</div>
      </div>
    </div>
  )
}
