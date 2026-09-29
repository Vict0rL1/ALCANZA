import { describe, expect, it } from 'vitest'
import { accountBalance } from './balances'
import { computeBudget } from './budget'
import { periodSummary } from './insights'
import { deleteTransaction, reconcileAccount, restoreFromTrash, saveTransaction, updateAccountBalance, type ReconcileInput } from './operations'
import { estimateDailySpend } from './projection'
import { balanceAtDate, nearbyTransactions, reconciliationState, verificationSummary } from './reconcile'
import type { AppData } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, TODAY, tx } from '../test/fixtures'

const ctx = { today: TODAY, now: '2026-09-28T18:00:00.000Z' }
// Saldo de referencia: 1000.00 el 20-sep.
const main = account({ id: 'main', name: 'Banco', anchor: { amountMinor: 100000, date: '2026-09-20', setAt: '2026-09-20T12:00:00.000Z' } })
const data = baseData({
  accounts: [main],
  transactions: [
    tx({ id: 'a', date: '2026-09-22', amountMinor: 2500, categoryId: 'groceries' }),
    tx({ id: 'b', date: '2026-09-25', kind: 'income', amountMinor: 50000, categoryId: 'salary' }),
    tx({ id: 'c', date: '2026-09-27', amountMinor: 1000, categoryId: 'dining' }),
    tx({ id: 'planned', date: '2026-09-26', status: 'planned', amountMinor: 99900, realizedAt: undefined }),
  ],
})

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

const input = (over: Partial<ReconcileInput>): ReconcileInput => ({ id: 'r1', accountId: 'main', date: '2026-09-25', observedMinor: 147500, resolution: 'matched', ...over })

describe('saldo calculado a una fecha', () => {
  it('suma solo movimientos realizados hasta el final de ese día (nunca previstos)', () => {
    expect(balanceAtDate(data, main, '2026-09-21')).toBe(100000)
    expect(balanceAtDate(data, main, '2026-09-25')).toBe(100000 - 2500 + 50000)
    expect(balanceAtDate(data, main, TODAY)).toBe(accountBalance(data, main).balanceMinor)
    expect(balanceAtDate(data, main, '2026-09-19')).toBeNull()
  })
})

describe('conciliación', () => {
  it('coincidencia exacta: se registra sin ajustes y sin tocar el saldo de referencia', () => {
    const r = ok(reconcileAccount(data, input({}), ctx))
    expect(r.value.reconciliation).toMatchObject({ computedMinor: 147500, differenceMinor: 0, resolution: 'matched' })
    expect(r.data.transactions).toHaveLength(data.transactions.length)
    expect(r.data.accounts[0]!.anchor).toEqual(main.anchor)
    expect(reconciliationState(r.data, r.value.reconciliation)).toBe('ok')
    // Guardar otra vez con el mismo id no duplica.
    expect(reconcileAccount(r.data, input({}), ctx)).toMatchObject({ ok: true, unchanged: true })
  })

  it('con diferencia: «coincide» se rechaza; sin resolver guarda la diferencia; revisa movimientos cercanos', () => {
    const matched = reconcileAccount(data, input({ observedMinor: 146500 }), ctx)
    expect(matched.ok ? [] : matched.issues.map((i) => i.code)).toEqual(['differenceNotZero'])
    const r = ok(reconcileAccount(data, input({ observedMinor: 146500, resolution: 'unresolved' }), ctx))
    expect(r.value.reconciliation).toMatchObject({ differenceMinor: -1000, resolution: 'unresolved' })
    expect(r.data.transactions).toHaveLength(data.transactions.length)
    expect(nearbyTransactions(r.data, 'main', '2026-09-25').map((t) => t.id)).toEqual(['c', 'b', 'a'])
    expect(verificationSummary(r.data, TODAY).needsAttention).toHaveLength(1)
  })

  it('ajuste explícito: corrige el saldo sin contar como gasto ni ingreso', () => {
    const noReason = reconcileAccount(data, input({ observedMinor: 146500, resolution: 'adjusted', adjustmentTxId: 'adj' }), ctx)
    expect(noReason.ok ? [] : noReason.issues.map((i) => i.code)).toEqual(['reasonRequired'])
    const before = { budget: computeBudget(data, TODAY).availableMinor, spend: periodSummary(data, '2026-09-01', '2026-09-30') }
    const r = ok(reconcileAccount(data, input({ observedMinor: 146500, resolution: 'adjusted', adjustmentTxId: 'adj', reason: 'Comisión bancaria no registrada' }), ctx))
    expect(r.value.adjustment).toMatchObject({ id: 'adj', kind: 'adjustment', adjustmentDirection: 'decrease', amountMinor: 1000, date: '2026-09-25', reconciliationId: 'r1' })
    expect(balanceAtDate(r.data, r.data.accounts[0]!, '2026-09-25')).toBe(146500)
    expect(computeBudget(r.data, TODAY).availableMinor).toBe(before.budget - 1000)
    const after = periodSummary(r.data, '2026-09-01', '2026-09-30')
    expect(after.netSpendingMinor).toBe(before.spend.netSpendingMinor)
    expect(after.incomeMinor).toBe(before.spend.incomeMinor)
    expect(estimateDailySpend(r.data, TODAY).totalMinor).toBe(estimateDailySpend(data, TODAY).totalMinor)
    expect(reconciliationState(r.data, r.value.reconciliation)).toBe('ok')
    expect(validateAppData(JSON.parse(JSON.stringify(r.data))).ok).toBe(true)
  })

  it('un ajuste hacia arriba suma al saldo', () => {
    const r = ok(reconcileAccount(data, input({ observedMinor: 150000, resolution: 'adjusted', reason: 'Interés', adjustmentTxId: 'up' }), ctx))
    expect(r.value.adjustment?.adjustmentDirection).toBe('increase')
    expect(accountBalance(r.data, r.data.accounts[0]!).balanceMinor).toBe(accountBalance(data, main).balanceMinor + 2500)
  })

  it('cambios retroactivos en el periodo conciliado lo marcan como pendiente de revisión', () => {
    const r = ok(reconcileAccount(data, input({}), ctx))
    const rec = r.value.reconciliation
    // Editar un movimiento del periodo (importe).
    const edited = ok(saveTransaction(r.data, { ...r.data.transactions.find((t) => t.id === 'a')!, amountMinor: 2600 }, ctx))
    expect(reconciliationState(edited.data, rec)).toBe('needsReview')
    // Eliminar y restaurar vuelve al estado conciliado.
    const trashed = ok(deleteTransaction(r.data, 'a', ctx))
    expect(reconciliationState(trashed.data, rec)).toBe('needsReview')
    expect(reconciliationState(ok(restoreFromTrash(trashed.data, 'a', ctx)).data, rec)).toBe('ok')
    // Cambiar solo la nota no altera el saldo: sigue conciliada.
    const noted = ok(saveTransaction(r.data, { ...r.data.transactions.find((t) => t.id === 'a')!, note: 'Súper' }, ctx))
    expect(reconciliationState(noted.data, rec)).toBe('ok')
    // Un movimiento posterior a la fecha conciliada no la afecta.
    const afterDate = ok(saveTransaction(r.data, { id: 'z', kind: 'expense', status: 'realized', amountMinor: 700, date: TODAY, accountId: 'main', categoryId: 'dining' }, ctx))
    expect(reconciliationState(afterDate.data, rec)).toBe('ok')
    // Un saldo de referencia posterior la deja reemplazada.
    const reanchored = ok(updateAccountBalance(r.data, { accountId: 'main', amountMinor: 140000, date: TODAY }, ctx))
    expect(reconciliationState(reanchored.data, rec)).toBe('superseded')
  })

  it('no se concilia antes del saldo de referencia ni en el futuro', () => {
    expect(reconcileAccount(data, input({ date: '2026-09-19' }), ctx)).toMatchObject({ ok: false, issues: [{ code: 'beforeAnchor' }] })
    expect(reconcileAccount(data, input({ date: '2026-09-30' }), ctx)).toMatchObject({ ok: false, issues: [{ code: 'realizedInFuture' }] })
  })

  it('tarjetas: deuda como saldo negativo; el crédito disponible no interviene', () => {
    const card = account({ id: 'card', name: 'Visa', kind: 'credit', includeInBudget: false, card: { limitMinor: 200000 }, anchor: { amountMinor: -30000, date: '2026-09-20', setAt: '2026-09-20T12:00:00.000Z' } })
    const d = baseData({
      accounts: [main, card],
      transactions: [
        tx({ id: 'buy', accountId: 'card', date: '2026-09-22', amountMinor: 4500, categoryId: 'shopping' }),
        tx({ id: 'pay', kind: 'transfer', categoryId: undefined, accountId: 'main', toAccountId: 'card', date: '2026-09-24', amountMinor: 10000 }),
      ],
    })
    expect(balanceAtDate(d, card, '2026-09-25')).toBe(-30000 - 4500 + 10000)
    // El banco muestra una deuda de 250.00 → observado −25000: diferencia de −500 (se debe más).
    const r = ok(reconcileAccount(d, { id: 'rc', accountId: 'card', date: '2026-09-25', observedMinor: -25000, resolution: 'adjusted', reason: 'Cargo por intereses', adjustmentTxId: 'int' }, ctx))
    expect(r.value.reconciliation).toMatchObject({ computedMinor: -24500, differenceMinor: -500 })
    expect(r.value.adjustment).toMatchObject({ adjustmentDirection: 'decrease', amountMinor: 500 })
    expect(balanceAtDate(r.data, card, '2026-09-25')).toBe(-25000)
    expect(accountBalance(r.data, card).balanceMinor).toBe(-25000)
  })

  it('Inicio: distingue el último movimiento registrado del saldo verificado', () => {
    const before = verificationSummary(data, TODAY)
    expect(before).toMatchObject({ oldestVerifiedDate: null, lastMovementDate: '2026-09-27', daysSinceVerified: null })
    const r = ok(reconcileAccount(data, input({}), ctx))
    expect(verificationSummary(r.data, TODAY)).toMatchObject({ oldestVerifiedDate: '2026-09-25', daysSinceVerified: 3, lastMovementDate: '2026-09-27' })
  })
})
