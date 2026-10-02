/**
 * Bandeja de pendientes (ver docs/FORMULAS.md §24).
 *
 * Los avisos NO se guardan: se calculan cada vez a partir de los datos, con un id estable
 * (el mismo problema produce siempre el mismo id, así nunca aparece dos veces). Solo se
 * guarda lo que decide la persona:
 *  - Posponer hasta una fecha: el aviso vuelve solo; nunca cambia cifras.
 *  - Descartar («está bien así», «son distintos»): se recuerda junto con una huella de los
 *    datos relevantes; si esos datos cambian, el aviso vuelve a aparecer.
 * Resolver el problema (categorizar, registrar el pago, verificar el saldo…) hace que el
 * aviso deje de calcularse.
 */
import { addDays, daysBetween } from './dates'
import { distributionIncomeState } from './incomeDistribution'
import { findSettlement, openItemsUntil, type PlanItem } from './planItems'
import { lastVerified, reconciliationsFor, reconciliationState } from './reconcile'
import { normalizeText } from './rules'
import { cardSummary } from './cards'
import { goalProgress, goalSavedMinor } from './goals'
import type { OpContext, OpResult } from './operations'
import type { AppData, InboxState, LocalDate, Transaction } from './types'

export type InboxKind = 'uncategorized' | 'overdue' | 'duplicate' | 'balance' | 'attention' | 'integrity'

export const INBOX_KINDS: readonly InboxKind[] = ['overdue', 'balance', 'attention', 'duplicate', 'uncategorized', 'integrity']

export type InboxReason =
  | 'otherCategory'
  | 'overdueExpense'
  | 'overdueIncome'
  | 'possibleDuplicate'
  | 'neverVerified'
  | 'verifiedLongAgo'
  | 'verificationNeedsReview'
  | 'reserveForSettledBill'
  | 'distributionIncomeChanged'
  | 'distributionIncomeMissing'
  | 'cardNearLimit'
  | 'cardOverLimit'
  | 'goalPastDue'

export interface InboxItem {
  /** Estable: el mismo problema siempre tiene el mismo id. */
  id: string
  kind: InboxKind
  reason: InboxReason
  /** Datos relevantes: si cambian, un descarte deja de aplicarse. */
  fingerprint: string
  date?: LocalDate
  amountMinor?: number
  txIds?: string[]
  accountId?: string
  goalId?: string
  distributionId?: string
  planItem?: PlanItem
  /** Fechas para explicar el porqué (p. ej. último movimiento vs. última verificación). */
  lastMovementDate?: LocalDate | null
  verifiedDate?: LocalDate | null
  canDismiss: boolean
}

export interface InboxView {
  active: InboxItem[]
  snoozed: (InboxItem & { until: LocalDate })[]
  /** Descartados cuyo motivo sigue igual (se pueden recuperar). */
  dismissed: InboxItem[]
}

/** Cada cuántos días conviene volver a verificar el saldo de una cuenta. */
export const VERIFY_EVERY_DAYS = 30
/** Ventana para posibles duplicados (mismo importe y cuenta). */
export const DUPLICATE_WINDOW_DAYS = 3

const CATCH_ALL = new Set(['other_expense', 'other_income'])

function txKey(t: Transaction): string {
  return [t.kind, t.accountId, t.amountMinor, t.date, normalizeText(t.note ?? '')].join('|')
}

function uncategorized(data: AppData): InboxItem[] {
  return data.transactions
    .filter((t) => t.status === 'realized' && (t.kind === 'expense' || t.kind === 'income') && !t.splits?.length && t.categoryId && CATCH_ALL.has(t.categoryId))
    .map((t) => ({
      id: `cat:${t.id}`,
      kind: 'uncategorized' as const,
      reason: 'otherCategory' as const,
      fingerprint: `${t.categoryId}|${t.amountMinor}|${normalizeText(t.note ?? '')}`,
      date: t.date,
      amountMinor: t.amountMinor,
      txIds: [t.id],
      canDismiss: true,
    }))
}

function overdue(data: AppData, today: LocalDate): InboxItem[] {
  return openItemsUntil(data, today, addDays(today, -1))
    .filter((i) => i.state === 'overdue' && i.direction !== 'transfer')
    .map((i) => ({
      id: `due:${i.key}`,
      kind: 'overdue' as const,
      reason: i.direction === 'income' ? ('overdueIncome' as const) : ('overdueExpense' as const),
      fingerprint: `${i.key}|${i.amountMinor}`,
      date: i.date,
      amountMinor: i.amountMinor,
      planItem: i,
      canDismiss: false,
    }))
}

/**
 * Posibles duplicados: dos movimientos realizados del mismo tipo, cuenta e importe, a
 * ±3 días, cuyas notas coinciden (o alguna falta). Nunca se consideran:
 *  - transferencias (los dos lados son UN registro) ni ajustes de conciliación;
 *  - las líneas de una compra dividida (son el mismo movimiento);
 *  - cobros o pagos de la misma ocurrencia del calendario (parciales deliberados).
 */
export function possibleDuplicates(data: Pick<AppData, 'transactions'>): [Transaction, Transaction][] {
  const groups = new Map<string, Transaction[]>()
  for (const t of data.transactions) {
    if (t.status !== 'realized' || (t.kind !== 'expense' && t.kind !== 'income' && t.kind !== 'refund')) continue
    const key = `${t.kind}|${t.accountId}|${t.amountMinor}`
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  const pairs: [Transaction, Transaction][] = []
  for (const list of groups.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!
        const b = list[j]!
        if (daysBetween(a.date, b.date) > DUPLICATE_WINDOW_DAYS) break
        if (a.scheduleId && a.scheduleId === b.scheduleId) continue
        const na = normalizeText(a.note ?? '')
        const nb = normalizeText(b.note ?? '')
        if (na && nb && na !== nb) continue
        pairs.push(a.id < b.id ? [a, b] : [b, a])
      }
    }
  }
  return pairs
}

function duplicates(data: AppData): InboxItem[] {
  return possibleDuplicates(data).map(([a, b]) => ({
    id: `dup:${a.id}:${b.id}`,
    kind: 'duplicate' as const,
    reason: 'possibleDuplicate' as const,
    fingerprint: `${txKey(a)}~${txKey(b)}`,
    date: a.date > b.date ? a.date : b.date,
    amountMinor: a.amountMinor,
    txIds: [a.id, b.id],
    accountId: a.accountId,
    canDismiss: true,
  }))
}

function balances(data: AppData, today: LocalDate): InboxItem[] {
  const items: InboxItem[] = []
  for (const account of data.accounts.filter((a) => a.includeInBudget || a.kind === 'credit')) {
    const lastMovementDate = data.transactions
      .filter((t) => t.status === 'realized' && (t.accountId === account.id || t.toAccountId === account.id))
      .reduce<LocalDate | null>((max, t) => (max === null || t.date > max ? t.date : max), null)
    const latest = reconciliationsFor(data, account.id)[0]
    const verified = lastVerified(data, account.id)
    const base = { kind: 'balance' as const, accountId: account.id, lastMovementDate, verifiedDate: verified?.date ?? null, canDismiss: false }
    if (latest && (reconciliationState(data, latest) === 'needsReview' || (latest.resolution === 'unresolved' && reconciliationState(data, latest) === 'ok'))) {
      items.push({ ...base, id: `bal:${account.id}:review`, reason: 'verificationNeedsReview', fingerprint: `${latest.id}|${latest.fingerprint}`, date: latest.date })
    } else if (!verified) {
      items.push({ ...base, id: `bal:${account.id}:never`, reason: 'neverVerified', fingerprint: 'none' })
    } else if (daysBetween(verified.date, today) > VERIFY_EVERY_DAYS) {
      items.push({ ...base, id: `bal:${account.id}:old`, reason: 'verifiedLongAgo', fingerprint: verified.id, date: verified.date })
    }
  }
  return items
}

/** Uso de la tarjeta a partir del cual se avisa (90 %), comparado con enteros. */
export const CARD_NEAR_LIMIT_PERCENT = 90

/**
 * Atención: tarjetas cerca o por encima del límite y metas cuya fecha pasó sin
 * completarse. Un aviso «cerca del límite» descartado vuelve si se supera el límite.
 */
function attention(data: AppData, today: LocalDate): InboxItem[] {
  const items: InboxItem[] = []
  for (const account of data.accounts.filter((a) => a.kind === 'credit')) {
    const c = cardSummary(data, account, today)
    if (c.limitMinor === null || c.limitMinor <= 0) continue
    const base = { kind: 'attention' as const, accountId: account.id, amountMinor: c.debtMinor }
    if (c.overLimit) {
      items.push({ ...base, id: `card:${account.id}:over`, reason: 'cardOverLimit', fingerprint: 'over', canDismiss: false })
    } else if (c.debtMinor * 100 >= c.limitMinor * CARD_NEAR_LIMIT_PERCENT) {
      items.push({ ...base, id: `card:${account.id}:near`, reason: 'cardNearLimit', fingerprint: `near|${c.limitMinor}`, canDismiss: true })
    }
  }
  for (const g of data.goals) {
    // Los gastos planificados tienen su propio aviso de vencido en Metas.
    if (g.kind === 'expense' || !g.targetDate || g.targetDate >= today) continue
    const remaining = goalProgress(g).remainingMinor
    if (remaining <= 0) continue
    items.push({
      id: `goal:${g.id}:${g.targetDate}`,
      kind: 'attention',
      reason: 'goalPastDue',
      fingerprint: `${g.targetDate}|${g.targetMinor}`,
      date: g.targetDate,
      amountMinor: remaining,
      goalId: g.id,
      canDismiss: true,
    })
  }
  return items
}

function integrity(data: AppData): InboxItem[] {
  const items: InboxItem[] = []
  // Un gasto planificado vinculado a un pago que ya se registró sigue con dinero apartado:
  // ese dinero se estaría descontando dos veces (por el pago y por la reserva).
  for (const g of data.goals) {
    const link = g.kind === 'expense' && !g.plan?.paidAt ? g.plan?.link : undefined
    if (!link || g.fundedFrom !== 'budget') continue
    const saved = goalSavedMinor(g)
    const settled = findSettlement(data, link.scheduleId, link.occurrenceDate)
    if (settled && saved > 0) {
      items.push({
        id: `int:goal:${g.id}:${link.occurrenceDate}`,
        kind: 'integrity',
        reason: 'reserveForSettledBill',
        fingerprint: `${settled.id}|${saved}`,
        date: link.occurrenceDate,
        amountMinor: saved,
        goalId: g.id,
        txIds: [settled.id],
        canDismiss: false,
      })
    }
  }
  for (const d of data.incomeDistributions) {
    if (d.undoneAt) continue
    const state = distributionIncomeState(data, d)
    if (state.status === 'ok') continue
    items.push({
      id: `int:dist:${d.id}`,
      kind: 'integrity',
      reason: state.status === 'missing' ? 'distributionIncomeMissing' : 'distributionIncomeChanged',
      fingerprint: state.fingerprint,
      amountMinor: d.incomeAmountMinor,
      distributionId: d.id,
      txIds: [d.incomeTxId],
      canDismiss: true,
    })
  }
  return items
}

/** Todos los pendientes calculados (sin aplicar posponer/descartar). */
export function computeInbox(data: AppData, today: LocalDate): InboxItem[] {
  return [...overdue(data, today), ...balances(data, today), ...attention(data, today), ...duplicates(data), ...uncategorized(data), ...integrity(data)]
}

export function inboxView(data: AppData, today: LocalDate): InboxView {
  const snoozedUntil = new Map(data.inbox.snoozed.map((s) => [s.id, s.until]))
  const dismissedAt = new Map(data.inbox.dismissed.map((d) => [d.id, d.fingerprint]))
  const view: InboxView = { active: [], snoozed: [], dismissed: [] }
  for (const item of computeInbox(data, today)) {
    if (item.canDismiss && dismissedAt.get(item.id) === item.fingerprint) view.dismissed.push(item)
    else {
      const until = snoozedUntil.get(item.id)
      if (until && until > today) view.snoozed.push({ ...item, until })
      else view.active.push(item)
    }
  }
  return view
}

/* ------------------------------------------------------------------ */
/* Decisiones de la persona (solo cambian `inbox`, nunca cifras)        */
/* ------------------------------------------------------------------ */

const touchInbox = (data: AppData, inbox: InboxState, now: string): AppData => ({ ...data, inbox, updatedAt: now })

/** Pospone hasta `until` (fecha futura). Al llegar esa fecha el aviso vuelve si sigue el problema. */
export function snoozeInboxItem(data: AppData, id: string, until: LocalDate, ctx: OpContext): OpResult<null> {
  if (until <= ctx.today) return { ok: false, issues: [{ path: 'until', code: 'dateInPast' }] }
  const snoozed = [...data.inbox.snoozed.filter((s) => s.id !== id && s.until > ctx.today), { id, until, at: ctx.now }]
  return { ok: true, data: touchInbox(data, { ...data.inbox, snoozed }, ctx.now), value: null }
}

export function unsnoozeInboxItem(data: AppData, id: string, ctx: OpContext): OpResult<null> {
  if (!data.inbox.snoozed.some((s) => s.id === id)) return { ok: true, data, value: null, unchanged: true }
  return { ok: true, data: touchInbox(data, { ...data.inbox, snoozed: data.inbox.snoozed.filter((s) => s.id !== id) }, ctx.now), value: null }
}

/** «Está bien así» / «Son distintos»: se recuerda mientras los datos relevantes no cambien. */
export function dismissInboxItem(data: AppData, item: Pick<InboxItem, 'id' | 'fingerprint' | 'canDismiss'>, ctx: OpContext): OpResult<null> {
  if (!item.canDismiss) return { ok: false, issues: [{ path: 'id', code: 'invalidValue' }] }
  const dismissed = [...data.inbox.dismissed.filter((d) => d.id !== item.id), { id: item.id, fingerprint: item.fingerprint, at: ctx.now }]
  return { ok: true, data: touchInbox(data, { ...data.inbox, dismissed }, ctx.now), value: null }
}

export function undismissInboxItem(data: AppData, id: string, ctx: OpContext): OpResult<null> {
  if (!data.inbox.dismissed.some((d) => d.id === id)) return { ok: true, data, value: null, unchanged: true }
  return { ok: true, data: touchInbox(data, { ...data.inbox, dismissed: data.inbox.dismissed.filter((d) => d.id !== id) }, ctx.now), value: null }
}
