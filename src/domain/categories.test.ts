import { describe, expect, it } from 'vitest'
import { CATEGORY_COLOR_LIST, categoriesForKind, colorForId, defaultOnboardingCategoryIds, EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS, resolveCategories, resolveGroups, SYSTEM_GROUP_IDS, systemCategoryMeta } from './categories'
import { NOW } from '../test/fixtures'

describe('categorías v9', () => {
  it('el onboarding propone las 16 de gasto y 6 de ingreso de §7.1; las extras de Clara quedan disponibles', () => {
    const on = defaultOnboardingCategoryIds()
    expect(on.filter((id) => EXPENSE_CATEGORY_IDS.includes(id as never))).toHaveLength(16)
    expect(on.filter((id) => INCOME_CATEGORY_IDS.includes(id as never))).toHaveLength(6)
    expect(on).not.toContain('phone_internet')
    expect(EXPENSE_CATEGORY_IDS).toContain('phone_internet')
  })

  it('toda categoría del sistema tiene grupo válido, icono y uno de los 16 colores', () => {
    for (const id of [...EXPENSE_CATEGORY_IDS, ...INCOME_CATEGORY_IDS]) {
      const meta = systemCategoryMeta(id)!
      expect(SYSTEM_GROUP_IDS).toContain(meta.groupId)
      expect(meta.icon.length).toBeGreaterThan(0)
      expect(CATEGORY_COLOR_LIST).toContain(meta.color)
    }
    expect(resolveGroups({ categoryGroups: [] }).map((g) => g.id)).toEqual([...SYSTEM_GROUP_IDS])
  })

  it('resolveCategories aplica preferencias sobre las del sistema y rellena las personalizadas', () => {
    const all = resolveCategories({
      categories: [{ id: 'c_pets', name: 'Mascotas', kind: 'expense', archived: false, createdAt: NOW, updatedAt: NOW }],
      categoryPrefs: { dining: { name: 'Comer fuera', archived: true, color: 'red', sortOrder: 0 } },
    })
    const dining = all.find((c) => c.id === 'dining')!
    expect(dining).toMatchObject({ name: 'Comer fuera', archived: true, color: 'red', isCustom: false, nameKey: 'category.dining' })
    expect(all[0]!.id).toBe('dining')
    const pets = all.find((c) => c.id === 'c_pets')!
    expect(pets).toMatchObject({ isCustom: true, groupId: 'other', icon: 'tag', color: colorForId('c_pets') })
    expect(colorForId('c_pets')).toBe(colorForId('c_pets'))
    // Archivada por preferencia: fuera de los formularios, pero válida para datos antiguos.
    expect(categoriesForKind('expense', [], { prefs: { dining: { archived: true } } })).not.toContain('dining')
    expect(categoriesForKind('expense', [], { prefs: { dining: { archived: true } }, includeArchived: true })).toContain('dining')
  })
})
