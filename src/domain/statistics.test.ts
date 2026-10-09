import { describe, expect, it } from 'vitest'
import { categoryBreakdown, categoryTransactions, cumulativeTrend, dailyAverage, futureBalance, periodSeries, periodStats, shiftRange, statsRange, topMerchants } from './statistics'
import { account, baseData, ctx, NOW, TODAY, tx } from '../test/fixtures'

function sample() {
  return baseData({
    accounts: [account({ id: 'main', name: 'Principal', anchor: { amountMinor: 100000, date: '2026-08-01', setAt: '2026-08-01T12:00:00.000Z' } })],
    createdAt: '2026-07-01T12:00:00.000Z',
    transactions: [
      tx({ id: 'i1', kind: 'income', amountMinor: 64000, date: '2026-09-05' }),
      tx({ id: 'a', categoryId: 'dining', amountMinor: 9000, date: '2026-09-02', merchant: 'Café Luna' }),
      tx({ id: 'b', categoryId: 'groceries', amountMinor: 5000, date: '2026-09-03', note: 'Super' }),
      tx({ id: 'c', kind: 'refund', categoryId: 'dining', amountMinor: 1000, date: '2026-09-04', merchant: 'cafe luna' }),
      tx({ id: 'd', categoryId: 'transport', amountMinor: 2000, date: '2026-09-10' }),
      tx({ id: 'e', categoryId: 'dining', amountMinor: 3000, date: '2026-09-27', merchant: 'Café Luna' }),
      tx({ id: 'f', categoryId: 'dining', amountMinor: 999, date: '2026-10-01', status: 'planned' }),
      // Agosto (periodo anterior).
      tx({ id: 'g', categoryId: 'groceries', amountMinor: 8000, date: '2026-08-10', note: 'Super' }),
      tx({ id: 'h', kind: 'income', amountMinor: 32000, date: '2026-08-05' }),
    ],
  })
}

describe('estadísticas: rangos, comparación, desglose y series', () => {
  it('rango del tipo elegido y desplazamiento al anterior/siguiente (personalizado conserva la duración)', () => {
    const d = sample()
    const month = statsRange('month', d.settings, TODAY)
    expect(month).toMatchObject({ start: '2026-09-01', end: '2026-09-30' })
    expect(shiftRange(month, 'month', d.settings, -1)).toMatchObject({ start: '2026-08-01', end: '2026-08-31' })
    expect(shiftRange(month, 'month', d.settings, 1)).toMatchObject({ start: '2026-10-01', end: '2026-10-31' })
    const custom = statsRange('custom', d.settings, TODAY, { start: '2026-09-10', end: '2026-09-19' })
    expect(shiftRange(custom, 'custom', d.settings, -1)).toMatchObject({ start: '2026-08-31', end: '2026-09-09' })
    expect(statsRange('custom', d.settings, TODAY)).toMatchObject({ start: '2026-08-30', end: TODAY })
    expect(statsRange('week', { ...d.settings, budgetPeriod: { type: 'month', weekStartsOn: 1 } }, TODAY)).toMatchObject({ start: '2026-09-28', end: '2026-10-04' })
  })

  it('tres cifras con delta frente al periodo anterior; sin porcentaje con base 0 o datos no comparables', () => {
    const d = sample()
    const s = periodStats(d, 'month', statsRange('month', d.settings, TODAY))
    // Gastos netos: 9000 + 5000 − 1000 + 2000 + 3000 = 18000 (el previsto no cuenta).
    expect(s).toMatchObject({ incomeMinor: 64000, expensesMinor: 18000, netMinor: 46000, transactionCount: 6, previousComparable: true })
    expect(s.income).toEqual({ diffMinor: 32000, percent: 100 })
    expect(s.expenses).toEqual({ diffMinor: 10000, percent: 125 })
    expect(s.net).toEqual({ diffMinor: 22000, percent: 91 })
    // Julio no tiene nada: base 0 → sin porcentaje. Junio empieza antes de los registros → no comparable.
    const aug = periodStats(d, 'month', statsRange('month', d.settings, '2026-08-15'))
    expect(aug.income).toEqual({ diffMinor: 32000, percent: null })
    const jul = periodStats(d, 'month', statsRange('month', d.settings, '2026-07-15'))
    expect(jul.previousComparable).toBe(false)
    expect(jul.expenses.percent).toBeNull()
  })

  it('desglose por categoría con porcentajes enteros y movimientos de una categoría', () => {
    const d = sample()
    const range = statsRange('month', d.settings, TODAY)
    const b = categoryBreakdown(d, range)
    expect(b.total).toBe(18000)
    expect(b.categories.map((c) => [c.categoryId, c.netMinor, c.percent])).toEqual([
      ['dining', 11000, 61],
      ['groceries', 5000, 27],
      ['transport', 2000, 11],
    ])
    expect(categoryTransactions(d, range, 'dining').map((t) => t.id)).toEqual(['a', 'c', 'e'])
  })

  it('serie de 6 periodos (el actual al final) y tendencia acumulada frente al anterior', () => {
    const d = sample()
    const range = statsRange('month', d.settings, TODAY)
    const series = periodSeries(d, 'month', range, 6)
    expect(series).toHaveLength(6)
    expect(series[5]).toMatchObject({ incomeMinor: 64000, expensesMinor: 18000 })
    expect(series[4]).toMatchObject({ incomeMinor: 32000, expensesMinor: 8000 })
    expect(series[0]!.range.start).toBe('2026-04-01')
    const trend = cumulativeTrend(d, range, shiftRange(range, 'month', d.settings, -1), TODAY)
    expect(trend).toHaveLength(30)
    expect(trend[1]).toMatchObject({ day: 2, currentMinor: 9000, previousMinor: 0 })
    expect(trend[9]).toMatchObject({ day: 10, currentMinor: 15000, previousMinor: 8000 })
    expect(trend[27]).toMatchObject({ day: 28, currentMinor: 18000 })
    expect(trend[29]).toMatchObject({ day: 30, currentMinor: null, previousMinor: 8000 })
  })

  it('top de comercios agrupa sin acentos ni mayúsculas y resta devoluciones; promedio diario y día con más gasto', () => {
    const d = sample()
    const range = statsRange('month', d.settings, TODAY)
    expect(topMerchants(d, range)).toEqual([
      { key: 'cafe luna', label: 'Café Luna', amountMinor: 11000, count: 3 },
      { key: 'super', label: 'Super', amountMinor: 5000, count: 1 },
    ])
    const avg = dailyAverage(d, range, TODAY)
    expect(avg).toMatchObject({ averageMinor: 642, daysCounted: 28 }) // 18000 / 28
    // 2-sep (mié) 9000; 27-sep (dom) 3000; 3-sep (jue) 5000; 4-sep (vie) −1000; 10-sep (jue) 2000 → jueves 7000 < miércoles 9000.
    expect(avg.topWeekday).toBe(3)
    expect(avg.topWeekdayMinor).toBe(9000)
    expect(dailyAverage(baseData(), range, TODAY)).toMatchObject({ averageMinor: 0, topWeekday: null })
  })

  it('saldo futuro a 90 días: oculto sin historial suficiente; con datos, banda y marcas Hoy/30/60/90', () => {
    expect(futureBalance(baseData(), TODAY)).toMatchObject({ enough: false, reason: 'noHistory' })
    const d = sample()
    const fb = futureBalance(d, TODAY)
    expect(fb.enough).toBe(true)
    expect(fb.points).toHaveLength(91)
    expect(fb.marks.map((m) => m.date)).toEqual([TODAY, '2026-10-28', '2026-11-27', '2026-12-27'])
    for (const p of fb.points) {
      expect(p.pessimisticMinor).toBeLessThanOrEqual(p.baseMinor)
      expect(p.baseMinor).toBeLessThanOrEqual(p.optimisticMinor)
    }
    expect(fb.points[0]!.date).toBe(TODAY)
    // Pocos días de historial: oculto.
    const young = baseData({ createdAt: NOW, transactions: [tx({ id: 'x', date: TODAY })] })
    expect(futureBalance(young, ctx.today)).toMatchObject({ enough: false, reason: 'fewDays' })
  })
})
