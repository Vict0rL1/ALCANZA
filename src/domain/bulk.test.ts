import { describe, expect, it } from 'vitest'
import { recategorizeTransactions, setCategoriesEach, setTagsEach, tagTransactions } from './bulk'
import { baseData, TODAY, tx } from '../test/fixtures'

const ctx = { today: TODAY, now: '2026-09-28T15:00:00.000Z' }
const data = () =>
  baseData({
    tags: [{ id: 'tag-viaje', name: 'Viaje', color: 'teal', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
    transactions: [
      tx({ id: 'a', amountMinor: 1000, date: '2026-09-10', categoryId: 'groceries' }),
      tx({ id: 'b', amountMinor: 2000, date: '2026-09-11', categoryId: 'dining' }),
      tx({ id: 'c', kind: 'transfer', toAccountId: 'main', amountMinor: 500, date: '2026-09-12' }),
      tx({ id: 'd', amountMinor: 3000, date: '2026-09-13', categoryId: 'groceries', splits: [{ id: 'l1', categoryId: 'groceries', amountMinor: 1000 }, { id: 'l2', categoryId: 'dining', amountMinor: 2000 }] }),
    ],
  })

describe('acciones en lote (D4)', () => {
  it('cambiar categoría: todos los simples cambian; transferencias y divididas se saltan', () => {
    const r = recategorizeTransactions(data(), ['a', 'b', 'c', 'd'], 'transport', ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toEqual({ changed: 2, skipped: 2 })
    expect(r.data.transactions.find((x) => x.id === 'a')!.categoryId).toBe('transport')
    expect(r.data.transactions.find((x) => x.id === 'b')!.categoryId).toBe('transport')
    expect(r.data.transactions.find((x) => x.id === 'd')!.categoryId).toBe('groceries')
  })

  it('todo o nada: un id inexistente no cambia nada', () => {
    const before = data()
    const r = recategorizeTransactions(before, ['a', 'zzz'], 'transport', ctx)
    expect(r.ok).toBe(false)
    expect(before.transactions.find((x) => x.id === 'a')!.categoryId).toBe('groceries')
  })

  it('etiquetar añade sin quitar y no duplica; etiquetas desconocidas se ignoran', () => {
    const r = tagTransactions(data(), ['a', 'b'], ['tag-viaje', 'nope'], ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.changed).toBe(2)
    expect(r.data.transactions.find((x) => x.id === 'a')!.tagIds).toEqual(['tag-viaje'])
    const again = tagTransactions(r.data, ['a'], ['tag-viaje'], ctx)
    expect(again.ok && again.unchanged).toBe(true)
  })

  it('deshacer: restaurar categorías y etiquetas exactas por id devuelve el estado anterior', () => {
    const before = data()
    const r = recategorizeTransactions(before, ['a', 'b'], 'transport', ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const undo = setCategoriesEach(r.data, [{ id: 'a', categoryId: 'groceries' }, { id: 'b', categoryId: 'dining' }], ctx)
    expect(undo.ok).toBe(true)
    if (!undo.ok) return
    expect(undo.value.changed).toBe(2)
    expect(undo.data.transactions.find((x) => x.id === 'a')!.categoryId).toBe('groceries')
    expect(undo.data.transactions.find((x) => x.id === 'b')!.categoryId).toBe('dining')
    const tagged = tagTransactions(undo.data, ['a'], ['tag-viaje'], ctx)
    expect(tagged.ok).toBe(true)
    if (!tagged.ok) return
    const untag = setTagsEach(tagged.data, [{ id: 'a', tagIds: [] }], ctx)
    expect(untag.ok).toBe(true)
    if (!untag.ok) return
    expect(untag.data.transactions.find((x) => x.id === 'a')!.tagIds ?? []).toEqual([])
    const bad = setCategoriesEach(undo.data, [{ id: 'zzz', categoryId: 'dining' }], ctx)
    expect(bad.ok).toBe(false)
  })
})
