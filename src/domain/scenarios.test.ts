import { describe, expect, it } from 'vitest'
import { computeBudget } from './budget'
import { saveTransaction } from './operations'
import { projectBalance } from './projection'
import { compare, deleteScenario, evaluate, financialFingerprint, isStale, markScenarioReviewed, saveScenario, similarPlanned } from './scenarios'
import type { AppData, ScenarioChange } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, bill, ctx, income, TODAY, tx } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

// Saldo 1000; renta de 600 el 1-oct (mensual); ingreso de 800 el 10-oct.
const data = baseData({ schedules: [bill('2026-10-01', 60000, { id: 'rent', frequency: 'monthly' }), income('2026-10-10', 80000)] })
const buyToday: ScenarioChange = { type: 'purchase', amountMinor: 30000, date: TODAY }
const buyLater: ScenarioChange = { type: 'purchase', amountMinor: 30000, date: '2026-10-12' }

describe('escenarios: simulación aislada', () => {
  it('la base coincide con la proyección y el disponible reales', () => {
    const base = evaluate(data, TODAY, [])
    expect(base.endMinor).toBe(projectBalance(data, TODAY).endMinor)
    expect(base.availableMinor).toBe(computeBudget(data, TODAY).availableMinor)
  })

  it('comprar hoy vs. en otra fecha: mismo final, distinto disponible y peor día', () => {
    const today = evaluate(data, TODAY, [buyToday])
    const later = evaluate(data, TODAY, [buyLater])
    const base = evaluate(data, TODAY, [])
    expect(today.endMinor).toBe(base.endMinor - 30000)
    expect(later.endMinor).toBe(base.endMinor - 30000)
    expect(today.availableMinor).toBe(base.availableMinor - 30000)
    // Después del próximo ingreso: no reduce el disponible de hoy.
    expect(later.availableMinor).toBe(base.availableMinor)
    expect(today.lowest.minor).toBeLessThan(later.lowest.minor)
  })

  it('subir un pago mensual o reducir un gasto previsto', () => {
    const up = evaluate(data, TODAY, [{ type: 'scheduleAmount', scheduleId: 'rent', newAmountMinor: 70000 }])
    const base = evaluate(data, TODAY, [])
    expect(up.availableMinor).toBe(base.availableMinor - 10000)
    expect(up.endMinor).toBe(base.endMinor - 10000)
    const down = evaluate(data, TODAY, [{ type: 'scheduleAmount', scheduleId: 'rent', newAmountMinor: 50000 }])
    expect(down.availableMinor).toBe(base.availableMinor + 10000)
  })

  it('faltante posible cuando el saldo proyectado baja de cero', () => {
    const r = evaluate(data, TODAY, [{ type: 'purchase', amountMinor: 50000, date: TODAY }])
    expect(r.firstNegativeDate).toBe('2026-10-01')
    expect(r.shortfallMinor).toBe(10000)
  })

  it('evaluar, guardar, editar y eliminar escenarios nunca toca los datos reales', () => {
    const snapshot = JSON.stringify({ a: data.accounts, t: data.transactions, s: data.schedules, g: data.goals })
    compare(data, TODAY, [])
    evaluate(data, TODAY, [buyToday, { type: 'scheduleAmount', scheduleId: 'rent', newAmountMinor: 1 }])
    let d = ok(saveScenario(data, { id: 'sc', name: 'Laptop', changes: [buyToday] }, ctx)).data
    d = ok(saveScenario(d, { id: 'sc', name: 'Laptop usada', changes: [{ ...buyToday, amountMinor: 20000 }] }, ctx)).data
    d = ok(deleteScenario(d, 'sc', ctx)).data
    expect(JSON.stringify({ a: d.accounts, t: d.transactions, s: d.schedules, g: d.goals })).toBe(snapshot)
  })

  it('misma hipótesis para todas: base y hasta 3 alternativas', () => {
    let d = data
    for (const [i, c] of [buyToday, buyLater, buyToday, buyLater].entries()) d = ok(saveScenario(d, { id: `s${i}`, name: `E${i}`, changes: [c] }, ctx)).data
    const r = compare(d, TODAY, d.scenarios, { dailySpendMinor: 1000 })
    expect(r.alternatives).toHaveLength(3)
    expect(r.base.endMinor).toBe(projectBalance(d, TODAY, { dailySpendMinor: 1000 }).endMinor)
  })
})

describe('escenarios: cambios de la base', () => {
  it('si cambian los datos reales, el escenario se marca para revisar y se recalcula', () => {
    const saved = ok(saveScenario(data, { id: 'sc', name: 'Laptop', changes: [buyToday] }, ctx))
    expect(isStale(saved.value, saved.data)).toBe(false)
    const before = evaluate(saved.data, TODAY, saved.value.changes).endMinor
    const changed = ok(saveTransaction(saved.data, { id: 'n', kind: 'expense', status: 'realized', amountMinor: 5000, date: TODAY, accountId: 'main', categoryId: 'dining' }, ctx)).data
    expect(isStale(changed.scenarios[0]!, changed)).toBe(true)
    expect(evaluate(changed, TODAY, changed.scenarios[0]!.changes).endMinor).toBe(before - 5000)
    const reviewed = ok(markScenarioReviewed(changed, 'sc', ctx)).data
    expect(isStale(reviewed.scenarios[0]!, reviewed)).toBe(false)
    // Guardar un escenario no cambia la huella de los datos financieros.
    expect(financialFingerprint(reviewed)).toBe(financialFingerprint(changed))
  })

  it('un pago programado que ya no existe se señala como cambio no aplicable', () => {
    const r = evaluate({ ...data, schedules: [] }, TODAY, [{ type: 'scheduleAmount', scheduleId: 'rent', newAmountMinor: 1 }])
    expect(r.invalidChanges).toEqual([0])
  })

  it('valida: compras en el pasado no, programado inexistente no; y detecta previstos parecidos', () => {
    const past = saveScenario(data, { id: 'x', name: 'Pasado', changes: [{ ...buyToday, date: '2026-09-01' }] }, ctx)
    expect(past.ok ? [] : past.issues.map((i) => i.code)).toEqual(['dateInPast'])
    const missing = saveScenario(data, { id: 'x', name: 'X', changes: [{ type: 'scheduleAmount', scheduleId: 'nope', newAmountMinor: 1 }] }, ctx)
    expect(missing.ok).toBe(false)
    const withPlanned = baseData({ transactions: [tx({ id: 'p', status: 'planned', amountMinor: 30000, date: '2026-10-13', realizedAt: undefined })] })
    expect(similarPlanned(withPlanned, buyLater as Extract<ScenarioChange, { type: 'purchase' }>)?.id).toBe('p')
  })

  it('se guardan en las copias y se validan al importar', () => {
    const d = ok(saveScenario(data, { id: 'sc', name: 'Laptop', changes: [buyToday] }, ctx)).data
    const r = validateAppData(JSON.parse(JSON.stringify(d)))
    expect(r.ok && r.data.scenarios).toEqual(d.scenarios)
    const bad = JSON.parse(JSON.stringify(d))
    bad.scenarios[0].changes[0].amountMinor = 10.5
    expect(validateAppData(bad).ok).toBe(false)
  })
})

describe('escenarios: cuenta de la compra', () => {
  it('una compra en una cuenta fuera del presupuesto no reduce el disponible; una cuenta inexistente no se aplica', () => {
    const withSavings = { ...data, accounts: [...data.accounts, account({ id: 'sav', name: 'Ahorro', includeInBudget: false })] }
    const base = evaluate(withSavings, TODAY, [])
    const fromSavings = evaluate(withSavings, TODAY, [{ ...buyToday, accountId: 'sav' }])
    expect(fromSavings.availableMinor).toBe(base.availableMinor)
    expect(evaluate(withSavings, TODAY, [{ ...buyToday, accountId: 'main' }]).availableMinor).toBe(base.availableMinor - 30000)
    expect(evaluate(withSavings, TODAY, [{ ...buyToday, accountId: 'nope' }]).invalidChanges).toEqual([0])
    const bad = saveScenario(withSavings, { id: 'x', name: 'X', changes: [{ ...buyToday, accountId: 'nope' }] }, ctx)
    expect(bad.ok ? [] : bad.issues.map((i) => i.code)).toEqual(['unknownAccount'])
    const saved = ok(saveScenario(withSavings, { id: 'x', name: 'X', changes: [{ ...buyToday, accountId: 'sav' }] }, ctx)).data
    const r = validateAppData(JSON.parse(JSON.stringify(saved)))
    expect(r.ok && r.data.scenarios[0]!.changes[0]).toMatchObject({ accountId: 'sav' })
  })
})
