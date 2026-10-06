/**
 * Borradores de formularios sin guardar (p. ej. un movimiento a medio escribir).
 *
 * - Son texto del formulario, NO registros: no cuentan en ningún cálculo, no viajan en las
 *   copias de seguridad y no aparecen en el historial.
 * - Se guardan en `localStorage` del dispositivo, ligados al presupuesto (`budgetId`).
 * - Se borran al guardar el registro, al descartarlos y con «Borrar todos los datos».
 */
const PREFIX = 'clara.draft.'

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export interface StoredDraft<T> {
  budgetId: string
  savedAt: string
  value: T
}

export function readDraft<T>(name: string, budgetId: string): StoredDraft<T> | null {
  try {
    const raw = storage()?.getItem(PREFIX + name)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    return parsed && parsed.budgetId === budgetId && typeof parsed.savedAt === 'string' ? parsed : null
  } catch {
    return null
  }
}

/** Devuelve `false` si no se pudo guardar (sin espacio o bloqueado): el formulario sigue igual. */
export function writeDraft<T>(name: string, budgetId: string, value: T, now = new Date()): boolean {
  try {
    storage()?.setItem(PREFIX + name, JSON.stringify({ budgetId, savedAt: now.toISOString(), value } satisfies StoredDraft<T>))
    return true
  } catch {
    return false
  }
}

export function clearDraft(name: string): void {
  try {
    storage()?.removeItem(PREFIX + name)
  } catch {
    // Sin acceso al almacenamiento: no hay nada que borrar.
  }
}

export function clearAllDrafts(): void {
  const s = storage()
  if (!s) return
  try {
    for (const key of Object.keys(s)) if (key.startsWith(PREFIX)) s.removeItem(key)
  } catch {
    // Igual que arriba.
  }
}
