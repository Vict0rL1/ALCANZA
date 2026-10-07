import { describe, expect, it } from 'vitest'
import { changeCurrency } from './operations'
import { validateAppData } from '../storage/backup'
import { baseData, ctx, goal, tx } from '../test/fixtures'

describe('cambiar la moneda del presupuesto', () => {
  it('sin registros con importe cambia la moneda; con registros se rechaza sin tocar nada', () => {
    const r = changeCurrency(baseData(), 'MXN', ctx)
    expect(r.ok && r.data.settings.currency).toBe('MXN')
    expect(r.ok && validateAppData(r.data).ok).toBe(true)
    expect(changeCurrency(baseData(), 'CAD', ctx)).toMatchObject({ ok: true, unchanged: true })
    expect(changeCurrency(baseData(), 'XXX' as never, ctx).ok).toBe(false)
    const withTx = baseData({ transactions: [tx({ id: 't' })] })
    expect(changeCurrency(withTx, 'MXN', ctx)).toMatchObject({ ok: false, issues: [{ path: 'currency', code: 'currencyMismatch', params: { expected: 'CAD' } }] })
    expect(changeCurrency(baseData({ goals: [goal()] }), 'MXN', ctx).ok).toBe(false)
    expect(changeCurrency(baseData({ favorites: [{ id: 'f', name: 'Café', kind: 'expense', accountId: 'main', categoryId: 'dining', amountMinor: 100, order: 0, createdAt: ctx.now, updatedAt: ctx.now }] }), 'MXN', ctx).ok).toBe(false)
  })
})
