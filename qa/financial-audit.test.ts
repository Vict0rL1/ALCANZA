import { describe, expect, it } from 'vitest'
import { account, baseData, bill, ctx, EARLIER, goal, income, TODAY, tx } from '../src/test/fixtures'
import { allAccountBalances, spendableBalance } from '../src/domain/balances'
import { computeBudget } from '../src/domain/budget'
import { simulatePurchase } from '../src/domain/affordability'
import { allocateToGoal, changeCurrency, deleteTransaction, importTransactions, markOccurrence, restoreFromTrash, saveTransaction, updateSettings } from '../src/domain/operations'
import { projectBalance } from '../src/domain/projection'
import { occurrencesBetween } from '../src/domain/recurrence'
import { autoConfirmDue } from '../src/domain/scheduledJobs'
import { homeSnapshotAt } from '../src/domain/homeSnapshot'
import { guessMapping, parseBankDate, parseCsv, previewImport } from '../src/domain/bankImport'
import { MAX_AMOUNT_MINOR, parseMoney } from '../src/domain/money'
import { periodSummary } from '../src/domain/insights'
import { addDays } from '../src/domain/dates'
import { validateAppData } from '../src/storage/backup'
import type { AppData } from '../src/domain/types'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}
const bank = (id: string, amountMinor: number, includeInBudget = true) => account({ id, includeInBudget, anchor: { amountMinor, date: TODAY, setAt: EARLIER } })
const available = (d: AppData) => computeBudget(d, TODAY).availableMinor
const budget = () => baseData({
  accounts: [bank('main', 200000)],
  schedules: [income('2026-10-12', 150000), bill('2026-09-29', 100000)],
  goals: [goal({ allocations: [{ id: 'reserve', amountMinor: 30000, date: TODAY, createdAt: EARLIER }] })],
})

describe('12 escenarios del encargo: oráculos calculados a mano, importes en centavos CAD', () => {
  it('S01: 2000 - 1000 - 300 = 700; 14 días => 50/día, 350/semana', () => {
    expect(validateAppData(budget()).ok).toBe(true)
    expect(computeBudget(budget(), TODAY)).toMatchObject({ availableMinor: 70000, dailyMinor: 5000, weeklyMinor: 35000 })
  })
  it('S02: ingreso variable futuro no crea dinero; mínimo 100, esperado 500, extra 900', () => {
    const d = baseData({ schedules: [income('2026-09-29', 50000, { range: { minMinor: 10000, extraMinor: 90000 } })] })
    expect(available(d)).toBe(100000)
    expect(['min', 'expected', 'extra'].map(scenario => projectBalance(d, TODAY, { days: 2, scenario: scenario as 'min' | 'expected' | 'extra' }).endMinor)).toEqual([110000, 150000, 190000])
  })
  it('S03: saldo -50 - factura 20 = -70; sugerencia diaria cero', () => {
    const d = baseData({ accounts: [bank('main', -5000)], schedules: [income('2026-10-12', 100000), bill(TODAY, 2000)] })
    expect(computeBudget(d, TODAY)).toMatchObject({ availableMinor: -7000, dailyMinor: 0, weeklyMinor: 0 })
  })
  it('S04: sin ingreso ni horizonte conserva 1000 disponibles, sin inventar importe diario', () => {
    expect(computeBudget(baseData(), TODAY)).toMatchObject({ status: 'needsHorizon', availableMinor: 100000, dailyMinor: null })
  })
  it('S05: banco 2000 y dos tarjetas con deudas 200 y 300 => 1500; pagar 100 no duplica gasto', () => {
    const d = baseData({ accounts: [bank('main', 200000), { ...bank('visa', -20000), kind: 'credit' }, { ...bank('master', -30000), kind: 'credit' }] })
    expect(available(d)).toBe(150000)
    const paid = ok(saveTransaction(d, tx({ kind: 'transfer', categoryId: undefined, toAccountId: 'visa', amountMinor: 10000 }), ctx)).data
    expect(available(paid)).toBe(150000)
    expect(periodSummary(paid, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(0)
  })
  it('S06: pago realizado deja de reservarse; 1000 - 100 = 900 antes y después', () => {
    const d = baseData({ schedules: [bill(TODAY, 10000, { id: 'bill' }), income('2026-10-12', 100000)] })
    const r = ok(markOccurrence(d, { scheduleId: 'bill', occurrenceDate: TODAY, amountMinor: 10000, date: TODAY }, ctx))
    expect([available(d), available(r.data)]).toEqual([90000, 90000])
    expect(markOccurrence(r.data, { scheduleId: 'bill', occurrenceDate: TODAY, amountMinor: 10000, date: TODAY }, ctx)).toMatchObject({ ok: true, unchanged: true })
  })
  it('S07: reimportar la misma huella no resta dos veces; 1000 - 25 = 975', () => {
    const items = [{ id: 'import-1', kind: 'expense' as const, accountId: 'main', categoryId: 'groceries', amountMinor: 2500, date: TODAY, importRef: 'bank|one' }]
    const first = ok(importTransactions(baseData(), { items, sameDayAlreadyInBalance: false }, ctx))
    const twice = ok(importTransactions(first.data, { items: [{ ...items[0]!, id: 'import-2' }], sameDayAlreadyInBalance: false }, ctx))
    expect(twice.data.transactions).toHaveLength(1)
    expect(available(twice.data)).toBe(97500)
  })
  it('S08: el esquema rechaza transacción USD dentro de presupuesto CAD', () => {
    expect(validateAppData(baseData({ transactions: [tx({ currency: 'USD' })] })).ok).toBe(false)
  })
  it('S09: compra 100 y devolución 25 => saldo 925, gasto neto 75; rechaza devolver otros 76', () => {
    const d = ok(saveTransaction(baseData(), tx({ id: 'purchase', amountMinor: 10000 }), ctx)).data
    const r = ok(saveTransaction(d, tx({ id: 'refund', kind: 'refund', amountMinor: 2500, refundOfId: 'purchase' }), ctx)).data
    expect(available(r)).toBe(92500)
    expect(periodSummary(r, '2026-09-01', '2026-09-30').netSpendingMinor).toBe(7500)
    expect(saveTransaction(r, tx({ kind: 'refund', amountMinor: 7600, refundOfId: 'purchase' }), ctx).ok).toBe(false)
  })
  it('S10: factura mañana 300 se reserva incluso si el ingreso también es mañana', () => {
    const d = baseData({ schedules: [bill('2026-09-29', 30000), income('2026-09-29', 100000)] })
    expect(computeBudget(d, TODAY)).toMatchObject({ availableMinor: 70000, dailyMinor: 70000 })
  })
  it('S11: transferencia interna 100 conserva patrimonio 1500; hacia ahorro excluido baja disponible', () => {
    const d = baseData({ accounts: [bank('main', 100000), bank('other', 50000), bank('savings', 0, false)] })
    const internal = ok(saveTransaction(d, tx({ kind: 'transfer', categoryId: undefined, toAccountId: 'other', amountMinor: 10000 }), ctx)).data
    expect(available(internal)).toBe(150000)
    const external = ok(saveTransaction(internal, tx({ kind: 'transfer', categoryId: undefined, toAccountId: 'savings', amountMinor: 10000 }), ctx)).data
    expect(available(external)).toBe(140000)
    expect(allAccountBalances(external).reduce((sum, b) => sum + b.balanceMinor, 0)).toBe(150000)
  })
  it('S12: editar gasto posterior al saldo de 100 a 150 => 850; anterior al saldo no altera referencia', () => {
    const d = ok(saveTransaction(baseData(), tx({ id: 'expense', amountMinor: 10000 }), ctx)).data
    const edited = ok(saveTransaction(d, { ...d.transactions[0]!, amountMinor: 15000 }, ctx)).data
    expect(available(edited)).toBe(85000)
    const historical = ok(saveTransaction(edited, tx({ id: 'old', amountMinor: 10000, date: '2026-09-27' }), ctx)).data
    expect(available(historical)).toBe(85000)
  })
})

describe('controles adicionales y extremos', () => {
  it('la simulación no muta: 700 - 200 = 500; por día 35.71', () => {
    const d = budget(); const before = JSON.stringify(d)
    expect(simulatePurchase(d, TODAY, 20000)).toMatchObject({ availableAfterMinor: 50000, dailyAfterMinor: 3571 })
    expect(JSON.stringify(d)).toBe(before)
  })
  it('metas: no permite reservar 701 de 700 disponibles', () => {
    const d = budget(); d.goals.push(goal({ id: 'new-goal', targetMinor: 100000 }))
    expect(allocateToGoal(d, { goalId: 'new-goal', amountMinor: 70100 }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'exceedsFreeMoney' }] })
    expect(allocateToGoal(d, { goalId: 'new-goal', amountMinor: 70000 }, ctx).ok).toBe(true)
  })
  it('papelera y restauración conservan efecto: 900 -> 1000 -> 900', () => {
    const d = ok(saveTransaction(baseData(), tx({ id: 'delete-me', amountMinor: 10000 }), ctx)).data
    const deleted = ok(deleteTransaction(d, 'delete-me', ctx))
    const restored = ok(restoreFromTrash(deleted.data, deleted.value.id, ctx))
    expect([available(d), available(deleted.data), available(restored.data)]).toEqual([90000, 100000, 90000])
  })
  it('fechas: 31 enero -> 28 febrero -> 31 marzo; bisiesto y cambio de año', () => {
    expect(occurrencesBetween({ frequency: 'monthly', startDate: '2027-01-31' }, '2027-01-01', '2027-03-31')).toEqual(['2027-01-31','2027-02-28','2027-03-31'])
    expect(occurrencesBetween({ frequency: 'yearly', startDate: '2024-02-29' }, '2025-01-01', '2025-12-31')).toEqual(['2025-02-28'])
    expect(occurrencesBetween({ frequency: 'monthly', startDate: '2026-12-31' }, '2026-12-01', '2027-01-31')).toEqual(['2026-12-31','2027-01-31'])
  })
  it.each(['', '-1', '1.001', '10000000000.01', 'NaN', 'Infinity'])('importe inválido CAD %s se rechaza', input => {
    expect(parseMoney(input, 'CAD', 'en-CA').ok).toBe(false)
  })
  it('admite exactamente el límite documentado; rechaza futuros realizados y fechas inválidas', () => {
    expect(parseMoney('10000000000', 'CAD', 'en-CA')).toMatchObject({ ok: true, minor: MAX_AMOUNT_MINOR })
    expect(saveTransaction(baseData(), tx({ date: '2099-01-01' }), ctx).ok).toBe(false)
    expect(parseBankDate('31/02/2026', 'dmy')).toBeNull()
  })
  it('10.000 gastos de un centavo: 1000 - 100 = 900 exactos', () => {
    const d = baseData({ transactions: Array.from({ length: 10000 }, (_, i) => tx({ id: `stress-${i}`, amountMinor: 1 })) })
    expect(available(d)).toBe(90000)
    expect(validateAppData(d).ok).toBe(true)
  })
})

describe('regresiones abiertas: expectativas de seguridad financiera', () => {
  it('QA-01: cambiar moneda debe bloquearse si existe saldo de referencia no nulo', () => {
    expect(changeCurrency(baseData({ accounts: [bank('main', 200000)] }), 'JPY', ctx).ok).toBe(false)
  })
  it('QA-02: autoConfirm de ingreso 1000 con cobro parcial 400 solo debe añadir 600', () => {
    const d = baseData({ schedules: [income(TODAY, 100000, { id: 'partial', autoConfirm: true })] })
    const part = ok(markOccurrence(d, { scheduleId: 'partial', occurrenceDate: TODAY, amountMinor: 40000, date: TODAY, expectRemainder: true }, ctx)).data
    const auto = ok(autoConfirmDue(part, ctx)).data
    expect(auto.transactions.reduce((sum, t) => sum + t.amountMinor, 0)).toBe(100000)
    expect(spendableBalance(auto).totalMinor).toBe(200000)
  })
  it('QA-03: sin arrastre nunca debe anunciar más disponible que el saldo real después de deuda previa', () => {
    const d = baseData({ accounts: [bank('main', -50000)], transactions: [tx({ kind: 'income', amountMinor: 100000 })] })
    const changed = ok(updateSettings(d, { budgetPeriod: { type: 'month', weekStartsOn: 1 }, carryOverBalance: false }, ctx)).data
    expect(available(changed)).toBeLessThanOrEqual(50000)
  })
  it('QA-04: una reserva creada en septiembre no debe reducir el disponible de agosto', () => {
    const d = baseData({ goals: [goal({ allocations: [{ id: 'september', amountMinor: 30000, date: TODAY, createdAt: EARLIER }] })] })
    expect(homeSnapshotAt(d, '2026-08-31', { today: TODAY }).budget.availableMinor).toBe(100000)
  })
  it('QA-05: un CSV con importe USD explícito no debe aceptarse como CAD', () => {
    const table = parseCsv('date,description,amount\n2026-09-28,Refund,USD 100.00')
    const preview = previewImport(table, baseData(), { accountId: 'main', hasHeader: true, mapping: guessMapping(table[0]!)!, dateFormat: 'ymd', locale: 'en-CA', today: TODAY, invertSign: false })
    expect(preview.rows[0]!.status).toBe('error')
  })
  it('QA-06: 2000 ocurrencias pagadas no deben ocultar facturas diarias actuales', () => {
    const schedule = bill('2020-01-01', 100, { id: 'long-lived', frequency: 'daily' })
    // Fixture independiente del generador de recurrencias que estamos comprobando.
    const paidDates = Array.from({ length: 2000 }, (_, i) => addDays('2020-01-01', i))
    const d = baseData({ schedules: [schedule, income('2026-09-29', 100000)], transactions: paidDates.map((date, i) => tx({ id: `paid-${i}`, date, amountMinor: 100, scheduleId: schedule.id, occurrenceDate: date })) })
    expect(computeBudget(d, TODAY).reservedItems.some(i => i.date === TODAY && i.sourceId === schedule.id)).toBe(true)
  })
})
