import { describe, expect, it } from 'vitest'
import { accountBalance, spendableBalance } from './balances'
import { previewImport, isImportable } from './bankImport'
import { computeBudget } from './budget'
import { periodSummary } from './insights'
import {
  deleteAccount,
  deleteCategory,
  deleteTransaction,
  importTransactions,
  markOccurrence,
  purgeTrash,
  restoreFromTrash,
} from './operations'
import { planItems } from './planItems'
import { projectBalance } from './projection'
import type { AppData, CustomCategory } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, bill, ctx, deepFreeze, NOW, TODAY, tx } from '../test/fixtures'

const later = { today: TODAY, now: '2026-09-28T18:00:00.000Z' }

function mustOk<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(`rechazado: ${JSON.stringify(r.issues)}`)
  return r
}

describe('papelera: eliminar, restaurar y eliminar definitivamente', () => {
  const data = deepFreeze(baseData({ transactions: [tx({ id: 'coffee', amountMinor: 500, date: TODAY, categoryId: 'dining' })] }))

  it('un movimiento eliminado deja de contar en saldo, presupuesto, proyección y reportes', () => {
    const before = computeBudget(data, TODAY).availableMinor
    const r = mustOk(deleteTransaction(data, 'coffee', later))
    expect(r.data.transactions).toHaveLength(0)
    expect(r.data.trash).toEqual([{ id: 'coffee', deletedAt: later.now, transaction: data.transactions[0], unlinkedRefundIds: [] }])
    expect(computeBudget(r.data, TODAY).availableMinor).toBe(before + 500)
    expect(projectBalance(r.data, TODAY).startMinor).toBe(before + 500)
    expect(periodSummary(r.data, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(0)
  })

  it('restaurar devuelve exactamente el mismo registro; repetir no duplica', () => {
    const del = mustOk(deleteTransaction(data, 'coffee', later))
    const back = mustOk(restoreFromTrash(del.data, 'coffee', later))
    expect(back.data.transactions).toEqual(data.transactions)
    expect(back.data.trash).toEqual([])
    expect(restoreFromTrash(back.data, 'coffee', later)).toMatchObject({ ok: true, unchanged: true })
    // Eliminar dos veces tampoco duplica la entrada.
    expect(deleteTransaction(del.data, 'coffee', later)).toMatchObject({ ok: true, unchanged: true })
  })

  it('persiste en la copia validada y se puede restaurar tras recargar', () => {
    const del = mustOk(deleteTransaction(data, 'coffee', later))
    const reloaded = validateAppData(JSON.parse(JSON.stringify(del.data)))
    if (!reloaded.ok) throw new Error(JSON.stringify(reloaded.issues))
    expect(reloaded.data.trash).toHaveLength(1)
    expect(mustOk(restoreFromTrash(reloaded.data, 'coffee', later)).data.transactions).toHaveLength(1)
  })

  it('eliminar definitivamente uno o todos; solo queda la huella de importación', () => {
    const two = baseData({ transactions: [tx({ id: 'a' }), tx({ id: 'b', importRef: 'main|2026-09-28|-1000|x|1' })] })
    let d = mustOk(deleteTransaction(two, 'a', later)).data
    d = mustOk(deleteTransaction(d, 'b', later)).data
    const one = mustOk(purgeTrash(d, ['a'], later))
    expect(one.data.trash.map((e) => e.id)).toEqual(['b'])
    expect(one.data.purgedImportRefs).toEqual([])
    const all = mustOk(purgeTrash(one.data, 'all', later))
    expect(all.data.trash).toEqual([])
    expect(all.data.purgedImportRefs).toEqual(['main|2026-09-28|-1000|x|1'])
    expect(restoreFromTrash(all.data, 'b', later)).toMatchObject({ ok: false })
    expect(purgeTrash(all.data, 'all', later)).toMatchObject({ unchanged: true })
  })
})

describe('papelera: transferencias y movimientos vinculados', () => {
  it('una transferencia se elimina y restaura completa (ambas cuentas a la vez)', () => {
    const savings = account({ id: 'sav', name: 'Ahorro', includeInBudget: false })
    const transfer = tx({ id: 't', kind: 'transfer', categoryId: undefined, toAccountId: 'sav', amountMinor: 2000 })
    const data = baseData({ accounts: [baseData().accounts[0]!, savings], transactions: [transfer] })
    const main = data.accounts[0]!
    const del = mustOk(deleteTransaction(data, 't', later))
    expect(accountBalance(del.data, main).balanceMinor).toBe(main.anchor.amountMinor)
    expect(accountBalance(del.data, savings).balanceMinor).toBe(savings.anchor.amountMinor)
    const back = mustOk(restoreFromTrash(del.data, 't', later))
    expect(accountBalance(back.data, main).balanceMinor).toBe(main.anchor.amountMinor - 2000)
    expect(accountBalance(back.data, savings).balanceMinor).toBe(savings.anchor.amountMinor + 2000)
  })

  it('gasto con devoluciones: la devolución sigue contando, pierde el vínculo y lo recupera al restaurar', () => {
    const buy = tx({ id: 'buy', amountMinor: 5000, categoryId: 'shopping' })
    const refund = tx({ id: 'ref', kind: 'refund', amountMinor: 1500, categoryId: 'shopping', refundOfId: 'buy' })
    const data = baseData({ transactions: [buy, refund] })
    const del = mustOk(deleteTransaction(data, 'buy', later))
    expect(del.data.transactions).toEqual([{ ...refund, refundOfId: undefined, updatedAt: later.now }].map(({ refundOfId: _r, ...rest }) => rest))
    expect(spendableBalance(del.data).totalMinor).toBe(data.accounts[0]!.anchor.amountMinor + 1500)
    expect(validateAppData(del.data).ok).toBe(true)
    const back = mustOk(restoreFromTrash(del.data, 'buy', later))
    expect(back.value.relinkedRefundIds).toEqual(['ref'])
    expect(back.data.transactions.find((t) => t.id === 'ref')?.refundOfId).toBe('buy')
  })

  it('una devolución restaurada cuyo gasto ya no existe se restaura sin vínculo (sin referencias rotas)', () => {
    const buy = tx({ id: 'buy', amountMinor: 5000, categoryId: 'shopping' })
    const refund = tx({ id: 'ref', kind: 'refund', amountMinor: 1500, categoryId: 'shopping', refundOfId: 'buy' })
    let d = mustOk(deleteTransaction(baseData({ transactions: [buy, refund] }), 'ref', later)).data
    d = mustOk(deleteTransaction(d, 'buy', later)).data
    d = mustOk(purgeTrash(d, ['buy'], later)).data
    const back = mustOk(restoreFromTrash(d, 'ref', later))
    expect(back.value.refundLinkDropped).toBe(true)
    expect(back.data.transactions[0]?.refundOfId).toBeUndefined()
    expect(validateAppData(back.data).ok).toBe(true)
  })

  it('un pago del calendario eliminado vuelve a reservarse; no se restaura si otro movimiento ya lo pagó', () => {
    const rent = bill('2026-09-25', 30000, { id: 'rent' })
    const data = baseData({ schedules: [rent] })
    const paid = mustOk(markOccurrence(data, { scheduleId: 'rent', occurrenceDate: '2026-09-25', amountMinor: 30000, date: TODAY, txId: 'p1' }, ctx))
    expect(computeBudget(paid.data, TODAY).reservedTotalMinor).toBe(0)
    const del = mustOk(deleteTransaction(paid.data, 'p1', later))
    // Sin el pago, la ocurrencia vuelve a estar vencida y reservada: nunca se descuenta dos veces.
    expect(computeBudget(del.data, TODAY).reservedTotalMinor).toBe(30000)
    const repaid = mustOk(markOccurrence(del.data, { scheduleId: 'rent', occurrenceDate: '2026-09-25', amountMinor: 30000, date: TODAY, txId: 'p2' }, later))
    const blocked = restoreFromTrash(repaid.data, 'p1', later)
    expect(blocked.ok ? [] : blocked.issues.map((i) => i.code)).toEqual(['occurrenceAlreadySettled'])
    expect(planItems(repaid.data, { today: TODAY, from: '2026-09-25', to: '2026-09-25' })[0]?.settledByTxId).toBe('p2')
  })

  it('no se puede eliminar una cuenta ni una categoría usada por movimientos de la papelera', () => {
    const extra = account({ id: 'x', name: 'Extra', includeInBudget: false })
    const cat: CustomCategory = { id: 'c_pets', name: 'Mascotas', kind: 'expense', archived: false, createdAt: NOW, updatedAt: NOW }
    const data = baseData({ accounts: [baseData().accounts[0]!, extra], categories: [cat], transactions: [tx({ id: 'v', accountId: 'x', categoryId: 'c_pets' })] })
    const del = mustOk(deleteTransaction(data, 'v', later))
    expect(deleteAccount(del.data, 'x', later)).toMatchObject({ ok: false, issues: [{ code: 'accountInUse' }] })
    expect(deleteCategory(del.data, 'c_pets', later)).toMatchObject({ ok: false, issues: [{ code: 'categoryInUse' }] })
  })
})

describe('papelera e importación CSV', () => {
  const CSV = [['Fecha', 'Descripción', 'Importe'], ['2026-09-27', 'Farmacia', '-12.00']]
  const options = { accountId: 'main', mapping: { date: 0, description: 1, amount: 2 }, hasHeader: true, dateFormat: 'ymd' as const, invertSign: false, locale: 'en-CA', today: TODAY }
  const importAll = (d: AppData) => {
    const rows = previewImport(CSV, d, options).rows.filter(isImportable)
    return importTransactions(
      d,
      { sameDayAlreadyInBalance: true, items: rows.map((r) => ({ id: `imp-${r.line}`, kind: r.kind, amountMinor: r.amountMinor, date: r.date, accountId: 'main', categoryId: 'health', importRef: r.importRef })) },
      later,
    )
  }
  const withAnchor = baseData({ accounts: [account({ id: 'main', anchor: { amountMinor: 100000, date: '2026-09-20', setAt: '2026-09-20T12:00:00.000Z' } })] })

  it('reimportar un archivo cuya fila está en la papelera no la restaura ni la duplica', () => {
    const imported = mustOk(importAll(withAnchor))
    const del = mustOk(deleteTransaction(imported.data, 'imp-2', later))
    const preview = previewImport(CSV, del.data, options)
    expect(preview.rows[0]).toMatchObject({ status: 'trashed', matchId: 'imp-2' })
    expect(isImportable(preview.rows[0]!)).toBe(false)
    // Aunque se forzara la fila, la operación la ignora.
    const forced = importTransactions(del.data, { sameDayAlreadyInBalance: true, items: [{ id: 'other', kind: 'expense', amountMinor: 1200, date: '2026-09-27', accountId: 'main', categoryId: 'health', importRef: preview.rows[0]!.importRef! }] }, later)
    expect(forced).toMatchObject({ ok: true, unchanged: true })
  })

  it('tras eliminar definitivamente, la fila se ofrece desmarcada (no nueva)', () => {
    let d = mustOk(importAll(withAnchor)).data
    d = mustOk(deleteTransaction(d, 'imp-2', later)).data
    d = mustOk(purgeTrash(d, 'all', later)).data
    const preview = previewImport(CSV, d, options)
    expect(preview.rows[0]?.status).toBe('purged')
    expect(isImportable(preview.rows[0]!)).toBe(true)
  })
})
