/**
 * Índices de una lista de movimientos (por id y devoluciones de cada compra), calculados una
 * vez por lista y reutilizados mientras la lista sea la misma (los datos son inmutables).
 *
 * Por qué: validar una copia de 50.000 movimientos buscaba, por cada devolución, su compra y
 * sus otras devoluciones recorriendo la lista entera (cuadrático). Medido en
 * docs/PERFORMANCE.md. Las reglas no cambian: solo cómo se encuentran los registros.
 */
import type { Transaction } from './types'

export interface TxIndex {
  byId: Map<string, Transaction>
  /** Devoluciones de cada compra, en el orden de la lista. */
  refundsOf: Map<string, Transaction[]>
}

const cache = new WeakMap<readonly Transaction[], TxIndex>()

export function txIndex(transactions: readonly Transaction[]): TxIndex {
  let index = cache.get(transactions)
  if (index) return index
  const byId = new Map<string, Transaction>()
  const refundsOf = new Map<string, Transaction[]>()
  for (const t of transactions) {
    // Con ids repetidos (datos dañados) gana el primero, como `find`.
    if (!byId.has(t.id)) byId.set(t.id, t)
    if (t.kind === 'refund' && t.refundOfId) {
      const list = refundsOf.get(t.refundOfId)
      if (list) list.push(t)
      else refundsOf.set(t.refundOfId, [t])
    }
  }
  index = { byId, refundsOf }
  cache.set(transactions, index)
  return index
}
