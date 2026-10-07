/**
 * Exportación CSV de movimientos (§7.4): una fila por movimiento, importes en unidades mayores
 * con punto decimal (formato neutro para hojas de cálculo), fechas ISO, UTF-8 con BOM para
 * Excel. Las etiquetas (categoría, cuenta, tipo) las resuelve quien llama, ya traducidas.
 */
import { minorToDecimalString } from './money'
import type { Transaction } from './types'

export interface CsvLabels {
  headers: readonly string[]
  kind: (tx: Transaction) => string
  status: (tx: Transaction) => string
  category: (tx: Transaction) => string
  account: (id: string | undefined) => string
}

function cell(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Signo según el efecto sobre la cuenta de origen: gasto y transferencia negativos; ingreso y devolución positivos. */
export function signedAmount(tx: Transaction): number {
  if (tx.kind === 'income' || tx.kind === 'refund') return tx.amountMinor
  if (tx.kind === 'adjustment') return tx.adjustmentDirection === 'increase' ? tx.amountMinor : -tx.amountMinor
  return -tx.amountMinor
}

export function transactionsToCsv(txs: readonly Transaction[], labels: CsvLabels): string {
  const rows = [labels.headers.map(cell).join(',')]
  for (const tx of txs) {
    rows.push(
      [
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
      ]
        .map(cell)
        .join(','),
    )
  }
  return `﻿${rows.join('\r\n')}\r\n`
}
