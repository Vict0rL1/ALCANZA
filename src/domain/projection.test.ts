import { describe, expect, it } from 'vitest'
import { simulatePurchase } from './affordability'
import { goalPlan } from './goals'
import { estimateDailySpend, projectBalance } from './projection'
import { account, baseData, bill, deepFreeze, EARLIER, goal, income, TODAY, tx } from '../test/fixtures'

describe('proyección a 30 días', () => {
  const data = baseData({
    schedules: [income('2026-10-09', 60000), bill('2026-10-01', 65000), bill('2026-10-05', 50000)],
  })

  it('parte del saldo real y aplica ingresos y pagos previstos en su fecha', () => {
    const p = projectBalance(data, TODAY)
    expect(p.days).toHaveLength(30)
    expect(p.startMinor).toBe(100000)
    expect(p.days[0]!.date).toBe(TODAY)
    const oct1 = p.days.find((d) => d.date === '2026-10-01')!
    expect(oct1.endMinor).toBe(35000)
    const oct5 = p.days.find((d) => d.date === '2026-10-05')!
    expect(oct5.endMinor).toBe(-15000)
    expect(p.firstNegativeDate).toBe('2026-10-05')
    expect(p.lowest).toEqual({ date: '2026-10-05', minor: -15000 })
    expect(p.days.at(-1)!.endMinor).toBe(45000)
  })

  it('resta un gasto diario estimado cada día', () => {
    const p = projectBalance(baseData(), TODAY, { dailySpendMinor: 1000, days: 10 })
    expect(p.days.at(-1)!.endMinor).toBe(90000)
  })

  it('no suma ingresos retrasados y resta hoy los pagos vencidos', () => {
    const late = baseData({ schedules: [income('2026-09-25', 60000), bill('2026-09-26', 5000)] })
    const p = projectBalance(late, TODAY)
    expect(p.lateIncomesExcluded).toHaveLength(1)
    expect(p.overdueOutflowsToday).toHaveLength(1)
    expect(p.days[0]!.endMinor).toBe(95000)
    expect(p.hasIncomeInRange).toBe(false)
  })

  it('señala cuándo el saldo cae por debajo de los apartados', () => {
    const withGoal = baseData({
      schedules: [bill('2026-10-01', 80000)],
      goals: [goal({ allocations: [{ id: 'a', amountMinor: 30000, date: TODAY, createdAt: EARLIER }] })],
    })
    const p = projectBalance(withGoal, TODAY)
    expect(p.firstBelowGoalsDate).toBe('2026-10-01')
    expect(p.firstNegativeDate).toBeNull()
  })
})

describe('gasto diario estimado', () => {
  it('excluye pagos programados y transferencias y descuenta devoluciones', () => {
    const data = baseData({
      accounts: [account({ id: 'main' }), account({ id: 'sav', includeInBudget: false })],
      transactions: [
        tx({ date: '2026-09-18', amountMinor: 3000 }),
        tx({ date: '2026-09-20', amountMinor: 2000 }),
        tx({ date: '2026-09-21', kind: 'refund', categoryId: 'groceries', amountMinor: 1000 }),
        tx({ date: '2026-09-22', amountMinor: 65000, scheduleId: 'rent', occurrenceDate: '2026-09-22' }),
        tx({ date: '2026-09-23', kind: 'transfer', toAccountId: 'sav', categoryId: undefined, amountMinor: 9999 }),
        tx({ date: TODAY, amountMinor: 700 }), // hoy no cuenta (día incompleto)
      ],
    })
    const e = estimateDailySpend(data, TODAY)
    expect(e.totalMinor).toBe(4000)
    expect(e.daysObserved).toBe(10)
    expect(e.dailyMinor).toBe(400)
    expect(e.sufficient).toBe(true)
  })

  it('indica datos insuficientes con poco historial', () => {
    const e = estimateDailySpend(baseData({ transactions: [tx({ date: '2026-09-26', amountMinor: 1000 })] }), TODAY)
    expect(e.sufficient).toBe(false)
    expect(estimateDailySpend(baseData(), TODAY)).toMatchObject({ dailyMinor: 0, daysObserved: 0, sufficient: false })
  })
})

describe('¿Me alcanza?', () => {
  const data = deepFreeze(
    baseData({
      schedules: [income('2026-10-03', 50000), bill('2026-10-01', 40000)],
      goals: [goal({ allocations: [{ id: 'a', amountMinor: 10000, date: TODAY, createdAt: EARLIER }] })],
    }),
  )
  // Disponible = 1000 − 400 − 100 = 500.00; 5 días.

  it('muestra antes y después sin modificar los datos', () => {
    const snapshot = JSON.stringify(data)
    const r = simulatePurchase(data, TODAY, 10000)
    expect(r.budget.availableMinor).toBe(50000)
    expect(r.availableAfterMinor).toBe(40000)
    expect(r.budget.dailyMinor).toBe(10000)
    expect(r.dailyAfterMinor).toBe(8000)
    expect(r.verdict).toBe('fits')
    expect(JSON.stringify(data)).toBe(snapshot)
  })

  it('clasifica compras ajustadas, que usan apartados o que no alcanzan', () => {
    expect(simulatePurchase(data, TODAY, 30000).verdict).toBe('tight')
    expect(simulatePurchase(data, TODAY, 50000).verdict).toBe('tight')
    expect(simulatePurchase(data, TODAY, 55000).verdict).toBe('onlyWithGoals')
    expect(simulatePurchase(data, TODAY, 70000).verdict).toBe('doesNotFit')
    expect(simulatePurchase(data, TODAY, 70000).dailyAfterMinor).toBe(0)
  })

  it('avisa si alcanza hoy pero la proyección cae bajo cero después', () => {
    const d2 = baseData({ schedules: [income('2026-10-03', 1000), bill('2026-10-10', 80000)] })
    const r = simulatePurchase(d2, TODAY, 30000)
    expect(r.verdict).toBe('tight')
    expect(r.futureShortfallDate).toBe('2026-10-10')
    expect(r.shortfallExistedBefore).toBe(false)
  })

  it('distingue un faltante que ya existía sin la compra', () => {
    const d3 = baseData({ schedules: [income('2026-10-03', 1000), bill('2026-10-10', 120000)] })
    const r = simulatePurchase(d3, TODAY, 1000)
    expect(r.projectionBefore.firstNegativeDate).toBe('2026-10-10')
    expect(r.shortfallExistedBefore).toBe(true)
    expect(r.projectionAfter.lowest.minor).toBe(r.projectionBefore.lowest.minor - 1000)
  })

  it('sin horizonte no da veredicto', () => {
    expect(simulatePurchase(baseData(), TODAY, 100).verdict).toBeNull()
  })
})

describe('plan de ahorro de metas', () => {
  it('redondea la cuota hacia arriba para llegar a tiempo', () => {
    const g = goal({ targetMinor: 10000, targetDate: '2026-10-19' }) // 21 días = 3 semanas
    const plan = goalPlan(g, TODAY, ['2026-10-09', '2026-10-23'])
    expect(plan.weeksLeft).toBe(3)
    expect(plan.perWeekMinor).toBe(3334)
    expect(plan.incomeCount).toBe(1)
    expect(plan.perIncomeMinor).toBe(10000)
    expect(plan.monthsLeft).toBe(1)
  })

  it('estados especiales: sin fecha, vencida y completa', () => {
    expect(goalPlan(goal(), TODAY).status).toBe('noDate')
    expect(goalPlan(goal({ targetDate: '2026-09-01' }), TODAY).status).toBe('dueTodayOrPast')
    expect(goalPlan(goal({ targetMinor: 100, allocations: [{ id: 'a', amountMinor: 100, date: TODAY, createdAt: EARLIER }] }), TODAY).status).toBe('complete')
  })
})
