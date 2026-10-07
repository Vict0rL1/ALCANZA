import { describe, expect, it } from 'vitest'
import { closeDuePlans, cycleFor, deletePlan, planAlerts, planDailySeries, planProgress, plansSummary, planTransactions, repeatPlan, restorePlan, savePlan, setPlanStatus } from './plans'
import { deleteCategory } from './operations'
import { validateAppData } from '../storage/backup'
import { baseData, ctx, goal, NOW, TODAY, tx } from '../test/fixtures'

const draft = { id: 'p1', name: 'Comer fuera', categoryIds: ['dining'], amountMinor: 20000, periodType: 'month' as const, recurring: true, alertAt80: true, alertAt100: true }

describe('planes: crear, progreso, serie diaria y validación', () => {
  it('crear fija el ciclo mensual que contiene hoy; editar conserva estado y ciclo; errores claros', () => {
    const r = savePlan(baseData(), draft, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30', status: 'active', currency: 'CAD', recurring: true })
    const edit = savePlan(r.data, { ...draft, amountMinor: 30000 }, { ...ctx, today: '2026-10-05' })
    expect(edit.ok && edit.value).toMatchObject({ amountMinor: 30000, startDate: '2026-09-01', endDate: '2026-09-30' })
    // Cambiar el periodo recalcula el ciclo.
    const week = savePlan(r.data, { ...draft, periodType: 'week' }, ctx)
    expect(week.ok && week.value).toMatchObject({ startDate: '2026-09-28', endDate: '2026-10-04' })
    expect(savePlan(baseData(), { ...draft, amountMinor: 0 }, ctx)).toMatchObject({ ok: false, issues: [{ path: 'amountMinor' }] })
    expect(savePlan(baseData(), { ...draft, categoryIds: ['salary'] }, ctx)).toMatchObject({ ok: false, issues: [{ path: 'categoryIds' }] })
    expect(savePlan(baseData(), { ...draft, periodType: 'custom', startDate: '2026-10-10', endDate: '2026-10-01' }, ctx).ok).toBe(false)
    const custom = savePlan(baseData(), { ...draft, periodType: 'custom', startDate: '2026-09-20', endDate: '2026-10-10' }, ctx)
    expect(custom.ok && custom.value).toMatchObject({ startDate: '2026-09-20', endDate: '2026-10-10', recurring: false })
    expect(validateAppData(r.data).ok).toBe(true)
  })

  it('progreso: gasto neto de las categorías del plan (divididas incluidas), estados, días y ritmo ideal', () => {
    const data = baseData({
      transactions: [
        tx({ id: 'a', categoryId: 'dining', amountMinor: 9000, date: '2026-09-02' }),
        tx({ id: 'b', categoryId: 'groceries', amountMinor: 5000, date: '2026-09-03', splits: [{ id: 'l1', categoryId: 'groceries', amountMinor: 3000 }, { id: 'l2', categoryId: 'dining', amountMinor: 2000 }] }),
        tx({ id: 'c', kind: 'refund', categoryId: 'dining', amountMinor: 1000, date: '2026-09-04' }),
        tx({ id: 'd', categoryId: 'dining', amountMinor: 999, date: '2026-08-31' }),
        tx({ id: 'e', categoryId: 'dining', amountMinor: 999, date: '2026-09-10', status: 'planned' }),
      ],
    })
    const saved = savePlan(data, draft, ctx)
    if (!saved.ok) throw new Error('plan')
    const p = planProgress(saved.data, saved.value, TODAY)
    expect(p).toMatchObject({ spentMinor: 10000, remainingMinor: 10000, percent: 50, state: 'ok', daysTotal: 30, daysLeft: 3 })
    expect(p.idealToDateMinor).toBe(18666) // 20000 × 28 / 30
    expect(planTransactions(saved.data, saved.value, p.cycle!).map((t) => t.id)).toEqual(['c', 'b', 'a'])
    const series = planDailySeries(saved.data, saved.value, p.cycle!, TODAY)
    expect(series).toHaveLength(30)
    expect(series[0]).toEqual({ date: '2026-09-01', cumulativeMinor: 0, idealMinor: 666 })
    expect(series[3]).toMatchObject({ date: '2026-09-04', cumulativeMinor: 10000 })
    expect(series[29]).toMatchObject({ date: '2026-09-30', cumulativeMinor: null, idealMinor: 20000 })

    const near = savePlan(data, { ...draft, amountMinor: 12000 }, ctx)
    expect(near.ok && planProgress(near.data, near.value, TODAY).state).toBe('near')
    const over = savePlan(data, { ...draft, amountMinor: 9999 }, ctx)
    expect(over.ok && planProgress(over.data, over.value, TODAY)).toMatchObject({ state: 'over', remainingMinor: -1 })
    // Sin categorías = todas las de gasto (el movimiento dividido cuenta entero).
    const all = savePlan(data, { ...draft, categoryIds: [] }, ctx)
    expect(all.ok && planProgress(all.data, all.value, TODAY).spentMinor).toBe(13000)
  })

  it('pausar, reanudar, eliminar y restaurar', () => {
    const saved = savePlan(baseData(), draft, ctx)
    if (!saved.ok) throw new Error('plan')
    const paused = setPlanStatus(saved.data, 'p1', 'paused', ctx)
    expect(paused.ok && paused.value.status).toBe('paused')
    expect(paused.ok && planProgress(paused.data, paused.value, TODAY).state).toBe('paused')
    expect(paused.ok && setPlanStatus(paused.data, 'p1', 'paused', ctx)).toMatchObject({ ok: true, unchanged: true })
    const removed = deletePlan(saved.data, 'p1', ctx)
    expect(removed.ok && removed.data.plans).toEqual([])
    const back = removed.ok && restorePlan(removed.data, removed.value, ctx)
    expect(back && back.ok && back.data.plans).toHaveLength(1)
    expect(setPlanStatus(baseData(), 'nope', 'paused', ctx).ok).toBe(false)
  })
})

describe('planes: cierre automático, recurrencia, repetir, resumen y alertas', () => {
  it('cierra el ciclo vencido con resultado y renueva el recurrente en el periodo que contiene hoy', () => {
    const data = baseData({ transactions: [tx({ id: 'a', categoryId: 'dining', amountMinor: 25000, date: '2026-09-15' })] })
    const saved = savePlan(data, draft, ctx)
    if (!saved.ok) throw new Error('plan')
    // Mientras el ciclo sigue abierto, no hay cambios.
    expect(closeDuePlans(saved.data, ctx)).toMatchObject({ ok: true, unchanged: true })
    const r = closeDuePlans(saved.data, { today: '2026-11-03', now: '2026-11-03T12:00:00.000Z' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.closed).toHaveLength(1)
    expect(r.value.closed[0]).toMatchObject({ id: 'p1', status: 'completed', result: { spentMinor: 25000, achieved: false, deltaMinor: -5000, closedAt: '2026-11-03T12:00:00.000Z' } })
    expect(r.value.renewed).toHaveLength(1)
    // Saltó octubre: el nuevo ciclo es noviembre (no se inventan cierres intermedios).
    expect(r.value.renewed[0]).toMatchObject({ startDate: '2026-11-01', endDate: '2026-11-30', status: 'active', previousPlanId: 'p1', amountMinor: 20000 })
    expect(r.value.renewed[0]!.result).toBeUndefined()
    expect(r.data.plans).toHaveLength(2)
    expect(validateAppData(r.data).ok).toBe(true)
    // Idempotente: una segunda pasada no cambia nada.
    expect(closeDuePlans(r.data, { today: '2026-11-03', now: NOW })).toMatchObject({ ok: true, unchanged: true })
  })

  it('un plan no recurrente solo se cierra; un pausado no se cierra; un migrado sin ciclo recibe el de hoy', () => {
    const once = savePlan(baseData(), { ...draft, recurring: false }, ctx)
    if (!once.ok) throw new Error('plan')
    const r = closeDuePlans(once.data, { today: '2026-10-01', now: NOW })
    expect(r.ok && r.value).toMatchObject({ closed: [{ id: 'p1', status: 'completed', result: { achieved: true, deltaMinor: 20000 } }], renewed: [] })
    const paused = setPlanStatus(once.data, 'p1', 'paused', ctx)
    expect(paused.ok && closeDuePlans(paused.data, { today: '2026-10-01', now: NOW })).toMatchObject({ ok: true, unchanged: true })
    const migrated = baseData({ plans: [{ ...once.value, startDate: undefined, endDate: undefined }] })
    const fixed = closeDuePlans(migrated, ctx)
    expect(fixed.ok && fixed.data.plans[0]).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30', status: 'active' })
  })

  it('repetir crea un plan activo con el ciclo de hoy (los personalizados conservan la duración)', () => {
    const custom = savePlan(baseData(), { ...draft, id: 'c1', periodType: 'custom', startDate: '2026-08-01', endDate: '2026-08-10' }, ctx)
    if (!custom.ok) throw new Error('plan')
    const r = repeatPlan(custom.data, 'c1', { today: '2026-10-01', now: NOW }, 'c2')
    expect(r.ok && r.value).toMatchObject({ id: 'c2', startDate: '2026-10-01', endDate: '2026-10-10', status: 'active', previousPlanId: 'c1' })
    expect(r.ok && repeatPlan(r.data, 'c1', ctx, 'c2')).toMatchObject({ ok: true, unchanged: true })
    expect(repeatPlan(baseData(), 'nope', ctx).ok).toBe(false)
  })

  it('resumen y alertas respetan umbrales y estados; metas completas en porcentaje entero', () => {
    const data = baseData({
      transactions: [tx({ id: 'a', categoryId: 'dining', amountMinor: 17000, date: '2026-09-15' }), tx({ id: 'b', categoryId: 'transport', amountMinor: 5000, date: '2026-09-15' })],
      goals: [goal({ id: 'g1', allocations: [{ id: 'al', amountMinor: 50000, date: TODAY, createdAt: NOW }] }), goal({ id: 'g2' }), goal({ id: 'g3' })],
    })
    let d = data
    for (const p of [draft, { ...draft, id: 'p2', categoryIds: ['transport'], amountMinor: 4000, alertAt80: false }, { ...draft, id: 'p3', categoryIds: ['groceries'], amountMinor: 4000 }]) {
      const r = savePlan(d, p, ctx)
      if (!r.ok) throw new Error('plan')
      d = r.data
    }
    expect(plansSummary(d, TODAY)).toEqual({ active: 3, completed: 0, exceeded: 1, near: 1, goals: 3, goalsComplete: 1, goalsPercent: 33 })
    expect(planAlerts(d, TODAY).map((a) => [a.plan.id, a.level])).toEqual([['p1', 80], ['p2', 100]])
    const noAlert = savePlan(d, { ...draft, alertAt80: false }, ctx)
    expect(noAlert.ok && planAlerts(noAlert.data, TODAY).map((a) => a.plan.id)).toEqual(['p2'])
    const paused = setPlanStatus(d, 'p2', 'paused', ctx)
    expect(paused.ok && plansSummary(paused.data, TODAY)).toMatchObject({ active: 3, exceeded: 0 })
  })

  it('eliminar una categoría personalizada quita su plan exclusivo y la retira de los compartidos', () => {
    const custom = { id: 'c_gym', name: 'Gimnasio', kind: 'expense' as const, archived: false, createdAt: NOW, updatedAt: NOW }
    let d = baseData({ categories: [custom] })
    for (const p of [{ ...draft, id: 'only', categoryIds: ['c_gym'] }, { ...draft, id: 'shared', categoryIds: ['c_gym', 'dining'] }]) {
      const r = savePlan(d, p, ctx)
      if (!r.ok) throw new Error('plan')
      d = r.data
    }
    const r = deleteCategory(d, 'c_gym', ctx)
    expect(r.ok && r.data.plans.map((p) => [p.id, p.categoryIds])).toEqual([['shared', ['dining']]])
  })

  it('cycleFor: semana según el inicio configurado y personalizado solo con fechas válidas', () => {
    const settings = { ...baseData().settings, budgetPeriod: { type: 'month' as const, weekStartsOn: 0 as const } }
    expect(cycleFor('week', settings, TODAY)).toEqual({ start: '2026-09-27', end: '2026-10-03' })
    expect(cycleFor('custom', settings, TODAY)).toBeNull()
    expect(cycleFor('untilIncome', settings, TODAY)).toBeNull()
  })
})
