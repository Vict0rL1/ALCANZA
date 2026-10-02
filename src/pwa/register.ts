/**
 * Registro del service worker (solo en la versión compilada y en contexto seguro:
 * https o localhost). Avisa cuando hay una versión nueva lista para instalar.
 */
import { useSyncExternalStore } from 'react'

type PwaState = { offlineReady: boolean; update: (() => void) | null }

let state: PwaState = { offlineReady: false, update: null }
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
      const offer = (worker: ServiceWorker) => set({ update: () => worker.postMessage('skipWaiting') })
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
        if (reloading || !state.update) return
        reloading = true
        window.location.reload()
      })
    } catch {
      // Sin service worker la app sigue funcionando; solo no estará disponible sin conexión.
    }
  })
}
