/**
 * Registro del service worker (solo en la versión compilada y en contexto seguro:
 * https o localhost). Avisa cuando hay una versión nueva lista para instalar.
 *
 * Nunca se recarga sola: solo la pestaña donde la persona pulsó «Actualizar» se recarga.
 * Si la versión nueva se activó desde OTRA pestaña, aquí solo se avisa (puede haber un
 * formulario a medias) y se pide recargar cuando convenga.
 */
import { useSyncExternalStore } from 'react'

type PwaState = {
  offlineReady: boolean
  update: (() => void) | null
  /** Otra pestaña activó una versión nueva: esta sigue con la anterior hasta recargar. */
  reloadNeeded: boolean
}

let state: PwaState = { offlineReady: false, update: null, reloadNeeded: false }
const listeners = new Set<() => void>()

function set(next: Partial<PwaState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')
      let requested = false
      const offer = (worker: ServiceWorker) =>
        set({
          update: () => {
            requested = true
            worker.postMessage('skipWaiting')
          },
        })
      if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting)
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing
        worker?.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return
          if (navigator.serviceWorker.controller) offer(worker)
          else set({ offlineReady: true })
        })
      })
      if (registration.active) set({ offlineReady: true })
      let reloading = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return
        if (requested) {
          reloading = true
          window.location.reload()
        } else if (state.update) {
          set({ update: null, reloadNeeded: true })
        }
      })
    } catch {
      // Sin service worker la app sigue funcionando; solo no estará disponible sin conexión.
    }
  })
}
