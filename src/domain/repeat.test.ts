import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { nextPendingOccurrence, saveTransactionWithSchedule } from './repeat'
import { baseData, TODAY } from '../test/fixtures'

const ctx = { today: TODAY, now: '2026-09-28T15:00:00.000Z' }
const data = () => baseData({ settings: { ...baseData().settings, budgetPeriod: { type: 'month', weekStartsOn: 1 } } })
const tx = { id: 't1', kind: 'expense' as const, status: 'realized' as const, amountMinor: 1000, date: TODAY, accountId: 'main', categoryId: 'groceries', note: 'Pan', tagIds: [] as string[], source: 'manual' as const }
const schedule = { id: 's1', name: 'Pan', kind: 'expense' as const, amountMinor: 1000, amountIsEstimate: false, accountId: 'main', categoryId: 'groceries', frequency: 'daily' as const, startDate: TODAY, reminderDaysBefore: 1 }

describe('«Repetir»: movimiento + programado en una operación (D6)', () => {
  it('crea ambos; el movimiento es la primera ocurrencia y no se reserva dos veces', () => {
    const r = saveTransactionWithSchedule(data(), tx, schedule, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.schedules).toHaveLength(1)
    expect(r.data.schedules[0]!.startDate).toBe(TODAY)
    const saved = r.data.transactions.find((x) => x.id === 't1')!
    expect(saved.scheduleId).toBe('s1')
    expect(saved.occurrenceDate).toBe(TODAY)
    // Mes natural hasta el 30-sep: se reservan el 29 y el 30 (2 × 10.00); hoy ya es un movimiento.
    const budget = computeBudget(r.data, TODAY)
    expect(budget.reservedItems.map((i) => i.date)).toEqual(['2026-09-29', '2026-09-30'])
    expect(budget.reservedTotalMinor).toBe(2000)
    expect(budget.spendableMinor).toBe(100000 - 1000)
  })

  it('todo o nada: un programado inválido no deja ni movimiento ni programado', () => {
    const before = data()
    const r = saveTransactionWithSchedule(before, tx, { ...schedule, amountMinor: 0 }, ctx)
    expect(r.ok).toBe(false)
    expect(before.schedules).toHaveLength(0)
    expect(before.transactions.find((x) => x.id === 't1')).toBeUndefined()
  })

  it('guardar dos veces con los mismos ids no duplica nada', () => {
    const first = saveTransactionWithSchedule(data(), tx, schedule, ctx)
    if (!first.ok) throw new Error('first')
    const second = saveTransactionWithSchedule(first.data, tx, schedule, ctx)
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.data.schedules).toHaveLength(1)
    expect(second.data.transactions.filter((x) => x.id === 't1')).toHaveLength(1)
  })

  it('la siguiente ocurrencia pendiente salta la primera (ya pagada) y las omitidas', () => {
    const r = saveTransactionWithSchedule(data(), tx, { ...schedule, frequency: 'monthly' }, ctx)
    if (!r.ok) throw new Error('save')
    const s = r.data.schedules[0]!
    expect(nextPendingOccurrence(r.data, s, TODAY)).toBe('2026-10-28')
    const skipped = { ...r.data, schedules: [{ ...s, skippedDates: ['2026-10-28'] }] }
    expect(nextPendingOccurrence(skipped, skipped.schedules[0]!, TODAY)).toBe('2026-11-28')
    // Sin pago enlazado, la de hoy sigue pendiente.
    const unlinked = { ...r.data, transactions: r.data.transactions.map((x) => (x.id === 't1' ? { ...x, scheduleId: undefined, occurrenceDate: undefined } : x)) }
    expect(nextPendingOccurrence(unlinked, s, TODAY)).toBe(TODAY)
  })
})
