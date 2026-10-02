import { describe, expect, it } from 'vitest'
import { limitStatuses, periodSummary } from './insights'
import { removeCategoryLimit, setCategoryLimit } from './operations'
import { baseData, ctx, tx } from '../test/fixtures'

describe('resumen del periodo por categoría', () => {
  const data = baseData({
    transactions: [
      tx({ date: '2026-09-02', amountMinor: 5000, categoryId: 'groceries' }),
      tx({ date: '2026-09-10', amountMinor: 3000, categoryId: 'groceries' }),
      tx({ date: '2026-09-12', amountMinor: 4999, categoryId: 'shopping' }),
      tx({ date: '2026-09-15', kind: 'refund', amountMinor: 1500, categoryId: 'shopping' }),
      tx({ date: '2026-09-20', kind: 'income', amountMinor: 60000, categoryId: 'salary' }),
      tx({ date: '2026-09-21', kind: 'transfer', amountMinor: 9999, categoryId: undefined, toAccountId: 'main' }),
      tx({ date: '2026-09-25', status: 'planned', amountMinor: 7000, categoryId: 'dining', realizedAt: undefined }),
      tx({ date: '2026-10-01', amountMinor: 800, categoryId: 'dining' }),
    ],
  })

  it('suma gastos menos devoluciones por categoría, sin transferencias ni previstos', () => {
    const s = periodSummary(data, '2026-09-01', '2026-09-30')
    expect(s.incomeMinor).toBe(60000)
    expect(s.netSpendingMinor).toBe(8000 + 3499)
    expect(s.categories.map((c) => [c.categoryId, c.netMinor, c.count])).toEqual([
      ['groceries', 8000, 2],
      ['shopping', 3499, 2],
    ])
  })

  it('una devolución mayor que el gasto del periodo da neto negativo', () => {
    const s = periodSummary(data, '2026-09-13', '2026-09-30')
    expect(s.categories.find((c) => c.categoryId === 'shopping')?.netMinor).toBe(-1500)
  })

  it('respeta los límites del periodo (cambio de mes)', () => {
    expect(periodSummary(data, '2026-10-01', '2026-10-31').netSpendingMinor).toBe(800)
  })
})

describe('límites mensuales por categoría', () => {
  const data = baseData({
    transactions: [
      tx({ date: '2026-09-02', amountMinor: 9000, categoryId: 'dining' }),
      tx({ date: '2026-09-03', amountMinor: 2000, categoryId: 'groceries' }),
    ],
  })
  const summary = periodSummary(data, '2026-09-01', '2026-09-30')

  it('marca pasado, cerca (≥ 80 %) y dentro del límite', () => {
    const [dining, groceries, health] = limitStatuses(summary, [
      { categoryId: 'dining', monthlyLimitMinor: 8000 },
      { categoryId: 'groceries', monthlyLimitMinor: 2500 },
      { categoryId: 'health', monthlyLimitMinor: 5000 },
    ])
    expect(dining).toMatchObject({ over: true, near: false, remainingMinor: -1000 })
    expect(groceries).toMatchObject({ over: false, near: true, remainingMinor: 500 })
    expect(health).toMatchObject({ over: false, near: false, spentMinor: 0 })
  })

  it('solo categorías de gasto, un límite por categoría, importe positivo', () => {
    const ok = setCategoryLimit(data, { categoryId: 'dining', monthlyLimitMinor: 10000 }, ctx)
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    const replaced = setCategoryLimit(ok.data, { categoryId: 'dining', monthlyLimitMinor: 12000 }, ctx)
    expect(replaced.ok && replaced.data.categoryLimits).toEqual([{ categoryId: 'dining', monthlyLimitMinor: 12000 }])
    expect(setCategoryLimit(data, { categoryId: 'salary', monthlyLimitMinor: 100 }, ctx).ok).toBe(false)
    expect(setCategoryLimit(data, { categoryId: 'dining', monthlyLimitMinor: 0 }, ctx).ok).toBe(false)
    const removed = removeCategoryLimit(ok.data, 'dining', ctx)
    expect(removed.ok && removed.data.categoryLimits).toEqual([])
  })
})
