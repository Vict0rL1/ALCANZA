/**
 * Formateadores únicos de la interfaz (§2 del master prompt): dinero, números, porcentajes,
 * fechas y fechas relativas. Funciones puras sobre `Intl`; la capa de UI solo las envuelve con
 * los ajustes de la persona. Nunca se formatea un importe por otra vía.
 */
import { daysBetween, localDateToDisplayDate, parseLocalDate } from './dates'
import type { LocalDate, Timestamp } from './types'

export { currencySymbol, formatMoney, MASKED_DIGITS, type FormatMoneyOptions } from './money'

const numberCache = new Map<string, Intl.NumberFormat>()
const dateCache = new Map<string, Intl.DateTimeFormat>()
const relativeCache = new Map<string, Intl.RelativeTimeFormat>()

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let f = numberCache.get(key)
  if (!f) numberCache.set(key, (f = new Intl.NumberFormat(locale, options)))
  return f
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let f = dateCache.get(key)
  if (!f) dateCache.set(key, (f = new Intl.DateTimeFormat(locale, options)))
  return f
}

/** Números sin moneda (recuentos, días, porcentajes ya calculados). */
export function formatNumber(value: number, locale: string, options: { maximumFractionDigits?: number; compact?: boolean } = {}): string {
  return numberFormat(locale, {
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    ...(options.compact ? { notation: 'compact' } : {}),
  }).format(value)
}

/** Fracción 0–1 → «25 %» según el locale. */
export function formatPercent(fraction: number, locale: string, maximumFractionDigits = 0): string {
  return numberFormat(locale, { style: 'percent', maximumFractionDigits }).format(fraction)
}

export type DateStyleOption = 'short' | 'medium' | 'long' | 'iso'

export interface FormatDateOptions {
  weekday?: boolean
  /** Omite el año (p. ej. en listas del año en curso). */
  omitYear?: boolean
}

/** Fecha de calendario (`AAAA-MM-DD`), mostrada en UTC porque es una fecha «pura». */
export function formatDate(date: LocalDate, locale: string, style: DateStyleOption = 'medium', options: FormatDateOptions = {}): string {
  const d = localDateToDisplayDate(date)
  if (style === 'iso') {
    const wd = options.weekday ? `${dateFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(d)} ` : ''
    return `${wd}${date}`
  }
  if (style === 'short') {
    return dateFormat(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', ...(options.weekday ? { weekday: 'short' } : {}) }).format(d)
  }
  return dateFormat(locale, {
    timeZone: 'UTC',
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    ...(options.omitYear ? {} : { year: 'numeric' }),
    ...(options.weekday ? { weekday: style === 'long' ? 'long' : 'short' } : {}),
  }).format(d)
}

/** «octubre de 2026» / «October 2026». */
export function formatMonthYear(date: LocalDate, locale: string): string {
  return dateFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(localDateToDisplayDate(date))
}

/** Marca de tiempo (instante) en la zona horaria de la persona. */
export function formatTimestamp(ts: Timestamp, locale: string, timeZone: string, options: { time?: boolean } = { time: true }): string {
  return dateFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(options.time === false ? {} : { hour: '2-digit', minute: '2-digit' }),
  }).format(new Date(ts))
}

/** Solo la hora de un instante. */
export function formatTime(ts: Timestamp, locale: string, timeZone: string): string {
  return dateFormat(locale, { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
}

/**
 * «hoy», «ayer», «mañana», «hace 3 días», «dentro de 5 días» (según el idioma, vía
 * `Intl.RelativeTimeFormat`). A partir de 30 días de distancia devuelve la fecha completa.
 */
export function formatRelativeDate(date: LocalDate, today: LocalDate, locale: string, style: DateStyleOption = 'medium'): string {
  const diff = daysBetween(today, date)
  if (Math.abs(diff) >= 30) return formatDate(date, locale, style, { omitYear: parseLocalDate(date).year === parseLocalDate(today).year })
  let f = relativeCache.get(locale)
  if (!f) relativeCache.set(locale, (f = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })))
  return f.format(diff, 'day')
}

const displayNamesCache = new Map<string, Intl.DisplayNames>()

/** Nombre de la moneda en el idioma de la interfaz («peso colombiano»), sin claves de i18n. */
export function currencyName(code: string, locale: string): string {
  let d = displayNamesCache.get(locale)
  if (!d) displayNamesCache.set(locale, (d = new Intl.DisplayNames([locale], { type: 'currency', fallback: 'code' })))
  try {
    return d.of(code) ?? code
  } catch {
    return code
  }
}
