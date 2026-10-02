import { describe, expect, it } from 'vitest'
import { favoritePrefill, sortedFavorites } from './favorites'
import { deleteAccount, deleteFavorite, moveFavorite, restoreFavorite, saveFavorite, setCategoryArchived, type FavoriteDraft } from './operations'
import type { AppData, CustomCategory } from './types'
import { validateAppData } from '../storage/backup'
import { account, baseData, ctx, NOW } from '../test/fixtures'

function ok<T>(r: { ok: true; data: AppData; value: T } | { ok: false; issues: unknown[] }) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

const coffee: FavoriteDraft = { id: 'f1', name: 'Café', kind: 'expense', accountId: 'main', categoryId: 'dining', amountMinor: 425 }

describe('favoritos', () => {
  it('guardar dos veces (doble pulsación) no duplica ni cambia nada', () => {
    const first = ok(saveFavorite(baseData(), coffee, ctx))
    expect(first.data.favorites).toHaveLength(1)
    expect(saveFavorite(first.data, coffee, ctx)).toMatchObject({ ok: true, unchanged: true })
    // Editar conserva posición y fecha de creación.
    const edited = ok(saveFavorite(first.data, { ...coffee, name: 'Café grande', amountMinor: undefined }, { ...ctx, now: '2026-09-28T20:00:00.000Z' }))
    expect(edited.value).toMatchObject({ name: 'Café grande', order: 0, createdAt: NOW })
    expect(edited.value.amountMinor).toBeUndefined()
  })

  it('valida nombre, importe opcional positivo y referencias existentes al guardar', () => {
    const bad = saveFavorite(baseData(), { ...coffee, name: ' ', amountMinor: 0, accountId: 'nope', categoryId: 'salary' }, ctx)
    expect(bad.ok ? [] : bad.issues.map((i) => i.code).sort()).toEqual(['amountNotPositive', 'favoriteAccountMissing', 'favoriteCategoryMissing', 'required'])
  })

  it('ordenar, eliminar y deshacer conservan un orden consecutivo', () => {
    let d = ok(saveFavorite(baseData(), coffee, ctx)).data
    d = ok(saveFavorite(d, { ...coffee, id: 'f2', name: 'Bus', categoryId: 'transport' }, ctx)).data
    d = ok(saveFavorite(d, { ...coffee, id: 'f3', name: 'Súper', categoryId: 'groceries' }, ctx)).data
    d = ok(moveFavorite(d, 'f3', -1, ctx)).data
    expect(sortedFavorites(d).map((f) => f.id)).toEqual(['f1', 'f3', 'f2'])
    expect(moveFavorite(d, 'f1', -1, ctx)).toMatchObject({ unchanged: true })
    const del = ok(deleteFavorite(d, 'f3', ctx))
    expect(del.data.favorites.map((f) => [f.id, f.order])).toEqual([['f1', 0], ['f2', 1]])
    const back = ok(restoreFavorite(del.data, del.value, ctx))
    expect(sortedFavorites(back.data).map((f) => f.id)).toEqual(['f1', 'f3', 'f2'])
  })

  it('si la cuenta se elimina o la categoría se archiva, el favorito pide elegir otra', () => {
    const extra = account({ id: 'cash', name: 'Efectivo', includeInBudget: false })
    const pets: CustomCategory = { id: 'c_pets', name: 'Mascotas', kind: 'expense', archived: false, createdAt: NOW, updatedAt: NOW }
    let d = baseData({ accounts: [baseData().accounts[0]!, extra], categories: [pets] })
    d = ok(saveFavorite(d, { ...coffee, accountId: 'cash', categoryId: 'c_pets', note: undefined }, ctx)).data
    d = ok(deleteAccount(d, 'cash', ctx)).data
    d = ok(setCategoryArchived(d, 'c_pets', true, ctx)).data
    const fav = d.favorites[0]!
    const p = favoritePrefill(d, fav)
    expect(p).toMatchObject({ accountId: undefined, categoryId: undefined, missingAccount: true, missingCategory: true, note: 'Café', amountMinor: 425 })
    expect(sortedFavorites(d)[0]?.broken).toBe(true)
    // Una copia con favoritos de referencias rotas sigue siendo válida (no se pierden).
    expect(validateAppData(JSON.parse(JSON.stringify(d))).ok).toBe(true)
  })

  it('un favorito nunca crea movimientos', () => {
    const d = ok(saveFavorite(baseData(), coffee, ctx)).data
    expect(d.transactions).toEqual([])
  })
})
