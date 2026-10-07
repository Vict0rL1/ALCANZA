/**
 * Háptica (§7.9 · pulido): `navigator.vibrate` donde existe (Android). En iOS Safari no hay API y
 * no se simula nada (decisión 15). Solo se dispara tras acciones de la persona, nunca sola.
 */
export type HapticKind = 'tick' | 'success' | 'warning' | 'error'

const PATTERNS: Record<HapticKind, number | number[]> = { tick: 8, success: [10, 40, 12], warning: [20, 60, 20], error: [30, 50, 30, 50, 30] }

export function hapticsAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

export function haptic(kind: HapticKind): boolean {
  if (!hapticsAvailable()) return false
  try {
    // Con «reducir movimiento» activo tampoco se vibra: es la señal más cercana que da el sistema.
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    return navigator.vibrate(PATTERNS[kind])
  } catch {
    return false
  }
}
