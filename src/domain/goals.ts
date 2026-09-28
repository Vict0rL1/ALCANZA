/**
 * Metas y apartados virtuales.
 *
 * Un apartado NO mueve dinero en el banco: solo marca una parte del saldo como
 * comprometida. Para no reservar dos veces la misma cantidad:
 *  - Solo las metas con `fundedFrom = 'budget'` se descuentan del disponible.
 *  - No se puede apartar más que el "dinero libre" (disponible después de pagos
 *    y de otros apartados).
 *  - Si el dinero ya está en una cuenta fuera del presupuesto, la meta se marca
 *    como 'external' y solo registra el progreso.
 */
import { daysBetween, wholeMonthsBetween } from './dates'
import { ceilDiv, sumMinor } from './money'
import type { Goal, LocalDate } from './types'

export function goalSavedMinor(goal: Goal): number {
  return sumMinor(goal.allocations.map((a) => a.amountMinor))
}

export interface GoalProgress {
  savedMinor: number
  targetMinor: number
  remainingMinor: number
  /** Solo para mostrar (barra de progreso); no se usa en cálculos de dinero. */
  fraction: number
  complete: boolean
}

export function goalProgress(goal: Goal): GoalProgress {
  const savedMinor = goalSavedMinor(goal)
  const remainingMinor = Math.max(0, goal.targetMinor - savedMinor)
  const fraction = goal.targetMinor > 0 ? Math.min(1, Math.max(0, savedMinor / goal.targetMinor)) : 0
  return { savedMinor, targetMinor: goal.targetMinor, remainingMinor, fraction, complete: remainingMinor === 0 }
}

/** Total apartado que se descuenta del presupuesto. */
export function goalsReservedFromBudget(goals: Goal[]): number {
  return sumMinor(goals.filter((g) => g.fundedFrom === 'budget').map((g) => Math.max(0, goalSavedMinor(g))))
}

export type GoalPlanStatus = 'complete' | 'noDate' | 'dueTodayOrPast' | 'ok'

export interface GoalPlan {
  status: GoalPlanStatus
  remainingMinor: number
  daysLeft: number | null
  weeksLeft: number | null
  monthsLeft: number | null
  perWeekMinor: number | null
  perMonthMinor: number | null
  /** Cuántos ingresos programados hay antes de la fecha (incluida). */
  incomeCount: number
  perIncomeMinor: number | null
}

/**
 * Ahorro periódico necesario. Se redondea HACIA ARRIBA al centavo para que,
 * apartando esa cuota, se llegue a la meta a tiempo.
 *
 * - Semanas restantes = ceil(días restantes / 7), mínimo 1.
 * - Meses restantes = meses completos hasta la fecha, mínimo 1.
 * - Por ingreso = restante / número de ingresos programados hasta la fecha.
 */
export function goalPlan(goal: Goal, today: LocalDate, incomeDates: LocalDate[] = []): GoalPlan {
  const { remainingMinor, complete } = goalProgress(goal)
  const base: GoalPlan = {
    status: 'ok',
    remainingMinor,
    daysLeft: null,
    weeksLeft: null,
    monthsLeft: null,
    perWeekMinor: null,
    perMonthMinor: null,
    incomeCount: 0,
    perIncomeMinor: null,
  }
  if (complete) return { ...base, status: 'complete' }
  if (!goal.targetDate) return { ...base, status: 'noDate' }
  const daysLeft = daysBetween(today, goal.targetDate)
  if (daysLeft <= 0) return { ...base, status: 'dueTodayOrPast', daysLeft }
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7))
  const monthsLeft = Math.max(1, wholeMonthsBetween(today, goal.targetDate))
  const incomes = incomeDates.filter((d) => d > today && d <= goal.targetDate!)
  return {
    status: 'ok',
    remainingMinor,
    daysLeft,
    weeksLeft,
    monthsLeft,
    perWeekMinor: ceilDiv(remainingMinor, weeksLeft),
    perMonthMinor: ceilDiv(remainingMinor, monthsLeft),
    incomeCount: incomes.length,
    perIncomeMinor: incomes.length > 0 ? ceilDiv(remainingMinor, incomes.length) : null,
  }
}
