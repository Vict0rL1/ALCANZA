/**
 * Saldos por cuenta a partir del saldo de referencia (anchor) y los movimientos realizados.
 *
 * Regla anti doble conteo:
 *   Un movimiento REALIZADO cambia el saldo de una cuenta solo si ocurrió después
 *   del saldo de referencia:
 *     - su fecha es posterior a la fecha del saldo, o
 *     - es del mismo día y se marcó como realizado después de registrar el saldo.
 *   Todo lo anterior se considera ya incluido en el saldo que escribió la persona.
 *   Los movimientos PREVISTOS nunca cambian el saldo.
 */
import { sumMinor } from './money'
import type { Account, AppData, Transaction } from './types'

export function txAppliesToAccount(tx: Transaction, account: Account): boolean {
  if (tx.status !== 'realized') return false
  const { date, setAt } = account.anchor
  if (tx.date > date) return true
  if (tx.date < date) return false
  const realizedAt = tx.realizedAt ?? tx.createdAt
  return realizedAt > setAt
}

/** Efecto con signo de un movimiento sobre una cuenta (sin mirar el saldo de referencia). */
export function txEffectOnAccount(tx: Transaction, accountId: string): number {
  switch (tx.kind) {
    case 'income':
    case 'refund':
      return tx.accountId === accountId ? tx.amountMinor : 0
    case 'expense':
      return tx.accountId === accountId ? -tx.amountMinor : 0
    case 'transfer': {
      let effect = 0
      if (tx.accountId === accountId) effect -= tx.amountMinor
      if (tx.toAccountId === accountId) effect += tx.amountMinor
      return effect
    }
    case 'adjustment':
      return tx.accountId === accountId ? adjustmentSign(tx) * tx.amountMinor : 0
  }
}

/** +1 si el ajuste sube el saldo, −1 si lo baja. */
export function adjustmentSign(tx: Pick<Transaction, 'adjustmentDirection'>): 1 | -1 {
  return tx.adjustmentDirection === 'decrease' ? -1 : 1
}

export interface AccountBalance {
  account: Account
  anchorMinor: number
  /** Movimientos realizados que se aplicaron sobre el saldo de referencia. */
  applied: Transaction[]
  appliedTotalMinor: number
  balanceMinor: number
}

export function accountBalance(data: Pick<AppData, 'transactions'>, account: Account): AccountBalance {
  const applied = data.transactions.filter(
    (tx) => (tx.accountId === account.id || tx.toAccountId === account.id) && txAppliesToAccount(tx, account),
  )
  const appliedTotalMinor = sumMinor(applied.map((tx) => txEffectOnAccount(tx, account.id)))
  return {
    account,
    anchorMinor: account.anchor.amountMinor,
    applied,
    appliedTotalMinor,
    balanceMinor: sumMinor([account.anchor.amountMinor, appliedTotalMinor]),
  }
}

export function allAccountBalances(data: Pick<AppData, 'transactions' | 'accounts'>): AccountBalance[] {
  return data.accounts.map((a) => accountBalance(data, a))
}

/** Saldo total de las cuentas incluidas en el presupuesto. */
export function spendableBalance(data: Pick<AppData, 'transactions' | 'accounts'>): {
  totalMinor: number
  accounts: AccountBalance[]
} {
  const accounts = allAccountBalances(data).filter((b) => b.account.includeInBudget)
  return { totalMinor: sumMinor(accounts.map((b) => b.balanceMinor)), accounts }
}

/**
 * Efecto de un movimiento sobre el conjunto de cuentas del presupuesto:
 * una transferencia entre dos cuentas del presupuesto no cambia nada;
 * hacia una cuenta fuera del presupuesto (p. ej. ahorro) lo reduce.
 */
export function txEffectOnBudgetPool(
  tx: Pick<Transaction, 'kind' | 'amountMinor' | 'accountId' | 'toAccountId' | 'adjustmentDirection'>,
  accounts: Account[],
): number {
  const included = (id: string | undefined) => !!id && accounts.some((a) => a.id === id && a.includeInBudget)
  switch (tx.kind) {
    case 'income':
    case 'refund':
      return included(tx.accountId) ? tx.amountMinor : 0
    case 'expense':
      return included(tx.accountId) ? -tx.amountMinor : 0
    case 'transfer': {
      const from = included(tx.accountId)
      const to = included(tx.toAccountId)
      if (from === to) return 0
      return from ? -tx.amountMinor : tx.amountMinor
    }
    case 'adjustment':
      return included(tx.accountId) ? adjustmentSign(tx) * tx.amountMinor : 0
  }
}

/** Fecha y hora del saldo de referencia más antiguo entre las cuentas del presupuesto. */
export function oldestAnchor(data: Pick<AppData, 'accounts'>): Account['anchor'] | null {
  const included = data.accounts.filter((a) => a.includeInBudget)
  if (included.length === 0) return null
  return included.reduce((old, a) => (a.anchor.setAt < old.setAt ? a.anchor : old), included[0]!.anchor)
}
