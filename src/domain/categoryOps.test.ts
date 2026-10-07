import { describe, expect, it } from 'vitest'
import { applyOnboardingCategories, categoryUsage, deleteCategoryGroup, moveCategory, saveCategoryGroup, saveCategoryV2, setCategoryArchivedV2 } from './categoryOps'
import { categoriesForKind, defaultOnboardingCategoryIds, resolveCategories } from './categories'
import { baseData, bill, ctx, NOW, tx } from '../test/fixtures'
import { validateAppData } from '../storage/backup'

const custom = { id: 'c_gym', name: 'Gimnasio', kind: 'expense' as const, archived: false, createdAt: NOW, updatedAt: NOW }

describe('categorías v2: editar, archivar con reasignación, ordenar, grupos y onboarding', () => {
  it('edita una del sistema vía preferencias (nombre, icono, color, grupo) y vuelve al nombre traducido con nombre vacío', () => {
    const r = saveCategoryV2(baseData(), { id: 'dining', kind: 'expense', name: 'Comer fuera', icon: 'cup', color: 'red', groupId: 'lifestyle' }, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.categoryPrefs.dining).toEqual({ name: 'Comer fuera', icon: 'cup', color: 'red', groupId: 'lifestyle' })
    expect(r.value).toMatchObject({ id: 'dining', name: 'Comer fuera', icon: 'cup', color: 'red', groupId: 'lifestyle', isCustom: false })
    const back = saveCategoryV2(r.data, { id: 'dining', kind: 'expense', name: '' }, ctx)
    expect(back.ok && back.data.categoryPrefs.dining).toEqual({ icon: 'cup', color: 'red', groupId: 'lifestyle' })
    expect(saveCategoryV2(baseData(), { id: 'dining', kind: 'expense', groupId: 'nope' }, ctx)).toMatchObject({ ok: false, issues: [{ path: 'groupId' }] })
    expect(saveCategoryV2(baseData(), { id: 'dining', kind: 'expense', icon: 'bad icon!' }, ctx)).toMatchObject({ ok: false, issues: [{ path: 'icon' }] })
    expect(validateAppData(r.data).ok).toBe(true)
  })

  it('crea y edita una personalizada con aspecto; el tipo no cambia y el nombre no se repite', () => {
    const r = saveCategoryV2(baseData(), { id: 'c_gym', kind: 'expense', name: 'Gimnasio', icon: 'heart', color: 'lime', groupId: 'lifestyle' }, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.categories[0]).toMatchObject({ id: 'c_gym', name: 'Gimnasio', kind: 'expense', icon: 'heart', color: 'lime', groupId: 'lifestyle' })
    const edit = saveCategoryV2(r.data, { id: 'c_gym', kind: 'income', name: 'Gym', color: 'teal' }, ctx)
    expect(edit.ok && edit.data.categories[0]).toMatchObject({ kind: 'expense', name: 'Gym', color: 'teal', icon: 'heart' })
    expect(saveCategoryV2(r.data, { id: 'c_x', kind: 'expense', name: 'gimnasio' }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'duplicateName' }] })
    expect(saveCategoryV2(r.data, { id: 'dining', kind: 'expense', name: 'Gimnasio' }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'duplicateName' }] })
    expect(saveCategoryV2(baseData(), { id: 'x_bad', kind: 'expense', name: 'X' }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'invalidId' }] })
  })

  it('archivar con reasignación mueve movimientos, líneas divididas, papelera, programados, favoritos y reglas; nada se borra', () => {
    const data = baseData({
      categories: [custom],
      transactions: [
        tx({ id: 't1', categoryId: 'c_gym' }),
        tx({ id: 't2', categoryId: 'groceries', amountMinor: 1000, splits: [{ id: 'l1', categoryId: 'groceries', amountMinor: 600 }, { id: 'l2', categoryId: 'c_gym', amountMinor: 400 }] }),
      ],
      schedules: [bill('2026-10-05', 5000, { id: 's1', categoryId: 'c_gym' })],
      favorites: [{ id: 'f1', name: 'Gym', kind: 'expense', accountId: 'main', categoryId: 'c_gym', order: 0, createdAt: NOW, updatedAt: NOW }],
      categoryRules: [{ id: 'r1', pattern: 'gym', kind: 'expense', categoryId: 'c_gym', createdAt: NOW, updatedAt: NOW }],
    })
    expect(categoryUsage(data, 'c_gym')).toBe(5)
    const r = setCategoryArchivedV2(data, 'c_gym', true, ctx, { reassignTo: 'health' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.transactions.map((t) => t.categoryId)).toEqual(['health', 'groceries'])
    expect(r.data.transactions[1]!.splits!.map((l) => l.categoryId)).toEqual(['groceries', 'health'])
    expect(r.data.schedules[0]!.categoryId).toBe('health')
    expect(r.data.favorites[0]!.categoryId).toBe('health')
    expect(r.data.categoryRules[0]!.categoryId).toBe('health')
    expect(r.data.categories[0]!.archived).toBe(true)
    expect(r.data.transactions).toHaveLength(2)
    expect(categoryUsage(r.data, 'c_gym')).toBe(0)
    expect(validateAppData(r.data).ok).toBe(true)
    // Reasignar a una de otro tipo o archivada falla sin tocar nada.
    expect(setCategoryArchivedV2(data, 'c_gym', true, ctx, { reassignTo: 'salary' })).toMatchObject({ ok: false, issues: [{ path: 'reassignTo' }] })
  })

  it('archivar una del sistema usa preferencias y la saca de los formularios; nunca la última activa de un tipo', () => {
    const r = setCategoryArchivedV2(baseData(), 'dining', true, ctx)
    expect(r.ok && r.data.categoryPrefs.dining).toEqual({ archived: true })
    if (!r.ok) return
    expect(categoriesForKind('expense', r.data.categories, { prefs: r.data.categoryPrefs })).not.toContain('dining')
    expect(categoriesForKind('expense', r.data.categories, { includeArchived: true })).toContain('dining')
    const restore = setCategoryArchivedV2(r.data, 'dining', false, ctx)
    expect(restore.ok && restore.data.categoryPrefs.dining).toEqual({ archived: false })
    // Dejar solo una de ingresos y archivarla: no.
    const incomeIds = categoriesForKind('income', [], {})
    const onlySalary = applyOnboardingCategories(baseData(), ['groceries', 'salary'], ctx)
    expect(onlySalary.ok).toBe(true)
    if (!onlySalary.ok) return
    expect(categoriesForKind('income', [], { prefs: onlySalary.data.categoryPrefs })).toEqual(['salary'])
    expect(incomeIds.length).toBeGreaterThan(1)
    expect(setCategoryArchivedV2(onlySalary.data, 'salary', true, ctx)).toMatchObject({ ok: false, issues: [{ code: 'lastCategoryOfKind' }] })
  })

  it('reordena dentro del tipo y guarda el orden para todas (sistema y personalizadas)', () => {
    const data = baseData({ categories: [custom] })
    const before = resolveCategories(data).filter((c) => c.kind === 'expense').map((c) => c.id)
    expect(before[0]).toBe('groceries')
    expect(before.at(-1)).toBe('c_gym')
    const up = moveCategory(data, 'c_gym', -1, ctx)
    expect(up.ok).toBe(true)
    if (!up.ok) return
    const after = resolveCategories(up.data).filter((c) => c.kind === 'expense').map((c) => c.id)
    expect(after.at(-2)).toBe('c_gym')
    expect(after.at(-1)).toBe(before.at(-2))
    expect(after.length).toBe(before.length)
    // Los ingresos no se mueven y los extremos no se pasan.
    expect(resolveCategories(up.data).filter((c) => c.kind === 'income').map((c) => c.id)).toEqual(resolveCategories(data).filter((c) => c.kind === 'income').map((c) => c.id))
    expect(moveCategory(up.data, 'groceries', -1, ctx)).toMatchObject({ ok: true, unchanged: true })
    expect(validateAppData(up.data).ok).toBe(true)
  })

  it('grupos propios: crear, renombrar, no duplicar, y al eliminar sus categorías vuelven a «Otros»', () => {
    const g = saveCategoryGroup(baseData(), { id: 'g_kids', name: 'Peques', color: 'pink' }, ctx)
    expect(g.ok).toBe(true)
    if (!g.ok) return
    expect(saveCategoryGroup(g.data, { id: 'g_two', name: 'peques', color: 'blue' }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'duplicateName' }] })
    expect(saveCategoryGroup(g.data, { id: 'food', name: 'X', color: 'blue' }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'invalidId' }] })
    const moved = saveCategoryV2(g.data, { id: 'children', kind: 'expense', groupId: 'g_kids' }, ctx)
    expect(moved.ok && moved.value.groupId).toBe('g_kids')
    if (!moved.ok) return
    const del = deleteCategoryGroup(moved.data, 'g_kids', ctx)
    expect(del.ok).toBe(true)
    if (!del.ok) return
    expect(del.data.categoryGroups).toEqual([])
    expect(resolveCategories(del.data).find((c) => c.id === 'children')!.groupId).toBe('other')
    expect(validateAppData(del.data).ok).toBe(true)
  })

  it('el onboarding archiva las no elegidas y exige una de cada tipo; las propuestas por defecto son 16 + 6', () => {
    const r = applyOnboardingCategories(baseData(), ['groceries', 'dining', 'salary'], ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(categoriesForKind('expense', [], { prefs: r.data.categoryPrefs })).toEqual(['groceries', 'dining'])
    expect(categoriesForKind('income', [], { prefs: r.data.categoryPrefs })).toEqual(['salary'])
    expect(applyOnboardingCategories(baseData(), ['groceries'], ctx)).toMatchObject({ ok: false, issues: [{ code: 'lastCategoryOfKind' }] })
    const def = applyOnboardingCategories(baseData(), defaultOnboardingCategoryIds(), ctx)
    expect(def.ok && categoriesForKind('expense', [], { prefs: def.data.categoryPrefs })).toHaveLength(16)
    expect(def.ok && categoriesForKind('income', [], { prefs: def.data.categoryPrefs })).toHaveLength(6)
  })
})
