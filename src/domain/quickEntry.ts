/**
 * Ayudas del registro rápido. Solo SUGIEREN valores del formulario a partir de lo ya
 * registrado; nunca crean ni cambian movimientos.
 */
import { categoriesForKind } from './categories'
import type { AppData, Transaction, TxKind } from './types'

/** Movimientos más recientes primero (por momento de registro). Una pasada, sin ordenar todo. */
function latest(data: Pick<AppData, 'transactions'>, keep: (tx: Transaction) => boolean, limit: number): Transaction[] {
  const out: Transaction[] = []
  for (const tx of data.transactions) {
    if (!keep(tx)) continue
    if (out.length >= limit && tx.createdAt <= out[out.length - 1]!.createdAt) continue
    out.push(tx)
    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    if (out.length > limit) out.pop()
  }
  return out
}

/**
 * Últimas categorías distintas usadas para este tipo (incluye las de compras divididas).
 * Excluye las archivadas o eliminadas.
 */
export function recentCategories(data: Pick<AppData, 'transactions' | 'categories' | 'categoryPrefs'>, kind: Exclude<TxKind, 'transfer' | 'adjustment'>, limit = 5): string[] {
  const valid = new Set(categoriesForKind(kind, data.categories, { prefs: data.categoryPrefs }))
  const want: TxKind = kind === 'refund' ? 'expense' : kind
  const recent = latest(data, (tx) => tx.kind === want, 40)
  const out: string[] = []
  for (const tx of recent) {
    const ids = tx.splits?.length ? tx.splits.map((l) => l.categoryId) : tx.categoryId ? [tx.categoryId] : []
    for (const id of ids) {
      if (valid.has(id) && !out.includes(id)) out.push(id)
      if (out.length >= limit) return out
    }
  }
  return out
}

/** Cuenta del último movimiento registrado de este tipo (si sigue existiendo). */
export function lastUsedAccount(data: Pick<AppData, 'transactions' | 'accounts'>, kind: TxKind): string | undefined {
  const [last] = latest(data, (tx) => tx.kind === kind && data.accounts.some((a) => a.id === tx.accountId), 1)
  return last?.accountId
}
