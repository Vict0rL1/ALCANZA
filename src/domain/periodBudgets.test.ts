import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { deleteTransaction, purgeTrash, saveTransaction } from './operations'
import {
  consolidatedSpent,
  reserveForPeriod,
  savePeriodBudget,
  setPeriodBudgetArchived,
  setPeriodTransaction,
  summarizePeriod,
  type PeriodBudgetDraft,
} from './periodBudgets'
import type { AppData } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, ctx, TODAY, tx } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

const trip: PeriodBudgetDraft = { id: 'trip', name: 'Viaje', template: 'trip', startDate: '2026-09-25', endDate: '2026-10-04', allocatedMinor: 50000 }
const semester: PeriodBudgetDraft = { id: 'sem', name: 'Semestre', template: 'semester', startDate: '2026-09-01', endDate: '2026-12-20', allocatedMinor: 300000 }

const data = baseData({
  transactions: [
    tx({ id: 'hotel', date: '2026-09-26', amountMinor: 20000, categoryId: 'other_expense' }),
    tx({ id: 'food', date: '2026-09-27', amountMinor: 5000, categoryId: 'dining' }),
    tx({ id: 'refund', date: '2026-09-28', kind: 'refund', amountMinor: 2000, categoryId: 'other_expense', refundOfId: 'hotel' }),
    tx({ id: 'flight', date: '2026-08-15', amountMinor: 30000, categoryId: 'transport' }),
    tx({ id: 'bus', date: '2026-10-02', status: 'planned', amountMinor: 1500, categoryId: 'transport', realizedAt: undefined }),
    tx({ id: 'salary', date: '2026-09-20', kind: 'income', amountMinor: 90000, categoryId: 'salary' }),
  ],
})

function withTrip(d: AppData = data, ids = ['hotel', 'food', 'flight', 'bus']): AppData {
  let next = ok(savePeriodBudget(d, trip, ctx)).data
  for (const id of ids) next = ok(setPeriodTransaction(next, 'trip', id, true, ctx)).data
  return next
}

describe('presupuestos por periodo', () => {
  it('crear no mueve, ingresa ni reserva dinero', () => {
    const before = computeBudget(data, TODAY).availableMinor
    const r = ok(savePeriodBudget(data, trip, ctx))
    expect(computeBudget(r.data, TODAY).availableMinor).toBe(before)
    expect(r.data.transactions).toEqual(data.transactions)
  })

  it('gastado, restante, previstos, fuera de fechas y promedio por día y semana', () => {
    const s = summarizePeriod(withTrip(), withTrip().periodBudgets[0]!, TODAY)
    // 200 + 50 + 300 (vuelo fuera de fechas, asociado a propósito) − 20 de devolución implícita.
    expect(s.spentMinor).toBe(53000)
    expect(s.plannedMinor).toBe(1500)
    expect(s.remainingMinor).toBe(-3000)
    expect(s.outsideRange.map((t) => t.id)).toEqual(['flight'])
    expect(s).toMatchObject({ status: 'active', totalDays: 10, daysLeft: 7, perDayMinor: 0, perWeekMinor: 0 })
    const small = summarizePeriod(withTrip(data, ['hotel', 'food']), withTrip(data, ['hotel', 'food']).periodBudgets[0]!, TODAY)
    expect(small.remainingMinor).toBe(27000)
    expect(small.perDayMinor).toBe(3857) // floor(27000 / 7)
    expect(small.perWeekMinor).toBe(27000)
  })

  it('solo gastos y devoluciones: transferencias e ingresos no se asocian', () => {
    const d = ok(savePeriodBudget(data, trip, ctx)).data
    expect(setPeriodTransaction(d, 'trip', 'salary', true, ctx).ok).toBe(false)
    // Asociar dos veces no duplica.
    const once = ok(setPeriodTransaction(d, 'trip', 'hotel', true, ctx)).data
    expect(setPeriodTransaction(once, 'trip', 'hotel', true, ctx)).toMatchObject({ unchanged: true })
  })

  it('periodos solapados: un movimiento en dos presupuestos cuenta una vez en el total', () => {
    let d = withTrip(data, ['hotel', 'food'])
    d = ok(savePeriodBudget(d, semester, ctx)).data
    d = ok(setPeriodTransaction(d, 'sem', 'hotel', true, ctx)).data
    const trip = summarizePeriod(d, d.periodBudgets[0]!, TODAY)
    const sem = summarizePeriod(d, d.periodBudgets[1]!, TODAY)
    expect(trip.shared.map((t) => t.id)).toEqual(['hotel'])
    expect(trip.spentMinor + sem.spentMinor).toBe(23000 + 18000)
    // Consolidado: el hotel (y su devolución) una sola vez.
    expect(consolidatedSpent(d, d.periodBudgets)).toEqual({ spentMinor: 23000, sharedCount: 2 })
  })

  it('periodo terminado y futuro; archivar conserva el historial', () => {
    const d = withTrip()
    const b = d.periodBudgets[0]!
    expect(summarizePeriod(d, b, '2026-10-10')).toMatchObject({ status: 'ended', daysLeft: 0, perDayMinor: null })
    expect(summarizePeriod(d, b, '2026-09-01')).toMatchObject({ status: 'upcoming', daysLeft: 10 })
    const archived = ok(setPeriodBudgetArchived(d, 'trip', true, ctx))
    expect(archived.value.archived).toBe(true)
    expect(summarizePeriod(archived.data, archived.value, TODAY).spentMinor).toBe(53000)
  })

  it('papelera: lo eliminado no cuenta; al purgarlo se quita la asociación', () => {
    const d = withTrip()
    const trashed = ok(deleteTransaction(d, 'food', ctx)).data
    const s = summarizePeriod(trashed, trashed.periodBudgets[0]!, TODAY)
    expect(s.spentMinor).toBe(48000)
    expect(s.trashedCount).toBe(1)
    const purged = ok(purgeTrash(trashed, 'all', ctx)).data
    expect(purged.periodBudgets[0]!.txIds).not.toContain('food')
  })

  it('reservar dinero para el periodo: descuenta una vez y lo gastado libera la reserva', () => {
    const bank = account({ id: 'main', anchor: { amountMinor: 100000, date: '2026-09-01', setAt: '2026-09-01T12:00:00.000Z' } })
    const clean = baseData({ accounts: [bank] })
    let d = ok(savePeriodBudget(clean, { ...trip, startDate: '2026-09-28', endDate: '2026-10-04' }, ctx)).data
    const before = computeBudget(d, TODAY).availableMinor
    d = ok(reserveForPeriod(d, { budgetId: 'trip', amountMinor: 30000, goalId: 'res' }, ctx)).data
    expect(d.periodBudgets[0]!.goalId).toBe('res')
    expect(computeBudget(d, TODAY).availableMinor).toBe(before - 30000)
    // Gasto del viaje asociado: sale del saldo y consume la reserva (no se descuenta dos veces).
    d = ok(saveTransaction(d, { id: 'dinner', kind: 'expense', status: 'realized', amountMinor: 10000, date: TODAY, accountId: 'main', categoryId: 'dining' }, ctx)).data
    d = ok(setPeriodTransaction(d, 'trip', 'dinner', true, ctx)).data
    const b = computeBudget(d, TODAY)
    expect(b.goalsReservedMinor).toBe(20000)
    expect(b.availableMinor).toBe(before - 30000)
    // Reservar más de lo libre no se permite.
    expect(reserveForPeriod(d, { budgetId: 'trip', amountMinor: 999999 }, ctx).ok).toBe(false)
  })

  it('valida fechas, importe y moneda; se incluye en copias', () => {
    const bad = savePeriodBudget(data, { ...trip, endDate: '2026-09-01', allocatedMinor: 0 }, ctx)
    expect(bad.ok ? [] : bad.issues.map((i) => i.code).sort()).toEqual(['amountNotPositive', 'endBeforeStart'])
    const d = withTrip()
    const restored = validateAppData(JSON.parse(JSON.stringify(d)))
    expect(restored.ok && restored.data.periodBudgets).toEqual(d.periodBudgets)
  })
})

describe('presupuestos por periodo: desde el formulario de movimiento', () => {
  it('asocia a varios a la vez, respeta los archivados y es idempotente', async () => {
    const { setTransactionPeriods } = await import('./periodBudgets')
    let d = ok(savePeriodBudget(data, trip, ctx)).data
    d = ok(savePeriodBudget(d, semester, ctx)).data
    d = ok(setTransactionPeriods(d, 'hotel', ['trip', 'sem'], ctx)).data
    expect(d.periodBudgets.map((b) => b.txIds)).toEqual([['hotel'], ['hotel']])
    expect(setTransactionPeriods(d, 'hotel', ['trip', 'sem'], ctx)).toMatchObject({ unchanged: true })
    d = ok(setPeriodBudgetArchived(d, 'sem', true, ctx)).data
    d = ok(setTransactionPeriods(d, 'hotel', [], ctx)).data
    expect(d.periodBudgets.map((b) => b.txIds)).toEqual([[], ['hotel']])
  })
})
