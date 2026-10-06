/**
 * Diálogo modal con el elemento nativo <dialog>: atrapa el foco, se cierra con
 * Escape y devuelve el foco al botón que lo abrió.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { Icon } from './Icon'

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** Si se indica, el contenido es un formulario y Enter lo envía. */
  onSubmit?: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const { t } = useT()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const handleCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  const body = (
    <>
      <div className="dialog__header">
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label={t('common.close')}>
          <Icon name="x" />
        </button>
      </div>
      <div className="dialog__body">{children}</div>
      {footer && <div className="dialog__footer">{footer}</div>}
    </>
  )

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId}>
      {open &&
        (onSubmit ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
            }}
            noValidate
          >
            {body}
          </form>
        ) : (
          body
        ))}
    </dialog>
  )
}

/** Confirmación para acciones destructivas o importantes. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive,
  confirmDisabled,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
  confirmDisabled?: boolean
}) {
  const { t } = useT()
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className={`btn ${destructive ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
