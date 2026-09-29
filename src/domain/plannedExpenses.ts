/**
 * Gastos planificados (anuales o poco frecuentes): matrícula, seguro, regalos,
 * renovaciones (ver docs/FORMULAS.md §18).
 *
 * Son metas (`Goal.kind = 'expense'`) y reutilizan sus apartados, así que:
 *  - PLAN = cuota sugerida por semana o mes (solo un cálculo; no descuenta nada).
 *  - CONFIRMADO = apartado real (`allocations`), que sí se descuenta del disponible.
 *  - Si se vincula a una ocurrencia del calendario, esa ocurrencia no se reserva dos
 *    veces (ver `reserves.ts`).
 *  - Pagar crea (o vincula) el gasto real y libera la reserva en UNA operación.
 */
import { addDays, addMonthsClamped, daysBetween, parseLocalDate } from './dates'
import { goalPlan, goalProgress, type GoalPlan } from './goals'
import { newId } from './ids'
import { allocateToGoal, markOccurrence, saveGoal, saveTransaction, type OpContext, type OpResult } from './operations'
import { findSettlement, openItemsUntil } from './planItems'
import { occurrencesBetween } from './recurrence'
import type { AppData, Goal, GoalAllocation, GoalFunding, LocalDate, PlannedExpense, PlannedExpenseCycle, Transaction } from './types'
import type { Issue } from './validation'

const fail = (issues: Issue[]): { ok: false; issues: Issue[] } => ({ ok: false, issues })

export type PlannedExpenseState = 'paid' | 'covered' | 'overdue' | 'underWeek' | 'onTrack'

export interface PlannedExpenseStatus {
  state: PlannedExpenseState
  plan: GoalPlan
  savedMinor: number
  remainingMinor: number
  /** Días hasta el vencimiento (negativo = vencido). */
  daysLeft: number
}

export function plannedExpenseStatus(goal: Goal, today: LocalDate): PlannedExpenseStatus {
  const plan = goalPlan(goal, today)
  const { savedMinor, remainingMinor, complete } = goalProgress(goal)
  const daysLeft = goal.targetDate ? daysBetween(today, goal.targetDate) : 0
  let state: PlannedExpenseState = 'onTrack'
  if (goal.plan?.paidAt) state = 'paid'
  else if (complete) state = 'covered'
  else if (daysLeft <= 0) state = 'overdue'
  else if (plan.underWeek) state = 'underWeek'
  return { state, plan, savedMinor, remainingMinor, daysLeft }
}

export interface PlannedExpenseDraft {
  id: string
  name: string
  targetMinor: number
  dueDate: LocalDate
  fundedFrom: GoalFunding
  repeatEveryMonths?: number
  categoryId?: string
  link?: { scheduleId: string; occurrenceDate: LocalDate }
  /** Solo al crear: dinero que YA está apartado. Pasa por el mismo control de dinero libre. */
  initialReservedMinor?: number
  allocationId?: string
}

/**
 * Crea o edita un gasto planificado. El vínculo con el calendario debe apuntar a una
 * ocurrencia ABIERTA de un gasto programado que ninguna otra meta cubra (sin duplicar).
 * La fecha de vencimiento pasa a ser la de esa ocurrencia.
 */
export function savePlannedExpense(data: AppData, draft: PlannedExpenseDraft, ctx: OpContext): OpResult<Goal> {
  let dueDate = draft.dueDate
  if (draft.link) {
    const schedule = data.schedules.find((s) => s.id === draft.link!.scheduleId)
    if (!schedule || schedule.kind !== 'expense') return fail([{ path: 'link', code: 'notFound' }])
    const open = openItemsUntil(data, ctx.today, addDays(ctx.today, 3 * 366)).some(
      (i) => i.source === 'schedule' && i.sourceId === schedule.id && i.date === draft.link!.occurrenceDate,
    )
    if (!open) return fail([{ path: 'link', code: 'occurrenceAlreadySettled', params: { date: draft.link.occurrenceDate } }])
    const taken = data.goals.some(
      (g) => g.id !== draft.id && !g.plan?.paidAt && g.plan?.link?.scheduleId === schedule.id && g.plan.link.occurrenceDate === draft.link!.occurrenceDate,
    )
    if (taken) return fail([{ path: 'link', code: 'duplicateId' }])
    dueDate = draft.link.occurrenceDate
  }
  const existing = data.goals.find((g) => g.id === draft.id)
  const plan: PlannedExpense = {
    history: existing?.plan?.history ?? [],
    ...(draft.repeatEveryMonths ? { repeatEveryMonths: draft.repeatEveryMonths } : {}),
    ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
    ...(draft.link ? { link: draft.link } : {}),
    ...(existing?.plan?.paidAt ? { paidAt: existing.plan.paidAt } : {}),
  }
  const saved = saveGoal(
    data,
    { id: draft.id, name: draft.name, kind: 'expense', targetMinor: draft.targetMinor, targetDate: dueDate, fundedFrom: draft.fundedFrom, plan },
    ctx,
  )
  if (!saved.ok) return saved
  // saveGoal mezcla el plan anterior; aquí el borrador manda (p. ej. quitar el vínculo o la repetición).
  const goal: Goal = { ...saved.value, plan }
  let next: AppData = { ...saved.data, goals: saved.data.goals.map((g) => (g.id === goal.id ? goal : g)) }
  if (!existing && draft.initialReservedMinor && draft.initialReservedMinor > 0) {
    const r = allocateToGoal(next, { goalId: goal.id, amountMinor: draft.initialReservedMinor, allocationId: draft.allocationId, reason: 'contribution' }, ctx)
    if (!r.ok) return fail(r.issues.map((i) => ({ ...i, path: i.path === 'amountMinor' ? 'initialReservedMinor' : i.path })))
    next = r.data
  }
  return { ok: true, data: next, value: next.goals.find((g) => g.id === goal.id)! }
}

export interface PayPlannedExpenseInput {
  goalId: string
  /** Id del gasto real, generado al abrir el diálogo (pagar dos veces no duplica). */
  txId: string
  amountMinor: number
  date: LocalDate
  accountId: string
  categoryId?: string
  note?: string
  /** Si se pagó menos de lo apartado: liberar el sobrante o guardarlo para el siguiente periodo. */
  surplus: 'release' | 'carry'
  alreadyInBalance?: boolean
}

export interface PayPlannedExpenseResult {
  tx: Transaction
  cycle: PlannedExpenseCycle
  /** Pagado de más respecto a lo apartado: sale del dinero disponible. */
  shortfallMinor: number
  surplusMinor: number
}

/**
 * Paga un gasto planificado en una operación consistente:
 *  1. Registra el gasto real (o liquida la ocurrencia vinculada del calendario).
 *  2. Libera de la reserva lo usado: min(apartado, pagado).
 *  3. Sobrante (apartado − pagado > 0): se libera o se guarda para el siguiente periodo.
 *     Faltante (pagado − apartado > 0): sale del dinero disponible (queda registrado).
 *  4. Guarda el periodo en el historial. Si se repite, pasa al siguiente vencimiento
 *     SIN marcarlo como financiado (solo con el sobrante guardado, si lo hubo).
 */
export function payPlannedExpense(data: AppData, input: PayPlannedExpenseInput, ctx: OpContext): OpResult<PayPlannedExpenseResult> {
  const goal = data.goals.find((g) => g.id === input.goalId)
  if (!goal || goal.kind !== 'expense' || !goal.plan) return fail([{ path: 'goalId', code: 'notFound' }])
  // Idempotente: si el gasto ya existe, no se paga otra vez.
  const already = data.transactions.find((t) => t.id === input.txId)
  const alreadyCycle = goal.plan.history.find((c) => c.txId === input.txId)
  if (already && alreadyCycle) return { ok: true, data, value: { tx: already, cycle: alreadyCycle, shortfallMinor: 0, surplusMinor: 0 }, unchanged: true }
  if (goal.plan.paidAt) return fail([{ path: 'goalId', code: 'occurrenceAlreadySettled', params: { date: goal.targetDate ?? '' } }])
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) return fail([{ path: 'amountMinor', code: 'amountNotPositive' }])

  // 1. Gasto real (vinculado a la ocurrencia si sigue abierta).
  const link = goal.plan.link
  const linkOpen = !!link && !findSettlement(data, link.scheduleId, link.occurrenceDate) && data.schedules.some((s) => s.id === link.scheduleId)
  const categoryId = input.categoryId ?? goal.plan.categoryId ?? 'other_expense'
  const note = input.note?.trim() ? input.note : goal.name
  const txResult = linkOpen
    ? markOccurrence(
        data,
        { scheduleId: link!.scheduleId, occurrenceDate: link!.occurrenceDate, amountMinor: input.amountMinor, date: input.date, accountId: input.accountId, txId: input.txId, categoryId, note, alreadyInBalance: input.alreadyInBalance },
        ctx,
      )
    : saveTransaction(
        data,
        { id: input.txId, kind: 'expense', status: 'realized', amountMinor: input.amountMinor, date: input.date, accountId: input.accountId, categoryId, note, alreadyInBalance: input.alreadyInBalance },
        ctx,
      )
  if (!txResult.ok) return txResult
  if (linkOpen && txResult.value.id !== input.txId) return fail([{ path: 'link', code: 'occurrenceAlreadySettled', params: { date: link!.occurrenceDate } }])
  let next = txResult.data

  // 2 y 3. Liberar la reserva usada y decidir el sobrante.
  const savedMinor = Math.max(0, goalProgress(goal).savedMinor)
  const usedMinor = Math.min(savedMinor, input.amountMinor)
  const surplusMinor = savedMinor - usedMinor
  const shortfallMinor = Math.max(0, input.amountMinor - savedMinor)
  const recurring = !!goal.plan.repeatEveryMonths
  const surplusAction: PlannedExpenseCycle['surplus'] = surplusMinor === 0 ? 'none' : recurring && input.surplus === 'carry' ? 'carry' : 'release'
  const moves: GoalAllocation[] = []
  if (usedMinor > 0) moves.push({ id: newId(), amountMinor: -usedMinor, date: ctx.today, createdAt: ctx.now, reason: 'payment' })
  if (surplusAction === 'release') moves.push({ id: newId(), amountMinor: -surplusMinor, date: ctx.today, createdAt: ctx.now, reason: 'release' })

  // 4. Historial y siguiente periodo.
  const cycle: PlannedExpenseCycle = {
    dueDate: goal.targetDate ?? input.date,
    targetMinor: goal.targetMinor,
    reservedMinor: savedMinor,
    paidMinor: input.amountMinor,
    txId: input.txId,
    surplus: surplusAction,
    paidAt: ctx.now,
  }
  const plan: PlannedExpense = { ...goal.plan, history: [...goal.plan.history, cycle] }
  let targetDate = goal.targetDate
  if (recurring) {
    const due = goal.targetDate ?? input.date
    targetDate = addMonthsClamped(due, goal.plan.repeatEveryMonths!, parseLocalDate(due).day)
    const schedule = link ? next.schedules.find((s) => s.id === link.scheduleId) : undefined
    const nextOccurrence = schedule ? occurrencesBetween(schedule, addDays(link!.occurrenceDate, 1), addDays(link!.occurrenceDate, 800))[0] : undefined
    if (link && schedule && nextOccurrence) {
      plan.link = { scheduleId: link.scheduleId, occurrenceDate: nextOccurrence }
      targetDate = nextOccurrence
    } else {
      delete plan.link
    }
  } else {
    plan.paidAt = ctx.now
  }
  // Con 'carry' el sobrante simplemente sigue apartado; el historial deja constancia.
  const allocations = [...goal.allocations, ...moves]
  const updated: Goal = { ...goal, targetDate, plan, allocations, updatedAt: ctx.now }
  next = { ...next, goals: next.goals.map((g) => (g.id === goal.id ? updated : g)), updatedAt: ctx.now }
  return { ok: true, data: next, value: { tx: txResult.value, cycle, shortfallMinor, surplusMinor } }
}
