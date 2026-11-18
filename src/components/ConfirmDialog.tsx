import { useRef, type ReactNode } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  message: string
  danger?: boolean
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

// Every write goes through here. Confirm is focused, so Enter confirms and Escape cancels.
export function ConfirmDialog({ open, message, danger, children, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content
          className="dialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            confirmRef.current?.focus()
          }}
        >
          <AlertDialog.Title>Confirm change</AlertDialog.Title>
          <AlertDialog.Description>{message}</AlertDialog.Description>
          {children}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button
              ref={confirmRef}
              type="button"
              className={danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={onConfirm}
            >
              Confirm
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
