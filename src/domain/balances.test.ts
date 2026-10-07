import { describe, expect, it } from 'vitest'
import { accountBalance, allAccountBalances, spendableBalance } from './balances'
import { sumMinor } from './money'
import type { AppData } from './types'
import { account, baseData, EARLIER, NOW, TODAY, tx } from '../test/fixtures'
import { createSyntheticData } from '../test/synthetic'

/** Método anterior (una pasada por cuenta): la referencia contra la que se compara. */
function reference(data: AppData) {
  const all = data.accounts.map((a) => accountBalance(data, a))
  const budget = all.filter((b) => b.account.includeInBudget)
  return { all, spendable: { totalMinor: sumMinor(budget.map((b) => b.balanceMinor)), accounts: budget } }
}

describe('saldos en una sola pasada', () => {
  it('coinciden con el cálculo por cuenta en casos límite', () => {
    const savings = account({ id: 'save', includeInBudget: false, anchor: { amountMinor: 50000, date: TODAY, setAt: EARLIER } })
    const card = account({ id: 'card', kind: 'credit', anchor: { amountMinor: -20000, date: '2026-09-20', setAt: '2026-09-20T12:00:00.000Z' } })
    const d = baseData({
      accounts: [baseData().accounts[0]!, savings, card],
      transactions: [
        tx({ id: 'before-anchor', date: '2026-09-27', amountMinor: 999 }),
        tx({ id: 'same-day-earlier', date: TODAY, realizedAt: '2026-09-28T12:00:00.000Z', amountMinor: 111 }),
        tx({ id: 'same-day-later', date: TODAY, realizedAt: NOW, amountMinor: 222 }),
        tx({ id: 'planned', date: '2026-09-29', status: 'planned', amountMinor: 333 }),
        tx({ id: 'to-savings', kind: 'transfer', accountId: 'main', toAccountId: 'save', date: '2026-09-29', amountMinor: 1000 }),
        tx({ id: 'self', kind: 'transfer', accountId: 'main', toAccountId: 'main', date: '2026-09-29', amountMinor: 500 }),
        tx({ id: 'card-buy', accountId: 'card', date: '2026-09-25', amountMinor: 4000 }),
        tx({ id: 'card-pay', kind: 'transfer', accountId: 'main', toAccountId: 'card', date: '2026-09-29', amountMinor: 3000 }),
        tx({ id: 'adj', kind: 'adjustment', adjustmentDirection: 'decrease', accountId: 'save', date: '2026-09-29', amountMinor: 70 }),
        tx({ id: 'ghost', accountId: 'deleted-account', date: '2026-09-29', amountMinor: 5 }),
      ],
    })
    const ref = reference(d)
    expect(allAccountBalances(d)).toEqual(ref.all)
    expect(spendableBalance(d)).toEqual(ref.spendable)
    // A mano, cuenta principal: 1000.00 − 2.22 (gasto del mismo día, posterior al saldo) − 10.00 − 30.00.
    // Lo anterior al saldo, lo previsto y la autotransferencia no cambian nada.
    expect(ref.all[0]!.balanceMinor).toBe(100000 - 222 - 1000 - 3000)
  })

  it('coinciden con el cálculo por cuenta en datos sintéticos grandes', () => {
    const d = createSyntheticData({ movements: 5000, today: '2026-10-01' })
    const ref = reference(d)
    expect(allAccountBalances(d)).toEqual(ref.all)
    expect(spendableBalance(d)).toEqual(ref.spendable)
  })

  it('con ids de cuenta repetidos (datos inválidos) se comporta como antes', () => {
    const a = account({ id: 'dup' })
    const b = account({ id: 'dup', anchor: { amountMinor: 1, date: TODAY, setAt: EARLIER } })
    const d = baseData({ accounts: [a, b], transactions: [tx({ accountId: 'dup', date: '2026-09-29', amountMinor: 10 })] })
    expect(allAccountBalances(d)).toEqual(reference(d).all)
  })
})
