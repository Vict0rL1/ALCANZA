import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { dismissInboxItem, inboxView, possibleDuplicates, snoozeInboxItem, undismissInboxItem, unsnoozeInboxItem } from './inbox'
import { markOccurrence, reconcileAccount, saveTransaction } from './operations'
import type { AppData } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, bill, ctx, EARLIER, TODAY, tx } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}
// Avisos sin los de verificación de saldo (que tienen su propia prueba): cambiar un movimiento
// ya verificado marca la conciliación «por revisar», como corresponde.
const ids = (d: AppData, today = TODAY) => inboxView(d, today).active.filter((i) => i.kind !== 'balance').map((i) => i.id)
const verifiedMain = (d: AppData, date = TODAY) =>
  ok(reconcileAccount(d, { id: `rec-${date}`, accountId: 'main', date, observedMinor: computeBudget(d, TODAY).spendableMinor, resolution: 'matched' }, ctx)).data

describe('bandeja: movimientos sin categoría', () => {
  it('aparece una vez, se resuelve al categorizar y «está bien así» se recuerda salvo que cambie', () => {
    let d = verifiedMain(baseData({ transactions: [tx({ id: 'x', categoryId: 'other_expense', note: 'POS 1234', amountMinor: 999 })] }))
    expect(ids(d)).toEqual(['cat:x'])
    expect(ids(d)).toEqual(ids(d)) // estable: no se duplica al recalcular
    const item = inboxView(d, TODAY).active[0]!
    const dismissed = ok(dismissInboxItem(d, item, ctx)).data
    expect(ids(dismissed)).toEqual([])
    expect(inboxView(dismissed, TODAY).dismissed.map((i) => i.id)).toEqual(['cat:x'])
    // Cambia el importe: el descarte ya no aplica.
    const changed = ok(saveTransaction(dismissed, { ...dismissed.transactions[0]!, amountMinor: 1000 }, ctx)).data
    expect(ids(changed)).toEqual(['cat:x'])
    expect(ids(ok(undismissInboxItem(dismissed, 'cat:x', ctx)).data)).toEqual(['cat:x'])
    // Resolver: elegir una categoría.
    d = ok(saveTransaction(d, { ...d.transactions[0]!, categoryId: 'dining' }, ctx)).data
    expect(ids(d)).toEqual([])
  })
})

describe('bandeja: pagos vencidos sin confirmar', () => {
  const overdue = () => verifiedMain(baseData({ schedules: [bill('2026-09-25', 4280, { id: 'luz', name: 'Luz' })] }))

  it('aparece con fecha e importe y desaparece al registrar el pago', () => {
    const d = overdue()
    const item = inboxView(d, TODAY).active[0]!
    expect(item).toMatchObject({ id: 'due:schedule:luz:2026-09-25', kind: 'overdue', reason: 'overdueExpense', date: '2026-09-25', amountMinor: 4280, canDismiss: false })
    const paid = ok(markOccurrence(d, { scheduleId: 'luz', occurrenceDate: '2026-09-25', amountMinor: 4280, date: TODAY }, ctx)).data
    expect(ids(paid)).toEqual([])
  })

  it('posponer no cambia cifras ni lo oculta para siempre', () => {
    const d = overdue()
    const before = computeBudget(d, TODAY)
    const snoozed = ok(snoozeInboxItem(d, 'due:schedule:luz:2026-09-25', '2026-10-01', ctx)).data
    expect(ids(snoozed)).toEqual([])
    expect(inboxView(snoozed, TODAY).snoozed.map((i) => [i.id, i.until])).toEqual([['due:schedule:luz:2026-09-25', '2026-10-01']])
    expect(computeBudget(snoozed, TODAY)).toEqual(before)
    // Llega la fecha: vuelve si el problema sigue.
    expect(inboxView(snoozed, '2026-10-01').active.map((i) => i.id)).toContain('due:schedule:luz:2026-09-25')
    expect(ids(ok(unsnoozeInboxItem(snoozed, 'due:schedule:luz:2026-09-25', ctx)).data)).toEqual(['due:schedule:luz:2026-09-25'])
    // No se puede posponer al pasado ni descartar un pago vencido.
    expect(snoozeInboxItem(d, 'x', TODAY, ctx).ok).toBe(false)
    expect(dismissInboxItem(d, inboxView(d, TODAY).active[0]!, ctx).ok).toBe(false)
  })
})

describe('bandeja: posibles duplicados', () => {
  const two = (over: Partial<AppData['transactions'][number]> = {}) =>
    verifiedMain(baseData({ transactions: [tx({ id: 'a', note: 'Café Olé', amountMinor: 425, date: '2026-09-26' }), tx({ id: 'b', note: 'cafe ole', amountMinor: 425, date: '2026-09-27', ...over })] }))

  it('mismo tipo, cuenta e importe a ±3 días y misma nota → una sugerencia estable', () => {
    const d = two()
    expect(ids(d)).toEqual(['dup:a:b'])
    expect(possibleDuplicates(d)).toHaveLength(1)
    // Nunca se elimina ni combina nada.
    expect(d.transactions).toHaveLength(2)
  })

  it('falsos positivos excluidos: notas distintas, más de 3 días, otra cuenta, transferencias, cuotas parciales y compras divididas', () => {
    expect(ids(two({ note: 'Panadería' }))).toEqual([])
    expect(ids(two({ date: '2026-09-21' }))).toEqual([])
    const sav = account({ id: 'sav', name: 'Ahorro', includeInBudget: false, anchor: { amountMinor: 0, date: TODAY, setAt: EARLIER } })
    const transfers = verifiedMain(baseData({ accounts: [baseData().accounts[0]!, sav], transactions: [tx({ id: 't1', kind: 'transfer', categoryId: undefined, toAccountId: 'sav', amountMinor: 5000 }), tx({ id: 't2', kind: 'transfer', categoryId: undefined, toAccountId: 'sav', amountMinor: 5000 })] }))
    expect(ids(transfers).filter((i) => i.startsWith('dup:'))).toEqual([])
    const partials = verifiedMain(
      baseData({
        schedules: [bill('2026-09-20', 10000, { id: 'r' })],
        transactions: [
          tx({ id: 'p1', amountMinor: 5000, date: '2026-09-26', scheduleId: 'r', occurrenceDate: '2026-09-20', partialSettlement: true }),
          tx({ id: 'p2', amountMinor: 5000, date: '2026-09-27', scheduleId: 'r', occurrenceDate: '2026-09-20' }),
        ],
      }),
    )
    expect(ids(partials).filter((i) => i.startsWith('dup:'))).toEqual([])
    const split = verifiedMain(
      baseData({ transactions: [tx({ id: 's', amountMinor: 1000, categoryId: 'groceries', splits: [{ id: 'l1', categoryId: 'groceries', amountMinor: 500 }, { id: 'l2', categoryId: 'dining', amountMinor: 500 }] })] }),
    )
    expect(ids(split)).toEqual([])
  })

  it('«son distintos» se recuerda hasta que cambien datos relevantes', () => {
    const d = two()
    const kept = ok(dismissInboxItem(d, inboxView(d, TODAY).active[0]!, ctx)).data
    expect(ids(kept)).toEqual([])
    // Cambiar la fecha de uno (sigue dentro de la ventana) vuelve a preguntar.
    const moved = ok(saveTransaction(kept, { ...kept.transactions[1]!, date: '2026-09-28' }, ctx)).data
    expect(ids(moved)).toEqual(['dup:a:b'])
  })
})

describe('bandeja: cuentas para verificar', () => {
  it('distingue último movimiento y última verificación; desaparece al verificar y vuelve tras 30 días', () => {
    const d = baseData({ transactions: [tx({ id: 'x', date: '2026-09-20', categoryId: 'dining' })] })
    expect(inboxView(d, TODAY).active.find((i) => i.kind === 'balance')).toMatchObject({ id: 'bal:main:never', reason: 'neverVerified', lastMovementDate: '2026-09-20', verifiedDate: null })
    const verified = verifiedMain(d)
    expect(inboxView(verified, TODAY).active).toEqual([])
    // Un movimiento nuevo dentro del periodo verificado pide revisar la verificación.
    const edited = ok(saveTransaction(verified, { id: 'late', kind: 'expense', status: 'realized', amountMinor: 2000, date: TODAY, accountId: 'main', categoryId: 'dining' }, ctx)).data
    expect(inboxView(edited, TODAY).active.map((i) => i.reason)).toEqual(['verificationNeedsReview'])
    expect(inboxView(verified, '2026-10-29').active.find((i) => i.kind === 'balance')).toMatchObject({ id: 'bal:main:old', verifiedDate: TODAY, lastMovementDate: '2026-09-20' })
  })
})

describe('bandeja: copias', () => {
  it('lo pospuesto y descartado viaja en la copia y se valida', () => {
    const d = ok(snoozeInboxItem(baseData(), 'bal:main:never', '2026-10-05', ctx)).data
    const r = validateAppData(JSON.parse(JSON.stringify(d)))
    expect(r.ok && r.data.inbox).toEqual(d.inbox)
    const bad = JSON.parse(JSON.stringify(d))
    bad.inbox.snoozed[0].until = 'mañana'
    expect(validateAppData(bad).ok).toBe(false)
  })
})
