import { describe, expect, it } from 'vitest'
import { deleteTag, restoreTag, saveTag, tagUsage } from './tagOps'
import { validateAppData } from '../storage/backup'
import { baseData, ctx, NOW, tx } from '../test/fixtures'

describe('etiquetas', () => {
  it('crear, editar (idempotente por id), nombre único y color válido', () => {
    const r = saveTag(baseData(), { id: 'tg1', name: 'Viaje', color: 'sky' }, ctx)
    expect(r.ok && r.data.tags).toEqual([{ id: 'tg1', name: 'Viaje', color: 'sky', createdAt: NOW, updatedAt: NOW }])
    if (!r.ok) return
    const edit = saveTag(r.data, { id: 'tg1', name: 'Viaje 2026', color: 'teal' }, ctx)
    expect(edit.ok && edit.data.tags).toHaveLength(1)
    expect(edit.ok && edit.data.tags[0]).toMatchObject({ name: 'Viaje 2026', color: 'teal' })
    expect(saveTag(r.data, { id: 'tg2', name: 'viaje', color: 'sky' }, ctx)).toMatchObject({ ok: false, issues: [{ code: 'duplicateName' }] })
    expect(saveTag(r.data, { id: 'tg2', name: '', color: 'sky' }, ctx).ok).toBe(false)
    expect(validateAppData(r.data).ok).toBe(true)
  })

  it('uso, borrar quita la etiqueta de movimientos, favoritos y papelera sin tocar importes; restaurar devuelve solo la etiqueta', () => {
    const tag = { id: 'tg1', name: 'Viaje', color: 'sky' as const, createdAt: NOW, updatedAt: NOW }
    const d = baseData({
      tags: [tag],
      transactions: [tx({ id: 'a', tagIds: ['tg1', 'tg9'] }), tx({ id: 'b', tagIds: ['tg1'] }), tx({ id: 'c' })],
      favorites: [{ id: 'f1', name: 'Café', kind: 'expense', accountId: 'main', categoryId: 'dining', order: 0, tagIds: ['tg1'], createdAt: NOW, updatedAt: NOW }],
      trash: [{ id: 'z', deletedAt: NOW, unlinkedRefundIds: [], transaction: tx({ id: 'z', tagIds: ['tg1'] }) }],
    })
    expect(tagUsage(d, 'tg1')).toEqual({ transactions: 2, favorites: 1 })
    const r = deleteTag(d, 'tg1', ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.tags).toEqual([])
    expect(r.data.transactions.map((t) => [t.id, t.tagIds, t.amountMinor])).toEqual([['a', ['tg9'], 1000], ['b', undefined, 1000], ['c', undefined, 1000]])
    expect('tagIds' in r.data.transactions[1]!).toBe(false)
    expect(r.data.favorites[0]!.tagIds).toBeUndefined()
    expect(r.data.trash[0]!.transaction.tagIds).toBeUndefined()
    expect(tagUsage(r.data, 'tg1')).toEqual({ transactions: 0, favorites: 0 })
    const back = restoreTag(r.data, tag, ctx)
    expect(back.ok && back.data.tags).toEqual([tag])
    expect(back.ok && tagUsage(back.data, 'tg1').transactions).toBe(0)
    expect(deleteTag(baseData(), 'nope', ctx).ok).toBe(false)
  })
})
