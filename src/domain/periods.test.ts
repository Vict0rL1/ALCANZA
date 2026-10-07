import { describe, expect, it } from 'vitest'
import { getPeriod, periodBalance, safeToSpend, startOfWeek } from './periods'
import { baseData, tx } from '../test/fixtures'
import type { BudgetPeriodSettings } from './types'

const s = (type: BudgetPeriodSettings['type'], extra: Partial<BudgetPeriodSettings> = {}): BudgetPeriodSettings => ({ type, weekStartsOn: 1, ...extra })

describe('getPeriod (§6.1)', () => {
  it('semana según el día de inicio; quincena 1–15 / 16–fin; mes', () => {
    // 2026-09-30 es miércoles.
    expect(startOfWeek('2026-09-30', 1)).toBe('2026-09-28')
    expect(startOfWeek('2026-09-30', 0)).toBe('2026-09-27')
    expect(getPeriod(s('week'), '2026-09-30')).toMatchObject({ start: '2026-09-28', end: '2026-10-04', days: 7, daysLeft: 5 })
    expect(getPeriod(s('week', { weekStartsOn: 0 }), '2026-09-27')).toMatchObject({ start: '2026-09-27', end: '2026-10-03', daysLeft: 7 })
    expect(getPeriod(s('biweek'), '2026-02-15')).toMatchObject({ start: '2026-02-01', end: '2026-02-15', days: 15, daysLeft: 1 })
    expect(getPeriod(s('biweek'), '2026-02-16')).toMatchObject({ start: '2026-02-16', end: '2026-02-28', days: 13, daysLeft: 13 })
    expect(getPeriod(s('month'), '2026-02-10')).toMatchObject({ start: '2026-02-01', end: '2026-02-28', days: 28, daysLeft: 19, anchorMonth: 2, anchorYear: 2026 })
    expect(getPeriod(s('month'), '2028-02-29')).toMatchObject({ end: '2028-02-29', daysLeft: 1 })
  })

  it('trimestre, semestre y año alineados al calendario', () => {
    expect(getPeriod(s('quarter'), '2026-11-15')).toMatchObject({ start: '2026-10-01', end: '2026-12-31', days: 92, daysLeft: 47 })
    expect(getPeriod(s('quarter'), '2026-03-31')).toMatchObject({ start: '2026-01-01', end: '2026-03-31', daysLeft: 1 })
    expect(getPeriod(s('semester'), '2026-07-01')).toMatchObject({ start: '2026-07-01', end: '2026-12-31', days: 184 })
    expect(getPeriod(s('year'), '2026-10-07')).toMatchObject({ start: '2026-01-01', end: '2026-12-31', days: 365, daysLeft: 86 })
  })

  it('personalizado: se repite con la misma duración hasta contener hoy; mal definido = mes', () => {
    const custom = s('custom', { customStart: '2026-09-05', customEnd: '2026-09-14' }) // 10 días
    expect(getPeriod(custom, '2026-09-10')).toMatchObject({ start: '2026-09-05', end: '2026-09-14', daysLeft: 5 })
    expect(getPeriod(custom, '2026-09-25')).toMatchObject({ start: '2026-09-25', end: '2026-10-04', daysLeft: 10 })
    expect(getPeriod(custom, '2026-09-01')).toMatchObject({ start: '2026-08-26', end: '2026-09-04' })
    expect(getPeriod(s('custom'), '2026-09-10')).toMatchObject({ type: 'month', start: '2026-09-01' })
  })

  it('hasta mi próximo ingreso: hoy hasta el día anterior al ingreso; sin ingreso, null', () => {
    expect(getPeriod(s('untilIncome'), '2026-09-28', { incomeEnd: '2026-10-09' })).toMatchObject({ start: '2026-09-28', end: '2026-10-08', days: 11, daysLeft: 11 })
    expect(getPeriod(s('untilIncome'), '2026-09-28', { incomeEnd: null })).toBeNull()
    expect(getPeriod(s('untilIncome'), '2026-09-28', { incomeEnd: '2026-09-28' })).toBeNull()
  })
})

describe('saldo del periodo y safe to spend (§6.2–6.3)', () => {
  it('con arrastre el disponible es el saldo consolidado; sin arrastre, solo el neto del periodo', () => {
    // Saldo de referencia 1000.00 el 28-sep; en el periodo (septiembre): ingreso 500 y gasto 200 el 29.
    const data = baseData({ transactions: [tx({ id: 'i', kind: 'income', categoryId: 'salary', amountMinor: 50000, date: '2026-09-29' }), tx({ id: 'e', amountMinor: 20000, date: '2026-09-29' })] })
    const period = getPeriod(s('month'), '2026-09-30')!
    const on = periodBalance(data, period, true)
    expect(on).toMatchObject({ incomeMinor: 50000, expensesMinor: 20000, carryOverMinor: 100000, availableMinor: 130000 })
    expect(on.availablePct).toBeCloseTo(130000 / 150000, 5)
    const off = periodBalance(data, period, false)
    expect(off).toMatchObject({ availableMinor: 30000 })
    expect(off.availablePct).toBeCloseTo(0.6, 5)
    expect(periodBalance(baseData({ accounts: [] }), period, false).availablePct).toBeNull()
  })

  it('safe = max(disponible − comprometido, 0); por día incluye hoy; nunca divide entre cero', () => {
    const r = safeToSpend(100000, 25000, 15)
    expect(r).toMatchObject({ safeMinor: 75000, perDayMinor: 5000, perWeekMinor: 35000, perPeriodMinor: 75000, short: false, shortfallMinor: 0 })
    expect(safeToSpend(10000, 25000, 10)).toMatchObject({ safeMinor: 0, perDayMinor: 0, short: true, shortfallMinor: 15000 })
    expect(safeToSpend(100000, 0, 0)).toMatchObject({ perDayMinor: 0, perWeekMinor: 0, perPeriodMinor: 100000 })
    expect(safeToSpend(100001, 0, 3)).toMatchObject({ perDayMinor: 33333, perWeekMinor: 100001 })
  })
})
