/**
 * Dinero en unidades menores enteras (centavos). Nunca se usa punto flotante
 * para sumar, restar o dividir importes.
 */
import type { CurrencyCode, NumberLocale } from './types'

export interface CurrencyInfo {
  code: CurrencyCode
  /** Decimales fijos. Se fijan aquí (no se leen de Intl) para que los datos guardados no cambien de significado. */
  digits: number
}

export const SUPPORTED_CURRENCIES: readonly CurrencyInfo[] = [
  { code: 'CAD', digits: 2 },
  { code: 'USD', digits: 2 },
  { code: 'MXN', digits: 2 },
  { code: 'EUR', digits: 2 },
  { code: 'GBP', digits: 2 },
  { code: 'COP', digits: 2 },
  { code: 'PEN', digits: 2 },
  { code: 'ARS', digits: 2 },
  { code: 'CLP', digits: 0 },
]

/** Límite por importe individual: 10^12 unidades menores (10 000 millones de CAD). */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000

export function isSupportedCurrency(code: string): boolean {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code)
}

export function currencyDigits(code: CurrencyCode): number {
  const info = SUPPORTED_CURRENCIES.find((c) => c.code === code)
  if (!info) throw new Error(`Moneda no soportada: ${code}`)
  return info.digits
}

export function isMinorAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/** Suma enteros verificando que el resultado siga siendo exacto. */
export function sumMinor(values: Iterable<number>): number {
  let total = 0
  for (const v of values) {
    if (!Number.isSafeInteger(v)) throw new Error(`Importe no entero: ${v}`)
    total += v
    if (!Number.isSafeInteger(total)) throw new Error('Desbordamiento al sumar importes')
  }
  return total
}

/** División entera redondeando hacia abajo (también con negativos). */
export function floorDiv(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b === 0) {
    throw new Error('floorDiv requiere enteros y divisor distinto de cero')
  }
  const A = BigInt(a)
  const B = BigInt(b)
  let q = A / B
  if ((A % B !== 0n) && ((A < 0n) !== (B < 0n))) q -= 1n
  return Number(q)
}

/** División entera redondeando hacia arriba (para cuotas de ahorro: así sí se llega a la meta). */
export function ceilDiv(a: number, b: number): number {
  return -floorDiv(-a, b)
}

/** Parte proporcional: floor(a * num / den) sin perder precisión. */
export function mulDivFloor(a: number, num: number, den: number): number {
  if (den === 0) throw new Error('Divisor cero')
  const A = BigInt(a) * BigInt(num)
  const B = BigInt(den)
  let q = A / B
  if ((A % B !== 0n) && ((A < 0n) !== (B < 0n))) q -= 1n
  return Number(q)
}

/** Convierte unidades menores a texto decimal exacto: 123456 → "1234.56". */
export function minorToDecimalString(minor: number, currency: CurrencyCode): string {
  const digits = currencyDigits(currency)
  const negative = minor < 0
  const abs = String(Math.abs(minor))
  if (digits === 0) return (negative ? '-' : '') + abs
  const padded = abs.padStart(digits + 1, '0')
  const intPart = padded.slice(0, padded.length - digits)
  const frac = padded.slice(padded.length - digits)
  return `${negative ? '-' : ''}${intPart}.${frac}`
}

const formatterCache = new Map<string, Intl.NumberFormat>()

function getFormatter(locale: string, currency: string, signDisplay: 'auto' | 'always' | 'exceptZero') {
  const key = `${locale}|${currency}|${signDisplay}`
  let f = formatterCache.get(key)
  if (!f) {
    const digits = currencyDigits(currency)
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay,
    })
    formatterCache.set(key, f)
  }
  return f
}

export interface FormatMoneyOptions {
  /** 'always' muestra "+" en positivos (útil para movimientos). */
  signDisplay?: 'auto' | 'always' | 'exceptZero'
}

/**
 * Formatea sin pasar por flotantes: Intl recibe el texto decimal exacto.
 */
export function formatMoney(
  minor: number,
  currency: CurrencyCode,
  locale: NumberLocale | string,
  options: FormatMoneyOptions = {},
): string {
  const formatter = getFormatter(locale, currency, options.signDisplay ?? 'auto')
  const decimal = minorToDecimalString(minor, currency)
  return formatter.format(decimal as Intl.StringNumericLiteral)
}

/** Separadores del formato elegido (por ejemplo es-ES usa "," para decimales). */
export function localeSeparators(locale: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  const group = parts.find((p) => p.type === 'group')?.value ?? ','
  return { decimal, group }
}

/** Texto para un campo de edición (sin símbolo de moneda ni separador de miles). */
export function minorToInputString(minor: number, currency: CurrencyCode, locale: string): string {
  const { decimal } = localeSeparators(locale)
  return minorToDecimalString(minor, currency).replace('.', decimal)
}

/** "1,234,567" es válido; "12,3,4" no: tras el primer grupo, todos deben tener 3 dígitos. */
function validGrouping(value: string, sep: string): boolean {
  if (!value.includes(sep)) return true
  const groups = value.split(sep)
  const [first, ...rest] = groups
  return !!first && first.length >= 1 && first.length <= 3 && rest.every((g) => g.length === 3)
}

export type ParseMoneyError = 'empty' | 'invalid' | 'tooManyDecimals' | 'negativeNotAllowed' | 'tooLarge' | 'zero'

export type ParseMoneyResult = { ok: true; minor: number } | { ok: false; error: ParseMoneyError; digits: number }

export interface ParseMoneyOptions {
  allowNegative?: boolean
  allowZero?: boolean
}

/**
 * Interpreta lo que escribe una persona: "12,50", "12.50", "1,234.56", "1.234,56", "$ 45".
 *
 * Reglas para decidir cuál es el separador decimal:
 * 1. Si aparecen "," y ".", el último que aparece es el decimal.
 * 2. Si aparece un solo tipo varias veces, es separador de miles ("1,234,567").
 * 3. Si aparece una sola vez seguido de exactamente 3 dígitos, se usa el formato
 *    elegido en Ajustes (o, si la moneda no tiene decimales, se toma como miles).
 * 4. En cualquier otro caso es el separador decimal ("12,5" = 12.50).
 */
export function parseMoney(
  input: string,
  currency: CurrencyCode,
  locale: string,
  options: ParseMoneyOptions = {},
): ParseMoneyResult {
  const digits = currencyDigits(currency)
  const fail = (error: ParseMoneyError): ParseMoneyResult => ({ ok: false, error, digits })

  let s = input.trim().replace(/[\s  '’]/g, '').replace(/[$€£¥]/g, '')
  s = s.replace(/^[A-Z]{2,3}(?=[\d.,\-−])/i, '') // "CA$ 5" o "CAD 5" → "5"
  if (s === '') return fail('empty')

  let negative = false
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true
    s = s.slice(1)
  }
  if (s === '') return fail('invalid')
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return fail('invalid')
  if (negative && !options.allowNegative) return fail('negativeNotAllowed')

  const { decimal: localeDecimal } = localeSeparators(locale)
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let decimalSep: '.' | ',' | null = null

  if (lastDot >= 0 && lastComma >= 0) {
    decimalSep = lastDot > lastComma ? '.' : ','
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const count = s.split(sep).length - 1
    if (count > 1) {
      decimalSep = null
    } else {
      const after = s.length - s.indexOf(sep) - 1
      if (after === 3) {
        decimalSep = digits > 0 && localeDecimal === sep ? sep : null
      } else {
        decimalSep = sep
      }
    }
  }

  let intPart: string
  let fracPart = ''
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep)
    intPart = s.slice(0, idx)
    fracPart = s.slice(idx + 1)
    if (/[.,]/.test(fracPart)) return fail('invalid')
    const groupSep = decimalSep === '.' ? ',' : '.'
    if (intPart.includes(decimalSep)) return fail('invalid')
    if (!validGrouping(intPart, groupSep)) return fail('invalid')
    intPart = intPart.split(groupSep).join('')
  } else {
    const groupSep = s.includes('.') ? '.' : ','
    if (s.includes('.') && s.includes(',')) return fail('invalid')
    if (!validGrouping(s, groupSep)) return fail('invalid')
    intPart = s.split(groupSep).join('')
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return fail('invalid')
  if (intPart === '' && fracPart === '') return fail('invalid')
  if (fracPart.length > digits) return fail('tooManyDecimals')

  const normalized = (intPart === '' ? '0' : intPart) + fracPart.padEnd(digits, '0')
  const big = BigInt(normalized)
  if (big > BigInt(MAX_AMOUNT_MINOR)) return fail('tooLarge')
  const minor = Number(big) * (negative ? -1 : 1)
  if (minor === 0 && !options.allowZero) return fail('zero')
  return { ok: true, minor: minor === 0 ? 0 : minor }
}
