/**
 * Ocurrencias de pagos e ingresos programados.
 *
 * - Semanal / quincenal (cada 2 semanas): cada 7 / 14 días desde `startDate`.
 * - Mensual: mismo día del mes que `startDate`. Si un mes no tiene ese día
 *   (29, 30 o 31) se usa el último día de ese mes, y el mes siguiente se vuelve
 *   al día original (31 ene → 28 feb → 31 mar → 30 abr).
 * - Anual: mismo día y mes; el 29 de febrero pasa al 28 en años no bisiestos.
 */
import { addDays, addMonthsClamped, daysBetween, parseLocalDate } from './dates'
import type { Frequency, LocalDate, Schedule } from './types'

const MAX_OCCURRENCES = 2000

function stepDays(frequency: Frequency): number | null {
  if (frequency === 'weekly') return 7
  if (frequency === 'biweekly') return 14
  return null
}

function stepMonths(frequency: Frequency): number | null {
  if (frequency === 'monthly') return 1
  if (frequency === 'yearly') return 12
  return null
}

/** n-ésima ocurrencia (n = 0 es `startDate`). */
export function nthOccurrence(schedule: Pick<Schedule, 'frequency' | 'startDate'>, n: number): LocalDate {
  const { frequency, startDate } = schedule
  if (frequency === 'once') return startDate
  const days = stepDays(frequency)
  if (days !== null) return addDays(startDate, days * n)
  const months = stepMonths(frequency) ?? 1
  const preferredDay = parseLocalDate(startDate).day
  return addMonthsClamped(startDate, months * n, preferredDay)
}

/**
 * Fechas de ocurrencia entre `from` y `to` (ambas incluidas), respetando
 * `startDate` y `endDate`. No excluye omitidas ni pagadas: eso lo decide quien llama.
 */
export function occurrencesBetween(
  schedule: Pick<Schedule, 'frequency' | 'startDate' | 'endDate'>,
  from: LocalDate,
  to: LocalDate,
): LocalDate[] {
  if (to < from) return []
  const end = schedule.endDate && schedule.endDate < to ? schedule.endDate : to
  if (end < schedule.startDate) return []

  if (schedule.frequency === 'once') {
    return schedule.startDate >= from && schedule.startDate <= end ? [schedule.startDate] : []
  }

  // Primera n candidata para no recorrer desde el principio en fechas lejanas.
  let n = 0
  if (from > schedule.startDate) {
    const days = stepDays(schedule.frequency)
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
export function nextOccurrenceOnOrAfter(
  schedule: Pick<Schedule, 'frequency' | 'startDate' | 'endDate'>,
  from: LocalDate,
  lookaheadDays = 800,
): LocalDate | null {
  return occurrencesBetween(schedule, from, addDays(from, lookaheadDays))[0] ?? null
}
