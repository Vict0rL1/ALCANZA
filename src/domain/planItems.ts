/**
 * "Elementos del plan": todo lo que se espera que ocurra y aún no ocurrió.
 *
 * Proceden de dos fuentes:
 *  - Ocurrencias de pagos/ingresos programados (Schedule).
 *  - Movimientos con estado "previsto".
 *
 * Una ocurrencia programada está PAGADA si existe un movimiento realizado con
 * el mismo `scheduleId` y `occurrenceDate`. Así se evita descontarla dos veces:
 * o cuenta como reserva pendiente, o cuenta como movimiento realizado, nunca ambas.
 */
import { addDays } from './dates'
import { txEffectOnBudgetPool } from './balances'
import { occurrencesBetween } from './recurrence'
import type { Account, AppData, IncomeRange, IncomeScenario, LocalDate, Schedule, Transaction } from './types'

export type PlanItemState = 'pending' | 'overdue' | 'paid' | 'skipped'
export type PlanItemSource = 'schedule' | 'planned'

export interface PlanItem {
  /** Clave estable: 'schedule:<id>:<fecha>' o 'planned:<id>'. */
  key: string
  source: PlanItemSource
  sourceId: string
  /** income: entra dinero; expense: sale dinero; transfer: entre cuentas. */
  direction: 'income' | 'expense' | 'transfer'
  name: string
  date: LocalDate
  amountMinor: number
  isEstimate: boolean
  accountId: string
  toAccountId?: string
  categoryId?: string
  state: PlanItemState
  /** Movimiento que liquidó la ocurrencia (si está pagada). */
  settledByTxId?: string
  /** Cobros o pagos parciales ya registrados (la ocurrencia sigue abierta por el resto). */
  partialTxIds?: string[]
  /** Suma ya recibida o pagada para esta ocurrencia. */
  receivedMinor?: number
  /** Ingresos variables: rango y esperado (el `amountMinor` depende del escenario). */
  range?: IncomeRange
  expectedMinor?: number
  /** Efecto con signo sobre las cuentas del presupuesto. */
  budgetEffectMinor: number
  reminderDaysBefore: number
}

/** Liquidaciones de una ocurrencia: como mucho una final y cualquier número de parciales. */
export interface OccurrenceSettlement {
  /** Movimiento que cierra la ocurrencia (no parcial). */
  final?: Transaction
  /** Cobros o pagos parciales: todavía se espera el resto. */
  partials: Transaction[]
  /** Suma de lo ya recibido o pagado (parciales + final). */
  settledMinor: number
}

export function settlementIndex(transactions: Transaction[]): Map<string, OccurrenceSettlement> {
  const index = new Map<string, OccurrenceSettlement>()
  for (const tx of transactions) {
    if (tx.status !== 'realized' || !tx.scheduleId || !tx.occurrenceDate) continue
    const key = `${tx.scheduleId}:${tx.occurrenceDate}`
    const entry = index.get(key) ?? { partials: [], settledMinor: 0 }
    if (tx.partialSettlement) entry.partials.push(tx)
    else entry.final = tx
    entry.settledMinor += tx.amountMinor
    index.set(key, entry)
  }
  return index
}

/** Movimiento que CIERRA la ocurrencia (los parciales no la cierran). */
export function findSettlement(data: Pick<AppData, 'transactions'>, scheduleId: string, occurrenceDate: LocalDate): Transaction | undefined {
  return data.transactions.find(
    (tx) => tx.status === 'realized' && tx.scheduleId === scheduleId && tx.occurrenceDate === occurrenceDate && !tx.partialSettlement,
  )
}

/** Importe de un pago o ingreso programado según el escenario (solo cambia en ingresos con rango). */
export function scheduleAmountFor(schedule: Schedule, scenario: IncomeScenario = 'expected'): number {
  if (schedule.kind !== 'income' || !schedule.range || scenario === 'expected') return schedule.amountMinor
  return scenario === 'min' ? schedule.range.minMinor : schedule.range.extraMinor
}

function scheduleItem(
  schedule: Schedule,
  date: LocalDate,
  today: LocalDate,
  settlement: OccurrenceSettlement | undefined,
  accounts: Account[],
  scenario: IncomeScenario,
): PlanItem {
  let state: PlanItemState
  if (settlement?.final) state = 'paid'
  else if (schedule.skippedDates.includes(date)) state = 'skipped'
  else if (date < today) state = 'overdue'
  else state = 'pending'
  // Con cobros parciales solo queda por llegar la diferencia (nunca negativa).
  const settledMinor = settlement?.settledMinor ?? 0
  const expectedMinor = scheduleAmountFor(schedule, scenario)
  const amountMinor = state === 'paid' ? settledMinor : Math.max(0, expectedMinor - settledMinor)
  return {
    key: `schedule:${schedule.id}:${date}`,
    source: 'schedule',
    sourceId: schedule.id,
    direction: schedule.kind,
    name: schedule.name,
    date,
    amountMinor,
    isEstimate: schedule.amountIsEstimate || !!schedule.range,
    accountId: schedule.accountId,
    categoryId: schedule.categoryId,
    state,
    settledByTxId: settlement?.final?.id,
    partialTxIds: settlement?.partials.map((t) => t.id) ?? [],
    receivedMinor: settledMinor,
    ...(schedule.kind === 'income' && schedule.range ? { range: schedule.range, expectedMinor: schedule.amountMinor } : {}),
    budgetEffectMinor: txEffectOnBudgetPool({ kind: schedule.kind, amountMinor, accountId: schedule.accountId }, accounts),
    reminderDaysBefore: schedule.reminderDaysBefore,
  }
}

function plannedItem(tx: Transaction, today: LocalDate, accounts: Account[]): PlanItem {
  const direction = tx.kind === 'transfer' ? 'transfer' : tx.kind === 'expense' ? 'expense' : 'income'
  return {
    key: `planned:${tx.id}`,
    source: 'planned',
    sourceId: tx.id,
    direction,
    name: tx.note || '',
    date: tx.date,
    amountMinor: tx.amountMinor,
    isEstimate: false,
    accountId: tx.accountId,
    toAccountId: tx.toAccountId,
    categoryId: tx.categoryId,
    state: tx.date < today ? 'overdue' : 'pending',
    budgetEffectMinor: txEffectOnBudgetPool(tx, accounts),
    reminderDaysBefore: 1,
  }
}

export interface PlanItemsQuery {
  today: LocalDate
  from: LocalDate
  to: LocalDate
  /** Incluir vencidos (anteriores a `from`) sin pagar ni omitir. */
  includeOverdueBefore?: boolean
  /** Escenario de los ingresos variables (por defecto, el esperado). */
  scenario?: IncomeScenario
}

/**
 * Elementos del plan en el rango [from, to], ordenados por fecha.
 * Si `includeOverdueBefore` es verdadero, añade también todos los vencidos anteriores a `from`.
 */
export function planItems(data: AppData, query: PlanItemsQuery): PlanItem[] {
  const { today, from, to } = query
  const settlements = settlementIndex(data.transactions)
  const items: PlanItem[] = []

  for (const schedule of data.schedules) {
    const rangeFrom = query.includeOverdueBefore ? schedule.startDate : from
    for (const date of occurrencesBetween(schedule, rangeFrom < from ? rangeFrom : from, to)) {
      const item = scheduleItem(schedule, date, today, settlements.get(`${schedule.id}:${date}`), data.accounts, query.scenario ?? 'expected')
      if (date < from && item.state !== 'overdue') continue
      items.push(item)
    }
  }

  for (const tx of data.transactions) {
    if (tx.status !== 'planned') continue
    const inRange = tx.date >= from && tx.date <= to
    const overdueBefore = query.includeOverdueBefore && tx.date < from && tx.date < today
    if (inRange || overdueBefore) items.push(plannedItem(tx, today, data.accounts))
  }

  return items.sort((a, b) => (a.date === b.date ? a.name.localeCompare(b.name) : a.date < b.date ? -1 : 1))
}

/** Pendientes y vencidos (sin pagar ni omitir) desde siempre hasta `to`. */
export function openItemsUntil(data: AppData, today: LocalDate, to: LocalDate, scenario: IncomeScenario = 'expected'): PlanItem[] {
  return planItems(data, { today, from: today, to, includeOverdueBefore: true, scenario }).filter(
    (i) => i.state === 'pending' || i.state === 'overdue',
  )
}

/** Recordatorios dentro de la app: vencidos + los que vencen dentro de su margen de aviso. */
export function reminders(data: AppData, today: LocalDate): PlanItem[] {
  return openItemsUntil(data, today, addDays(today, 7)).filter((i) => {
    if (i.state === 'overdue') return true
    return i.date <= addDays(today, i.reminderDaysBefore)
  })
}
