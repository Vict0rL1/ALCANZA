import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { heroFigures } from './heroFigures'
import { account, baseData, TODAY, tx } from '../test/fixtures'

describe('cifras del héroe (ingresos, gastos y % disponible)', () => {
  // Saldo de referencia 1000.00 hoy (28-sep). Movimientos de septiembre: ingreso 500, gasto 200,
  // una transferencia y un gasto previsto (ninguno de los dos cuenta).
  const data = baseData({
    accounts: [baseData().accounts[0]!, account({ id: 'save', includeInBudget: false, anchor: { amountMinor: 0, date: TODAY, setAt: '2026-09-28T13:00:00.000Z' } })],
    transactions: [
      tx({ id: 'pay', kind: 'income', amountMinor: 50000, date: '2026-09-10', categoryId: 'salary' }),
      tx({ id: 'rent', amountMinor: 20000, date: '2026-09-15' }),
      tx({ id: 'move', kind: 'transfer', toAccountId: 'save', amountMinor: 10000, date: '2026-09-16' }),
      tx({ id: 'later', amountMinor: 999, date: '2026-09-29', status: 'planned' }),
    ],
  })

  it('sin periodo de calendario usa el mes natural; mismas sumas que Estadísticas', () => {
    const budget = computeBudget(data, TODAY)
    const h = heroFigures(data, budget, TODAY)
    expect([h.start, h.end, h.isBudgetPeriod]).toEqual(['2026-09-01', '2026-09-30', false])
    expect(h.incomeMinor).toBe(50000)
    expect(h.expensesMinor).toBe(20000)
    // Los movimientos son del mismo día del saldo o anteriores: no cambian el saldo (1000.00).
    expect(budget.spendableMinor).toBe(100000)
    // Saldo al empezar = 1000 − (500 − 200) = 700; base = 700 + 500 = 1200.
    expect(h.startBalanceMinor).toBe(70000)
    expect(h.baseMinor).toBe(120000)
    // % = disponible ÷ base, redondeado hacia abajo (el disponible descuenta lo reservado por los datos base).
    expect(h.availablePct).toBe(Math.floor((budget.availableMinor * 100) / 120000))
    expect(h.availablePct).toBeGreaterThan(0)
  })

  it('con periodo de presupuesto usa sus fechas', () => {
    const d = { ...data, settings: { ...data.settings, budgetPeriod: { type: 'week' as const, weekStartsOn: 1 as const } } }
    const budget = computeBudget(d, TODAY)
    const h = heroFigures(d, budget, TODAY)
    expect(h.isBudgetPeriod).toBe(true)
    expect([h.start, h.end]).toEqual([budget.period!.start, budget.period!.end])
    expect(h.incomeMinor).toBe(0)
    expect(h.expensesMinor).toBe(0)
  })

  it('base 0 → 0 %; disponible negativo → 0 %; nunca pasa de 100', () => {
    const zero = baseData({ accounts: [account({ id: 'main', anchor: { amountMinor: 0, date: TODAY, setAt: '2026-09-28T13:00:00.000Z' } })] })
    expect(heroFigures(zero, computeBudget(zero, TODAY), TODAY).availablePct).toBe(0)
    const negative = heroFigures(data, { period: null, spendableMinor: 100000, availableMinor: -500 }, TODAY)
    expect(negative.availablePct).toBe(0)
    const over = heroFigures(data, { period: null, spendableMinor: 100000, availableMinor: 500000 }, TODAY)
    expect(over.availablePct).toBe(100)
  })
})
