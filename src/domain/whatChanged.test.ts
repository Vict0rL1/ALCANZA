import { describe, expect, it } from 'vitest'
import { recordHistory } from './history'
import { allocateToGoal, markOccurrence, saveTransaction } from './operations'
import type { AppData } from './types'
import { classifyEntry, whatChanged, whatChangedSteps, WHAT_CHANGED_MAX_STEPS } from './whatChanged'
import { baseData, bill, goal, income, tx } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

const DAY2 = { today: '2026-09-29', now: '2026-09-29T15:00:00.000Z' }
const commit = (prev: AppData, next: AppData, at = DAY2.now) => recordHistory(prev, next, at)

/**
 * Cuenta 1000.00; sueldo el 10-oct; factura de 100.00 el 5-oct.
 * El 29-sep: gasto de 50.00, apartado de 200.00 en una meta, se paga la factura (100.00)
 * y el gasto se corrige a 70.00. Hoy es 2-oct.
 */
function scenario() {
  let d = baseData({ schedules: [income('2026-10-10', 200000, { id: 'pay' }), bill('2026-10-05', 10000, { id: 'rent' })], goals: [goal({ id: 'trip' })] })
  d = commit(d, ok(saveTransaction(d, tx({ id: 'coffee', amountMinor: 5000, date: '2026-09-29' }), DAY2)).data)
  d = commit(d, ok(allocateToGoal(d, { goalId: 'trip', amountMinor: 20000 }, DAY2)).data)
  d = commit(d, ok(markOccurrence(d, { scheduleId: 'rent', occurrenceDate: '2026-10-05', amountMinor: 10000, date: '2026-09-29', txId: 'rent-paid' }, DAY2)).data)
  d = commit(d, ok(saveTransaction(d, { ...d.transactions.find((t) => t.id === 'coffee')!, amountMinor: 7000 }, DAY2)).data)
  return d
}

describe('¿Qué cambió?', () => {
  it('desglose por cambio con cifras calculadas a mano y suma exacta', () => {
    const r = whatChanged(scenario(), '2026-10-02', { kind: 'date', date: '2026-09-29' })
    if (r.status !== 'ok') throw new Error(r.status)
    // Antes (inicio del 29-sep): 1000.00 − factura 100.00 = 900.00; 11 días hasta el 10-oct.
    expect(r.from.availableMinor).toBe(90000)
    // Ahora: 1000 − 70 (gasto) − 100 (factura pagada) − 200 (meta) = 630.00; 8 días.
    expect(r.to.availableMinor).toBe(63000)
    expect(r.totalMinor).toBe(-27000)
    expect(r.steps.map((s) => [s.category, s.deltaMinor])).toEqual([
      ['expenses', -5000],
      ['reserves', -20000],
      // Pagar lo ya reservado no cambia el disponible: sale del saldo y deja de reservarse.
      ['payments', 0],
      ['edits', -2000],
    ])
    expect(r.time.deltaMinor).toBe(0)
    expect(r.unexplainedMinor).toBe(0)
    const sum = r.steps.reduce((a, s) => a + s.deltaMinor, 0) + r.time.deltaMinor + r.unexplainedMinor
    expect(sum).toBe(r.totalMinor)
    expect(r.neutralEntries).toBe(1)
    // Diario: 900.00 ÷ 11 = 81.81 → 630.00 ÷ 8 = 78.75. Cambios (a 11 días): 630 ÷ 11 = 57.27.
    expect(r.daily).toEqual({ fromMinor: 8181, toMinor: 7875, changesMinor: 5727 - 8181, timeMinor: 7875 - 5727, unexplainedMinor: 0 })
    expect(r.byCategory.find((c) => c.category === 'expenses')).toEqual({ category: 'expenses', deltaMinor: -5000, entries: 1 })
  })

  it('el paso del tiempo se separa: un ingreso vencido sin marcar alarga el periodo y reserva otra factura', () => {
    const d = baseData({
      historyStartedAt: '2026-09-20T12:00:00.000Z',
      schedules: [income('2026-09-30', 100000, { id: 'a' }), income('2026-10-15', 100000, { id: 'b' }), bill('2026-10-10', 30000, { id: 'gas' })],
    })
    const r = whatChanged(d, '2026-10-02', { kind: 'date', date: '2026-09-29' })
    if (r.status !== 'ok') throw new Error(r.status)
    expect(r.steps).toEqual([])
    // El 29-sep el periodo terminaba el 30-sep (sin la factura); hoy, el ingreso del 30 no se marcó
    // y el siguiente es el 15-oct: la factura del 10-oct pasa a reservarse.
    expect(r.time.deltaMinor).toBe(-30000)
    expect(r.time.entered.map((i) => i.sourceId)).toEqual(['gas'])
    expect(r.time.otherMinor).toBe(0)
    expect(r.totalMinor).toBe(-30000)
  })

  it('no inventa: antes del historial, o con un corte por medio, no compara', () => {
    const d = scenario()
    const before = whatChanged(d, '2026-10-02', { kind: 'date', date: '2026-09-28' })
    expect(before).toMatchObject({ status: 'beforeHistory', earliestDate: '2026-09-29' })
    const withCut: AppData = { ...d, history: [...d.history.slice(0, 2), { id: 'cut', at: DAY2.now, source: 'replace', changes: [] }, ...d.history.slice(2)] }
    expect(whatChanged(withCut, '2026-10-02', { kind: 'date', date: '2026-09-29' })).toMatchObject({ status: 'cut' })
    // Desde el corte sí se puede.
    expect(whatChanged(withCut, '2026-10-02', { kind: 'index', index: 3 }).status).toBe('ok')
  })

  it('un cambio guardado fuera del historial aparece como diferencia sin explicar', () => {
    const d = scenario()
    const tampered: AppData = { ...d, accounts: d.accounts.map((a) => ({ ...a, anchor: { ...a.anchor, amountMinor: a.anchor.amountMinor + 1234 } })) }
    const r = whatChanged(tampered, '2026-10-02', { kind: 'date', date: '2026-09-29' })
    if (r.status !== 'ok') throw new Error(r.status)
    // stateBefore parte de los datos actuales: el cambio no registrado ya estaba «antes».
    expect(r.unexplainedMinor).toBe(0)
    expect(r.from.availableMinor).toBe(90000 + 1234)
    // Si el registro anterior de un cambio no coincide con los datos actuales, sí queda sin explicar.
    const drift: AppData = { ...d, transactions: d.transactions.map((t) => (t.id === 'coffee' ? { ...t, amountMinor: 9000 } : t)) }
    const r2 = whatChanged(drift, '2026-10-02', { kind: 'date', date: '2026-09-29' })
    if (r2.status !== 'ok') throw new Error(r2.status)
    expect(r2.unexplainedMinor).toBe(-2000)
    expect(r2.steps.reduce((a, s) => a + s.deltaMinor, 0) + r2.time.deltaMinor + r2.unexplainedMinor).toBe(r2.totalMinor)
  })

  it('con muchas entradas agrupa pasos sin perder exactitud', () => {
    let d = baseData({ schedules: [income('2026-10-10', 200000)] })
    for (let i = 0; i < WHAT_CHANGED_MAX_STEPS * 3; i++) {
      d = commit(d, ok(saveTransaction(d, tx({ id: `t${i}`, amountMinor: 100 + i, date: '2026-09-29', kind: i % 2 ? 'expense' : 'income', categoryId: i % 2 ? 'groceries' : 'salary' }), DAY2)).data)
    }
    const r = whatChanged(d, '2026-10-02', { kind: 'date', date: '2026-09-29' })
    if (r.status !== 'ok') throw new Error(r.status)
    expect(r.steps.length).toBeLessThanOrEqual(WHAT_CHANGED_MAX_STEPS)
    expect(r.steps.reduce((a, s) => a + s.entries.length, 0)).toBe(WHAT_CHANGED_MAX_STEPS * 3)
    expect(r.steps.reduce((a, s) => a + s.deltaMinor, 0) + r.time.deltaMinor + r.unexplainedMinor).toBe(r.totalMinor)
  })

  it('clasifica por el registro principal', () => {
    const d = scenario()
    expect(d.history.map(classifyEntry)).toEqual(['expenses', 'reserves', 'payments', 'edits'])
  })

  it('paso a paso: avance creciente hasta el total y el mismo resultado que de una vez', () => {
    const d = scenario()
    const point = { kind: 'date' as const, date: '2026-09-29' }
    const run = whatChangedSteps(d, '2026-10-02', point)
    const seen: { done: number; total: number }[] = []
    let step = run.next()
    while (!step.done) {
      seen.push(step.value)
      step = run.next()
    }
    // 4 entradas → 4 pasos, más el inicial, el de hoy rehecho y el actual.
    expect(seen.map((p) => p.done)).toEqual([1, 2, 3, 4, 5, 6])
    expect(new Set(seen.map((p) => p.total))).toEqual(new Set([7]))
    expect(step.value).toEqual(whatChanged(d, '2026-10-02', point))
  })
})
