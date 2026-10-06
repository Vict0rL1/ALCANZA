import { describe, expect, it } from 'vitest'
import { todayInTimeZone } from './dates'
import type { AppData } from './types'
import { trackedSince, weeklyReview, weekStartOf } from './weeklyReview'
import { account, baseData, bill, goal, tx } from '../test/fixtures'

// Semana del lunes 21 al domingo 27 de septiembre de 2026; la anterior, 14–20.
const bank = account({ id: 'main', anchor: { amountMinor: 100000, date: '2026-09-01', setAt: '2026-09-01T12:00:00.000Z' } })
const savings = account({ id: 'sav', name: 'Ahorro', includeInBudget: false, anchor: { amountMinor: 0, date: '2026-09-01', setAt: '2026-09-01T12:00:00.000Z' } })
const make = (over: Partial<AppData> = {}) => baseData({ accounts: [bank, savings], createdAt: '2026-09-01T12:00:00.000Z', ...over })

describe('revisión semanal: límites de semana', () => {
  it('lunes a domingo con fechas de calendario', () => {
    expect(weekStartOf('2026-09-27')).toBe('2026-09-21') // domingo
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28') // lunes
  })

  it('la zona horaria decide a qué semana pertenece «hoy»', () => {
    // 02:00 UTC del lunes 28 aún es domingo 27 en Toronto: otra semana.
    const instant = new Date('2026-09-28T02:00:00Z')
    expect(weekStartOf(todayInTimeZone('America/Toronto', instant))).toBe('2026-09-21')
    expect(weekStartOf(todayInTimeZone('UTC', instant))).toBe('2026-09-28')
  })
})

describe('revisión semanal: totales y comparación', () => {
  const data = make({
    transactions: [
      tx({ id: 'a', date: '2026-09-15', amountMinor: 4000, categoryId: 'groceries' }),
      tx({ id: 'b', date: '2026-09-22', amountMinor: 6000, categoryId: 'groceries' }),
      tx({ id: 'c', date: '2026-09-23', amountMinor: 2500, categoryId: 'dining' }),
      tx({ id: 'd', date: '2026-09-24', kind: 'refund', amountMinor: 500, categoryId: 'dining' }),
      tx({ id: 'e', date: '2026-09-25', kind: 'income', amountMinor: 50000, categoryId: 'salary' }),
      tx({ id: 'f', date: '2026-09-26', kind: 'transfer', categoryId: undefined, toAccountId: 'sav', amountMinor: 10000 }),
      tx({ id: 'g', date: '2026-09-26', kind: 'adjustment', categoryId: undefined, adjustmentDirection: 'decrease', amountMinor: 300 }),
    ],
    goals: [goal({ id: 'trip', allocations: [{ id: 'x', amountMinor: 7000, date: '2026-09-22', createdAt: '2026-09-22T12:00:00.000Z', reason: 'contribution' }] })],
  })

  it('separa ingresos, gasto neto, transferencias, apartados y ajustes', () => {
    const r = weeklyReview(data, '2026-09-21', '2026-09-28')
    expect(r.isCurrent).toBe(false)
    expect(r.current).toMatchObject({ incomeMinor: 50000, spendingMinor: 8000, balanceMinor: 42000, toSavingsMinor: 10000, transfersMinor: 10000, goalContributionsMinor: 7000, coverage: 'complete' })
    expect(r.current.categories.map((c) => c.categoryId)).toEqual(['groceries', 'dining'])
    expect(r.previous).toMatchObject({ from: '2026-09-14', to: '2026-09-20', spendingMinor: 4000 })
    expect(r.spendingChange).toEqual({ diffMinor: 4000, percent: 100 })
    const ids = r.observations.map((o) => o.id)
    expect(ids).toEqual(expect.arrayContaining(['spendingMore', 'topCategory', 'goalContributions', 'toSavings']))
  })

  it('semana en curso: compara periodos equivalentes (lunes…hoy)', () => {
    const r = weeklyReview(data, '2026-09-21', '2026-09-23')
    expect(r).toMatchObject({ isCurrent: true, throughDate: '2026-09-23' })
    expect(r.current.spendingMinor).toBe(8500)
    expect(r.previous).toMatchObject({ from: '2026-09-14', to: '2026-09-16', spendingMinor: 4000 })
  })

  it('base cero: sin porcentaje ni división entre cero', () => {
    const noPrev = make({ transactions: [tx({ id: 'i', date: '2026-09-16', kind: 'income', amountMinor: 1000, categoryId: 'salary' }), tx({ id: 'b', date: '2026-09-22', amountMinor: 6000 })] })
    const r = weeklyReview(noPrev, '2026-09-21', '2026-09-28')
    expect(r.previous.spendingMinor).toBe(0)
    expect(r.spendingChange).toEqual({ diffMinor: 6000, percent: null })
    expect(r.incomeChange.percent).toBe(-100)
  })

  it('sin registros no se interpreta como «sin gastos»; antes de empezar faltan datos', () => {
    const empty = make()
    const r = weeklyReview(empty, '2026-09-21', '2026-09-28')
    expect(r.observations.map((o) => o.id)).toContain('noRecords')
    expect(r.spendingChange.percent).toBeNull()
    expect(trackedSince(empty)).toBe('2026-09-01')
    const partial = weeklyReview(empty, '2026-08-31', '2026-09-28')
    expect(partial.current.coverage).toBe('partial')
    expect(partial.observations.map((o) => o.id)).toContain('partialData')
    expect(weeklyReview(empty, '2026-08-10', '2026-09-28').current.coverage).toBe('none')
  })

  it('próximos pagos de 7 días (solo semana en curso) y progreso real de metas', () => {
    const d = make({ schedules: [bill('2026-09-30', 4280, { name: 'Luz' }), bill('2026-10-02', 1000, { name: 'Tel' }), bill('2026-10-20', 9999)] })
    const r = weeklyReview(d, '2026-09-28', '2026-09-28')
    expect(r.upcoming.map((i) => i.name)).toEqual(['Luz', 'Tel'])
    expect(r.observations).toContainEqual({ id: 'upcomingPayments', params: { count: 2, totalMinor: 5280 } })
    expect(weeklyReview(d, '2026-09-14', '2026-09-28').upcoming).toEqual([])
    const g = weeklyReview(data, '2026-09-21', '2026-09-28').goals[0]!
    expect(g).toMatchObject({ savedMinor: 7000, weekMinor: 7000, complete: false })
  })
})
