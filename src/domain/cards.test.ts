import { describe, expect, it } from 'vitest'
import { cardPaymentReminders, cardSummary, minimumPayment, monthlyInterest, nextMonthlyDay } from './cards'
import { categoriesForKind } from './categories'
import { deleteCategory, saveAccount, saveCategory, saveTransaction, setCategoryArchived, type OpResult } from './operations'
import { account, baseData, ctx, EARLIER, TODAY, tx } from '../test/fixtures'

function must<T>(r: OpResult<T>) {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r
}

const card = (amountMinor: number, card = {}) =>
  account({ id: 'card', name: 'Visa', kind: 'credit', anchor: { amountMinor, date: TODAY, setAt: EARLIER }, card })

describe('tarjetas: resumen y estimaciones', () => {
  it('deuda, límite, crédito disponible y utilización', () => {
    const s = cardSummary(baseData(), card(-30000, { limitMinor: 100000 }), TODAY)
    expect(s.debtMinor).toBe(30000)
    expect(s.availableCreditMinor).toBe(70000)
    expect(s.utilization).toBeCloseTo(0.3)
    expect(s.overLimit).toBe(false)
  })

  it('sobre el límite y saldo a favor', () => {
    expect(cardSummary(baseData(), card(-120000, { limitMinor: 100000 }), TODAY)).toMatchObject({ overLimit: true, availableCreditMinor: -20000 })
    expect(cardSummary(baseData(), card(2500), TODAY)).toMatchObject({ debtMinor: 0, creditBalanceMinor: 2500, minPaymentMinor: 0 })
  })

  it('pago mínimo: 3 % con piso de 10,00, nunca mayor que la deuda', () => {
    expect(minimumPayment(100000, {})).toBe(3000)
    expect(minimumPayment(20000, {})).toBe(1000)
    expect(minimumPayment(500, {})).toBe(500)
    expect(minimumPayment(0, {})).toBe(0)
    expect(minimumPayment(33333, { card: { minPaymentBps: 500, minPaymentFloorMinor: 0 } })).toBe(1667) // ceil(1666.65)
  })

  it('interés mensual estimado redondeado hacia arriba', () => {
    expect(monthlyInterest(100000, 1999)).toBe(1666) // 1000 × 19.99 % / 12 = 16.658…
    expect(monthlyInterest(100000, undefined)).toBeNull()
    expect(monthlyInterest(0, 1999)).toBe(0)
  })

  it('fechas de corte y pago con fin de mes', () => {
    expect(nextMonthlyDay('2026-09-28', 30)).toBe('2026-09-30')
    expect(nextMonthlyDay('2026-09-28', 15)).toBe('2026-10-15')
    expect(nextMonthlyDay('2027-02-10', 31)).toBe('2027-02-28')
    expect(nextMonthlyDay('2026-12-31', 5)).toBe('2027-01-05')
    expect(nextMonthlyDay('2026-09-28', 28)).toBe('2026-09-28')
  })

  it('recordatorio solo si hay deuda y el pago vence pronto', () => {
    const due = baseData({ accounts: [account({ id: 'main' }), card(-5000, { dueDay: 3 })] })
    expect(cardPaymentReminders(due, TODAY)).toHaveLength(1) // 3-oct, en 5 días
    const paid = baseData({ accounts: [account({ id: 'main' }), card(0, { dueDay: 3 })] })
    expect(cardPaymentReminders(paid, TODAY)).toHaveLength(0)
    const later = baseData({ accounts: [account({ id: 'main' }), card(-5000, { dueDay: 20 })] })
    expect(cardPaymentReminders(later, TODAY)).toHaveLength(0)
  })

  it('valida los datos de la tarjeta y solo los guarda en tarjetas', () => {
    const data = baseData()
    const bad = saveAccount(data, { id: 'v', name: 'Visa', kind: 'credit', includeInBudget: true, card: { aprBps: 20000 } }, ctx)
    expect(bad.ok).toBe(false)
    const ok = must(saveAccount(data, { id: 'v', name: 'Visa', kind: 'credit', includeInBudget: true, card: { limitMinor: 50000, dueDay: 31, aprBps: undefined } }, ctx))
    expect(ok.value.card).toEqual({ limitMinor: 50000, dueDay: 31 })
    const bank = must(saveAccount(data, { id: 'b', name: 'Banco', kind: 'bank', includeInBudget: true, card: { limitMinor: 1 } }, ctx))
    expect(bank.value.card).toBeUndefined()
  })
})

describe('categorías personalizadas', () => {
  it('se crean, aparecen en su tipo y validan movimientos', () => {
    const r = must(saveCategory(baseData(), { id: 'c_mascotas', name: 'Mascotas', kind: 'expense' }, ctx))
    expect(categoriesForKind('expense', r.data.categories)).toContain('c_mascotas')
    expect(categoriesForKind('refund', r.data.categories)).toContain('c_mascotas')
    expect(categoriesForKind('income', r.data.categories)).not.toContain('c_mascotas')
    const t = must(saveTransaction(r.data, { id: 't', kind: 'expense', status: 'realized', amountMinor: 100, date: TODAY, accountId: 'main', categoryId: 'c_mascotas' }, ctx))
    expect(t.data.transactions).toHaveLength(1)
    const wrongKind = saveTransaction(r.data, { id: 'i', kind: 'income', status: 'realized', amountMinor: 100, date: TODAY, accountId: 'main', categoryId: 'c_mascotas' }, ctx)
    expect(wrongKind.ok).toBe(false)
  })

  it('no permite nombres duplicados del mismo tipo ni cambiar el tipo', () => {
    const r = must(saveCategory(baseData(), { id: 'c_1', name: 'Mascotas', kind: 'expense' }, ctx))
    const dup = saveCategory(r.data, { id: 'c_2', name: ' mascotas ', kind: 'expense' }, ctx)
    expect(dup.ok || dup.issues[0]?.code).toBe('duplicateName')
    must(saveCategory(r.data, { id: 'c_3', name: 'Mascotas', kind: 'income' }, ctx))
    const renamed = must(saveCategory(r.data, { id: 'c_1', name: 'Perro', kind: 'income' }, ctx))
    expect(renamed.value.kind).toBe('expense')
  })

  it('archivada: fuera de formularios pero los movimientos antiguos siguen siendo válidos', () => {
    let data = must(saveCategory(baseData(), { id: 'c_1', name: 'Gimnasio', kind: 'expense' }, ctx)).data
    data = { ...data, transactions: [tx({ id: 'old', categoryId: 'c_1' })] }
    data = must(setCategoryArchived(data, 'c_1', true, ctx)).data
    expect(categoriesForKind('expense', data.categories)).not.toContain('c_1')
    const edit = saveTransaction(data, { ...data.transactions[0]!, amountMinor: 200 }, ctx)
    expect(edit.ok).toBe(true)
    const del = deleteCategory(data, 'c_1', ctx)
    expect(del.ok || del.issues[0]?.code).toBe('categoryInUse')
  })
})
