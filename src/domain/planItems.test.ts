import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { addDays, daysBetween } from './dates'
import { openItemsDetailed, planItems, planItemsDetailed } from './planItems'
import { MAX_OCCURRENCES, occurrencesBetween, OVERDUE_SCAN_LIMIT, scanOccurrences } from './recurrence'
import { baseData, bill, income, TODAY, tx } from '../test/fixtures'

/** Un pago diario antiguo con sus primeras `paid` ocurrencias ya liquidadas (fixture independiente del generador). */
function dailySince(start: string, paid: number, overrides: Partial<Parameters<typeof bill>[2]> = {}) {
  const schedule = bill(start, 100, { id: 'daily', name: 'Diario', frequency: 'daily', ...overrides })
  const transactions = Array.from({ length: paid }, (_, i) => {
    const date = addDays(start, i)
    return tx({ id: `paid-${i}`, date, amountMinor: 100, scheduleId: schedule.id, occurrenceDate: date })
  })
  return baseData({ schedules: [schedule, income('2026-10-12', 100000)], transactions })
}

describe('QA-06 · el historial de vencidos no consume el tope de la ventana actual', () => {
  it('2 000 ocurrencias pagadas desde 2020: el pago de hoy sigue reservado y los vencidos sin pagar siguen apareciendo', () => {
    const data = dailySince('2020-01-01', 2000)
    const budget = computeBudget(data, TODAY)
    expect(budget.reservedItems.some((i) => i.date === TODAY && i.sourceId === 'daily')).toBe(true)
    // Desde el día 2 001 (2025-06-23) hasta ayer nadie pagó: todos vencidos, ninguno perdido.
    const firstUnpaid = addDays('2020-01-01', 2000)
    expect(budget.overdueBills).toHaveLength(daysBetween(firstUnpaid, TODAY))
    expect(budget.overdueBills[0]!.date).toBe(firstUnpaid)
    expect(budget.incompleteScheduleIds).toEqual([])
    expect(budget.dailyMinor).not.toBeNull()
  })

  it('el calendario y el presupuesto ven los mismos vencidos', () => {
    const data = dailySince('2020-01-01', 2000)
    const calendar = planItems(data, { today: TODAY, from: TODAY, to: TODAY, includeOverdueBefore: true }).filter((i) => i.state === 'overdue')
    expect(calendar.map((i) => i.date)).toEqual(computeBudget(data, TODAY).overdueBills.map((i) => i.date))
  })

  it('omitidas y pagadas no cuentan; en pausa nada cuenta; una fecha final acota', () => {
    const skippedDate = addDays('2020-01-01', 2001)
    const data = dailySince('2020-01-01', 2000, { skippedDates: [skippedDate] })
    const overdue = computeBudget(data, TODAY).overdueBills
    expect(overdue.some((i) => i.date === skippedDate)).toBe(false)
    expect(overdue.some((i) => i.date === addDays('2020-01-01', 1999))).toBe(false)
    const paused = { ...data, schedules: data.schedules.map((s) => (s.id === 'daily' ? { ...s, paused: true } : s)) }
    expect(computeBudget(paused, TODAY).overdueBills).toEqual([])
    const ended = { ...data, schedules: data.schedules.map((s) => (s.id === 'daily' ? { ...s, endDate: '2026-06-30' } : s)) }
    expect(computeBudget(ended, TODAY).overdueBills.every((i) => i.date <= '2026-06-30')).toBe(true)
  })

  it('meses cortos, bisiestos y cambio de año en un programado antiguo: la ventana actual se calcula entera', () => {
    const monthly = baseData({ schedules: [bill('2010-01-31', 50000, { id: 'rent', frequency: 'monthly' }), income('2026-10-12', 100000)] })
    const r = planItemsDetailed(monthly, { today: TODAY, from: TODAY, to: '2027-03-31', includeOverdueBefore: true })
    expect(r.truncatedScheduleIds).toEqual([])
    const upcoming = r.items.filter((i) => i.sourceId === 'rent' && i.date >= TODAY).map((i) => i.date)
    expect(upcoming).toEqual(['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
    expect(r.items.filter((i) => i.date < TODAY).every((i) => i.state === 'overdue')).toBe(true)
    const leap = baseData({ schedules: [bill('2016-02-29', 1000, { id: 'leap', frequency: 'yearly' })] })
    expect(planItems(leap, { today: TODAY, from: '2027-01-01', to: '2028-12-31' }).map((i) => i.date)).toEqual(['2027-02-28', '2028-02-29'])
  })

  it('si el historial supera el tope, se dice (truncado) y no se sugiere nada por día', () => {
    const data = dailySince('1970-01-01', 0)
    expect(daysBetween('1970-01-01', TODAY)).toBeGreaterThan(OVERDUE_SCAN_LIMIT)
    const r = openItemsDetailed(data, TODAY, '2026-10-12')
    expect(r.truncatedScheduleIds).toEqual(['daily'])
    expect(r.items.length).toBeGreaterThan(0)
    const budget = computeBudget(data, TODAY)
    expect(budget.incompleteScheduleIds).toEqual(['daily'])
    expect(budget.dailyMinor).toBeNull()
    expect(budget.weeklyMinor).toBeNull()
    expect(budget.status).toBe('ok')
  })
})

describe('scanOccurrences', () => {
  it('equivale a occurrencesBetween y marca el truncado solo cuando quedaban fechas', () => {
    const rule = { frequency: 'daily' as const, startDate: '2026-01-01' }
    expect(scanOccurrences(rule, '2026-01-01', '2026-01-10')).toEqual({ dates: occurrencesBetween(rule, '2026-01-01', '2026-01-10'), truncated: false })
    const small = scanOccurrences(rule, '2026-01-01', '2026-12-31', 10)
    expect(small.dates).toHaveLength(10)
    expect(small.truncated).toBe(true)
    const exact = scanOccurrences(rule, '2026-01-01', '2026-01-10', 10)
    expect(exact).toEqual({ dates: occurrencesBetween(rule, '2026-01-01', '2026-01-10'), truncated: false })
    expect(MAX_OCCURRENCES).toBeLessThan(OVERDUE_SCAN_LIMIT)
  })

  it('no recorre desde el principio para una ventana lejana', () => {
    const rule = { frequency: 'daily' as const, startDate: '1970-01-01' }
    expect(scanOccurrences(rule, '2026-09-28', '2026-09-30')).toEqual({ dates: ['2026-09-28', '2026-09-29', '2026-09-30'], truncated: false })
  })
})
