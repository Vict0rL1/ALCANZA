import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { dataAsOf, homePeriodAt, homeSnapshotAt, isCurrentPeriod, nextPeriod, previousPeriod } from './homeSnapshot'
import { account, baseData, TODAY, tx } from '../test/fixtures'

// Saldo de referencia 1000.00 fijado hoy (28-sep-2026). Movimientos de agosto y septiembre.
const data = baseData({
  accounts: [baseData().accounts[0]!, account({ id: 'save', includeInBudget: false, anchor: { amountMinor: 0, date: TODAY, setAt: '2026-09-28T13:00:00.000Z' } })],
  transactions: [
    tx({ id: 'aug-pay', kind: 'income', amountMinor: 40000, date: '2026-08-05', categoryId: 'salary' }),
    tx({ id: 'aug-rent', amountMinor: 30000, date: '2026-08-10' }),
    tx({ id: 'sep-pay', kind: 'income', amountMinor: 50000, date: '2026-09-10', categoryId: 'salary' }),
    tx({ id: 'sep-rent', amountMinor: 20000, date: '2026-09-15' }),
    tx({ id: 'sep-move', kind: 'transfer', toAccountId: 'save', amountMinor: 10000, date: '2026-09-16' }),
    tx({ id: 'sep-planned', amountMinor: 999, date: '2026-09-29', status: 'planned' }),
  ],
})

describe('Inicio en otro periodo (D1)', () => {
  it('mes cerrado: ingresos y gastos de ese mes y el saldo tal como estaba al cierre', () => {
    const snap = homeSnapshotAt(data, '2026-08-31', { today: TODAY })
    expect([snap.period.start, snap.period.end]).toEqual(['2026-08-01', '2026-08-31'])
    expect(snap.hero.incomeMinor).toBe(40000)
    expect(snap.hero.expensesMinor).toBe(30000)
    // 1000.00 hoy incluía septiembre: +500 −200 −100 (transferencia a ahorro) = +200 → al 31-ago había 800.00.
    expect(snap.budget.spendableMinor).toBe(80000)
    expect(snap.transactionCount).toBe(2)
  })

  it('periodo sin movimientos: ceros y el saldo retrocedido también quita agosto', () => {
    const snap = homeSnapshotAt(data, '2026-07-31', { today: TODAY })
    expect(snap.hero.incomeMinor).toBe(0)
    expect(snap.hero.expensesMinor).toBe(0)
    expect(snap.transactionCount).toBe(0)
    // 800.00 al 31-ago menos lo de agosto (+400 −300 = +100) → 700.00 al 31-jul.
    expect(snap.budget.spendableMinor).toBe(70000)
  })

  it('el periodo actual coincide con las cifras vivas (se calcula a hoy, no al fin del mes)', () => {
    const snap = homeSnapshotAt(data, '2026-09-30', { today: TODAY })
    const live = computeBudget(data, TODAY)
    expect(snap.budget.spendableMinor).toBe(live.spendableMinor)
    expect(snap.budget.availableMinor).toBe(live.availableMinor)
    expect(isCurrentPeriod(snap.period, TODAY)).toBe(true)
  })

  it('«hasta mi próximo ingreso» navega por meses naturales; el futuro no existe', () => {
    const settings = data.settings.budgetPeriod
    const current = homePeriodAt(settings, TODAY, TODAY)
    expect([current.type, current.start, current.end]).toEqual(['month', '2026-09-01', '2026-09-30'])
    const prev = previousPeriod(settings, current, TODAY)
    expect([prev.start, prev.end]).toEqual(['2026-08-01', '2026-08-31'])
    expect(nextPeriod(settings, prev, TODAY)).toEqual(current)
    expect(nextPeriod(settings, current, TODAY)).toBeNull()
  })

  it('con periodo semanal navega por semanas', () => {
    const settings = { type: 'week' as const, weekStartsOn: 1 as const }
    const current = homePeriodAt(settings, TODAY, TODAY)
    expect([current.start, current.end]).toEqual(['2026-09-28', '2026-10-04'])
    const prev = previousPeriod(settings, current, TODAY)
    expect([prev.start, prev.end]).toEqual(['2026-09-21', '2026-09-27'])
    const snap = homeSnapshotAt({ ...data, settings: { ...data.settings, budgetPeriod: settings } }, prev.end, { today: TODAY })
    expect(snap.period).toEqual(prev)
    expect(snap.hero.incomeMinor).toBe(0)
  })

  it('nunca modifica los datos reales', () => {
    const before = JSON.stringify(data)
    homeSnapshotAt(data, '2026-08-31', { today: TODAY })
    dataAsOf(data, '2026-07-31')
    expect(JSON.stringify(data)).toBe(before)
  })
})
