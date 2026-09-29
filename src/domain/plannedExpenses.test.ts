import { describe, expect, it } from 'vitest'
import { spendableBalance } from './balances'
import { computeBudget } from './budget'
import { goalProgress } from './goals'
import { allocateToGoal, deleteSchedule } from './operations'
import { planItems } from './planItems'
import { payPlannedExpense, plannedExpenseStatus, savePlannedExpense, type PlannedExpenseDraft } from './plannedExpenses'
import type { AppData } from './types'
import { validateAppData } from '../storage/backup'
import { baseData, bill, ctx, income, TODAY } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

// Saldo 1000.00; próximo ingreso el 10-oct; matrícula de 400.00 programada el 5-oct.
const base = baseData({ schedules: [income('2026-10-10', 50000), bill('2026-10-05', 40000, { id: 'tuition', name: 'Matrícula' })] })
const draft = (over: Partial<PlannedExpenseDraft> = {}): PlannedExpenseDraft => ({
  id: 'g',
  name: 'Matrícula',
  targetMinor: 40000,
  dueDate: '2026-10-05',
  fundedFrom: 'budget',
  ...over,
})

describe('gastos planificados: plan y estado', () => {
  it('calcula lo que falta y la cuota semanal/mensual (redondeo hacia arriba)', () => {
    const r = ok(savePlannedExpense(base, draft({ dueDate: '2026-12-28', targetMinor: 100000, initialReservedMinor: 10000 }), ctx))
    const s = plannedExpenseStatus(r.value, TODAY)
    expect(s).toMatchObject({ state: 'onTrack', savedMinor: 10000, remainingMinor: 90000 })
    // 91 días → 13 semanas; 3 meses completos.
    expect(s.plan.perWeekMinor).toBe(6924) // ceil(90000 / 13)
    expect(s.plan.perMonthMinor).toBe(30000)
  })

  it('plazo menor a una semana, vencido y ya cubierto', () => {
    const soon = ok(savePlannedExpense(base, draft({ dueDate: '2026-10-01' }), ctx)).value
    expect(plannedExpenseStatus(soon, TODAY)).toMatchObject({ state: 'underWeek' })
    expect(plannedExpenseStatus(soon, TODAY).plan.perWeekMinor).toBe(40000)
    expect(plannedExpenseStatus(soon, '2026-10-02').state).toBe('overdue')
    const covered = ok(savePlannedExpense(base, draft({ id: 'c', initialReservedMinor: 40000 }), ctx)).value
    expect(plannedExpenseStatus(covered, TODAY).state).toBe('covered')
  })

  it('planificar NO descuenta; solo el apartado confirmado cuenta', () => {
    const before = computeBudget(base, TODAY).availableMinor
    const planned = ok(savePlannedExpense(base, draft({ dueDate: '2026-12-01', id: 'x' }), ctx))
    expect(computeBudget(planned.data, TODAY).availableMinor).toBe(before)
    const confirmed = ok(allocateToGoal(planned.data, { goalId: 'x', amountMinor: 5000 }, ctx))
    expect(computeBudget(confirmed.data, TODAY).availableMinor).toBe(before - 5000)
    expect(confirmed.value.reason).toBe('contribution')
  })
})

describe('gastos planificados: vínculo con un pago previsto sin doble descuento', () => {
  it('lo apartado reduce la reserva del pago: nunca se descuenta dos veces', () => {
    const plain = computeBudget(base, TODAY)
    // Sin vínculo: la matrícula (400) se reserva y los 300 apartados también.
    const unlinked = ok(savePlannedExpense(base, draft({ initialReservedMinor: 30000 }), ctx))
    expect(computeBudget(unlinked.data, TODAY).availableMinor).toBe(plain.availableMinor - 30000)
    // Con vínculo: la reserva del pago baja a 100 y los 300 siguen apartados → total 400.
    const linked = ok(savePlannedExpense(base, draft({ initialReservedMinor: 30000, link: { scheduleId: 'tuition', occurrenceDate: '2026-10-05' } }), ctx))
    const b = computeBudget(linked.data, TODAY)
    expect(b.reservedTotalMinor).toBe(10000)
    expect(b.goalsReservedMinor).toBe(30000)
    expect(b.availableMinor).toBe(plain.availableMinor)
    expect(b.coveredByGoals.get('schedule:tuition:2026-10-05')).toBe(30000)
  })

  it('no se puede vincular dos veces la misma ocurrencia ni una ya pagada', () => {
    const one = ok(savePlannedExpense(base, draft({ link: { scheduleId: 'tuition', occurrenceDate: '2026-10-05' } }), ctx))
    const two = savePlannedExpense(one.data, draft({ id: 'g2', link: { scheduleId: 'tuition', occurrenceDate: '2026-10-05' } }), ctx)
    expect(two.ok ? [] : two.issues.map((i) => i.code)).toEqual(['duplicateId'])
  })

  it('pagar el importe exacto: gasto real vinculado, reserva liberada, disponible consistente', () => {
    const linked = ok(savePlannedExpense(base, draft({ initialReservedMinor: 40000, link: { scheduleId: 'tuition', occurrenceDate: '2026-10-05' } }), ctx))
    const before = computeBudget(linked.data, TODAY).availableMinor
    const paid = ok(payPlannedExpense(linked.data, { goalId: 'g', txId: 'pay', amountMinor: 40000, date: TODAY, accountId: 'main', surplus: 'release' }, ctx))
    expect(paid.value.tx).toMatchObject({ id: 'pay', scheduleId: 'tuition', occurrenceDate: '2026-10-05', amountMinor: 40000 })
    expect(planItems(paid.data, { today: TODAY, from: '2026-10-05', to: '2026-10-05' })[0]?.state).toBe('paid')
    expect(goalProgress(paid.data.goals[0]!).savedMinor).toBe(0)
    expect(computeBudget(paid.data, TODAY).availableMinor).toBe(before)
    expect(paid.data.goals[0]!.plan!.paidAt).toBe(ctx.now)
    // Pagar otra vez con el mismo id no duplica.
    expect(payPlannedExpense(paid.data, { goalId: 'g', txId: 'pay', amountMinor: 40000, date: TODAY, accountId: 'main', surplus: 'release' }, ctx)).toMatchObject({ unchanged: true })
    expect(validateAppData(JSON.parse(JSON.stringify(paid.data))).ok).toBe(true)
  })

  it('pago menor que lo apartado: el sobrante se libera o se guarda para el siguiente periodo', () => {
    const yearly = ok(savePlannedExpense(base, draft({ dueDate: '2026-10-01', initialReservedMinor: 40000, repeatEveryMonths: 12 }), ctx))
    const released = ok(payPlannedExpense(yearly.data, { goalId: 'g', txId: 'p1', amountMinor: 35000, date: TODAY, accountId: 'main', surplus: 'release' }, ctx))
    expect(released.value).toMatchObject({ surplusMinor: 5000, shortfallMinor: 0 })
    expect(goalProgress(released.data.goals[0]!).savedMinor).toBe(0)
    const carried = ok(payPlannedExpense(yearly.data, { goalId: 'g', txId: 'p2', amountMinor: 35000, date: TODAY, accountId: 'main', surplus: 'carry' }, ctx))
    const next = carried.data.goals[0]!
    // Siguiente periodo: un año después, con solo el sobrante (no se marca como financiado).
    expect(next.targetDate).toBe('2027-10-01')
    expect(goalProgress(next).savedMinor).toBe(5000)
    expect(plannedExpenseStatus(next, TODAY).state).toBe('onTrack')
    expect(next.plan!.history).toEqual([expect.objectContaining({ dueDate: '2026-10-01', reservedMinor: 40000, paidMinor: 35000, surplus: 'carry' })])
    expect(next.plan!.paidAt).toBeUndefined()
  })

  it('pago mayor que lo apartado: el faltante sale del disponible y queda registrado', () => {
    const r = ok(savePlannedExpense(base, draft({ dueDate: '2026-10-01', initialReservedMinor: 30000 }), ctx))
    const before = computeBudget(r.data, TODAY).availableMinor
    const paid = ok(payPlannedExpense(r.data, { goalId: 'g', txId: 'p', amountMinor: 42000, date: TODAY, accountId: 'main', surplus: 'release' }, ctx))
    expect(paid.value).toMatchObject({ shortfallMinor: 12000, surplusMinor: 0 })
    expect(computeBudget(paid.data, TODAY).availableMinor).toBe(before - 12000)
    expect(spendableBalance(paid.data).totalMinor).toBe(spendableBalance(r.data).totalMinor - 42000)
  })

  it('recurrente vinculado: pasa a la siguiente ocurrencia del calendario', () => {
    const monthly = baseData({ schedules: [bill('2026-10-05', 12000, { id: 'ins', frequency: 'monthly' })] })
    const r = ok(savePlannedExpense(monthly, draft({ targetMinor: 12000, link: { scheduleId: 'ins', occurrenceDate: '2026-10-05' }, repeatEveryMonths: 1, initialReservedMinor: 12000 }), ctx))
    const paid = ok(payPlannedExpense(r.data, { goalId: 'g', txId: 'p', amountMinor: 12000, date: TODAY, accountId: 'main', surplus: 'release' }, ctx))
    expect(paid.data.goals[0]!.plan!.link).toEqual({ scheduleId: 'ins', occurrenceDate: '2026-11-05' })
    expect(paid.data.goals[0]!.targetDate).toBe('2026-11-05')
  })

  it('eliminar el pago programado quita el vínculo sin perder el dinero apartado', () => {
    const r = ok(savePlannedExpense(base, draft({ initialReservedMinor: 10000, link: { scheduleId: 'tuition', occurrenceDate: '2026-10-05' } }), ctx))
    const d = ok(deleteSchedule(r.data, 'tuition', ctx)).data
    expect(d.goals[0]!.plan!.link).toBeUndefined()
    expect(goalProgress(d.goals[0]!).savedMinor).toBe(10000)
  })
})
