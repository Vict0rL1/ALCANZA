import { createContext, useContext } from 'react'

export interface ToastInput {
  message: string
  tone?: 'good' | 'critical' | 'info'
  action?: { label: string; onClick: () => void }
  durationMs?: number
}

export const ToastContext = createContext<(toast: ToastInput) => void>(() => {})

/** Muestra un mensaje breve de confirmación (con acción opcional, p. ej. «Deshacer»). */
export function useToast() {
  return useContext(ToastContext)
}
