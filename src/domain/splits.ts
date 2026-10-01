/**
 * Compras divididas entre categorías (ver docs/FORMULAS.md §23).
 *
 * Una compra dividida sigue siendo UN movimiento (una cuenta, una fecha, un importe, una
 * huella de importación). Las líneas solo reparten ese importe entre categorías:
 *   - Saldos, proyecciones y disponible usan el movimiento (una sola vez).
 *   - Reportes, límites y búsquedas por categoría usan las líneas.
 * Una devolución de una compra dividida puede repartirse entre sus categorías sin superar
 * lo que queda por devolver en cada una.
 */
import { sumMinor } from './money'
import type { AppData, SplitLine, Transaction } from './types'

export const MAX_SPLIT_LINES = 20

export interface CategoryAmount {
  categoryId: string
  amountMinor: number
}

/** Reparto por categoría de un gasto o devolución (una línea si no está dividido). */
export function categoryAllocations(tx: Pick<Transaction, 'categoryId' | 'amountMinor' | 'splits' | 'kind'>): CategoryAmount[] {
  if (tx.splits && tx.splits.length > 0) return tx.splits.map((l) => ({ categoryId: l.categoryId, amountMinor: l.amountMinor }))
  return [{ categoryId: tx.categoryId ?? (tx.kind === 'income' ? 'other_income' : 'other_expense'), amountMinor: tx.amountMinor }]
}

/** Todas las categorías de un movimiento (para buscar y filtrar). */
export function txCategoryIds(tx: Pick<Transaction, 'categoryId' | 'splits'>): string[] {
  const ids = tx.splits?.length ? tx.splits.map((l) => l.categoryId) : tx.categoryId ? [tx.categoryId] : []
  return [...new Set(ids)]
}

export function isSplit(tx: Pick<Transaction, 'splits'>): boolean {
  return !!tx.splits && tx.splits.length > 0
}

/** Diferencia entre el total y la suma de las líneas (0 = cuadra; > 0 falta asignar; < 0 sobra). */
export function splitDifference(totalMinor: number, lines: Pick<SplitLine, 'amountMinor'>[]): number {
  return totalMinor - sumMinor(lines.map((l) => l.amountMinor))
}

/**
 * Lo que queda por devolver en cada categoría de una compra dividida:
 *   restante(c) = línea(c) − Σ devoluciones repartidas en c
 * Una devolución sin reparto se cuenta en su propia categoría (como siempre).
 */
export function refundableByCategory(data: Pick<AppData, 'transactions'>, original: Transaction, excludeRefundId?: string): Map<string, number> {
  const remaining = new Map<string, number>()
  for (const a of categoryAllocations(original)) remaining.set(a.categoryId, (remaining.get(a.categoryId) ?? 0) + a.amountMinor)
  for (const r of data.transactions) {
    if (r.kind !== 'refund' || r.refundOfId !== original.id || r.id === excludeRefundId) continue
    for (const a of categoryAllocations(r)) {
      if (remaining.has(a.categoryId)) remaining.set(a.categoryId, remaining.get(a.categoryId)! - a.amountMinor)
    }
  }
  return remaining
}

/**
 * Reparto de una devolución cuando se puede deducir sin adivinar:
 *  - devuelve TODO lo pendiente → cada categoría recibe su pendiente;
 *  - solo una categoría tiene pendiente y alcanza → esa categoría.
 * En otro caso devuelve null y la interfaz pide a la persona que lo reparta.
 */
export function inferRefundSplit(data: Pick<AppData, 'transactions'>, original: Transaction, amountMinor: number, refundId?: string): CategoryAmount[] | null {
  if (!isSplit(original)) return null
  const pending = [...refundableByCategory(data, original, refundId)].filter(([, v]) => v > 0).map(([categoryId, v]) => ({ categoryId, amountMinor: v }))
  const total = sumMinor(pending.map((p) => p.amountMinor))
  if (amountMinor === total && pending.length > 0) return pending
  if (pending.length === 1 && amountMinor <= pending[0]!.amountMinor) return [{ categoryId: pending[0]!.categoryId, amountMinor }]
  return null
}
