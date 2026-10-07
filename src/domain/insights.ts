/**
 * Resumen de un periodo: ingresos y gastos realizados por categoría.
 *
 *   Gasto neto de una categoría = Σ gastos − Σ devoluciones (realizados, en el periodo)
 *   Ingresos                    = Σ ingresos realizados
 *
 * Las transferencias no son ingresos ni gastos (incluidos los pagos de tarjeta).
 * Una compra dividida reparte su importe entre las categorías de sus líneas.
 * Los movimientos previstos no cuentan. Se incluyen todas las cuentas.
 */
import { sumMinor } from './money'
import { categoryAllocations } from './splits'
import type { AppData, LocalDate } from './types'

export interface CategorySpending {
  categoryId: string
  spentMinor: number
  refundedMinor: number
  /** Puede ser negativo si una devolución del periodo supera lo gastado en él. */
  netMinor: number
  count: number
}

export interface PeriodSummary {
  from: LocalDate
  to: LocalDate
  incomeMinor: number
  netSpendingMinor: number
  categories: CategorySpending[]
}

export function periodSummary(data: Pick<AppData, 'transactions'>, from: LocalDate, to: LocalDate): PeriodSummary {
  const inRange = data.transactions.filter((tx) => tx.status === 'realized' && tx.date >= from && tx.date <= to)
  const byCategory = new Map<string, CategorySpending>()
  for (const tx of inRange) {
    if (tx.kind !== 'expense' && tx.kind !== 'refund') continue
    // Compras divididas: cada línea en su categoría (el movimiento cuenta una vez en el total).
    for (const line of categoryAllocations(tx)) {
      const id = line.categoryId
      const entry = byCategory.get(id) ?? { categoryId: id, spentMinor: 0, refundedMinor: 0, netMinor: 0, count: 0 }
      if (tx.kind === 'expense') entry.spentMinor += line.amountMinor
      else entry.refundedMinor += line.amountMinor
      entry.netMinor = entry.spentMinor - entry.refundedMinor
      entry.count += 1
      byCategory.set(id, entry)
    }
  }
  const categories = [...byCategory.values()].sort((a, b) => b.netMinor - a.netMinor || a.categoryId.localeCompare(b.categoryId))
  return {
    from,
    to,
    incomeMinor: sumMinor(inRange.filter((tx) => tx.kind === 'income').map((tx) => tx.amountMinor)),
    netSpendingMinor: sumMinor(categories.map((c) => c.netMinor)),
    categories,
  }
}
