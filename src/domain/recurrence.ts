/**
 * Ocurrencias de pagos e ingresos programados.
 *
 * - Diaria / semanal / quincenal (cada 2 semanas) / personalizada (cada N días): cada
 *   1 / 7 / 14 / N días desde `startDate`.
 * - Mensual / trimestral / anual: mismo día del mes que `startDate`, cada 1 / 3 / 12 meses.
 *   Si un mes no tiene ese día (29, 30 o 31) se usa el último día de ese mes, y el mes
 *   siguiente se vuelve al día original (31 ene → 28 feb → 31 mar → 30 abr).
 * - Anual: el 29 de febrero pasa al 28 en años no bisiestos.
 */
import { addDays, addMonthsClamped, daysBetween, parseLocalDate } from './dates'
import type { Frequency, LocalDate, Schedule } from './types'

const MAX_OCCURRENCES = 2000

export type RecurrenceRule = Pick<Schedule, 'frequency' | 'startDate'> & Partial<Pick<Schedule, 'endDate' | 'intervalDays'>>

function stepDays(frequency: Frequency, intervalDays: number | undefined): number | null {
  if (frequency === 'daily') return 1
  if (frequency === 'weekly') return 7
  if (frequency === 'biweekly') return 14
  // Personalizada sin intervalo válido: se trata como diaria (la validación lo exige ≥ 1).
  if (frequency === 'custom') return Math.max(1, Math.floor(intervalDays ?? 1))
  return null
}

function stepMonths(frequency: Frequency): number | null {
  if (frequency === 'monthly') return 1
  if (frequency === 'quarterly') return 3
  if (frequency === 'yearly') return 12
  return null
}

/** n-ésima ocurrencia (n = 0 es `startDate`). */
export function nthOccurrence(schedule: RecurrenceRule, n: number): LocalDate {
  const { frequency, startDate } = schedule
  if (frequency === 'once') return startDate
  const days = stepDays(frequency, schedule.intervalDays)
  if (days !== null) return addDays(startDate, days * n)
  const months = stepMonths(frequency) ?? 1
  const preferredDay = parseLocalDate(startDate).day
  return addMonthsClamped(startDate, months * n, preferredDay)
}

/**
 * Fechas de ocurrencia entre `from` y `to` (ambas incluidas), respetando
 * `startDate` y `endDate`. No excluye omitidas ni pagadas: eso lo decide quien llama.
 */
export function occurrencesBetween(schedule: RecurrenceRule, from: LocalDate, to: LocalDate): LocalDate[] {
  if (to < from) return []
  const end = schedule.endDate && schedule.endDate < to ? schedule.endDate : to
  if (end < schedule.startDate) return []

  if (schedule.frequency === 'once') {
    return schedule.startDate >= from && schedule.startDate <= end ? [schedule.startDate] : []
  }

  // Primera n candidata para no recorrer desde el principio en fechas lejanas.
  let n = 0
  if (from > schedule.startDate) {
    const days = stepDays(schedule.frequency, schedule.intervalDays)
    if (days !== null) {
      n = Math.max(0, Math.floor(daysBetween(schedule.startDate, from) / days))
    } else {
      const months = stepMonths(schedule.frequency) ?? 1
      const a = parseLocalDate(schedule.startDate)
      const b = parseLocalDate(from)
      const diff = (b.year - a.year) * 12 + (b.month - a.month)
      n = Math.max(0, Math.floor(diff / months) - 1)
    }
  }

  const result: LocalDate[] = []
  for (let i = 0; i < MAX_OCCURRENCES; i++, n++) {
    const date = nthOccurrence(schedule, n)
    if (date > end) break
    if (date >= from) result.push(date)
  }
  return result
}

/** Primera ocurrencia en o después de `from`, o `null`. */
export function nextOccurrenceOnOrAfter(schedule: RecurrenceRule, from: LocalDate, lookaheadDays = 800): LocalDate | null {
  return occurrencesBetween(schedule, from, addDays(from, lookaheadDays))[0] ?? null
}
