/**
 * Pedir al navegador que no borre los datos del sitio por falta de espacio
 * (`navigator.storage.persist`). Función estándar del navegador, sin servicios externos.
 * El navegador decide; reduce el riesgo pero no lo elimina.
 */
import { useEffect, useState } from 'react'

export type PersistState = 'unsupported' | 'granted' | 'notGranted' | 'checking'

export function usePersistStatus(): { status: PersistState; request: () => Promise<void> } {
  const supported = typeof navigator !== 'undefined' && !!navigator.storage?.persisted && !!navigator.storage.persist
  const [status, setStatus] = useState<PersistState>(supported ? 'checking' : 'unsupported')
  useEffect(() => {
    if (!supported) return
    let alive = true
    navigator.storage
      .persisted()
      .then((p) => alive && setStatus(p ? 'granted' : 'notGranted'))
      .catch(() => alive && setStatus('unsupported'))
    return () => {
      alive = false
    }
  }, [supported])
  const request = async () => {
    if (!supported) return
    const granted = await navigator.storage.persist().catch(() => false)
    setStatus(granted ? 'granted' : 'notGranted')
  }
  return { status, request }
}
