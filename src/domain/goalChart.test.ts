import { describe, expect, it } from 'vitest'
import { goalEta, goalTrajectory, idealAt } from './goalChart'
import type { Goal } from './types'

const TODAY = '2026-09-28'
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Viaje',
  kind: 'goal',
  targetMinor: 60000,
  targetDate: '2026-12-31',
  currency: 'MXN',
  fundedFrom: 'budget',
  allocations: [],
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  ...over,
})
const alloc = (date: string, amountMinor: number, reason?: 'contribution' | 'release' | 'payment' | 'carry') => ({ id: `a-${date}-${amountMinor}`, amountMinor, date, createdAt: `${date}T12:00:00.000Z`, ...(reason ? { reason } : {}) })

describe('gráfico de meta y fecha estimada (D7)', () => {
  it('acumula los apartados por fecha, empieza en 0 y termina hoy', () => {
    const t = goalTrajectory(goal({ allocations: [alloc('2026-09-10', 10000), alloc('2026-09-20', 15000), alloc('2026-09-20', 5000)] }), TODAY)
    expect(t.start).toBe('2026-09-01')
    expect(t.points).toEqual([
      { date: '2026-09-01', savedMinor: 0 },
      { date: '2026-09-10', savedMinor: 10000 },
      { date: '2026-09-20', savedMinor: 30000 },
      { date: '2026-09-28', savedMinor: 30000 },
    ])
    expect(t.contributions).toBe(3)
  })

  it('la recta ideal va de 0 en el inicio al objetivo en la fecha; sin fecha no hay recta', () => {
    const t = goalTrajectory(goal(), TODAY)
    expect(idealAt(t, '2026-09-01')).toBe(0)
    expect(idealAt(t, '2026-12-31')).toBe(60000)
    expect(idealAt(t, '2026-11-15')).toBe(Math.floor((60000 * 75) / 121))
    expect(goalTrajectory(goal({ targetDate: undefined }), TODAY).end).toBeNull()
  })

  it('ETA con ≥ 2 aportes: hoy + ⌈restante ÷ ritmo de los últimos 30 días⌉', () => {
    const eta = goalEta(goal({ allocations: [alloc('2026-09-05', 9000), alloc('2026-09-20', 6000)] }), TODAY)
    // 15 000 en 30 días → 500/día; faltan 45 000 → 90 días → 27-dic.
    expect(eta).toEqual({ status: 'ok', date: '2026-12-27', perDayMinor: 500, days: 90 })
  })

  it('con menos de dos aportes no se estima y se dice por qué', () => {
    expect(goalEta(goal({ allocations: [alloc('2026-09-05', 9000)] }), TODAY)).toEqual({ status: 'tooFew', contributions: 1 })
    // Liberaciones y pagos no cuentan como aportes.
    expect(goalEta(goal({ allocations: [alloc('2026-09-05', 9000), alloc('2026-09-06', -1000, 'release')] }), TODAY)).toEqual({ status: 'tooFew', contributions: 1 })
  })

  it('sin aportes en los últimos 30 días no hay estimación; meta completa tampoco', () => {
    expect(goalEta(goal({ allocations: [alloc('2026-06-05', 9000), alloc('2026-07-20', 6000)] }), TODAY)).toEqual({ status: 'noRecent' })
    expect(goalEta(goal({ allocations: [alloc('2026-09-05', 30000), alloc('2026-09-20', 30000)] }), TODAY)).toEqual({ status: 'complete' })
  })
})
