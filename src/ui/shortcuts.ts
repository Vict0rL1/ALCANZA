/**
 * Atajos de teclado (escritorio). Todos tienen un botón o enlace visible equivalente; nunca
 * son la única forma de hacer algo. No actúan mientras se escribe en un campo ni con un
 * diálogo abierto, y no usan modificadores que choquen con lectores de pantalla.
 *
 *   N  → nuevo movimiento        /  → buscar
 *   Ctrl/Cmd + Intro (en el formulario) → guardar; + Mayús → guardar y agregar otro
 */
import { useEffect } from 'react'
import { navigate } from './router'

export const SHORTCUTS: Record<string, string> = { n: '/movimientos/nuevo', '/': '/buscar' }

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function useGlobalShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('dialog[open], [role="dialog"]')) return
      const to = SHORTCUTS[e.key.toLowerCase()]
      if (!to) return
      e.preventDefault()
      navigate(to)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
