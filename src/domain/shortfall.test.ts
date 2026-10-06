import { describe, expect, it } from 'vitest'
import { analyzeShortfall, applyShortfallPlan, evaluateLevers, leverBasis, type ShortfallLever } from './shortfall'
import type { AppData } from './types'
import { account, baseData, bill, ctx, income, tx } from '../test/fixtures'

/** 1000.00 hoy (28-sep); alquiler 800.00 el 1-oct; portátil PREVISTO 400.00 el 3-oct; sueldo 1000.00 el 10-oct. */
function scenario(): AppData {
  return baseData({
    schedules: [bill('2026-10-01', 80000, { id: 'rent', name: 'Alquiler' }), income('2026-10-10', 100000, { id: 'pay' })],
    transactions: [tx({ id: 'laptop', status: 'planned', amountMinor: 40000, date: '2026-10-03', note: 'Portátil' }), tx({ id: 'past', amountMinor: 1000, date: '2026-09-20', createdAt: '2026-09-20T12:00:00.000Z' })],
    accounts: [account({ id: 'main', anchor: { amountMinor: 101000, date: '2026-09-20', setAt: '2026-09-20T10:00:00.000Z' } })],
  })
}

describe('plan ante un faltante', () => {
  it('primer día negativo, importe, peor día y quién contribuye (cifras a mano)', () => {
    const r = analyzeShortfall(scenario(), ctx.today)
    if (r.status !== 'shortfall') throw new Error('sin faltante')
    // 1000 − 800 (1-oct) = 200; − 400 (3-oct) = −200; + 1000 (10-oct) = 800.
    expect(r.firstNegativeDate).toBe('2026-10-03')
    expect(r.firstNegativeMinor).toBe(20000)
    expect(r.worst).toEqual({ date: '2026-10-03', shortfallMinor: 20000 })
    expect(r.contributors.map((c) => [c.item.sourceId, c.role, c.amountMinor])).toEqual([
      ['rent', 'obligation', 80000],
      ['laptop', 'planned', 40000],
    ])
    expect(r.incomes.map((i) => i.sourceId)).toEqual(['pay'])
  })

  it('palancas: mover o reducir la compra prevista lo resuelve; adelantar el ingreso es solo un supuesto; el alquiler nunca es palanca', () => {
    const data = scenario()
    const r = analyzeShortfall(data, ctx.today)
    if (r.status !== 'shortfall') throw new Error('sin faltante')
    const byKind = Object.fromEntries(r.levers.map((l) => [l.lever.kind, l]))
    expect(byKind.postponePlanned!.lever).toEqual({ kind: 'postponePlanned', txId: 'laptop', fromDate: '2026-10-03', toDate: '2026-10-10' })
    expect(byKind.postponePlanned!.effect.resolves).toBe(true)
    // 400 − 200 que faltan = 200: el 3-oct queda en 0 (no negativo).
    expect(byKind.reducePlanned!.lever).toMatchObject({ toMinor: 20000 })
    expect(byKind.reducePlanned!.effect).toMatchObject({ resolves: true, lowest: { minor: 0 } })
    expect(byKind.incomeDate!.applicable).toBe(false)
    expect(byKind.incomeDate!.effect.resolves).toBe(true)
    expect(r.levers.some((l) => JSON.stringify(l.lever).includes('rent'))).toBe(false)
    // Simular no cambia nada.
    expect(data).toEqual(scenario())
  })

  it('aplicar: solo planificación, todo o nada, con conflicto si algo cambió; realizados intactos', () => {
    const data = scenario()
    const lever: ShortfallLever = { kind: 'postponePlanned', txId: 'laptop', fromDate: '2026-10-03', toDate: '2026-10-10' }
    const applied = applyShortfallPlan(data, [{ lever, basis: leverBasis(data, lever) }], ctx)
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues))
    expect(applied.data.transactions.find((t) => t.id === 'laptop')!.date).toBe('2026-10-10')
    expect(applied.data.transactions.find((t) => t.id === 'past')).toEqual(data.transactions.find((t) => t.id === 'past'))
    expect(applied.data.schedules).toEqual(data.schedules)
    expect(analyzeShortfall(applied.data, ctx.today).status).toBe('none')

    // Si la compra cambió después de mostrar la propuesta, no se aplica nada.
    const stale = leverBasis(data, lever)
    const edited = { ...data, transactions: data.transactions.map((t) => (t.id === 'laptop' ? { ...t, amountMinor: 45000, updatedAt: '2026-09-28T17:00:00.000Z' } : t)) }
    expect(applyShortfallPlan(edited, [{ lever, basis: stale }], ctx)).toMatchObject({ ok: false, issues: [{ code: 'revertConflict' }] })
    // Reducir a 0 = quitar la compra prevista: va a la papelera, nunca un importe 0.
    const remove: ShortfallLever = { kind: 'reducePlanned', txId: 'laptop', fromMinor: 40000, toMinor: 0 }
    const removed = applyShortfallPlan(data, [{ lever: remove, basis: leverBasis(data, remove) }], ctx)
    if (!removed.ok) throw new Error(JSON.stringify(removed.issues))
    expect(removed.data.transactions.some((t) => t.id === 'laptop')).toBe(false)
    expect(removed.data.trash.map((e) => e.id)).toEqual(['laptop'])
    // Un supuesto de fecha de ingreso no se aplica.
    const dateLever: ShortfallLever = { kind: 'incomeDate', scheduleId: 'pay', fromDate: '2026-10-10', toDate: '2026-10-03' }
    expect(applyShortfallPlan(data, [{ lever: dateLever, basis: null }], ctx).ok).toBe(false)
  })

  it('gasto diario: el recorte necesario se calcula hasta el peor día y lo resuelve justo', () => {
    const data = baseData({
      schedules: [bill('2026-10-01', 9000, { id: 'b' }), income('2026-10-05', 50000)],
      accounts: [account({ id: 'main', anchor: { amountMinor: 10000, date: ctx.today, setAt: '2026-09-28T10:00:00.000Z' } })],
    })
    const r = analyzeShortfall(data, ctx.today, { dailySpendMinor: 500 })
    if (r.status !== 'shortfall') throw new Error('sin faltante')
    // 100 − 5×4 − 90 = −10 el 1-oct; peor el 4-oct: −25.
    expect(r.firstNegativeDate).toBe('2026-10-01')
    expect(r.worst).toEqual({ date: '2026-10-04', shortfallMinor: 2500 })
    const daily = r.levers.find((l) => l.lever.kind === 'dailySpend')!
    // ceil(25.00 / 7 días) = 3.58 menos al día → 1.42.
    expect(daily.lever).toEqual({ kind: 'dailySpend', fromMinor: 500, toMinor: 142 })
    expect(daily.applicable).toBe(false)
    expect(daily.effect.resolves).toBe(true)
    expect(evaluateLevers(data, ctx.today, [{ kind: 'dailySpend', fromMinor: 500, toMinor: 143 }], { dailySpendMinor: 500 }).resolves).toBe(false)
  })

  it('ingreso variable: la proyección usa el mínimo; el esperado es un supuesto que no se aplica', () => {
    const data = baseData({
      schedules: [bill('2026-10-02', 15000, { id: 'b' }), income('2026-09-30', 10000, { id: 'v', amountIsEstimate: true, range: { minMinor: 2000, extraMinor: 15000 } })],
      accounts: [account({ id: 'main', anchor: { amountMinor: 10000, date: ctx.today, setAt: '2026-09-28T10:00:00.000Z' } })],
    })
    const r = analyzeShortfall(data, ctx.today)
    if (r.status !== 'shortfall') throw new Error('sin faltante')
    // 100 + 20 (mínimo) − 150 = −30.
    expect(r.firstNegativeMinor).toBe(3000)
    const amount = r.levers.find((l) => l.lever.kind === 'incomeAmount')!
    expect(amount.lever).toMatchObject({ fromMinor: 2000, toMinor: 10000 })
    expect(amount.applicable).toBe(false)
    expect(amount.effect.resolves).toBe(true)
  })
})
