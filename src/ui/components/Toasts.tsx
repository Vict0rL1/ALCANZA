/**
 * Mensajes breves de confirmación ("Guardado", "Eliminado · Deshacer").
 * Se anuncian a lectores de pantalla mediante una región aria-live.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { Icon } from './Icon'
import { ToastContext, type ToastInput } from './toastContext'

interface ToastItem extends ToastInput {
  id: number
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const { t } = useT()

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), [])

  const show = useCallback(
    (toast: ToastInput) => {
      const id = ++counter.current
      setToasts((list) => [...list.slice(-2), { ...toast, id }])
      window.setTimeout(() => dismiss(id), toast.durationMs ?? (toast.action ? 8000 : 4000))
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone ?? 'good'}`}>
            <Icon name={toast.tone === 'critical' ? 'alert' : toast.tone === 'info' ? 'info' : 'check'} size={18} />
            <span className="toast__message">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="btn btn--small btn--inverse"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="btn btn--icon btn--inverse-ghost" onClick={() => dismiss(toast.id)} aria-label={t('common.close')}>
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
