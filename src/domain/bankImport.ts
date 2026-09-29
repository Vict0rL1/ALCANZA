/**
 * Importar movimientos desde un archivo CSV descargado del banco.
 *
 * Todo ocurre en el dispositivo: el archivo no se envía a ningún sitio.
 * Nada se guarda hasta que la persona revisa la vista previa y confirma.
 *
 * Duplicados (ver docs/FORMULAS.md §11):
 * - Cada fila recibe una huella `importRef` = cuenta + fecha + importe con signo +
 *   descripción normalizada + nº de repetición dentro del archivo. Si ya existe un
 *   movimiento con esa huella, la fila es un duplicado EXACTO y no se importa
 *   (importar dos veces el mismo archivo no crea nada nuevo).
 * - Si hay un movimiento realizado de la misma cuenta, el mismo tipo y el mismo
 *   importe con fecha a ±3 días (y sin huella de importación), la fila es un
 *   POSIBLE duplicado: se muestra desmarcada para que la persona decida.
 */
import { addDays, isValidLocalDate, toLocalDate, daysInMonth } from './dates'
import { MAX_AMOUNT_MINOR, parseMoney } from './money'
import type { AppData, LocalDate } from './types'

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5000
export const POSSIBLE_DUPLICATE_WINDOW_DAYS = 3
const DESCRIPTION_MAX = 200

/* ------------------------------------------------------------------ */
/* Lectura del CSV                                                     */
/* ------------------------------------------------------------------ */

export type CsvDelimiter = ',' | ';' | '\t'

/** Elige el separador que aparece más veces fuera de comillas en las primeras líneas. */
export function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.slice(0, 4000)
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 }
  let inQuotes = false
  for (const ch of sample) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) counts[ch]++
  }
  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t'
  return counts[';'] > counts[','] ? ';' : ','
}

/**
 * Convierte el texto en filas de celdas. Admite comillas dobles (con "" como
 * comilla escapada), saltos de línea dentro de comillas, CRLF y BOM inicial.
 * Las filas totalmente vacías se descartan.
 */
export function parseCsv(input: string, delimiter: CsvDelimiter = detectDelimiter(input)): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  const pushRow = () => {
    row.push(cell)
    if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()))
    row = []
    cell = ''
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else inQuotes = false
      } else cell += ch
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else cell += ch
  }
  if (cell !== '' || row.length) pushRow()
  return rows
}

/* ------------------------------------------------------------------ */
/* Columnas                                                            */
/* ------------------------------------------------------------------ */

export interface ColumnMapping {
  date: number
  description: number
  /** Una sola columna con signo (−gasto, +ingreso)… */
  amount?: number
  /** …o dos columnas: cargos (gastos) y abonos (ingresos). */
  debit?: number
  credit?: number
}

const HEADER_HINTS: Record<'date' | 'description' | 'amount' | 'debit' | 'credit', RegExp> = {
  date: /^(fecha|date|fecha de operaci[oó]n|transaction date|posted date|posting date|date de l'op[ée]ration)/i,
  description: /(descripci[oó]n|concepto|description|detalle|details|memo|payee|libell[ée]|merchant|comercio|narrative)/i,
  amount: /^(importe|monto|amount|montant|cantidad|valor)/i,
  debit: /(cargo|d[ée]bito|debit|withdrawal|retiro|salida|egreso|money out|paid out)/i,
  credit: /(abono|cr[ée]dito|credit|deposit|dep[oó]sito|entrada|ingreso|money in|paid in)/i,
}

function findColumn(header: string[], hint: RegExp, taken: Set<number>): number | undefined {
  const idx = header.findIndex((h, i) => !taken.has(i) && hint.test(h))
  return idx >= 0 ? idx : undefined
}

/**
 * Propone columnas a partir de la cabecera. Devuelve `null` si no reconoce al menos
 * fecha e importe (la persona las elige a mano).
 */
export function guessMapping(header: string[]): ColumnMapping | null {
  const taken = new Set<number>()
  const take = (i: number | undefined) => {
    if (i !== undefined) taken.add(i)
    return i
  }
  const date = take(findColumn(header, HEADER_HINTS.date, taken))
  const amount = take(findColumn(header, HEADER_HINTS.amount, taken))
  const debit = amount === undefined ? take(findColumn(header, HEADER_HINTS.debit, taken)) : undefined
  const credit = amount === undefined ? take(findColumn(header, HEADER_HINTS.credit, taken)) : undefined
  const description = take(findColumn(header, HEADER_HINTS.description, taken))
  if (date === undefined) return null
  if (amount === undefined && (debit === undefined || credit === undefined)) return null
  const fallbackDescription = header.findIndex((_, i) => !taken.has(i))
  return {
    date,
    description: description ?? (fallbackDescription >= 0 ? fallbackDescription : date),
    ...(amount !== undefined ? { amount } : { debit, credit }),
  }
}

/** ¿Parece una cabecera? (ninguna celda es una fecha ni un importe). */
export function looksLikeHeader(row: string[]): boolean {
  return row.every((c) => c === '' || (parseBankDate(c, 'ymd') === null && parseBankDate(c, 'dmy') === null && !/^[-−+]?[$€£]?\s?\d[\d.,\s]*$/.test(c)))
}

/* ------------------------------------------------------------------ */
/* Fechas                                                              */
/* ------------------------------------------------------------------ */

/** Orden de día/mes en el archivo. AAAA-MM-DD se reconoce siempre. */
export type BankDateFormat = 'ymd' | 'dmy' | 'mdy'

const MONTHS: Record<string, number> = {
  jan: 1, ene: 1, feb: 2, mar: 3, apr: 4, abr: 4, may: 5, jun: 6, jul: 7,
  aug: 8, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dec: 12, dic: 12,
}

function safeDate(y: number, m: number, d: number): LocalDate | null {
  if (y < 100) y += 2000
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2999 || d > daysInMonth(y, m)) return null
  const date = toLocalDate(y, m, d)
  return isValidLocalDate(date) ? date : null
}

/**
 * Lee una fecha del banco. Acepta '2026-09-28', '2026/09/28', '20260928',
 * '28/09/2026' o '09/28/2026' (según `format`), con '/', '-' o '.', y '28 Sep 2026'.
 */
export function parseBankDate(value: string, format: BankDateFormat): LocalDate | null {
  const s = value.trim().replace(/[T\s]\d{1,2}:\d{2}.*$/, '')
  const nums = (m: RegExpExecArray) => m.slice(1).map((x) => Number(x))
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (m) {
    const [y = 0, mo = 0, d = 0] = nums(m)
    return safeDate(y, mo, d)
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s)
  if (m) {
    const [a = 0, b = 0, y = 0] = nums(m)
    return format === 'mdy' ? safeDate(y, a, b) : safeDate(y, b, a)
  }
  m = /^(\d{1,2})[\s-]([a-zA-Z]{3})[a-zA-Z]*\.?[\s-](\d{2}|\d{4})$/.exec(s)
  if (m) {
    const month = MONTHS[(m[2] ?? '').toLowerCase()]
    return month ? safeDate(Number(m[3]), month, Number(m[1])) : null
  }
  return null
}

/**
 * Formatos de fecha con los que TODAS las fechas de la columna son válidas.
 * Si quedan 'dmy' y 'mdy' (por ejemplo, todas con día ≤ 12), la persona elige.
 */
export function possibleDateFormats(values: string[]): BankDateFormat[] {
  const formats: BankDateFormat[] = ['dmy', 'mdy']
  const nonEmpty = values.filter((v) => v.trim() !== '')
  if (nonEmpty.length && nonEmpty.every((v) => /^\d{4}/.test(v.trim()) || /[a-zA-Z]{3}/.test(v))) {
    return nonEmpty.every((v) => parseBankDate(v, 'ymd') !== null) ? ['ymd'] : []
  }
  return formats.filter((f) => nonEmpty.every((v) => parseBankDate(v, f) !== null))
}

/* ------------------------------------------------------------------ */
/* Vista previa                                                        */
/* ------------------------------------------------------------------ */

export interface ImportOptions {
  accountId: string
  mapping: ColumnMapping
  hasHeader: boolean
  dateFormat: BankDateFormat
  /** Algunos bancos (sobre todo tarjetas) muestran las compras en positivo. */
  invertSign: boolean
  /** Formato numérico de Ajustes (decide "1,234" vs "1.234"). */
  locale: string
  today: LocalDate
}

export type ImportRowError = 'date' | 'amount' | 'zero' | 'future' | 'tooLarge'

export type ImportRowStatus = 'new' | 'duplicate' | 'possibleDuplicate' | 'error'

export interface ImportRow {
  /** Número de fila en el archivo (empezando en 1, contando la cabecera). */
  line: number
  status: ImportRowStatus
  error?: ImportRowError
  date?: LocalDate
  kind?: 'income' | 'expense'
  amountMinor?: number
  description: string
  importRef?: string
  /** Movimiento existente que coincide (duplicado exacto o posible). */
  matchId?: string
  /** Fecha anterior o igual a la del saldo de referencia de la cuenta. */
  anchorRelation?: 'before' | 'sameDay' | 'after'
}

export interface ImportPreview {
  rows: ImportRow[]
  counts: Record<ImportRowStatus, number>
  tooManyRows: boolean
}

/** Minúsculas, sin acentos y con espacios simples: "  CAFÉ  Central " → "cafe central". */
export function normalizeDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function signedAmount(cells: string[], mapping: ColumnMapping, currency: string, locale: string): { ok: true; value: number } | { ok: false; error: ImportRowError } {
  const read = (i: number | undefined) => {
    const raw = (i === undefined ? '' : (cells[i] ?? '')).replace(/^\((.*)\)$/, '-$1')
    if (raw.trim() === '') return { ok: true as const, minor: 0, empty: true }
    const r = parseMoney(raw.replace(/^\+/, ''), currency, locale, { allowNegative: true, allowZero: true })
    return r.ok ? { ok: true as const, minor: r.minor, empty: false } : { ok: false as const, tooLarge: r.error === 'tooLarge' }
  }
  if (mapping.amount !== undefined) {
    const r = read(mapping.amount)
    if (!r.ok) return { ok: false, error: r.tooLarge ? 'tooLarge' : 'amount' }
    if (r.empty) return { ok: false, error: 'amount' }
    return { ok: true, value: r.minor }
  }
  const debit = read(mapping.debit)
  const credit = read(mapping.credit)
  if (!debit.ok || !credit.ok) return { ok: false, error: (!debit.ok && debit.tooLarge) || (!credit.ok && credit.tooLarge) ? 'tooLarge' : 'amount' }
  if (debit.empty && credit.empty) return { ok: false, error: 'amount' }
  // Los cargos pueden venir con o sin signo: siempre restan.
  return { ok: true, value: Math.abs(credit.minor) - Math.abs(debit.minor) }
}

/**
 * Analiza el archivo SIN tocar los datos: cada fila queda como nueva, duplicada,
 * posible duplicado o con error.
 */
export function previewImport(table: string[][], data: AppData, options: ImportOptions): ImportPreview {
  const account = data.accounts.find((a) => a.id === options.accountId)
  const body = options.hasHeader ? table.slice(1) : table
  const tooManyRows = body.length > MAX_IMPORT_ROWS
  const limited = body.slice(0, MAX_IMPORT_ROWS)
  const currency = data.settings.currency

  const existingRefs = new Map<string, string>()
  for (const tx of data.transactions) if (tx.importRef) existingRefs.set(tx.importRef, tx.id)
  // Candidatos a posible duplicado: movimientos realizados de la cuenta registrados a mano.
  const candidates = data.transactions.filter(
    (tx) => tx.status === 'realized' && !tx.importRef && tx.accountId === options.accountId && (tx.kind === 'income' || tx.kind === 'expense'),
  )
  const usedCandidates = new Set<string>()
  const repeats = new Map<string, number>()

  const rows: ImportRow[] = limited.map((cells, i) => {
    const line = i + 1 + (options.hasHeader ? 1 : 0)
    const description = (cells[options.mapping.description] ?? '').replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX)
    const date = parseBankDate(cells[options.mapping.date] ?? '', options.dateFormat)
    if (!date) return { line, status: 'error', error: 'date', description }
    const amount = signedAmount(cells, options.mapping, currency, options.locale)
    if (!amount.ok) return { line, status: 'error', error: amount.error, date, description }
    const signed = options.invertSign ? -amount.value : amount.value
    if (signed === 0) return { line, status: 'error', error: 'zero', date, description }
    const amountMinor = Math.abs(signed)
    if (amountMinor > MAX_AMOUNT_MINOR) return { line, status: 'error', error: 'tooLarge', date, description }
    if (date > options.today) return { line, status: 'error', error: 'future', date, description }
    const kind = signed > 0 ? 'income' : 'expense'

    const key = `${options.accountId}|${date}|${signed}|${normalizeDescription(description)}`
    const n = (repeats.get(key) ?? 0) + 1
    repeats.set(key, n)
    const importRef = `${key}|${n}`
    const anchorRelation = !account ? undefined : date < account.anchor.date ? 'before' : date === account.anchor.date ? 'sameDay' : 'after'
    const base = { line, date, kind, amountMinor, description, importRef, anchorRelation } as const

    const exact = existingRefs.get(importRef)
    if (exact) return { ...base, status: 'duplicate', matchId: exact }
    const match = candidates.find(
      (tx) =>
        !usedCandidates.has(tx.id) &&
        tx.kind === kind &&
        tx.amountMinor === amountMinor &&
        tx.date >= addDays(date, -POSSIBLE_DUPLICATE_WINDOW_DAYS) &&
        tx.date <= addDays(date, POSSIBLE_DUPLICATE_WINDOW_DAYS),
    )
    if (match) {
      usedCandidates.add(match.id)
      return { ...base, status: 'possibleDuplicate', matchId: match.id }
    }
    return { ...base, status: 'new' }
  })

  const counts: Record<ImportRowStatus, number> = { new: 0, duplicate: 0, possibleDuplicate: 0, error: 0 }
  for (const r of rows) counts[r.status]++
  return { rows, counts, tooManyRows }
}

/** Filas que se ofrecen marcadas por defecto: solo las nuevas. */
export function defaultSelection(preview: ImportPreview): Set<number> {
  return new Set(preview.rows.filter((r) => r.status === 'new').map((r) => r.line))
}

export function isImportable(row: ImportRow): row is ImportRow & Required<Pick<ImportRow, 'date' | 'kind' | 'amountMinor' | 'importRef'>> {
  return row.status !== 'error' && row.status !== 'duplicate' && !!row.date && !!row.kind && !!row.amountMinor && !!row.importRef
}
