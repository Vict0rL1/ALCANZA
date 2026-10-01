/**
 * Distribuir un ingreso RECIBIDO entre pagos, metas y dinero libre (ver docs/FORMULAS.md §25).
 *
 * El ingreso ya está en el saldo: distribuirlo NO crea dinero ni otro ingreso. Solo crea
 * apartados virtuales con el sistema de metas existente:
 *   - Pago del calendario → gasto planificado vinculado a esa ocurrencia (se crea si no
 *     existe). Si el pago ya se descontaba del disponible, la cobertura (reserves.ts) evita
 *     restarlo otra vez: el disponible no cambia.
 *   - Meta → apartado normal (con el control de dinero libre de siempre).
 *   - Lo no asignado queda libre.
 * Todo se aplica en una sola operación (todo o nada) y queda vinculado al ingreso.
 */
import { computeBudget } from './budget'
import { addDays } from './dates'
import { goalPlan, goalProgress } from './goals'
import { sumMinor } from './money'
import { allocateToGoal, type OpContext, type OpResult } from './operations'
import { openItemsUntil, type PlanItem } from './planItems'
import { savePlannedExpense } from './plannedExpenses'
import { scheduledIncomeItems } from './budget'
import type { AppData, Goal, IncomeDistribution, IncomeDistributionLine, LocalDate, Transaction } from './types'
import type { Issue } from './validation'

const fail = (issues: Issue[]): { ok: false; issues: Issue[] } => ({ ok: false, issues })

/** Días hacia adelante en los que se ofrecen pagos del calendario. */
export const DISTRIBUTION_PAYMENT_DAYS = 45

export function incomeFingerprint(tx: Pick<Transaction, 'amountMinor' | 'date' | 'accountId' | 'status' | 'kind'>): string {
  return `${tx.kind}|${tx.status}|${tx.amountMinor}|${tx.date}|${tx.accountId}`
}

export type DistributionIncomeStatus = 'ok' | 'changed' | 'missing'

/** ¿El ingreso sigue igual que cuando se distribuyó? */
export function distributionIncomeState(data: Pick<AppData, 'transactions' | 'trash'>, d: IncomeDistribution): { status: DistributionIncomeStatus; fingerprint: string; tx?: Transaction } {
  const tx = data.transactions.find((t) => t.id === d.incomeTxId)
  if (!tx) return { status: 'missing', fingerprint: data.trash.some((e) => e.id === d.incomeTxId) ? 'trash' : 'gone' }
  const fp = incomeFingerprint(tx)
  return { status: fp === d.incomeFingerprint ? 'ok' : 'changed', fingerprint: fp, tx }
}

export function activeDistributions(data: Pick<AppData, 'incomeDistributions'>, incomeTxId: string): IncomeDistribution[] {
  return data.incomeDistributions.filter((d) => d.incomeTxId === incomeTxId && !d.undoneAt)
}

/** Lo ya repartido de este ingreso (distribuciones vigentes). */
export function distributedMinor(data: Pick<AppData, 'incomeDistributions'>, incomeTxId: string): number {
  return sumMinor(activeDistributions(data, incomeTxId).flatMap((d) => d.lines.map((l) => l.amountMinor)))
}

export interface PaymentNeed {
  item: PlanItem
  scheduleId: string
  occurrenceDate: LocalDate
  /** Apartado ya existente para este pago (gastos planificados vinculados). */
  coveredMinor: number
  /** Lo que falta apartar. */
  needMinor: number
  /** El pago ya se descuenta del disponible (antes del próximo ingreso): apartarle no cuesta dinero libre. */
  alreadyReserved: boolean
  /** Gasto planificado vinculado y abierto que se reutiliza, si existe. */
  goalId?: string
}

export interface GoalNeed {
  goal: Goal
  needMinor: number
  /** Cuota sugerida por la propia meta para un ingreso (si tiene fecha); no es un porcentaje fijo. */
  perIncomeMinor: number | null
}

export interface DistributionContext {
  income: Transaction
  incomeMinor: number
  alreadyMinor: number
  /** Ingreso − ya repartido (nunca negativo). */
  remainingMinor: number
  /** Dinero libre hoy para apartados nuevos que sí cuestan («Puedes gastar», ≥ 0). */
  freeMinor: number
  payments: PaymentNeed[]
  goals: GoalNeed[]
}

function linkedOpenGoal(data: AppData, scheduleId: string, occurrenceDate: LocalDate): Goal | undefined {
  return data.goals.find((g) => g.kind === 'expense' && !g.plan?.paidAt && g.fundedFrom === 'budget' && g.plan?.link?.scheduleId === scheduleId && g.plan.link.occurrenceDate === occurrenceDate)
}

export function distributionContext(data: AppData, incomeTxId: string, today: LocalDate): DistributionContext | null {
  const income = data.transactions.find((t) => t.id === incomeTxId)
  if (!income || income.kind !== 'income') return null
  const budget = computeBudget(data, today)
  const reservedKeys = new Set(budget.reservedItems.map((i) => i.key))
  const payments = openItemsUntil(data, today, addDays(today, DISTRIBUTION_PAYMENT_DAYS))
    .filter((i) => i.source === 'schedule' && i.budgetEffectMinor < 0 && (i.state === 'pending' || i.state === 'overdue'))
    .map((item): PaymentNeed => {
      const goal = linkedOpenGoal(data, item.sourceId, item.date)
      const coveredMinor = data.goals
        .filter((g) => g.kind === 'expense' && !g.plan?.paidAt && g.plan?.link?.scheduleId === item.sourceId && g.plan.link.occurrenceDate === item.date)
        .reduce((s, g) => s + Math.max(0, goalProgress(g).savedMinor), 0)
      const amount = -item.budgetEffectMinor
      return { item, scheduleId: item.sourceId, occurrenceDate: item.date, coveredMinor, needMinor: Math.max(0, amount - coveredMinor), alreadyReserved: reservedKeys.has(item.key), goalId: goal?.id }
    })
    .filter((p) => p.needMinor > 0)
  const incomeDates = scheduledIncomeItems(data, today, addDays(today, 3 * 365)).filter((i) => i.state === 'pending').map((i) => i.date)
  const goals = data.goals
    .filter((g) => g.fundedFrom === 'budget' && !g.plan?.paidAt && !g.plan?.link && !data.periodBudgets.some((b) => b.goalId === g.id))
    .map((goal): GoalNeed => {
      const p = goalProgress(goal)
      const plan = goalPlan(goal, today, incomeDates)
      return { goal, needMinor: p.remainingMinor, perIncomeMinor: plan.perIncomeMinor }
    })
    .filter((g) => g.needMinor > 0)
    .sort((a, b) => (a.goal.targetDate ?? '9999') .localeCompare(b.goal.targetDate ?? '9999'))
  const alreadyMinor = distributedMinor(data, incomeTxId)
  return {
    income,
    incomeMinor: income.amountMinor,
    alreadyMinor,
    remainingMinor: Math.max(0, income.amountMinor - alreadyMinor),
    freeMinor: Math.max(0, budget.availableMinor),
    payments,
    goals,
  }
}

export type DistributionPriority = 'paymentsFirst' | 'goalsFirst' | 'manual'

export interface DistributionLineInput {
  kind: IncomeDistributionLine['kind']
  amountMinor: number
  /** Pagos. */
  scheduleId?: string
  occurrenceDate?: LocalDate
  /** Metas. */
  goalId?: string
}

/**
 * Propuesta editable con reglas transparentes (nunca porcentajes fijos):
 *  - Pagos por fecha: lo que falta de cada uno.
 *  - Metas por fecha objetivo: su cuota por ingreso si la tienen; si no, lo que falta.
 *  - Nada supera lo que queda del ingreso; lo que cuesta dinero libre no supera el libre.
 * El orden lo elige la persona (pagos o metas primero) o lo reparte a mano.
 */
export function proposeDistribution(c: DistributionContext, priority: DistributionPriority): DistributionLineInput[] {
  if (priority === 'manual') return []
  let pool = c.remainingMinor
  let free = c.freeMinor
  const payments = (): DistributionLineInput[] =>
    c.payments.flatMap((p) => {
      let amount = Math.min(p.needMinor, pool)
      if (!p.alreadyReserved) amount = Math.min(amount, free)
      if (amount <= 0) return []
      pool -= amount
      if (!p.alreadyReserved) free -= amount
      return [{ kind: 'payment' as const, amountMinor: amount, scheduleId: p.scheduleId, occurrenceDate: p.occurrenceDate }]
    })
  const goals = (): DistributionLineInput[] =>
    c.goals.flatMap((g) => {
      const amount = Math.min(g.perIncomeMinor ?? g.needMinor, g.needMinor, pool, free)
      if (amount <= 0) return []
      pool -= amount
      free -= amount
      return [{ kind: 'goal' as const, amountMinor: amount, goalId: g.goal.id }]
    })
  return priority === 'paymentsFirst' ? [...payments(), ...goals()] : [...goals(), ...payments()]
}

export interface ApplyDistributionInput {
  /** Generado al abrir el asistente: confirmar dos veces no duplica. */
  distributionId: string
  incomeTxId: string
  lines: DistributionLineInput[]
}

/** Aplica la distribución en UNA operación: o se crean todos los apartados o ninguno. */
export function applyDistribution(data: AppData, input: ApplyDistributionInput, ctx: OpContext): OpResult<IncomeDistribution> {
  const existing = data.incomeDistributions.find((d) => d.id === input.distributionId)
  if (existing) return { ok: true, data, value: existing, unchanged: true }
  const income = data.transactions.find((t) => t.id === input.incomeTxId)
  if (!income || income.kind !== 'income') return fail([{ path: 'incomeTxId', code: 'notFound' }])
  if (income.status !== 'realized') return fail([{ path: 'incomeTxId', code: 'incomeNotRealized' }])
  const lines = input.lines.filter((l) => l.amountMinor !== 0)
  if (lines.length === 0) return fail([{ path: 'lines', code: 'required' }])
  if (lines.some((l) => !Number.isSafeInteger(l.amountMinor) || l.amountMinor < 0)) return fail([{ path: 'lines', code: 'invalidAmount' }])
  const remaining = income.amountMinor - distributedMinor(data, income.id)
  if (sumMinor(lines.map((l) => l.amountMinor)) > remaining) return fail([{ path: 'lines', code: 'distributionExceeds', params: { remainingMinor: Math.max(0, remaining) } }])

  let next = data
  const recorded: IncomeDistributionLine[] = []
  for (const [i, line] of lines.entries()) {
    let goalId = line.goalId
    let createdGoal = false
    if (line.kind === 'payment') {
      if (!line.scheduleId || !line.occurrenceDate) return fail([{ path: `lines[${i}]`, code: 'notFound' }])
      const reuse = linkedOpenGoal(next, line.scheduleId, line.occurrenceDate)
      if (reuse) goalId = reuse.id
      else {
        const schedule = next.schedules.find((s) => s.id === line.scheduleId)
        if (!schedule || schedule.kind !== 'expense') return fail([{ path: `lines[${i}].scheduleId`, code: 'notFound' }])
        goalId = `${input.distributionId}-g${i}`
        const created = savePlannedExpense(
          next,
          {
            id: goalId,
            name: schedule.name,
            targetMinor: schedule.amountMinor,
            dueDate: line.occurrenceDate,
            fundedFrom: 'budget',
            categoryId: schedule.categoryId,
            link: { scheduleId: schedule.id, occurrenceDate: line.occurrenceDate },
          },
          ctx,
        )
        if (!created.ok) return fail(created.issues.map((x) => ({ ...x, path: `lines[${i}].${x.path}` })))
        next = created.data
        createdGoal = true
      }
    }
    if (!goalId || !next.goals.some((g) => g.id === goalId)) return fail([{ path: `lines[${i}].goalId`, code: 'notFound' }])
    const allocationId = `${input.distributionId}-a${i}`
    const r = allocateToGoal(next, { goalId, amountMinor: line.amountMinor, allocationId, reason: 'contribution', distributionId: input.distributionId }, ctx)
    if (!r.ok) return fail(r.issues.map((x) => ({ ...x, path: `lines[${i}].${x.path}` })))
    next = r.data
    recorded.push({
      kind: line.kind,
      goalId,
      allocationId,
      amountMinor: line.amountMinor,
      createdGoal,
      ...(line.kind === 'payment' ? { scheduleId: line.scheduleId, occurrenceDate: line.occurrenceDate } : {}),
    })
  }
  const distribution: IncomeDistribution = {
    id: input.distributionId,
    incomeTxId: income.id,
    incomeFingerprint: incomeFingerprint(income),
    incomeAmountMinor: income.amountMinor,
    lines: recorded,
    createdAt: ctx.now,
  }
  return { ok: true, data: { ...next, incomeDistributions: [...next.incomeDistributions, distribution], updatedAt: ctx.now }, value: distribution }
}

export interface DistributionPreview {
  before: { availableMinor: number; reservedMinor: number; spendableMinor: number }
  after: { availableMinor: number; reservedMinor: number; spendableMinor: number }
}

/** Vista previa: aplica sobre una copia (nada se guarda). */
export function previewDistribution(data: AppData, input: ApplyDistributionInput, ctx: OpContext): { ok: true; preview: DistributionPreview } | { ok: false; issues: Issue[] } {
  const summary = (d: AppData) => {
    const b = computeBudget(d, ctx.today)
    return { availableMinor: b.availableMinor, reservedMinor: b.reservedTotalMinor + b.goalsReservedMinor, spendableMinor: b.spendableMinor }
  }
  const r = applyDistribution(data, input, ctx)
  if (!r.ok) return r
  return { ok: true, preview: { before: summary(data), after: summary(r.data) } }
}

/**
 * Deshace una distribución liberando sus apartados. Solo si es coherente: si algún apartado
 * ya se usó (se pagó el gasto) o la meta cambió de forma que ya no tiene ese dinero, no se
 * revierte nada y se explica el conflicto (nunca se deshacen operaciones posteriores).
 */
export function undoDistribution(data: AppData, distributionId: string, ctx: OpContext): OpResult<IncomeDistribution> {
  const d = data.incomeDistributions.find((x) => x.id === distributionId)
  if (!d) return fail([{ path: 'id', code: 'notFound' }])
  if (d.undoneAt) return { ok: true, data, value: d, unchanged: true }
  let goals = data.goals
  for (const line of d.lines) {
    const goal = goals.find((g) => g.id === line.goalId)
    const alloc = goal?.allocations.find((a) => a.id === line.allocationId)
    const usedAfter = !!goal && !!alloc && goal.allocations.some((a) => a.reason === 'payment' && a.createdAt >= alloc.createdAt)
    if (!goal || !alloc || usedAfter || !!goal.plan?.paidAt || goalProgress(goal).savedMinor < line.amountMinor) {
      return fail([{ path: 'id', code: 'distributionConflict', params: { name: goal?.name ?? '—' } }])
    }
    const release = { id: `${line.allocationId}-undo`, amountMinor: -line.amountMinor, date: ctx.today, createdAt: ctx.now, reason: 'release' as const, distributionId }
    const updated: Goal = { ...goal, allocations: [...goal.allocations, release], updatedAt: ctx.now }
    // Una meta creada solo por esta distribución y sin otros movimientos desaparece al deshacer.
    const onlyOurs = line.createdGoal && goal.allocations.every((a) => a.distributionId === distributionId)
    goals = onlyOurs ? goals.filter((g) => g.id !== goal.id) : goals.map((g) => (g.id === goal.id ? updated : g))
  }
  const undone = { ...d, undoneAt: ctx.now }
  return {
    ok: true,
    data: { ...data, goals, incomeDistributions: data.incomeDistributions.map((x) => (x.id === d.id ? undone : x)), updatedAt: ctx.now },
    value: undone,
  }
}
