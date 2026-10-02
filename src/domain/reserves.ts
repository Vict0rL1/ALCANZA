/**
 * Reservas efectivas: cuánto dinero apartado se descuenta del disponible SIN contar
 * dos veces la misma cantidad (ver docs/FORMULAS.md §7, §18 y §19).
 *
 *  1. Meta vinculada a un presupuesto por periodo: lo ya gastado en ese periodo
 *     (con efecto sobre las cuentas del presupuesto) consume la reserva.
 *        reserva efectiva = max(0, apartado − gastado del periodo)
 *  2. Gasto planificado vinculado a una ocurrencia del calendario: la reserva del
 *     pago previsto se reduce en lo que ya está apartado para él.
 *        reserva del pago = importe − min(apartado efectivo, importe)
 *
 * Así, apartado + pago previsto nunca suman más que el pago.
 */
import { txEffectOnBudgetPool } from './balances'
import { goalSavedMinor } from './goals'
import { sumMinor } from './money'
import type { PlanItem } from './planItems'
import type { AppData, Goal, PeriodBudget, Transaction } from './types'

/** Movimientos vivos (no en la papelera) de un presupuesto por periodo, sin duplicados. */
export function periodTransactions(data: Pick<AppData, 'transactions'>, budget: PeriodBudget): Transaction[] {
  const ids = new Set(budget.txIds)
  const linked = data.transactions.filter((t) => ids.has(t.id) && (t.kind === 'expense' || t.kind === 'refund'))
  // Devoluciones de un gasto del periodo cuentan aunque no se hayan asociado a mano.
  const expenseIds = new Set(linked.filter((t) => t.kind === 'expense').map((t) => t.id))
  const implicitRefunds = data.transactions.filter((t) => t.kind === 'refund' && !ids.has(t.id) && t.refundOfId !== undefined && expenseIds.has(t.refundOfId))
  return [...linked, ...implicitRefunds]
}

/** Gasto neto REALIZADO que salió de las cuentas del presupuesto (consume la reserva del periodo). */
export function periodSpentFromBudgetPool(data: Pick<AppData, 'transactions' | 'accounts'>, budget: PeriodBudget): number {
  const net = sumMinor(
    periodTransactions(data, budget)
      .filter((t) => t.status === 'realized')
      .map((t) => -txEffectOnBudgetPool(t, data.accounts)),
  )
  return Math.max(0, net)
}

export interface GoalReserveLine {
  goal: Goal
  /** Apartado total de la meta. */
  savedMinor: number
  /** Parte ya consumida por gastos del periodo vinculado. */
  consumedMinor: number
  /** Lo que realmente se descuenta del disponible. */
  amountMinor: number
}

/** Reservas de las metas del presupuesto, ya descontado lo consumido por su periodo. */
export function goalReserveLines(data: Pick<AppData, 'goals' | 'periodBudgets' | 'transactions' | 'accounts'>): GoalReserveLine[] {
  return data.goals
    .filter((g) => g.fundedFrom === 'budget')
    .map((goal) => {
      const savedMinor = Math.max(0, goalSavedMinor(goal))
      const period = data.periodBudgets.find((b) => b.goalId === goal.id)
      const consumedMinor = period ? Math.min(savedMinor, periodSpentFromBudgetPool(data, period)) : 0
      return { goal, savedMinor, consumedMinor, amountMinor: savedMinor - consumedMinor }
    })
    .filter((l) => l.amountMinor > 0 || l.consumedMinor > 0)
}

export function goalsReservedTotal(data: Pick<AppData, 'goals' | 'periodBudgets' | 'transactions' | 'accounts'>): number {
  return sumMinor(goalReserveLines(data).map((l) => l.amountMinor))
}

/**
 * Parte de cada pago previsto ya cubierta por un gasto planificado vinculado
 * (clave = `PlanItem.key`). Solo metas del presupuesto que aún no se pagaron.
 */
export function scheduleCoverage(lines: GoalReserveLine[], items: PlanItem[]): Map<string, number> {
  const coverage = new Map<string, number>()
  for (const line of lines) {
    const link = line.goal.kind === 'expense' && !line.goal.plan?.paidAt ? line.goal.plan?.link : undefined
    if (!link || line.amountMinor <= 0) continue
    const key = `schedule:${link.scheduleId}:${link.occurrenceDate}`
    const item = items.find((i) => i.key === key && i.budgetEffectMinor < 0)
    if (!item) continue
    const already = coverage.get(key) ?? 0
    const room = -item.budgetEffectMinor - already
    if (room > 0) coverage.set(key, already + Math.min(room, line.amountMinor))
  }
  return coverage
}
