import { describe, expect, it } from 'vitest'
import { matchesTxFilter, sourceGroupOf } from './txFilters'
import { tx } from '../test/fixtures'

describe('filtros de movimientos (D4)', () => {
  it('origen: manual por defecto; importado, programado, favorito y asistente por sus marcas', () => {
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01' }))).toBe('manual')
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01', source: 'shortcut' }))).toBe('manual')
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01', importRef: 'x' }))).toBe('import')
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01', scheduleId: 's', occurrenceDate: '2026-09-01' }))).toBe('scheduled')
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01', favoriteId: 'f' }))).toBe('common')
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01', source: 'voice' }))).toBe('assistant')
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01', source: 'ai_text' }))).toBe('assistant')
    expect(sourceGroupOf(tx({ amountMinor: 100, date: '2026-09-01', source: 'photo' }))).toBe('assistant')
  })

  it('varias categorías (cualquiera), etiquetas (cualquiera) e importe inclusivo', () => {
    const a = tx({ id: 'a', amountMinor: 1475, date: '2026-09-04', categoryId: 'dining', tagIds: ['t1'] })
    const b = tx({ id: 'b', amountMinor: 335, date: '2026-09-05', categoryId: 'transport' })
    const c = tx({ id: 'c', amountMinor: 5000, date: '2026-09-06', categoryId: 'groceries', splits: [{ id: 'l1', categoryId: 'groceries', amountMinor: 4000 }, { id: 'l2', categoryId: 'dining', amountMinor: 1000 }] })
    const cats = { categoryIds: ['dining', 'transport'] }
    expect([a, b, c].filter((t) => matchesTxFilter(t, cats)).map((t) => t.id)).toEqual(['a', 'b', 'c'])
    expect([a, b, c].filter((t) => matchesTxFilter(t, { ...cats, minMinor: 1000, maxMinor: 5000 })).map((t) => t.id)).toEqual(['a', 'c'])
    expect([a, b, c].filter((t) => matchesTxFilter(t, { minMinor: 335, maxMinor: 335 })).map((t) => t.id)).toEqual(['b'])
    expect([a, b, c].filter((t) => matchesTxFilter(t, { tagIds: ['t1', 't9'] })).map((t) => t.id)).toEqual(['a'])
    expect([a, b, c].filter((t) => matchesTxFilter(t, { source: 'manual' })).length).toBe(3)
    expect([a, b, c].filter((t) => matchesTxFilter(t, { source: 'import' })).length).toBe(0)
    expect(matchesTxFilter(a, {})).toBe(true)
  })
})
