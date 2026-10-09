import { beforeAll, describe, expect, it } from 'vitest'
import { createTranslator, loadLanguage, type MessageKey } from '../i18n'
import { deleteTransaction } from './operations'
import { buildSearchIndex, search } from './search'
import type { AppData, Language } from './types'
import { baseData, ctx, EARLIER, goal, schedule, tx } from '../test/fixtures'

function namer(language: Language, data: AppData) {
  const extra = Object.fromEntries(data.categories.map((c) => [`category.${c.id}`, c.name]))
  const { t } = createTranslator(language, extra)
  return (id: string) => t(`category.${id}` as MessageKey)
}

const data = baseData({
  transactions: [
    tx({ id: 'cafe', note: 'Café Olé', categoryId: 'dining', date: '2026-09-20' }),
    tx({ id: 'super', note: 'Walmart', categoryId: 'groceries', date: '2026-09-25' }),
    tx({ id: 'libro', note: undefined, categoryId: 'c_libros', date: '2026-09-26' }),
    tx({ id: 'beca', kind: 'income', note: 'Depósito', categoryId: 'scholarship', date: '2026-09-01' }),
  ],
  categories: [{ id: 'c_libros', name: 'Libros de Ingeniería', kind: 'expense', archived: false, createdAt: EARLIER, updatedAt: EARLIER }],
  goals: [goal({ id: 'g', name: 'Matrícula de invierno' })],
  schedules: [schedule({ id: 's', name: 'Teléfono', categoryId: 'phone_internet' })],
  favorites: [{ id: 'f', name: 'Cafe de la mañana', kind: 'expense', accountId: 'main', categoryId: 'dining', amountMinor: 425, order: 0, createdAt: EARLIER, updatedAt: EARLIER }],
  periodBudgets: [{ id: 'p', name: 'Viaje a México', template: 'trip', startDate: '2026-12-01', endDate: '2026-12-10', allocatedMinor: 50000, currency: 'CAD', txIds: [], archived: false, createdAt: EARLIER, updatedAt: EARLIER }],
})

const ids = (groups: ReturnType<typeof search>) => groups.flatMap((g) => g.items.map((i) => `${g.kind}:${i.id}`))

describe('búsqueda global', () => {
  beforeAll(() => loadLanguage('en'))
  const es = buildSearchIndex(data, namer('es', data))

  it('ignora mayúsculas y acentos, en ambos sentidos', () => {
    expect(ids(search(es, 'CAFE'))).toEqual(['transaction:cafe', 'category:dining', 'favorite:f'])
    expect(ids(search(es, 'café'))).toEqual(ids(search(es, 'cafe')))
    expect(ids(search(es, 'mexico'))).toEqual(['periodBudget:p'])
    expect(ids(search(es, 'matricula'))).toEqual(['goal:g'])
  })

  it('todas las palabras deben aparecer, en cualquier orden', () => {
    expect(ids(search(es, 'olé café'))).toEqual(['transaction:cafe'])
    expect(search(es, 'café walmart')).toEqual([])
  })

  it('categorías fijas en el idioma activo; personalizadas tal como se escribieron', () => {
    expect(ids(search(es, 'supermercado'))).toEqual(['transaction:super', 'category:groceries'])
    const en = buildSearchIndex(data, namer('en', data))
    expect(ids(search(en, 'groceries'))).toEqual(['transaction:super', 'category:groceries'])
    expect(search(en, 'supermercado')).toEqual([])
    // La personalizada se encuentra igual en los dos idiomas, y el movimiento sin nota por su categoría.
    expect(ids(search(en, 'ingenieria'))).toEqual(['transaction:libro', 'category:c_libros'])
    expect(ids(search(es, 'beca'))).toEqual(expect.arrayContaining(['transaction:beca', 'category:scholarship']))
  })

  it('agrupa por tipo y ordena movimientos del más reciente al más antiguo', () => {
    const groups = search(es, 'principal') // nombre de la cuenta: coincide con sus movimientos
    expect(groups.map((g) => g.kind)).toEqual(['transaction', 'account'])
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['libro', 'super', 'cafe', 'beca'])
  })

  it('la papelera queda fuera salvo que se incluya', () => {
    const trashed = deleteTransaction(data, 'super', ctx)
    if (!trashed.ok) throw new Error('delete')
    const index = buildSearchIndex(trashed.data, namer('es', trashed.data))
    expect(ids(search(index, 'walmart'))).toEqual([])
    expect(ids(search(index, 'walmart', { includeTrash: true }))).toEqual(['trash:super'])
  })

  it('consultas vacías o de una letra no devuelven nada', () => {
    expect(search(es, '')).toEqual([])
    expect(search(es, '  a ')).toEqual([])
  })

  it('rendimiento: 10 000 movimientos, índice y búsqueda rápidos', () => {
    const notes = ['Supermercado Metro', 'Café', 'Tim Hortons', 'Renta', 'Pasaje de autobús', 'Farmacia Jean Coutu', 'Librería', 'Amazon']
    const big: AppData = {
      ...data,
      transactions: Array.from({ length: 10_000 }, (_, i) =>
        tx({ id: `t${i}`, note: `${notes[i % notes.length]} ${i}`, date: `2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, categoryId: i % 2 ? 'groceries' : 'dining' }),
      ),
    }
    const t0 = performance.now()
    const index = buildSearchIndex(big, namer('es', big))
    const t1 = performance.now()
    const groups = search(index, 'autobus')
    const t2 = performance.now()
    expect(groups[0]!.total).toBe(1250)
    expect(groups[0]!.items).toHaveLength(50)
    // Márgenes amplios para máquinas lentas (medido: índice ~20 ms, búsqueda ~4–10 ms; ver FORMULAS §22).
    expect(t1 - t0).toBeLessThan(1000)
    expect(t2 - t1).toBeLessThan(200)
  })
})

describe('búsqueda global por importe', () => {
  const withAmounts = baseData({
    transactions: [
      tx({ id: 'cafe', note: 'Café', amountMinor: 425, categoryId: 'dining' }),
      tx({ id: 'renta', note: 'Renta', amountMinor: 65000, categoryId: 'housing' }),
      tx({ id: 'otro', note: 'Libro', amountMinor: 1425, categoryId: 'education' }),
    ],
  })
  const index = buildSearchIndex(withAmounts, namer('es', withAmounts))

  it('encuentra el importe exacto con punto, coma o símbolo, sin coincidencias parciales', () => {
    expect(ids(search(index, '4.25'))).toEqual(['transaction:cafe'])
    expect(ids(search(index, '4,25'))).toEqual(['transaction:cafe'])
    expect(ids(search(index, '$4.25'))).toEqual(['transaction:cafe'])
    expect(ids(search(index, '650'))).toEqual(['transaction:renta'])
    expect(search(index, '4.2')).toEqual([]) // 4.20, no 4.25
    expect(ids(search(index, '14.25'))).toEqual(['transaction:otro'])
  })

  it('se combina con palabras', () => {
    expect(ids(search(index, 'cafe 4.25'))).toEqual(['transaction:cafe'])
    expect(search(index, 'renta 4.25')).toEqual([])
  })
})
