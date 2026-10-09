/**
 * Acciones en lote sobre movimientos (D4): cambiar categoría y etiquetar. Cada acción es UNA
 * operación (una sola entrada en el historial) y todo o nada: si un movimiento no pasa la
 * validación, no se cambia ninguno. Las compras divididas y los movimientos sin categoría
 * (transferencias, ajustes) no se recategorizan: se saltan y se cuentan en `skipped`.
 */
import { saveTransaction, type OpContext, type OpResult } from './operations'
import type { AppData, Transaction } from './types'

export interface BulkResult {
  changed: number
  skipped: number
}

function draftOf(tx: Transaction) {
  const { createdAt: _c, updatedAt: _u, currency: _cur, realizedAt: _r, receiptUri: _ri, ...rest } = tx
  void _c
  void _u
  void _cur
  void _r
  void _ri
  return rest
}

export function recategorizeTransactions(data: AppData, ids: readonly string[], categoryId: string, ctx: OpContext): OpResult<BulkResult> {
  let current = data
  let changed = 0
  let skipped = 0
  for (const id of ids) {
    const tx = current.transactions.find((x) => x.id === id)
    if (!tx) return { ok: false, issues: [{ path: `ids.${id}`, code: 'notFound' }] }
    if (tx.kind === 'transfer' || tx.kind === 'adjustment' || (tx.splits && tx.splits.length > 0)) {
      skipped++
      continue
    }
    if (tx.categoryId === categoryId) continue
    const r = saveTransaction(current, { ...draftOf(tx), categoryId }, ctx)
    if (!r.ok) return r
    current = r.data
    changed++
  }
  return changed === 0 ? { ok: true, data, value: { changed, skipped }, unchanged: true } : { ok: true, data: current, value: { changed, skipped } }
}

/**
 * Restaura categorías por id (deshacer de «Cambiar categoría»): cada entrada fija la categoría
 * exacta que tenía el movimiento. Todo o nada; ids ausentes fallan.
 */
export function setCategoriesEach(data: AppData, entries: readonly { id: string; categoryId: string | undefined }[], ctx: OpContext): OpResult<BulkResult> {
  let current = data
  let changed = 0
  for (const { id, categoryId } of entries) {
    const tx = current.transactions.find((x) => x.id === id)
    if (!tx) return { ok: false, issues: [{ path: `ids.${id}`, code: 'notFound' }] }
    if ((tx.categoryId ?? undefined) === categoryId) continue
    const r = saveTransaction(current, { ...draftOf(tx), categoryId }, ctx)
    if (!r.ok) return r
    current = r.data
    changed++
  }
  return changed === 0 ? { ok: true, data, value: { changed, skipped: 0 }, unchanged: true } : { ok: true, data: current, value: { changed, skipped: 0 } }
}

/** Restaura las etiquetas exactas por id (deshacer de «Etiquetar»). Todo o nada. */
export function setTagsEach(data: AppData, entries: readonly { id: string; tagIds: readonly string[] }[], ctx: OpContext): OpResult<BulkResult> {
  let current = data
  let changed = 0
  for (const { id, tagIds } of entries) {
    const tx = current.transactions.find((x) => x.id === id)
    if (!tx) return { ok: false, issues: [{ path: `ids.${id}`, code: 'notFound' }] }
    const had = tx.tagIds ?? []
    if (had.length === tagIds.length && had.every((t, i) => t === tagIds[i])) continue
    const r = saveTransaction(current, { ...draftOf(tx), tagIds: [...tagIds] }, ctx)
    if (!r.ok) return r
    current = r.data
    changed++
  }
  return changed === 0 ? { ok: true, data, value: { changed, skipped: 0 }, unchanged: true } : { ok: true, data: current, value: { changed, skipped: 0 } }
}

/** Añade etiquetas (no quita las que ya tenía); etiquetas inexistentes se ignoran. */
export function tagTransactions(data: AppData, ids: readonly string[], tagIds: readonly string[], ctx: OpContext): OpResult<BulkResult> {
  const valid = tagIds.filter((t) => data.tags.some((x) => x.id === t))
  let current = data
  let changed = 0
  for (const id of ids) {
    const tx = current.transactions.find((x) => x.id === id)
    if (!tx) return { ok: false, issues: [{ path: `ids.${id}`, code: 'notFound' }] }
    const next = Array.from(new Set([...(tx.tagIds ?? []), ...valid]))
    if (next.length === (tx.tagIds ?? []).length) continue
    const r = saveTransaction(current, { ...draftOf(tx), tagIds: next }, ctx)
    if (!r.ok) return r
    current = r.data
    changed++
  }
  return changed === 0 ? { ok: true, data, value: { changed, skipped: 0 }, unchanged: true } : { ok: true, data: current, value: { changed, skipped: 0 } }
}
