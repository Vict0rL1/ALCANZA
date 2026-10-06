import { describe, expect, it } from 'vitest'
import { accountBalance } from './balances'
import { computeBudget } from './budget'
import { closeOccurrence, deleteTransaction, markOccurrence, restoreFromTrash, saveSchedule, type ScheduleDraft } from './operations'
import { openItemsUntil, planItems } from './planItems'
import { compareScenarios, projectBalance } from './projection'
import type { AppData } from './types'
import { validateAppData } from '../storage/backup'
import { baseData, ctx, income, TODAY } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

// Sueldo variable cada dos semanas: mínimo 400, esperado 600, extra 750.
const pay = income('2026-10-02', 60000, { id: 'pay', frequency: 'biweekly', amountIsEstimate: true, range: { minMinor: 40000, extraMinor: 75000 } })
const data = baseData({ schedules: [pay] })

describe('ingresos variables: validación', () => {
  const draft: ScheduleDraft = { ...pay }
  it('exige 0 ≤ mínimo ≤ esperado ≤ extra, en enteros, y solo para ingresos', () => {
    const codes = (d: ScheduleDraft) => {
      const r = saveSchedule(baseData(), d, ctx)
      return r.ok ? [] : r.issues.map((i) => `${i.path}:${i.code}`)
    }
    expect(codes(draft)).toEqual([])
    expect(codes({ ...draft, range: { minMinor: 0, extraMinor: 60000 } })).toEqual([])
    expect(codes({ ...draft, range: { minMinor: 70000, extraMinor: 80000 } })).toEqual(['range.minMinor:rangeOrder'])
    expect(codes({ ...draft, range: { minMinor: 10000, extraMinor: 50000 } })).toEqual(['range.extraMinor:rangeOrder'])
    expect(codes({ ...draft, range: { minMinor: -1, extraMinor: 70000 } })).toEqual(['range.minMinor:invalidAmount'])
    expect(codes({ ...draft, range: { minMinor: 100.5, extraMinor: 70000 } })).toEqual(['range.minMinor:invalidAmount'])
    expect(codes({ ...draft, kind: 'expense', categoryId: 'utilities' })).toEqual(['range:invalidValue'])
  })
})

describe('ingresos variables: escenarios', () => {
  it('el disponible NUNCA suma ingresos futuros, en ningún escenario', () => {
    const budget = computeBudget(data, TODAY)
    expect(budget.availableMinor).toBe(data.accounts[0]!.anchor.amountMinor)
    expect(budget.horizon?.endDate).toBe('2026-10-02')
  })

  it('la proyección cambia con el escenario; por defecto usa el mínimo (prudente)', () => {
    const [min, expected, extra] = compareScenarios(data, TODAY, { days: 30 })
    // Dos cobros en 30 días (2-oct y 16-oct).
    expect(min).toMatchObject({ scenario: 'min', incomeMinor: 80000 })
    expect(expected).toMatchObject({ scenario: 'expected', incomeMinor: 120000 })
    expect(extra).toMatchObject({ scenario: 'extra', incomeMinor: 150000 })
    expect(extra!.endMinor - min!.endMinor).toBe(70000)
    expect(projectBalance(data, TODAY).scenario).toBe('min')
    expect(projectBalance(data, TODAY).endMinor).toBe(min!.endMinor)
  })

  it('cambiar de escenario no modifica movimientos ni saldos reales', () => {
    const snapshot = JSON.stringify(data)
    compareScenarios(data, TODAY)
    projectBalance(data, TODAY, { scenario: 'extra' })
    expect(JSON.stringify(data)).toBe(snapshot)
    expect(accountBalance(data, data.accounts[0]!).balanceMinor).toBe(data.accounts[0]!.anchor.amountMinor)
  })
})

describe('ingresos recibidos: retrasados, parciales y distintos', () => {
  const late = baseData({ schedules: [{ ...pay, startDate: '2026-09-25' }] })

  it('retrasado: no se suma al disponible ni a la proyección hasta registrarlo', () => {
    const b = computeBudget(late, TODAY)
    expect(b.overdueIncomes.map((i) => i.date)).toEqual(['2026-09-25'])
    const p = projectBalance(late, TODAY, { days: 5 })
    expect(p.lateIncomesExcluded).toHaveLength(1)
    expect(p.endMinor).toBe(late.accounts[0]!.anchor.amountMinor)
  })

  it('importe distinto: se registra lo real y la ocurrencia queda cerrada (sin duplicar)', () => {
    const r = ok(markOccurrence(late, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 55000, date: TODAY, txId: 'got' }, ctx))
    const item = planItems(r.data, { today: TODAY, from: '2026-09-25', to: '2026-09-25' })[0]!
    expect(item).toMatchObject({ state: 'paid', settledByTxId: 'got', amountMinor: 55000 })
    expect(accountBalance(r.data, r.data.accounts[0]!).balanceMinor).toBe(late.accounts[0]!.anchor.amountMinor + 55000)
    // Registrar otra vez (otro id) no duplica: ya está cerrada.
    expect(markOccurrence(r.data, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 55000, date: TODAY, txId: 'again' }, ctx)).toMatchObject({ unchanged: true })
  })

  it('parcial esperando el resto: queda abierta por la diferencia; luego se completa', () => {
    const part = ok(markOccurrence(late, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 20000, date: TODAY, txId: 'p1', expectRemainder: true }, ctx))
    const open = openItemsUntil(part.data, TODAY, TODAY).find((i) => i.sourceId === 'pay')!
    expect(open).toMatchObject({ state: 'overdue', amountMinor: 40000, receivedMinor: 20000, partialTxIds: ['p1'] })
    // Con el escenario mínimo (400), ya recibidos 200: faltan 200.
    expect(openItemsUntil(part.data, TODAY, TODAY, 'min').find((i) => i.sourceId === 'pay')?.amountMinor).toBe(20000)
    // Un parcial que cubre todo lo que falta no puede quedar "esperando el resto".
    expect(markOccurrence(part.data, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 40000, date: TODAY, txId: 'p2', expectRemainder: true }, ctx).ok).toBe(false)
    const rest = ok(markOccurrence(part.data, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 40000, date: TODAY, txId: 'p2' }, ctx))
    const done = planItems(rest.data, { today: TODAY, from: '2026-09-25', to: '2026-09-25' })[0]!
    expect(done).toMatchObject({ state: 'paid', amountMinor: 60000 })
    expect(validateAppData(JSON.parse(JSON.stringify(rest.data))).ok).toBe(true)
  })

  it('parcial dando la previsión por terminada: no queda nada pendiente', () => {
    const part = ok(markOccurrence(late, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 20000, date: TODAY, txId: 'p1', expectRemainder: true }, ctx))
    const closed = ok(closeOccurrence(part.data, 'pay', '2026-09-25', ctx))
    expect(closed.data.transactions).toHaveLength(1)
    expect(planItems(closed.data, { today: TODAY, from: '2026-09-25', to: '2026-09-25' })[0]).toMatchObject({ state: 'paid', amountMinor: 20000 })
    expect(computeBudget(closed.data, TODAY).overdueIncomes).toEqual([])
  })

  it('restaurar un parcial eliminado no duplica si la ocurrencia ya se cerró', () => {
    const part = ok(markOccurrence(late, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 20000, date: TODAY, txId: 'p1', expectRemainder: true }, ctx))
    const trashed = ok(deleteTransaction(part.data, 'p1', ctx))
    const full = ok(markOccurrence(trashed.data, { scheduleId: 'pay', occurrenceDate: '2026-09-25', amountMinor: 60000, date: TODAY, txId: 'f' }, ctx))
    const r = restoreFromTrash(full.data, 'p1', ctx)
    expect(r.ok ? [] : r.issues.map((i) => i.code)).toEqual(['occurrenceAlreadySettled'])
  })
})
