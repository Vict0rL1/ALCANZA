/**
 * Exportación CSV de movimientos (§7.4): una fila por movimiento, importes en unidades mayores
 * con punto decimal (formato neutro para hojas de cálculo), fechas ISO, UTF-8 con BOM para
 * Excel. Las etiquetas (categoría, cuenta, tipo) las resuelve quien llama, ya traducidas.
 */
import { minorToDecimalString } from './money'
import type { Category, Plan, Transaction } from './types'

export interface CsvLabels {
  headers: readonly string[]
  kind: (tx: Transaction) => string
  status: (tx: Transaction) => string
  category: (tx: Transaction) => string
  account: (id: string | undefined) => string
  /** Origen del registro (manual, asistente, atajo…): columna final si se indica. */
  source?: (tx: Transaction) => string
  /** Separador de columnas: «;» cuando el locale usa coma decimal (Excel lo espera así), «,» si no. */
  separator?: ',' | ';'
}

/** Separador según el separador decimal del locale (§7.7 · Exportar datos). */
export function csvSeparatorFor(decimalSeparator: string): ',' | ';' {
  return decimalSeparator === ',' ? ';' : ','
}

function cell(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const BOM = '\uFEFF'

function table(headers: readonly string[], rows: readonly (readonly (string | number | undefined)[])[], sep: ',' | ';'): string {
  return [headers.map(cell).join(sep), ...rows.map((r) => r.map(cell).join(sep))].join('\r\n')
}

/** Signo según el efecto sobre la cuenta de origen: gasto y transferencia negativos; ingreso y devolución positivos. */
export function signedAmount(tx: Transaction): number {
  if (tx.kind === 'income' || tx.kind === 'refund') return tx.amountMinor
  if (tx.kind === 'adjustment') return tx.adjustmentDirection === 'increase' ? tx.amountMinor : -tx.amountMinor
  return -tx.amountMinor
}

export function transactionsToCsv(txs: readonly Transaction[], labels: CsvLabels): string {
  const sep = labels.separator ?? ','
  const rows = txs.map((tx) => [
    tx.date,
    labels.kind(tx),
    labels.status(tx),
    minorToDecimalString(signedAmount(tx), tx.currency),
    tx.currency,
    labels.category(tx),
    labels.account(tx.accountId),
    tx.kind === 'transfer' ? labels.account(tx.toAccountId) : '',
    tx.note ?? '',
    tx.merchant ?? '',
    tx.id,
    ...(labels.source ? [labels.source(tx)] : []),
  ])
  return `${BOM}${table(labels.headers, rows, sep)}\r\n`
}

export interface CategoryCsvLabels {
  headers: readonly string[]
  kind: (c: Category) => string
  group: (c: Category) => string
  name: (c: Category) => string
  yes: string
  no: string
  separator?: ',' | ';'
}

/** Categorías (del sistema y propias) con grupo, tipo, color, icono y estado. */
export function categoriesToCsv(categories: readonly Category[], labels: CategoryCsvLabels): string {
  const rows = categories.map((c) => [c.id, labels.name(c), labels.kind(c), labels.group(c), c.color, c.icon, c.archived ? labels.yes : labels.no, c.isCustom ? labels.yes : labels.no])
  return `${BOM}${table(labels.headers, rows, labels.separator ?? ',')}\r\n`
}

export interface PlanCsvLabels {
  headers: readonly string[]
  name: (p: Plan) => string
  period: (p: Plan) => string
  status: (p: Plan) => string
  categories: (p: Plan) => string
  yes: string
  no: string
  separator?: ',' | ';'
}

/** Planes (límites) con su ciclo, importe, recurrencia y resultado si cerraron. */
export function plansToCsv(plans: readonly Plan[], labels: PlanCsvLabels): string {
  const rows = plans.map((p) => [
    p.id,
    labels.name(p),
    labels.categories(p),
    minorToDecimalString(p.amountMinor, p.currency),
    p.currency,
    labels.period(p),
    p.startDate ?? '',
    p.endDate ?? '',
    p.recurring ? labels.yes : labels.no,
    labels.status(p),
    p.result ? minorToDecimalString(p.result.spentMinor, p.currency) : '',
    p.result ? (p.result.achieved ? labels.yes : labels.no) : '',
  ])
  return `${BOM}${table(labels.headers, rows, labels.separator ?? ',')}\r\n`
}

/** Varias tablas en un solo archivo, separadas por una línea en blanco y un título. */
export function joinCsvSections(sections: readonly { title: string; csv: string }[]): string {
  return `${BOM}${sections.map((s) => `${cell(s.title)}\r\n${s.csv.replace(BOM, '')}`).join('\r\n')}`
}
