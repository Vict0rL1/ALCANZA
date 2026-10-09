import { describe, expect, it } from 'vitest'
import { accountBalance } from './balances'
import { computeBudget } from './budget'
import { periodSummary } from './insights'
import { planProgress } from './plans'
import { deleteTransaction, importTransactions, restoreFromTrash, saveTransaction, type TransactionDraft } from './operations'
import { projectBalance } from './projection'
import { buildSearchIndex, search } from './search'
import { inferRefundSplit, refundableByCategory, txCategoryIds } from './splits'
import type { AppData, SplitLine } from './types'
import { validateAppData } from '../storage/backup'
import { baseData, ctx, NOW, TODAY } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r as { issues: { code: string }[] }).issues.map((i) => i.code))

// Compra de $120: supermercado 75, hogar (vivienda) 30, ropa (compras) 15. Saldo inicial 1000.
const lines: SplitLine[] = [
  { id: 'l1', categoryId: 'groceries', amountMinor: 7500 },
  { id: 'l2', categoryId: 'housing', amountMinor: 3000, note: 'Escoba' },
  { id: 'l3', categoryId: 'shopping', amountMinor: 1500 },
]
const purchase: TransactionDraft = { id: 'buy', kind: 'expense', status: 'realized', amountMinor: 12000, date: TODAY, accountId: 'main', categoryId: 'groceries', note: 'Walmart', splits: lines }
const withPurchase = () => ok(saveTransaction(baseData(), purchase, ctx)).data

describe('compras divididas: guardar y validar', () => {
  it('un único movimiento cuyo saldo baja una sola vez; categoría principal = 1.ª línea', () => {
    const d = withPurchase()
    expect(d.transactions).toHaveLength(1)
    expect(d.transactions[0]).toMatchObject({ categoryId: 'groceries', amountMinor: 12000 })
    expect(accountBalance(d, d.accounts[0]!).balanceMinor).toBe(100000 - 12000)
    expect(computeBudget(d, TODAY).spendableMinor).toBe(88000)
    expect(projectBalance(d, TODAY).endMinor).toBe(88000)
  })

  it('rechaza una diferencia de un centavo (en ambos sentidos) y pide al menos dos líneas', () => {
    const short = saveTransaction(baseData(), { ...purchase, splits: [lines[0]!, lines[1]!, { ...lines[2]!, amountMinor: 1499 }] }, ctx)
    expect(short.ok ? null : short.issues).toEqual([{ path: 'splits', code: 'splitMismatch', params: { differenceMinor: 1 } }])
    const over = saveTransaction(baseData(), { ...purchase, splits: [lines[0]!, lines[1]!, { ...lines[2]!, amountMinor: 1501 }] }, ctx)
    expect(over.ok ? null : over.issues).toEqual([{ path: 'splits', code: 'splitMismatch', params: { differenceMinor: -1 } }])
    expect(codes(saveTransaction(baseData(), { ...purchase, amountMinor: 7500, splits: [lines[0]!] }, ctx))).toEqual(['splitTooFew'])
  })

  it('no se pueden dividir transferencias ni ingresos', () => {
    const d = baseData({ accounts: [baseData().accounts[0]!, { ...baseData().accounts[0]!, id: 'sav', name: 'Ahorro' }] })
    expect(codes(saveTransaction(d, { id: 't', kind: 'transfer', status: 'realized', amountMinor: 12000, date: TODAY, accountId: 'main', toAccountId: 'sav', splits: lines }, ctx))).toContain('invalidValue')
    expect(codes(saveTransaction(d, { id: 'i', kind: 'income', status: 'realized', amountMinor: 12000, date: TODAY, accountId: 'main', categoryId: 'salary', splits: lines }, ctx))).toContain('invalidValue')
  })

  it('cambiar el total sin ajustar las líneas se bloquea; quitar la división conserva el movimiento', () => {
    const d = withPurchase()
    expect(codes(saveTransaction(d, { ...purchase, amountMinor: 13000 }, ctx))).toEqual(['splitMismatch'])
    const plain = ok(saveTransaction(d, { ...purchase, splits: undefined, categoryId: 'groceries' }, ctx)).data
    expect(plain.transactions[0]).toMatchObject({ id: 'buy', amountMinor: 12000, categoryId: 'groceries', note: 'Walmart' })
    expect(plain.transactions[0]!.splits).toBeUndefined()
  })
})

describe('compras divididas: reportes, límites y búsqueda', () => {
  it('cada línea cuenta en su categoría y el total no se duplica', () => {
    const s = periodSummary(withPurchase(), '2026-09-01', '2026-09-30')
    expect(s.netSpendingMinor).toBe(12000)
    expect(Object.fromEntries(s.categories.map((c) => [c.categoryId, c.netMinor]))).toEqual({ groceries: 7500, housing: 3000, shopping: 1500 })
    const plan = { id: 'p', kind: 'limit' as const, name: '', categoryIds: ['shopping'], amountMinor: 1000, currency: 'CAD' as const, periodType: 'month' as const, startDate: '2026-09-01', endDate: '2026-09-30', recurring: true, status: 'active' as const, alertAt80: true, alertAt100: true, createdAt: NOW, updatedAt: NOW }
    expect(planProgress(withPurchase(), plan, '2026-09-28')).toMatchObject({ spentMinor: 1500, state: 'over' })
  })

  it('se encuentra por cualquiera de sus categorías o notas de línea', () => {
    const d = withPurchase()
    const index = buildSearchIndex(d, (id) => ({ groceries: 'Supermercado', housing: 'Vivienda', shopping: 'Compras' })[id] ?? id)
    for (const q of ['vivienda', 'compras', 'escoba']) expect(search(index, q).find((g) => g.kind === 'transaction')?.items.map((i) => i.id)).toEqual(['buy'])
    expect(txCategoryIds(d.transactions[0]!)).toEqual(['groceries', 'housing', 'shopping'])
  })
})

describe('compras divididas: devoluciones', () => {
  const refund = (over: Partial<TransactionDraft> = {}): TransactionDraft => ({ id: 'ref', kind: 'refund', status: 'realized', amountMinor: 2000, date: TODAY, accountId: 'main', categoryId: 'shopping', refundOfId: 'buy', ...over })

  it('una devolución parcial se reparte sin superar lo pendiente de cada categoría', () => {
    let d = withPurchase()
    d = ok(saveTransaction(d, refund({ splits: [{ id: 'r1', categoryId: 'shopping', amountMinor: 1500 }, { id: 'r2', categoryId: 'housing', amountMinor: 500 }] }), ctx)).data
    expect(Object.fromEntries(refundableByCategory(d, d.transactions[0]!))).toEqual({ groceries: 7500, housing: 2500, shopping: 0 })
    const s = periodSummary(d, '2026-09-01', '2026-09-30')
    expect(Object.fromEntries(s.categories.map((c) => [c.categoryId, c.netMinor]))).toEqual({ groceries: 7500, housing: 2500, shopping: 0 })
    expect(s.netSpendingMinor).toBe(10000)
    // El dinero devuelto entra una sola vez y no es un ingreso.
    expect(accountBalance(d, d.accounts[0]!).balanceMinor).toBe(100000 - 12000 + 2000)
    expect(s.incomeMinor).toBe(0)
    // Más ropa de la que queda: rechazado.
    const extra = saveTransaction(d, refund({ id: 'ref2', amountMinor: 100, categoryId: 'shopping', splits: [{ id: 'x', categoryId: 'shopping', amountMinor: 100 }] }), ctx)
    expect(codes(extra)).toEqual(['refundExceeds'])
  })

  it('el reparto se deduce solo si no hay ambigüedad', () => {
    const d = withPurchase()
    const original = d.transactions[0]!
    expect(inferRefundSplit(d, original, 12000)).toEqual([
      { categoryId: 'groceries', amountMinor: 7500 },
      { categoryId: 'housing', amountMinor: 3000 },
      { categoryId: 'shopping', amountMinor: 1500 },
    ])
    expect(inferRefundSplit(d, original, 1500)).toBeNull()
  })

  it('cambiar la compra de forma que una devolución quede inválida se bloquea', () => {
    let d = withPurchase()
    d = ok(saveTransaction(d, refund({ splits: [{ id: 'r1', categoryId: 'shopping', amountMinor: 1500 }, { id: 'r2', categoryId: 'housing', amountMinor: 500 }] }), ctx)).data
    expect(codes(saveTransaction(d, { ...purchase, splits: undefined }, ctx))).toEqual(['refundExceeds'])
  })
})

describe('compras divididas: papelera, copias e importación', () => {
  it('eliminar y restaurar la compra conserva sus líneas y el reparto de su devolución', () => {
    let d = withPurchase()
    d = ok(saveTransaction(d, { id: 'ref', kind: 'refund', status: 'realized', amountMinor: 1500, date: TODAY, accountId: 'main', categoryId: 'shopping', refundOfId: 'buy', splits: [{ id: 'r1', categoryId: 'shopping', amountMinor: 1500 }] }, ctx)).data
    const before = periodSummary(d, '2026-09-01', '2026-09-30')
    const trashed = ok(deleteTransaction(d, 'buy', ctx)).data
    // La devolución sigue (el dinero volvió) pero sin vínculo ni reparto; los datos siguen siendo válidos.
    expect(trashed.transactions[0]).toMatchObject({ id: 'ref' })
    expect(trashed.transactions[0]!.splits).toBeUndefined()
    expect(validateAppData(JSON.parse(JSON.stringify(trashed))).ok).toBe(true)
    const restored = ok(restoreFromTrash(trashed, 'buy', ctx)).data
    expect(restored.transactions.find((t) => t.id === 'buy')!.splits).toEqual(lines)
    expect(restored.transactions.find((t) => t.id === 'ref')).toMatchObject({ refundOfId: 'buy', splits: [{ id: 'r1', categoryId: 'shopping', amountMinor: 1500 }] })
    expect(periodSummary(restored, '2026-09-01', '2026-09-30')).toEqual(before)
  })

  it('las líneas viajan en la copia y se validan al importar', () => {
    const d = withPurchase()
    const r = validateAppData(JSON.parse(JSON.stringify(d)))
    expect(r.ok && r.data.transactions[0]!.splits).toEqual(lines)
    const bad = JSON.parse(JSON.stringify(d))
    bad.transactions[0].splits[2].amountMinor = 1499
    expect(validateAppData(bad).ok).toBe(false)
  })

  it('reimportar el CSV después de dividir la compra no la duplica', () => {
    let d = baseData()
    const item = { id: 'imp', kind: 'expense' as const, amountMinor: 12000, date: TODAY, accountId: 'main', categoryId: 'other_expense', note: 'WALMART', importRef: 'main|2026-09-28|-12000|walmart|1' }
    d = ok(importTransactions(d, { items: [item], sameDayAlreadyInBalance: false }, ctx)).data
    d = ok(saveTransaction(d, { ...d.transactions[0]!, splits: lines.map((l) => ({ ...l })) }, ctx)).data
    expect(d.transactions[0]!.importRef).toBe(item.importRef)
    const again = importTransactions(d, { items: [{ ...item, id: 'imp-2' }], sameDayAlreadyInBalance: false }, ctx)
    expect(again.ok && again.data.transactions).toHaveLength(1)
  })
})

describe('compras divididas: sugerencia desde el historial', () => {
  it('reescala el último reparto del mismo comercio sin flotantes y con suma exacta', async () => {
    const { scaleSplit, suggestSplitFromHistory } = await import('./splits')
    const d = withPurchase() // Walmart 120 = 75 + 30 + 15
    // Mismo total: copia exacta.
    expect(suggestSplitFromHistory(d, 'walmart', 12000)!.lines.map((l) => l.amountMinor)).toEqual([7500, 3000, 1500])
    // 100.00: floor(10000×7500/12000)=6250, floor(10000×3000/12000)=2500, floor(10000×1500/12000)=1250 → suma 10000.
    expect(suggestSplitFromHistory(d, 'WALMART', 10000)!.lines.map((l) => l.amountMinor)).toEqual([6250, 2500, 1250])
    // 1.00: 62, 25, 12 = 99 → el centavo restante va a la 1.ª línea: 63, 25, 12.
    expect(scaleSplit([{ categoryId: 'a', amountMinor: 7500 }, { categoryId: 'b', amountMinor: 3000 }, { categoryId: 'c', amountMinor: 1500 }], 12000, 100).map((l) => l.amountMinor)).toEqual([63, 25, 12])
    // Sin antecedentes, sin nota o sin total: nada.
    expect(suggestSplitFromHistory(d, 'Costco', 10000)).toBeNull()
    expect(suggestSplitFromHistory(d, '', 10000)).toBeNull()
    expect(suggestSplitFromHistory(d, 'walmart', null)).toBeNull()
    // No se sugiere a sí misma al editarla.
    expect(suggestSplitFromHistory(d, 'walmart', 12000, 'buy')).toBeNull()
  })
})
