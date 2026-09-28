/**
 * Fechas de calendario ('AAAA-MM-DD') separadas de marcas de tiempo.
 *
 * La aritmética de días se hace en UTC para que los cambios de horario
 * (horario de verano) nunca sumen o resten un día por error.
 * "Hoy" se calcula en la zona horaria elegida en Ajustes.
 */
import type { LocalDate, Timestamp } from './types'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface DateParts {
  year: number
  month: number // 1-12
  day: number
}

export function isValidLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false
  const m = DATE_RE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (year < 1900 || year > 2200 || month < 1 || month > 12) return false
  return day >= 1 && day <= daysInMonth(year, month)
}

export function parseLocalDate(value: LocalDate): DateParts {
  const m = DATE_RE.exec(value)
  if (!m) throw new Error(`Fecha inválida: ${value}`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

export function toLocalDate(year: number, month: number, day: number): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 30
}

function toUtcMs(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date)
  return Date.UTC(year, month - 1, day)
}

function fromUtcMs(ms: number): LocalDate {
  const d = new Date(ms)
  return toLocalDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

const DAY_MS = 86_400_000

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS)
}

/** Número de días desde `from` hasta `to` (negativo si `to` es anterior). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS)
}

/**
 * Suma meses conservando el día preferido. Si el mes destino no tiene ese día
 * (29, 30 o 31), se usa el último día de ese mes: 31 ene + 1 mes = 28/29 feb.
 */
export function addMonthsClamped(date: LocalDate, months: number, preferredDay?: number): LocalDate {
  const { year, month, day } = parseLocalDate(date)
  const target = year * 12 + (month - 1) + months
  const ty = Math.floor(target / 12)
  const tm = (target % 12) + 1
  const wanted = preferredDay ?? day
  return toLocalDate(ty, tm, Math.min(wanted, daysInMonth(ty, tm)))
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a <= b ? a : b
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a >= b ? a : b
}

/** 0 = domingo … 6 = sábado. */
export function weekday(date: LocalDate): number {
  return new Date(toUtcMs(date)).getUTCDay()
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date)
  return toLocalDate(year, month, 1)
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date)
  return toLocalDate(year, month, daysInMonth(year, month))
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>()

/** Fecha de calendario de un instante en una zona horaria (IANA). */
export function localDateInTimeZone(instant: Date, timeZone: string): LocalDate {
  let f = partsFormatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    partsFormatterCache.set(timeZone, f)
  }
  const parts = f.formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return toLocalDate(get('year'), get('month'), get('day'))
}

export function todayInTimeZone(timeZone: string, now: Date = new Date()): LocalDate {
  return localDateInTimeZone(now, timeZone)
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone === '') return false
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return true
  } catch {
    return false
  }
}

export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return isValidTimeZone(tz) ? tz : 'America/Toronto'
  } catch {
    return 'America/Toronto'
  }
}

export function isValidTimestamp(value: unknown): value is Timestamp {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))
}

export function nowTimestamp(now: Date = new Date()): Timestamp {
  return now.toISOString()
}

/** Diferencia en horas entre dos marcas de tiempo. */
export function hoursBetween(a: Timestamp, b: Timestamp): number {
  return (Date.parse(b) - Date.parse(a)) / 3_600_000
}

/** Fecha de calendario como objeto Date a mediodía UTC, solo para mostrarla con Intl (timeZone: 'UTC'). */
export function localDateToDisplayDate(date: LocalDate): Date {
  return new Date(toUtcMs(date) + DAY_MS / 2)
}

/** Meses completos entre dos fechas (mínimo 0). */
export function wholeMonthsBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from)
  const b = parseLocalDate(to)
  let months = (b.year - a.year) * 12 + (b.month - a.month)
  if (b.day < a.day && b.day < daysInMonth(b.year, b.month)) months -= 1
  return Math.max(0, months)
}
