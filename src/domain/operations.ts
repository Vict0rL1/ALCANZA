/**
 * Operaciones que cambian los datos. Son funciones puras: reciben el estado,
 * devuelven un estado NUEVO (o errores) y nunca tocan el almacenamiento.
 *
 * Idempotencia: cada registro tiene un id generado al abrir el formulario.
 * Guardar dos veces el mismo id actualiza el registro; no crea duplicados.
 */
import { computeBudget } from './budget'
import { addDays, isValidLocalDate } from './dates'
import { goalProgress } from './goals'
import { newId } from './ids'
import { findSettlement } from './planItems'
import type { Account, AppData, CardDetails, CategoryLimit, CategoryRule, CustomCategory, Goal, GoalAllocation, LocalDate, Schedule, Settings, Timestamp, Transaction } from './types'
import { SCHEMA_VERSION } from './types'
import {
  validateAccount,
  validateCategory,
  validateCategoryLimit,
  validateCategoryRule,
  validateGoal,
  validateSchedule,
  validateSettings,
  validateTransaction,
  type Issue,
} from './validation'

export type OpResult<T = undefined> =
  | { ok: true; data: AppData; value: T; unchanged?: boolean }
  | { ok: false; issues: Issue[] }

export interface OpContext {
  today: LocalDate
  now: Timestamp
}

function fail(issues: Issue[]): { ok: false; issues: Issue[] } {
  return { ok: false, issues }
}

function touch(data: AppData, now: Timestamp): AppData {
  return { ...data, updatedAt: now }
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id)
  if (idx === -1) return [...list, item]
  const copy = list.slice()
  copy[idx] = item
  return copy
}

/* ------------------------------------------------------------------ */
/* Movimientos                                                         */
/* ------------------------------------------------------------------ */

export type TransactionDraft = Omit<Transaction, 'createdAt' | 'updatedAt' | 'currency' | 'realizedAt'> & {
  /**
   * Solo si la fecha coincide con la del saldo de referencia: el movimiento ya
   * estaba incluido en el saldo escrito, así que no debe volver a restarse.
   */
  alreadyInBalance?: boolean
}

function cleanText(value: string | undefined): string | undefined {
  const t = value?.trim()
  return t ? t : undefined
}

/**
 * Crea o actualiza un movimiento. Conserva `createdAt` y, si ya estaba realizado,
 * `realizedAt` (salvo que cambie la marca "ya incluido en el saldo").
 */
export function saveTransaction(data: AppData, draft: TransactionDraft, ctx: OpContext): OpResult<Transaction> {
  const existing = data.transactions.find((t) => t.id === draft.id)
  const account = data.accounts.find((a) => a.id === draft.accountId)
  let realizedAt: Timestamp | undefined
  if (draft.status === 'realized') {
    const anchor = account?.anchor
    const sameDayAsAnchor = !!anchor && draft.date === anchor.date
    const previous = existing?.status === 'realized' ? existing.realizedAt : undefined
    if (sameDayAsAnchor && draft.alreadyInBalance) {
      // Ya estaba en el saldo escrito: se fecha en el mismo instante del saldo → no se vuelve a aplicar.
      realizedAt = anchor.setAt
    } else if (sameDayAsAnchor) {
      // Debe aplicarse: el instante tiene que ser posterior al del saldo.
      realizedAt = previous && previous > anchor.setAt ? previous : ctx.now
    } else {
      realizedAt = previous ?? ctx.now
    }
  }
  const tx: Transaction = {
    id: draft.id,
    kind: draft.kind,
    status: draft.status,
    amountMinor: draft.amountMinor,
    currency: data.settings.currency,
    date: draft.date,
    accountId: draft.accountId,
    ...(draft.kind === 'transfer' ? { toAccountId: draft.toAccountId } : { categoryId: draft.categoryId }),
    ...(draft.kind === 'refund' && draft.refundOfId ? { refundOfId: draft.refundOfId } : {}),
    ...(cleanText(draft.note) ? { note: cleanText(draft.note) } : {}),
    ...(draft.scheduleId ? { scheduleId: draft.scheduleId, occurrenceDate: draft.occurrenceDate } : {}),
    ...(realizedAt ? { realizedAt } : {}),
    // La huella de importación se conserva al editar (evita reimportar la misma fila).
    ...((draft.importRef ?? existing?.importRef) ? { importRef: draft.importRef ?? existing?.importRef } : {}),
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  const issues = validateTransaction(tx, { data, today: ctx.today })
  if (issues.length) return fail(issues)
  return { ok: true, data: touch({ ...data, transactions: upsert(data.transactions, tx) }, ctx.now), value: tx }
}

export function deleteTransaction(
  data: AppData,
  id: string,
  ctx: OpContext,
): OpResult<{ tx: Transaction; unlinkedRefundIds: string[] }> {
  const tx = data.transactions.find((t) => t.id === id)
  if (!tx) return fail([{ path: 'id', code: 'notFound' }])
  // Las devoluciones vinculadas a este gasto conservan su importe pero pierden el vínculo.
  const unlinkedRefundIds: string[] = []
  const transactions = data.transactions
    .filter((t) => t.id !== id)
    .map((t) => {
      if (t.refundOfId !== id) return t
      unlinkedRefundIds.push(t.id)
      const { refundOfId: _removed, ...rest } = t
      return { ...rest, updatedAt: ctx.now }
    })
  return { ok: true, data: touch({ ...data, transactions }, ctx.now), value: { tx, unlinkedRefundIds } }
}

/** Deshacer: vuelve a insertar el mismo registro (mismo id, sin duplicar) y sus vínculos. */
export function restoreTransaction(
  data: AppData,
  tx: Transaction,
  ctx: OpContext,
  relinkRefundIds: string[] = [],
): OpResult<Transaction> {
  if (data.transactions.some((t) => t.id === tx.id)) return { ok: true, data, value: tx, unchanged: true }
  const transactions = data.transactions.map((t) =>
    relinkRefundIds.includes(t.id) ? { ...t, refundOfId: tx.id, updatedAt: ctx.now } : t,
  )
  return { ok: true, data: touch({ ...data, transactions: [...transactions, tx] }, ctx.now), value: tx }
}

/** Deshacer una edición: vuelve a dejar exactamente la versión anterior del registro. */
export function revertTransaction(data: AppData, previous: Transaction, ctx: OpContext): OpResult<Transaction> {
  return { ok: true, data: touch({ ...data, transactions: upsert(data.transactions, previous) }, ctx.now), value: previous }
}

/** Convierte un movimiento previsto en realizado (sin crear otro registro). */
export function realizePlanned(
  data: AppData,
  id: string,
  input: { date: LocalDate; amountMinor?: number; alreadyInBalance?: boolean },
  ctx: OpContext,
): OpResult<Transaction> {
  const tx = data.transactions.find((t) => t.id === id)
  if (!tx) return fail([{ path: 'id', code: 'notFound' }])
  if (tx.status === 'realized') return { ok: true, data, value: tx, unchanged: true }
  return saveTransaction(
    data,
    { ...tx, status: 'realized', date: input.date, amountMinor: input.amountMinor ?? tx.amountMinor, alreadyInBalance: input.alreadyInBalance },
    ctx,
  )
}

export interface ImportInput {
  /** Ids generados al abrir la vista previa: confirmar dos veces no duplica. */
  items: (Pick<Transaction, 'id' | 'kind' | 'amountMinor' | 'date' | 'accountId' | 'categoryId' | 'note'> & { importRef: string })[]
  /** Filas del mismo día que el saldo de referencia: ¿ya estaban incluidas en él? */
  sameDayAlreadyInBalance: boolean
}

/**
 * Importa movimientos realizados de un archivo del banco. Todo o nada: si una fila
 * no es válida, no se aplica ninguna. Las filas cuya huella ya existe se omiten.
 */
export function importTransactions(data: AppData, input: ImportInput, ctx: OpContext): OpResult<{ ids: string[] }> {
  let next = data
  const ids: string[] = []
  const issues: Issue[] = []
  const refs = new Set(data.transactions.map((t) => t.importRef).filter(Boolean))
  input.items.forEach((item, i) => {
    if (refs.has(item.importRef) || next.transactions.some((t) => t.id === item.id)) return
    refs.add(item.importRef)
    const r = saveTransaction(next, { ...item, status: 'realized', alreadyInBalance: input.sameDayAlreadyInBalance }, ctx)
    if (!r.ok) {
      issues.push(...r.issues.map((issue) => ({ ...issue, path: `items[${i}].${issue.path}` })))
      return
    }
    next = r.data
    ids.push(item.id)
  })
  if (issues.length) return fail(issues)
  if (!ids.length) return { ok: true, data, value: { ids }, unchanged: true }
  return { ok: true, data: next, value: { ids } }
}

/** Deshacer una importación: quita exactamente los movimientos creados. */
export function removeTransactions(data: AppData, ids: string[], ctx: OpContext): OpResult<{ removed: number }> {
  const set = new Set(ids)
  const transactions = data.transactions.filter((t) => !set.has(t.id))
  const removed = data.transactions.length - transactions.length
  if (!removed) return { ok: true, data, value: { removed }, unchanged: true }
  return { ok: true, data: touch({ ...data, transactions }, ctx.now), value: { removed } }
}

/* ------------------------------------------------------------------ */
/* Pagos e ingresos programados                                        */
/* ------------------------------------------------------------------ */

export type ScheduleDraft = Omit<Schedule, 'createdAt' | 'updatedAt' | 'currency' | 'skippedDates'> & { skippedDates?: LocalDate[] }

export function saveSchedule(data: AppData, draft: ScheduleDraft, ctx: OpContext): OpResult<Schedule> {
  const existing = data.schedules.find((s) => s.id === draft.id)
  const schedule: Schedule = {
    id: draft.id,
    name: draft.name.trim(),
    kind: draft.kind,
    amountMinor: draft.amountMinor,
    amountIsEstimate: draft.amountIsEstimate,
    currency: data.settings.currency,
    accountId: draft.accountId,
    categoryId: draft.categoryId,
    frequency: draft.frequency,
    startDate: draft.startDate,
    ...(draft.frequency !== 'once' && draft.endDate ? { endDate: draft.endDate } : {}),
    reminderDaysBefore: draft.reminderDaysBefore,
    skippedDates: draft.skippedDates ?? existing?.skippedDates ?? [],
    ...(cleanText(draft.note) ? { note: cleanText(draft.note) } : {}),
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  const issues = validateSchedule(schedule, { data })
  if (issues.length) return fail(issues)
  return { ok: true, data: touch({ ...data, schedules: upsert(data.schedules, schedule) }, ctx.now), value: schedule }
}

export function deleteSchedule(data: AppData, id: string, ctx: OpContext): OpResult<Schedule> {
  const schedule = data.schedules.find((s) => s.id === id)
  if (!schedule) return fail([{ path: 'id', code: 'notFound' }])
  // Los movimientos ya realizados se conservan: son historia real.
  return { ok: true, data: touch({ ...data, schedules: data.schedules.filter((s) => s.id !== id) }, ctx.now), value: schedule }
}

export function restoreSchedule(data: AppData, schedule: Schedule, ctx: OpContext): OpResult<Schedule> {
  if (data.schedules.some((s) => s.id === schedule.id)) return { ok: true, data, value: schedule, unchanged: true }
  return { ok: true, data: touch({ ...data, schedules: [...data.schedules, schedule] }, ctx.now), value: schedule }
}

export interface MarkOccurrenceInput {
  scheduleId: string
  occurrenceDate: LocalDate
  /** Importe real (puede diferir del previsto). */
  amountMinor: number
  /** Fecha real del pago/cobro (no futura). */
  date: LocalDate
  accountId?: string
  alreadyInBalance?: boolean
  /** Id generado al abrir el diálogo, para que un doble clic no duplique. */
  txId?: string
}

/**
 * Marca una ocurrencia como pagada/recibida creando UN movimiento realizado
 * vinculado. Si ya existe, no hace nada: nunca se descuenta dos veces.
 */
export function markOccurrence(data: AppData, input: MarkOccurrenceInput, ctx: OpContext): OpResult<Transaction> {
  const schedule = data.schedules.find((s) => s.id === input.scheduleId)
  if (!schedule) return fail([{ path: 'scheduleId', code: 'notFound' }])
  const existing = findSettlement(data, input.scheduleId, input.occurrenceDate)
  if (existing) return { ok: true, data, value: existing, unchanged: true }
  const byId = input.txId ? data.transactions.find((t) => t.id === input.txId) : undefined
  if (byId) return { ok: true, data, value: byId, unchanged: true }
  const withoutSkip = schedule.skippedDates.includes(input.occurrenceDate)
    ? { ...data, schedules: upsert(data.schedules, { ...schedule, skippedDates: schedule.skippedDates.filter((d) => d !== input.occurrenceDate) }) }
    : data
  return saveTransaction(
    withoutSkip,
    {
      id: input.txId ?? newId(),
      kind: schedule.kind,
      status: 'realized',
      amountMinor: input.amountMinor,
      date: input.date,
      accountId: input.accountId ?? schedule.accountId,
      categoryId: schedule.categoryId,
      note: schedule.name,
      scheduleId: schedule.id,
      occurrenceDate: input.occurrenceDate,
      alreadyInBalance: input.alreadyInBalance,
    },
    ctx,
  )
}

export function setOccurrenceSkipped(data: AppData, scheduleId: string, date: LocalDate, skipped: boolean, ctx: OpContext): OpResult<Schedule> {
  const schedule = data.schedules.find((s) => s.id === scheduleId)
  if (!schedule) return fail([{ path: 'scheduleId', code: 'notFound' }])
  if (!isValidLocalDate(date)) return fail([{ path: 'date', code: 'invalidDate' }])
  const has = schedule.skippedDates.includes(date)
  if (has === skipped) return { ok: true, data, value: schedule, unchanged: true }
  const skippedDates = skipped ? [...schedule.skippedDates, date].sort() : schedule.skippedDates.filter((d) => d !== date)
  const updated = { ...schedule, skippedDates, updatedAt: ctx.now }
  return { ok: true, data: touch({ ...data, schedules: upsert(data.schedules, updated) }, ctx.now), value: updated }
}

/* ------------------------------------------------------------------ */
/* Metas                                                               */
/* ------------------------------------------------------------------ */

export type GoalDraft = Omit<Goal, 'createdAt' | 'updatedAt' | 'currency' | 'allocations'>

export function saveGoal(data: AppData, draft: GoalDraft, ctx: OpContext): OpResult<Goal> {
  const existing = data.goals.find((g) => g.id === draft.id)
  const goal: Goal = {
    id: draft.id,
    name: draft.name.trim(),
    kind: draft.kind,
    targetMinor: draft.targetMinor,
    ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
    currency: data.settings.currency,
    fundedFrom: draft.fundedFrom,
    allocations: existing?.allocations ?? [],
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  const issues = validateGoal(goal, { data })
  if (issues.length) return fail(issues)
  // Cambiar a 'budget' una meta con dinero apartado también debe caber en el dinero libre.
  if (existing && existing.fundedFrom === 'external' && goal.fundedFrom === 'budget') {
    const saved = goalProgress(existing).savedMinor
    const free = Math.max(0, computeBudget(data, ctx.today).availableMinor)
    if (saved > free) return fail([{ path: 'fundedFrom', code: 'exceedsFreeMoney', params: { freeMinor: free } }])
  }
  return { ok: true, data: touch({ ...data, goals: upsert(data.goals, goal) }, ctx.now), value: goal }
}

export function deleteGoal(data: AppData, id: string, ctx: OpContext): OpResult<Goal> {
  const goal = data.goals.find((g) => g.id === id)
  if (!goal) return fail([{ path: 'id', code: 'notFound' }])
  return { ok: true, data: touch({ ...data, goals: data.goals.filter((g) => g.id !== id) }, ctx.now), value: goal }
}

export function restoreGoal(data: AppData, goal: Goal, ctx: OpContext): OpResult<Goal> {
  if (data.goals.some((g) => g.id === goal.id)) return { ok: true, data, value: goal, unchanged: true }
  return { ok: true, data: touch({ ...data, goals: [...data.goals, goal] }, ctx.now), value: goal }
}

/**
 * Aparta (+) o libera (−) dinero de una meta. Reglas contra la doble reserva:
 *  - Metas del presupuesto: no se puede apartar más que el disponible libre
 *    (saldo − pagos reservados − otros apartados).
 *  - No se aparta más de lo que le falta a la meta.
 *  - No se libera más de lo apartado.
 */
export function allocateToGoal(
  data: AppData,
  input: { goalId: string; amountMinor: number; allocationId?: string },
  ctx: OpContext,
): OpResult<GoalAllocation> {
  const goal = data.goals.find((g) => g.id === input.goalId)
  if (!goal) return fail([{ path: 'goalId', code: 'notFound' }])
  const allocationId = input.allocationId ?? newId()
  const dup = goal.allocations.find((a) => a.id === allocationId)
  if (dup) return { ok: true, data, value: dup, unchanged: true }
  const amount = input.amountMinor
  if (!Number.isSafeInteger(amount) || amount === 0) return fail([{ path: 'amountMinor', code: 'invalidAmount' }])
  const { savedMinor, remainingMinor } = goalProgress(goal)
  if (amount > 0) {
    if (amount > remainingMinor) return fail([{ path: 'amountMinor', code: 'exceedsRemaining', params: { remainingMinor } }])
    if (goal.fundedFrom === 'budget') {
      const free = Math.max(0, computeBudget(data, ctx.today).availableMinor)
      if (amount > free) return fail([{ path: 'amountMinor', code: 'exceedsFreeMoney', params: { freeMinor: free } }])
    }
  } else if (-amount > savedMinor) {
    return fail([{ path: 'amountMinor', code: 'exceedsSaved', params: { savedMinor } }])
  }
  const allocation: GoalAllocation = { id: allocationId, amountMinor: amount, date: ctx.today, createdAt: ctx.now }
  const updated: Goal = { ...goal, allocations: [...goal.allocations, allocation], updatedAt: ctx.now }
  return { ok: true, data: touch({ ...data, goals: upsert(data.goals, updated) }, ctx.now), value: allocation }
}

/* ------------------------------------------------------------------ */
/* Cuentas y saldo                                                     */
/* ------------------------------------------------------------------ */

export interface SettleOnUpdate {
  scheduleId?: string
  plannedTxId?: string
  occurrenceDate: LocalDate
  amountMinor: number
}

/**
 * Registra un nuevo saldo de referencia. Opcionalmente marca como pagados
 * (ya incluidos en ese saldo) pagos vencidos: se crean con `realizedAt = setAt`
 * para que NO vuelvan a restarse.
 */
export function updateAccountBalance(
  data: AppData,
  input: { accountId: string; amountMinor: number; date: LocalDate; settle?: SettleOnUpdate[] },
  ctx: OpContext,
): OpResult<Account> {
  const account = data.accounts.find((a) => a.id === input.accountId)
  if (!account) return fail([{ path: 'accountId', code: 'notFound' }])
  if (input.date > ctx.today) return fail([{ path: 'date', code: 'realizedInFuture' }])
  const updated: Account = { ...account, anchor: { amountMinor: input.amountMinor, date: input.date, setAt: ctx.now }, updatedAt: ctx.now }
  const issues = validateAccount(updated)
  if (issues.length) return fail(issues)
  let next: AppData = { ...data, accounts: upsert(data.accounts, updated) }
  for (const s of input.settle ?? []) {
    const date = s.occurrenceDate <= input.date ? s.occurrenceDate : input.date
    let r: OpResult<Transaction>
    if (s.scheduleId) {
      r = markOccurrence(next, { scheduleId: s.scheduleId, occurrenceDate: s.occurrenceDate, amountMinor: s.amountMinor, date, accountId: account.id, alreadyInBalance: true }, ctx)
    } else if (s.plannedTxId) {
      r = realizePlanned(next, s.plannedTxId, { date, alreadyInBalance: true }, ctx)
    } else continue
    if (!r.ok) return r
    next = r.data
  }
  return { ok: true, data: touch(next, ctx.now), value: updated }
}

export type AccountDraft = Pick<Account, 'id' | 'name' | 'kind' | 'includeInBudget' | 'card'> & {
  /** Solo al crear. */
  openingBalanceMinor?: number
  openingDate?: LocalDate
}

export function saveAccount(data: AppData, draft: AccountDraft, ctx: OpContext): OpResult<Account> {
  const existing = data.accounts.find((a) => a.id === draft.id)
  const account: Account = {
    id: draft.id,
    name: draft.name.trim(),
    kind: draft.kind,
    includeInBudget: draft.includeInBudget,
    ...(draft.kind === 'credit' && draft.card ? { card: cleanCard(draft.card) } : {}),
    anchor: existing?.anchor ?? { amountMinor: draft.openingBalanceMinor ?? 0, date: draft.openingDate ?? ctx.today, setAt: ctx.now },
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  const issues = validateAccount(account)
  if (issues.length) return fail(issues)
  // Cambiar una cuenta a tarjeta (o al revés) cambiaría el sentido de su saldo: se crea otra cuenta.
  if (existing && existing.kind !== account.kind && (existing.kind === 'credit' || account.kind === 'credit')) {
    return fail([{ path: 'kind', code: 'creditKindChange' }])
  }
  const accounts = upsert(data.accounts, account)
  if (!accounts.some((a) => a.includeInBudget)) return fail([{ path: 'includeInBudget', code: 'lastBudgetAccount' }])
  return { ok: true, data: touch({ ...data, accounts }, ctx.now), value: account }
}

/** Quita campos vacíos de los datos de tarjeta. */
function cleanCard(card: CardDetails): CardDetails {
  const out: CardDetails = {}
  for (const [k, v] of Object.entries(card) as [keyof CardDetails, number | undefined][]) if (v !== undefined) out[k] = v
  return out
}

export function deleteAccount(data: AppData, id: string, ctx: OpContext): OpResult<Account> {
  const account = data.accounts.find((a) => a.id === id)
  if (!account) return fail([{ path: 'id', code: 'notFound' }])
  const used =
    data.transactions.some((t) => t.accountId === id || t.toAccountId === id) || data.schedules.some((s) => s.accountId === id)
  if (used) return fail([{ path: 'id', code: 'accountInUse' }])
  const accounts = data.accounts.filter((a) => a.id !== id)
  if (!accounts.some((a) => a.includeInBudget)) return fail([{ path: 'id', code: 'lastBudgetAccount' }])
  return { ok: true, data: touch({ ...data, accounts }, ctx.now), value: account }
}

/* ------------------------------------------------------------------ */
/* Categorías personalizadas                                           */
/* ------------------------------------------------------------------ */

export type CategoryDraft = Pick<CustomCategory, 'id' | 'name' | 'kind'>

export function saveCategory(data: AppData, draft: CategoryDraft, ctx: OpContext): OpResult<CustomCategory> {
  const existing = data.categories.find((c) => c.id === draft.id)
  // El tipo no cambia después de crearla: los movimientos que la usan dependen de él.
  const category: CustomCategory = {
    id: draft.id,
    name: draft.name.trim(),
    kind: existing?.kind ?? draft.kind,
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  const issues = validateCategory(category, data.categories)
  if (issues.length) return fail(issues)
  return { ok: true, data: touch({ ...data, categories: upsert(data.categories, category) }, ctx.now), value: category }
}

export function setCategoryArchived(data: AppData, id: string, archived: boolean, ctx: OpContext): OpResult<CustomCategory> {
  const category = data.categories.find((c) => c.id === id)
  if (!category) return fail([{ path: 'id', code: 'notFound' }])
  if (category.archived === archived) return { ok: true, data, value: category, unchanged: true }
  const updated = { ...category, archived, updatedAt: ctx.now }
  return { ok: true, data: touch({ ...data, categories: upsert(data.categories, updated) }, ctx.now), value: updated }
}

/** Solo se elimina si ningún movimiento ni programado la usa; si no, se archiva. */
export function deleteCategory(data: AppData, id: string, ctx: OpContext): OpResult<CustomCategory> {
  const category = data.categories.find((c) => c.id === id)
  if (!category) return fail([{ path: 'id', code: 'notFound' }])
  const used = data.transactions.some((t) => t.categoryId === id) || data.schedules.some((s) => s.categoryId === id)
  if (used) return fail([{ path: 'id', code: 'categoryInUse' }])
  return {
    ok: true,
    data: touch({ ...data, categories: data.categories.filter((c) => c.id !== id), categoryLimits: data.categoryLimits.filter((l) => l.categoryId !== id), categoryRules: data.categoryRules.filter((r) => r.categoryId !== id) }, ctx.now),
    value: category,
  }
}

/** Crea o cambia el límite mensual de una categoría de gasto (uno por categoría). */
export function setCategoryLimit(data: AppData, limit: CategoryLimit, ctx: OpContext): OpResult<CategoryLimit> {
  const issues = validateCategoryLimit(limit, data.categories)
  if (issues.length) return fail(issues)
  const others = data.categoryLimits.filter((l) => l.categoryId !== limit.categoryId)
  return { ok: true, data: touch({ ...data, categoryLimits: [...others, limit] }, ctx.now), value: limit }
}

export function removeCategoryLimit(data: AppData, categoryId: string, ctx: OpContext): OpResult<CategoryLimit> {
  const limit = data.categoryLimits.find((l) => l.categoryId === categoryId)
  if (!limit) return fail([{ path: 'categoryId', code: 'notFound' }])
  return { ok: true, data: touch({ ...data, categoryLimits: data.categoryLimits.filter((l) => l.categoryId !== categoryId) }, ctx.now), value: limit }
}

/* ------------------------------------------------------------------ */
/* Reglas de categoría                                                 */
/* ------------------------------------------------------------------ */

export type CategoryRuleDraft = Pick<CategoryRule, 'id' | 'pattern' | 'kind' | 'categoryId'>

export function saveCategoryRule(data: AppData, draft: CategoryRuleDraft, ctx: OpContext): OpResult<CategoryRule> {
  const existing = data.categoryRules.find((r) => r.id === draft.id)
  const rule: CategoryRule = {
    id: draft.id,
    pattern: draft.pattern.replace(/\s+/g, ' ').trim(),
    kind: draft.kind,
    categoryId: draft.categoryId,
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  if (existing && existing.pattern === rule.pattern && existing.kind === rule.kind && existing.categoryId === rule.categoryId) {
    return { ok: true, data, value: existing, unchanged: true }
  }
  const issues = validateCategoryRule(rule, data.categoryRules, data.categories)
  if (issues.length) return fail(issues)
  return { ok: true, data: touch({ ...data, categoryRules: upsert(data.categoryRules, rule) }, ctx.now), value: rule }
}

export function deleteCategoryRule(data: AppData, id: string, ctx: OpContext): OpResult<CategoryRule> {
  const rule = data.categoryRules.find((r) => r.id === id)
  if (!rule) return fail([{ path: 'id', code: 'notFound' }])
  return { ok: true, data: touch({ ...data, categoryRules: data.categoryRules.filter((r) => r.id !== id) }, ctx.now), value: rule }
}

/** Deshacer: vuelve a poner la misma regla (mismo id). */
export function restoreCategoryRule(data: AppData, rule: CategoryRule, ctx: OpContext): OpResult<CategoryRule> {
  if (data.categoryRules.some((r) => r.id === rule.id)) return { ok: true, data, value: rule, unchanged: true }
  return { ok: true, data: touch({ ...data, categoryRules: [...data.categoryRules, rule] }, ctx.now), value: rule }
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

export function updateSettings(data: AppData, patch: Partial<Omit<Settings, 'currency'>>, ctx: OpContext): OpResult<Settings> {
  const settings: Settings = { ...data.settings, ...patch }
  const issues = validateSettings(settings)
  if (issues.length) return fail(issues)
  return { ok: true, data: touch({ ...data, settings }, ctx.now), value: settings }
}

/* ------------------------------------------------------------------ */
/* Configuración inicial                                               */
/* ------------------------------------------------------------------ */

export interface SetupInput {
  currency: string
  timeZone: string
  numberLocale: Settings['numberLocale']
  language: Settings['language']
  accountName: string
  balanceMinor: number
  balanceDate: LocalDate
  income:
    | { name: string; amountMinor: number; date: LocalDate; frequency: Schedule['frequency']; isEstimate: boolean }
    | null
  /** Si no hay ingreso: horizonte en días. */
  fallbackHorizonDays: number | null
  bills: { name: string; amountMinor: number; date: LocalDate; frequency: Schedule['frequency'] }[]
  /** `name` llega traducido desde la interfaz (p. ej. «Reserva de emergencia»). */
  reserve: { amountMinor: number; fundedFrom: Goal['fundedFrom']; name: string } | null
}

export function createInitialData(input: SetupInput, ctx: OpContext): OpResult<AppData> {
  const accountId = newId()
  let data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    budgetId: newId(),
    isDemo: false,
    settings: {
      currency: input.currency,
      numberLocale: input.numberLocale,
      dateStyle: 'medium',
      timeZone: input.timeZone,
      language: input.language,
      fallbackHorizonDays: input.income ? null : input.fallbackHorizonDays,
    },
    accounts: [],
    transactions: [],
    schedules: [],
    goals: [],
    categories: [],
    categoryLimits: [],
    categoryRules: [],
    createdAt: ctx.now,
    updatedAt: ctx.now,
    revision: 0,
  }
  const settingsIssues = validateSettings(data.settings, 'settings.')
  if (settingsIssues.length) return fail(settingsIssues)

  const account: Account = {
    id: accountId,
    name: input.accountName.trim(),
    kind: 'bank',
    includeInBudget: true,
    anchor: { amountMinor: input.balanceMinor, date: input.balanceDate, setAt: ctx.now },
    createdAt: ctx.now,
    updatedAt: ctx.now,
  }
  if (input.balanceDate > ctx.today) return fail([{ path: 'balanceDate', code: 'realizedInFuture' }])
  const accIssues = validateAccount(account)
  if (accIssues.length) return fail(accIssues)
  data = { ...data, accounts: [account] }

  if (input.income) {
    const r = saveSchedule(
      data,
      {
        id: newId(),
        name: input.income.name,
        kind: 'income',
        amountMinor: input.income.amountMinor,
        amountIsEstimate: input.income.isEstimate,
        accountId,
        categoryId: 'salary',
        frequency: input.income.frequency,
        startDate: input.income.date,
        reminderDaysBefore: 0,
      },
      ctx,
    )
    if (!r.ok) return fail(r.issues.map((i) => ({ ...i, path: `income.${i.path}` })))
    data = r.data
  }

  for (const [i, bill] of input.bills.entries()) {
    const r = saveSchedule(
      data,
      {
        id: newId(),
        name: bill.name,
        kind: 'expense',
        amountMinor: bill.amountMinor,
        amountIsEstimate: false,
        accountId,
        categoryId: 'other_expense',
        frequency: bill.frequency,
        startDate: bill.date,
        reminderDaysBefore: 2,
      },
      ctx,
    )
    if (!r.ok) return fail(r.issues.map((x) => ({ ...x, path: `bills[${i}].${x.path}` })))
    data = r.data
  }

  if (input.reserve && input.reserve.amountMinor > 0) {
    const goalId = newId()
    const goal: Goal = {
      id: goalId,
      name: input.reserve.name,
      kind: 'emergency',
      targetMinor: input.reserve.amountMinor,
      currency: input.currency,
      fundedFrom: input.reserve.fundedFrom,
      // La reserva inicial se registra tal cual; si supera el dinero libre, Inicio lo advierte.
      allocations: [{ id: newId(), amountMinor: input.reserve.amountMinor, date: ctx.today, createdAt: ctx.now }],
      createdAt: ctx.now,
      updatedAt: ctx.now,
    }
    const issues = validateGoal(goal, { data })
    if (issues.length) return fail(issues.map((x) => ({ ...x, path: `reserve.${x.path}` })))
    data = { ...data, goals: [goal] }
  }

  return { ok: true, data, value: data }
}

/** Fecha por defecto para un pago real: la de la ocurrencia si ya pasó, si no hoy. */
export function defaultPaymentDate(occurrenceDate: LocalDate, today: LocalDate): LocalDate {
  return occurrenceDate <= today ? occurrenceDate : today
}

/** Primer día disponible para un horizonte elegido (utilidad para la interfaz). */
export function horizonEnd(today: LocalDate, days: number): LocalDate {
  return addDays(today, days)
}
