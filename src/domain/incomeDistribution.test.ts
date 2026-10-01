import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { goalProgress } from './goals'
import { inboxView } from './inbox'
import { applyDistribution, distributionContext, distributionIncomeState, previewDistribution, proposeDistribution, undoDistribution, type ApplyDistributionInput } from './incomeDistribution'
import { deleteTransaction, markOccurrence, restoreFromTrash, saveTransaction } from './operations'
import { settlePlannedExpenseFromCalendar } from './plannedExpenses'
import type { AppData } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, bill, ctx, EARLIER, goal, income, TODAY, tx } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r as { issues: { code: string }[] }).issues.map((i) => i.code))

/*
 * Cuenta en 0 al 27-sep; hoy (28-sep) se recibe un sueldo de $1,500. Renta de $800 el 1-oct;
 * próximo ingreso programado el 10-oct (horizonte). Meta de ahorro de $1,000 sin fecha.
 * Disponible antes de distribuir = 1500 − 800 (renta ya reservada) = $700.
 */
const data: AppData = baseData({
  accounts: [account({ id: 'main', name: 'Principal', anchor: { amountMinor: 0, date: '2026-09-27', setAt: EARLIER } })],
  transactions: [tx({ id: 'pay', kind: 'income', amountMinor: 150000, categoryId: 'salary', date: TODAY })],
  schedules: [bill('2026-10-01', 80000, { id: 'rent', name: 'Renta', categoryId: 'housing' }), income('2026-10-10', 150000, { id: 'job' })],
  goals: [goal({ id: 'save', name: 'Ahorro', targetMinor: 100000 })],
})
const example: ApplyDistributionInput = {
  distributionId: 'dist-1',
  incomeTxId: 'pay',
  lines: [
    { kind: 'payment', amountMinor: 80000, scheduleId: 'rent', occurrenceDate: '2026-10-01' },
    { kind: 'goal', amountMinor: 20000, goalId: 'save' },
  ],
}

describe('distribuir un ingreso: ejemplo de aceptación', () => {
  it('$1,500 → $800 pagos, $200 ahorro, $500 libres; el saldo no cambia y la renta no se resta dos veces', () => {
    expect(computeBudget(data, TODAY).availableMinor).toBe(70000)
    const r = ok(applyDistribution(data, example, ctx))
    const after = computeBudget(r.data, TODAY)
    expect(after.spendableMinor).toBe(150000) // el saldo no cambia
    expect(r.data.transactions).toEqual(data.transactions) // ningún ingreso ni movimiento nuevo
    expect(after.availableMinor).toBe(50000) // solo los $200 de ahorro reducen el disponible
    const rentGoal = r.data.goals.find((g) => g.plan?.link?.scheduleId === 'rent')!
    expect(goalProgress(rentGoal).savedMinor).toBe(80000)
    expect(goalProgress(r.data.goals.find((g) => g.id === 'save')!).savedMinor).toBe(20000)
    expect(r.value.lines.map((l) => [l.kind, l.amountMinor, l.createdGoal])).toEqual([
      ['payment', 80000, true],
      ['goal', 20000, false],
    ])
    // Vínculos: los apartados guardan la distribución.
    expect(rentGoal.allocations[0]).toMatchObject({ distributionId: 'dist-1', amountMinor: 80000 })
  })

  it('la vista previa coincide y no guarda nada; confirmar dos veces no duplica', () => {
    const p = previewDistribution(data, example, ctx)
    expect(p.ok && p.preview).toEqual({ before: { availableMinor: 70000, reservedMinor: 80000, spendableMinor: 150000 }, after: { availableMinor: 50000, reservedMinor: 100000, spendableMinor: 150000 } })
    const once = ok(applyDistribution(data, example, ctx)).data
    expect(applyDistribution(once, example, ctx)).toMatchObject({ unchanged: true })
  })
})

describe('distribuir un ingreso: límites', () => {
  it('no se puede repartir más que el ingreso (ni volver a repartir lo ya repartido)', () => {
    expect(codes(applyDistribution(data, { ...example, lines: [{ kind: 'goal', amountMinor: 150001, goalId: 'save' }] }, ctx))).toEqual(['distributionExceeds'])
    const once = ok(applyDistribution(data, example, ctx)).data
    const c = distributionContext(once, 'pay', TODAY)!
    expect(c).toMatchObject({ alreadyMinor: 100000, remainingMinor: 50000, freeMinor: 50000 })
    // La renta ya está cubierta: no se vuelve a ofrecer.
    expect(c.payments.map((p) => p.scheduleId)).toEqual([])
    expect(codes(applyDistribution(once, { distributionId: 'dist-2', incomeTxId: 'pay', lines: [{ kind: 'goal', amountMinor: 60000, goalId: 'save' }] }, ctx))).toEqual(['distributionExceeds'])
  })

  it('un ingreso previsto no se puede distribuir', () => {
    const planned = baseData({ transactions: [tx({ id: 'p', kind: 'income', status: 'planned', amountMinor: 1000, categoryId: 'salary', date: '2026-10-05', realizedAt: undefined })], goals: [goal({ id: 'save' })] })
    expect(codes(applyDistribution(planned, { distributionId: 'd', incomeTxId: 'p', lines: [{ kind: 'goal', amountMinor: 100, goalId: 'save' }] }, ctx))).toEqual(['incomeNotRealized'])
  })

  it('ingreso ya gastado en parte: solo se aparta lo que de verdad está libre', () => {
    const spent = ok(saveTransaction(data, { id: 'tv', kind: 'expense', status: 'realized', amountMinor: 65000, date: TODAY, accountId: 'main', categoryId: 'shopping' }, ctx)).data
    const c = distributionContext(spent, 'pay', TODAY)!
    expect(c.freeMinor).toBe(5000) // 1500 − 650 − 800
    // Propuesta: la renta entera (ya reservada, no cuesta) y solo $50 a la meta.
    expect(proposeDistribution(c, 'paymentsFirst').map((l) => l.amountMinor)).toEqual([80000, 5000])
    expect(codes(applyDistribution(spent, { distributionId: 'd', incomeTxId: 'pay', lines: [{ kind: 'goal', amountMinor: 5001, goalId: 'save' }] }, ctx))).toEqual(['exceedsFreeMoney'])
  })

  it('un pago ya cubierto en parte solo pide lo que falta', () => {
    const half = ok(applyDistribution(data, { distributionId: 'd0', incomeTxId: 'pay', lines: [{ kind: 'payment', amountMinor: 30000, scheduleId: 'rent', occurrenceDate: '2026-10-01' }] }, ctx)).data
    const c = distributionContext(half, 'pay', TODAY)!
    expect(c.payments.map((p) => [p.scheduleId, p.coveredMinor, p.needMinor, p.alreadyReserved])).toEqual([['rent', 30000, 50000, true]])
    // Completarla reutiliza el mismo gasto planificado.
    const full = ok(applyDistribution(half, { distributionId: 'd1', incomeTxId: 'pay', lines: [{ kind: 'payment', amountMinor: 50000, scheduleId: 'rent', occurrenceDate: '2026-10-01' }] }, ctx)).data
    expect(full.goals.filter((g) => g.plan?.link?.scheduleId === 'rent')).toHaveLength(1)
    expect(computeBudget(full, TODAY).availableMinor).toBe(70000)
  })
})

describe('distribuir un ingreso: cambios posteriores y deshacer', () => {
  it('editar o eliminar el ingreso marca la distribución para revisar; restaurarlo la normaliza', () => {
    const d = ok(applyDistribution(data, example, ctx)).data
    const dist = d.incomeDistributions[0]!
    expect(distributionIncomeState(d, dist).status).toBe('ok')
    const edited = ok(saveTransaction(d, { ...d.transactions[0]!, amountMinor: 90000 }, ctx)).data
    expect(distributionIncomeState(edited, dist).status).toBe('changed')
    expect(inboxView(edited, TODAY).active.map((i) => i.id)).toContain('int:dist:dist-1')
    const trashed = ok(deleteTransaction(d, 'pay', ctx)).data
    expect(distributionIncomeState(trashed, dist).status).toBe('missing')
    const restored = ok(restoreFromTrash(trashed, 'pay', ctx)).data
    expect(distributionIncomeState(restored, dist).status).toBe('ok')
  })

  it('deshacer libera lo apartado (sin tocar el saldo) y quita la meta que creó; queda en el historial', () => {
    const d = ok(applyDistribution(data, example, ctx)).data
    const u = ok(undoDistribution(d, 'dist-1', ctx))
    expect(computeBudget(u.data, TODAY).availableMinor).toBe(70000)
    expect(u.data.goals.some((g) => g.plan?.link?.scheduleId === 'rent')).toBe(false)
    expect(goalProgress(u.data.goals.find((g) => g.id === 'save')!).savedMinor).toBe(0)
    expect(u.data.incomeDistributions[0]!.undoneAt).toBe(ctx.now)
    expect(distributionContext(u.data, 'pay', TODAY)!.remainingMinor).toBe(150000)
  })

  it('si el apartado ya se usó para pagar, no se deshace nada y se explica', () => {
    let d = ok(applyDistribution(data, example, ctx)).data
    d = ok(markOccurrence(d, { scheduleId: 'rent', occurrenceDate: '2026-10-01', amountMinor: 80000, date: TODAY, txId: 'rent-paid' }, ctx)).data
    const goalId = d.goals.find((g) => g.plan?.link?.scheduleId === 'rent')!.id
    // Antes de cerrar el gasto planificado, la renta se descontaría dos veces → la bandeja lo avisa.
    expect(inboxView(d, TODAY).active.map((i) => i.reason)).toContain('reserveForSettledBill')
    d = ok(settlePlannedExpenseFromCalendar(d, goalId, ctx)).data
    expect(inboxView(d, TODAY).active.map((i) => i.reason)).not.toContain('reserveForSettledBill')
    // Pagada la renta (−800) y usado su apartado: disponible = 1500 − 800 − 200 = 500.
    expect(computeBudget(d, TODAY).availableMinor).toBe(50000)
    const r = undoDistribution(d, 'dist-1', ctx)
    expect(codes(r)).toEqual(['distributionConflict'])
  })

  it('las distribuciones y sus vínculos viajan en la copia y se validan', () => {
    const d = ok(applyDistribution(data, example, ctx)).data
    const r = validateAppData(JSON.parse(JSON.stringify(d)))
    expect(r.ok && r.data.incomeDistributions).toEqual(d.incomeDistributions)
    expect(r.ok && r.data.goals.find((g) => g.id === 'save')!.allocations[0]!.distributionId).toBe('dist-1')
    const bad = JSON.parse(JSON.stringify(d))
    bad.incomeDistributions[0].lines[0].amountMinor = 200000
    expect(validateAppData(bad).ok).toBe(false)
  })
})
