import { describe, expect, it } from 'vitest'
import { applyDistribution, distributionContext } from './incomeDistribution'
import { saveTransaction } from './operations'
import { deleteTemplate, resolveDistributionTemplate, resolveSplitTemplate, saveTemplate, templateAmounts } from './templates'
import type { AppData, Template } from './types'
import { baseData, bill, ctx, EARLIER, goal, tx } from '../test/fixtures'

const pct = (bps: number) => ({ mode: 'percent' as const, bps })
const fixed = (amountMinor: number) => ({ mode: 'fixed' as const, amountMinor })
const split = (lines: { categoryId: string; amount: ReturnType<typeof pct> | ReturnType<typeof fixed> }[]): Extract<Template, { kind: 'split' }> => ({
  id: 'tpl-split',
  name: 'Súper',
  kind: 'split',
  lines,
  createdAt: EARLIER,
  updatedAt: EARLIER,
})

describe('plantillas: regla de importes', () => {
  it('100 % en porcentajes: los céntimos del redondeo van a la línea mayor y cuadra exacto', () => {
    // 100.01 × 1/3 = 33.336… → 33.33 ×3 = 99.99; sobran 2 céntimos → a la primera (empate).
    const r = templateAmounts([pct(3334), pct(3333), pct(3333)], 10001)
    expect(r).toEqual({ amounts: [3334 + 1, 3333, 3333], roundingTo: 0, roundingMinor: 1 })
    expect(r!.amounts.reduce((a, b) => a + b)).toBe(10001)
    const tie = templateAmounts([pct(5000), pct(5000)], 1001)
    expect(tie).toEqual({ amounts: [501, 500], roundingTo: 0, roundingMinor: 1 })
  })

  it('con fijos o porcentajes < 100 %, lo que sobra queda sin asignar; superar el total no aplica nada', () => {
    expect(templateAmounts([fixed(2000), pct(5000)], 10000)).toEqual({ amounts: [2000, 5000], roundingTo: null, roundingMinor: 0 })
    expect(templateAmounts([fixed(8000), pct(5000)], 10000)).toBeNull()
    expect(templateAmounts([fixed(10001)], 10000)).toBeNull()
  })
})

describe('plantillas de división', () => {
  it('categorías archivadas o eliminadas no se aplican y su parte queda sin asignar', () => {
    const data = baseData({ categories: [{ id: 'c_old', name: 'Vieja', kind: 'expense', archived: true, createdAt: EARLIER, updatedAt: EARLIER }] })
    const r = resolveSplitTemplate(data, split([
      { categoryId: 'groceries', amount: pct(6000) },
      { categoryId: 'c_old', amount: pct(3000) },
      { categoryId: 'c_gone', amount: pct(1000) },
    ]), 5000)
    if ('exceeds' in r) throw new Error('exceeds')
    expect(r.lines.map((l) => l.problem)).toEqual([undefined, 'archivedCategory', 'missingCategory'])
    expect(r.apply).toEqual([{ categoryId: 'groceries', amountMinor: 3000 }])
    expect(r.unassignedMinor).toBe(2000)
  })

  it('aplicada a una compra, la división guardada suma el total exacto', () => {
    const data = baseData()
    const r = resolveSplitTemplate(data, split([{ categoryId: 'groceries', amount: pct(7000) }, { categoryId: 'housing', amount: pct(3000) }]), 4999)
    if ('exceeds' in r) throw new Error('exceeds')
    // 49.99 × 70 % = 34.993 → 34.99; × 30 % = 14.997 → 14.99; sobra 0.01 → a la línea del 70 %.
    expect(r.apply).toEqual([
      { categoryId: 'groceries', amountMinor: 3500 },
      { categoryId: 'housing', amountMinor: 1499 },
    ])
    expect(r.rounding).toEqual({ toCategoryId: 'groceries', amountMinor: 1 })
    const saved = saveTransaction(data, tx({ id: 'buy', amountMinor: 4999, splits: r.apply.map((l, i) => ({ id: `s${i}`, ...l })) }), ctx)
    expect(saved.ok).toBe(true)
  })
})

describe('plantillas de distribución', () => {
  function setup(): AppData {
    let d = baseData({
      schedules: [bill('2026-10-05', 30000, { id: 'rent' })],
      goals: [goal({ id: 'save', targetMinor: 10000 }), goal({ id: 'gone-later', targetMinor: 5000 })],
    })
    const r = saveTransaction(d, tx({ id: 'pay', kind: 'income', amountMinor: 100000, categoryId: 'salary' }), ctx)
    if (!r.ok) throw new Error('setup')
    d = r.data
    return d
  }
  const tpl = (lines: Extract<Template, { kind: 'distribution' }>['lines']): Extract<Template, { kind: 'distribution' }> => ({ id: 'tpl-d', name: 'Quincena', kind: 'distribution', lines, createdAt: EARLIER, updatedAt: EARLIER })

  it('porcentajes del ingreso, limitados a lo que falta; nunca registra nada por sí sola', () => {
    const d = setup()
    const c = distributionContext(d, 'pay', ctx.today)!
    const r = resolveDistributionTemplate(d, tpl([
      { target: { kind: 'payment', scheduleId: 'rent' }, amount: pct(5000) },
      { target: { kind: 'goal', goalId: 'save' }, amount: pct(2000) },
      { target: { kind: 'goal', goalId: 'nope' }, amount: fixed(100) },
    ]), c)
    if ('exceeds' in r) throw new Error('exceeds')
    // Alquiler: 50 % de 1000 = 500, pero solo faltan 300 → 300. Meta: 20 % = 200, faltan 100 → 100.
    expect(r.lines.map((l) => [l.amountMinor, l.cappedFromMinor, l.problem])).toEqual([
      [30000, 50000, undefined],
      [10000, 20000, undefined],
      [0, undefined, 'missingGoal'],
    ])
    expect(r.apply).toEqual([
      { kind: 'payment', amountMinor: 30000, scheduleId: 'rent', occurrenceDate: '2026-10-05' },
      { kind: 'goal', amountMinor: 10000, goalId: 'save' },
    ])
    expect(r.unassignedMinor).toBe(100000 - 40000)
    // La plantilla solo propone: los datos no cambian hasta aplicar la distribución.
    expect(d.goals.every((g) => g.allocations.length === 0)).toBe(true)
    const applied = applyDistribution(d, { distributionId: 'dist-1', incomeTxId: 'pay', lines: r.apply }, ctx)
    expect(applied.ok).toBe(true)
  })

  it('no supera lo que queda por repartir', () => {
    const d = setup()
    const c = distributionContext(d, 'pay', ctx.today)!
    expect(resolveDistributionTemplate(d, tpl([{ target: { kind: 'goal', goalId: 'save' }, amount: fixed(100001) }]), c)).toEqual({ exceeds: true })
    const partly = applyDistribution(d, { distributionId: 'd0', incomeTxId: 'pay', lines: [{ kind: 'goal', amountMinor: 5000, goalId: 'save' }] }, ctx)
    if (!partly.ok) throw new Error('partly')
    const c2 = distributionContext(partly.data, 'pay', ctx.today)!
    // Queda 950.00 por repartir: un 96 % (960.00) ya no cabe.
    expect(resolveDistributionTemplate(partly.data, tpl([{ target: { kind: 'goal', goalId: 'gone-later' }, amount: pct(9600) }]), c2)).toEqual({ exceeds: true })
  })
})

describe('plantillas: guardar y eliminar', () => {
  it('valida, es idempotente y se puede eliminar', () => {
    const d = baseData()
    const draft = { id: 'tpl-1', name: ' Súper ', kind: 'split' as const, lines: [{ categoryId: 'groceries', amount: pct(10000) }] }
    const r = saveTemplate(d, draft, ctx)
    if (!r.ok) throw new Error('save')
    expect(r.value.name).toBe('Súper')
    const again = saveTemplate(r.data, draft, ctx)
    expect(again.ok && again.unchanged).toBe(true)
    expect(saveTemplate(d, { ...draft, lines: [{ categoryId: 'groceries', amount: pct(6000) }, { categoryId: 'housing', amount: pct(6000) }] }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'percentOver100' }] })
    const del = deleteTemplate(r.data, 'tpl-1', ctx)
    expect(del.ok && del.data.templates).toEqual([])
  })
})
