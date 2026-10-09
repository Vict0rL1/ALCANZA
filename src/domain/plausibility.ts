/**
 * Importes inverosímiles (G5): un gasto ≥ 20 × «Puedes gastar» de hoy y además ≥ 1 000 en la unidad
 * mayor de la moneda pide confirmación antes de guardarse (una vez por movimiento). No bloquea:
 * la persona confirma y se guarda tal cual.
 */
import { currencyDigits, floorDiv } from './money'

export const IMPLAUSIBLE_TIMES = 20
export const IMPLAUSIBLE_MIN_MAJOR = 1000

/** Cuántas veces el disponible cabe en el importe (entero, hacia abajo); null si no hay disponible. */
export function implausibilityRatio(amountMinor: number, availableMinor: number): number | null {
  if (availableMinor <= 0) return null
  return floorDiv(amountMinor, availableMinor)
}

export function isImplausibleAmount(amountMinor: number, availableMinor: number, currency: string): boolean {
  if (amountMinor < IMPLAUSIBLE_MIN_MAJOR * 10 ** currencyDigits(currency)) return false
  return amountMinor >= IMPLAUSIBLE_TIMES * Math.max(0, availableMinor)
}
