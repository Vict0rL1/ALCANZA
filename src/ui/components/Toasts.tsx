/**
 * Mensajes breves de confirmación ("Guardado", "Eliminado · Deshacer").
 * Se anuncian a lectores de pantalla mediante una región aria-live.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { Icon } from './Icon'
import { haptic } from '../haptics'
import { ToastContext, type ToastInput } from './toastContext'

interface ToastItem extends ToastInput {
  id: number
}

/** En pantallas estrechas se muestra UN aviso (el nuevo sustituye al anterior); en escritorio, hasta dos. */
const HELD_MS = 8000
const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 959px)').matches

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Si un aviso con acción (p. ej. «Deshacer») es sustituido por otro, su acción sigue disponible
  // unos segundos en un botón pequeño en el mismo sitio.
  const [held, setHeld] = useState<{ id: number; label: string; onClick: () => void } | null>(null)
  const list = useRef<ToastItem[]>([])
  const counter = useRef(0)
  const { t } = useT()

  const dismiss = useCallback((id: number) => {
    list.current = list.current.filter((x) => x.id !== id)
    setToasts(list.current)
  }, [])

  const show = useCallback(
    (toast: ToastInput) => {
      const id = ++counter.current
      haptic(toast.tone === 'critical' ? 'error' : toast.tone === 'info' ? 'tick' : 'success')
      const keep = isNarrow() ? 0 : 1
      const replaced = list.current.slice(0, Math.max(0, list.current.length - keep))
      const withAction = [...replaced].reverse().find((x) => x.action)
      if (withAction) {
        setHeld({ id: withAction.id, label: withAction.action!.label, onClick: withAction.action!.onClick })
        window.setTimeout(() => setHeld((h) => (h && h.id === withAction.id ? null : h)), HELD_MS)
      }
      list.current = [...list.current.slice(list.current.length - keep), { ...toast, id }]
      setToasts(list.current)
      window.setTimeout(() => dismiss(id), toast.durationMs ?? (toast.action ? 8000 : 3200))
    },
    [dismiss],
  )

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {held && (
          <div className="toast toast--held" data-testid="toast-held">
            <button
              type="button"
              className="btn btn--small btn--inverse"
              onClick={() => {
                held.onClick()
                setHeld(null)
              }}
            >
              {held.label}
            </button>
          </div>
        )}
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
