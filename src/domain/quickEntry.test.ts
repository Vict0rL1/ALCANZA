import { describe, expect, it } from 'vitest'
import { lastUsedAccount, recentCategories } from './quickEntry'
import { account, baseData, EARLIER, tx } from '../test/fixtures'

const at = (n: number) => `2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`

describe('registro rápido', () => {
  it('categorías recientes: distintas, más recientes primero, con divisiones y sin archivadas', () => {
    const data = baseData({
      categories: [{ id: 'c_old', name: 'Vieja', kind: 'expense', archived: true, createdAt: EARLIER, updatedAt: EARLIER }],
      transactions: [
        tx({ categoryId: 'groceries', createdAt: at(1) }),
        tx({ categoryId: 'dining', createdAt: at(3) }),
        tx({ categoryId: 'c_old', createdAt: at(4) }),
        tx({ categoryId: 'groceries', createdAt: at(5), splits: [{ id: 's1', categoryId: 'groceries', amountMinor: 500 }, { id: 's2', categoryId: 'health', amountMinor: 500 }] }),
        tx({ kind: 'income', categoryId: 'salary', createdAt: at(6) }),
      ],
    })
    expect(recentCategories(data, 'expense')).toEqual(['groceries', 'health', 'dining'])
    expect(recentCategories(data, 'income')).toEqual(['salary'])
    expect(recentCategories(data, 'expense', 1)).toEqual(['groceries'])
  })

  it('última cuenta usada para el tipo, solo si sigue existiendo', () => {
    const data = baseData({
      accounts: [account({ id: 'main' }), account({ id: 'card', kind: 'credit' })],
      transactions: [tx({ accountId: 'main', createdAt: at(1) }), tx({ accountId: 'card', createdAt: at(2) }), tx({ accountId: 'deleted', createdAt: at(3) })],
    })
    expect(lastUsedAccount(data, 'expense')).toBe('card')
    expect(lastUsedAccount(data, 'income')).toBeUndefined()
  })
})
