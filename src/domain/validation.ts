/**
 * Validación de registros. Se usa al guardar desde formularios y al importar
 * copias de seguridad (datos no confiables). Los mensajes visibles se buscan
 * en i18n con la clave `issue.<code>`.
 */
import { categoriesForKind } from './categories'
import { isValidLocalDate, isValidTimeZone, isValidTimestamp } from './dates'
import { isValidId } from './ids'
import { MAX_AMOUNT_MINOR, isMinorAmount, isSupportedCurrency, sumMinor } from './money'
import type { Account, AppData, CategoryLimit, CustomCategory, Goal, Schedule, Settings, Transaction } from './types'

export type IssueCode =
  | 'required'
  | 'invalidId'
  | 'duplicateId'
  | 'invalidValue'
  | 'invalidDate'
  | 'invalidTimestamp'
  | 'invalidAmount'
  | 'amountNotPositive'
  | 'amountTooLarge'
  | 'currencyMismatch'
  | 'unsupportedCurrency'
  | 'unknownAccount'
  | 'sameAccount'
  | 'invalidCategory'
  | 'realizedInFuture'
  | 'refundTargetInvalid'
  | 'refundExceeds'
  | 'textTooLong'
  | 'endBeforeStart'
  | 'invalidTimeZone'
  | 'exceedsFreeMoney'
  | 'exceedsRemaining'
  | 'exceedsSaved'
  | 'accountInUse'
  | 'lastBudgetAccount'
  | 'creditKindChange'
  | 'duplicateName'
  | 'categoryInUse'
  | 'notFound'

export interface Issue {
  /** Campo afectado, por ejemplo 'amountMinor' o 'transactions[3].date'. */
  path: string
  code: IssueCode
  params?: Record<string, string | number>
}

export const LIMITS = {
  nameMax: 60,
  noteMax: 200,
  reminderMaxDays: 30,
  horizonMaxDays: 90,
} as const

export const TX_KINDS = ['income', 'expense', 'transfer', 'refund'] as const
export const TX_STATUSES = ['planned', 'realized'] as const
export const ACCOUNT_KINDS = ['bank', 'cash', 'savings', 'credit', 'other'] as const
export const FREQUENCIES = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'] as const
export const NUMBER_LOCALES = ['es-MX', 'es-ES', 'en-CA', 'fr-CA'] as const
export const DATE_STYLES = ['short', 'medium', 'iso'] as const
export const LANGUAGES = ['es', 'en'] as const

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

function checkName(value: unknown, path: string, issues: Issue[], max: number = LIMITS.nameMax) {
  if (typeof value !== 'string' || value.trim() === '') issues.push({ path, code: 'required' })
  else if (value.length > max) issues.push({ path, code: 'textTooLong', params: { max } })
}

function checkOptionalText(value: unknown, path: string, issues: Issue[], max: number = LIMITS.noteMax) {
  if (value === undefined) return
  if (typeof value !== 'string') issues.push({ path, code: 'invalidValue' })
  else if (value.length > max) issues.push({ path, code: 'textTooLong', params: { max } })
}

function checkPositiveAmount(value: unknown, path: string, issues: Issue[]) {
  if (!isMinorAmount(value)) issues.push({ path, code: 'invalidAmount' })
  else if (value <= 0) issues.push({ path, code: 'amountNotPositive' })
  else if (value > MAX_AMOUNT_MINOR) issues.push({ path, code: 'amountTooLarge' })
}

function checkDate(value: unknown, path: string, issues: Issue[]) {
  if (!isValidLocalDate(value)) issues.push({ path, code: 'invalidDate' })
}

function checkTimestamps(value: { createdAt?: unknown; updatedAt?: unknown }, prefix: string, issues: Issue[]) {
  if (!isValidTimestamp(value.createdAt)) issues.push({ path: `${prefix}createdAt`, code: 'invalidTimestamp' })
  if (!isValidTimestamp(value.updatedAt)) issues.push({ path: `${prefix}updatedAt`, code: 'invalidTimestamp' })
}

export interface ValidationContext {
  data: Pick<AppData, 'accounts' | 'transactions' | 'settings'> & { categories?: CustomCategory[] }
  /** Si se indica, un movimiento realizado no puede tener fecha posterior. */
  today?: string
  prefix?: string
}

export function validateSettings(s: Settings, prefix = ''): Issue[] {
  const issues: Issue[] = []
  if (!isSupportedCurrency(s.currency as string)) issues.push({ path: `${prefix}currency`, code: 'unsupportedCurrency' })
  if (!isOneOf(NUMBER_LOCALES, s.numberLocale)) issues.push({ path: `${prefix}numberLocale`, code: 'invalidValue' })
  if (!isOneOf(DATE_STYLES, s.dateStyle)) issues.push({ path: `${prefix}dateStyle`, code: 'invalidValue' })
  if (!isValidTimeZone(s.timeZone)) issues.push({ path: `${prefix}timeZone`, code: 'invalidTimeZone' })
  if (!isOneOf(LANGUAGES, s.language)) issues.push({ path: `${prefix}language`, code: 'invalidValue' })
  const h = s.fallbackHorizonDays
  if (h !== null && !(Number.isInteger(h) && h >= 1 && h <= LIMITS.horizonMaxDays)) {
    issues.push({ path: `${prefix}fallbackHorizonDays`, code: 'invalidValue' })
  }
  return issues
}

export function validateAccount(a: Account, prefix = ''): Issue[] {
  const issues: Issue[] = []
  if (!isValidId(a.id)) issues.push({ path: `${prefix}id`, code: 'invalidId' })
  checkName(a.name, `${prefix}name`, issues, 40)
  if (!isOneOf(ACCOUNT_KINDS, a.kind)) issues.push({ path: `${prefix}kind`, code: 'invalidValue' })
  if (typeof a.includeInBudget !== 'boolean') issues.push({ path: `${prefix}includeInBudget`, code: 'invalidValue' })
  if (!a.anchor || typeof a.anchor !== 'object') {
    issues.push({ path: `${prefix}anchor`, code: 'required' })
  } else {
    if (!isMinorAmount(a.anchor.amountMinor)) issues.push({ path: `${prefix}anchor.amountMinor`, code: 'invalidAmount' })
    else if (Math.abs(a.anchor.amountMinor) > MAX_AMOUNT_MINOR) issues.push({ path: `${prefix}anchor.amountMinor`, code: 'amountTooLarge' })
    checkDate(a.anchor.date, `${prefix}anchor.date`, issues)
    if (!isValidTimestamp(a.anchor.setAt)) issues.push({ path: `${prefix}anchor.setAt`, code: 'invalidTimestamp' })
  }
  if (a.card !== undefined) {
    const c = a.card
    if (!c || typeof c !== 'object' || a.kind !== 'credit') {
      issues.push({ path: `${prefix}card`, code: 'invalidValue' })
    } else {
      if (c.limitMinor !== undefined) checkPositiveAmount(c.limitMinor, `${prefix}card.limitMinor`, issues)
      const intIn = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max
      if (c.aprBps !== undefined && !intIn(c.aprBps, 0, 10000)) issues.push({ path: `${prefix}card.aprBps`, code: 'invalidValue' })
      if (c.minPaymentBps !== undefined && !intIn(c.minPaymentBps, 0, 10000)) issues.push({ path: `${prefix}card.minPaymentBps`, code: 'invalidValue' })
      if (c.statementDay !== undefined && !intIn(c.statementDay, 1, 31)) issues.push({ path: `${prefix}card.statementDay`, code: 'invalidValue' })
      if (c.dueDay !== undefined && !intIn(c.dueDay, 1, 31)) issues.push({ path: `${prefix}card.dueDay`, code: 'invalidValue' })
      if (c.minPaymentFloorMinor !== undefined && !(isMinorAmount(c.minPaymentFloorMinor) && c.minPaymentFloorMinor >= 0 && c.minPaymentFloorMinor <= MAX_AMOUNT_MINOR)) {
        issues.push({ path: `${prefix}card.minPaymentFloorMinor`, code: 'invalidAmount' })
      }
    }
  }
  checkTimestamps(a, prefix, issues)
  return issues
}

export function validateCategory(c: CustomCategory, all: readonly CustomCategory[], prefix = ''): Issue[] {
  const issues: Issue[] = []
  if (!isValidId(c.id) || !c.id.startsWith('c_')) issues.push({ path: `${prefix}id`, code: 'invalidId' })
  checkName(c.name, `${prefix}name`, issues, 40)
  if (c.kind !== 'expense' && c.kind !== 'income') issues.push({ path: `${prefix}kind`, code: 'invalidValue' })
  if (typeof c.archived !== 'boolean') issues.push({ path: `${prefix}archived`, code: 'invalidValue' })
  if (typeof c.name === 'string') {
    const norm = c.name.trim().toLocaleLowerCase()
    if (all.some((o) => o.id !== c.id && o.kind === c.kind && o.name.trim().toLocaleLowerCase() === norm)) {
      issues.push({ path: `${prefix}name`, code: 'duplicateName' })
    }
  }
  checkTimestamps(c, prefix, issues)
  return issues
}

export function validateCategoryLimit(l: CategoryLimit, custom: readonly CustomCategory[], prefix = ''): Issue[] {
  const issues: Issue[] = []
  if (typeof l.categoryId !== 'string' || !categoriesForKind('expense', custom, { includeArchived: true }).includes(l.categoryId)) {
    issues.push({ path: `${prefix}categoryId`, code: 'invalidCategory' })
  }
  checkPositiveAmount(l.monthlyLimitMinor, `${prefix}monthlyLimitMinor`, issues)
  return issues
}

export function validateTransaction(tx: Transaction, ctx: ValidationContext): Issue[] {
  const p = ctx.prefix ?? ''
  const issues: Issue[] = []
  const { data } = ctx
  if (!isValidId(tx.id)) issues.push({ path: `${p}id`, code: 'invalidId' })
  if (!isOneOf(TX_KINDS, tx.kind)) issues.push({ path: `${p}kind`, code: 'invalidValue' })
  if (!isOneOf(TX_STATUSES, tx.status)) issues.push({ path: `${p}status`, code: 'invalidValue' })
  checkPositiveAmount(tx.amountMinor, `${p}amountMinor`, issues)
  if (tx.currency !== data.settings.currency) {
    issues.push({ path: `${p}currency`, code: 'currencyMismatch', params: { expected: data.settings.currency } })
  }
  checkDate(tx.date, `${p}date`, issues)
  if (!data.accounts.some((a) => a.id === tx.accountId)) issues.push({ path: `${p}accountId`, code: 'unknownAccount' })

  if (tx.kind === 'transfer') {
    if (!tx.toAccountId || !data.accounts.some((a) => a.id === tx.toAccountId)) {
      issues.push({ path: `${p}toAccountId`, code: 'unknownAccount' })
    } else if (tx.toAccountId === tx.accountId) {
      issues.push({ path: `${p}toAccountId`, code: 'sameAccount' })
    }
    if (tx.categoryId !== undefined) issues.push({ path: `${p}categoryId`, code: 'invalidCategory' })
  } else if (isOneOf(TX_KINDS, tx.kind)) {
    if (tx.toAccountId !== undefined) issues.push({ path: `${p}toAccountId`, code: 'invalidValue' })
    if (!tx.categoryId || !categoriesForKind(tx.kind, ctx.data.categories, { includeArchived: true }).includes(tx.categoryId)) {
      issues.push({ path: `${p}categoryId`, code: 'invalidCategory' })
    }
  }

  if (tx.status === 'realized' && ctx.today && isValidLocalDate(tx.date) && tx.date > ctx.today) {
    issues.push({ path: `${p}date`, code: 'realizedInFuture' })
  }

  if (tx.refundOfId !== undefined) {
    const original = data.transactions.find((t) => t.id === tx.refundOfId)
    if (tx.kind !== 'refund' || !original || original.kind !== 'expense' || original.id === tx.id) {
      issues.push({ path: `${p}refundOfId`, code: 'refundTargetInvalid' })
    } else if (isMinorAmount(tx.amountMinor)) {
      const otherRefunds = sumMinor(
        data.transactions
          .filter((t) => t.kind === 'refund' && t.refundOfId === original.id && t.id !== tx.id)
          .map((t) => t.amountMinor),
      )
      const remaining = original.amountMinor - otherRefunds
      if (tx.amountMinor > remaining) {
        issues.push({ path: `${p}amountMinor`, code: 'refundExceeds', params: { remainingMinor: Math.max(0, remaining) } })
      }
    }
  }

  if ((tx.scheduleId === undefined) !== (tx.occurrenceDate === undefined)) {
    issues.push({ path: `${p}occurrenceDate`, code: 'invalidValue' })
  }
  if (tx.scheduleId !== undefined && !isValidId(tx.scheduleId)) issues.push({ path: `${p}scheduleId`, code: 'invalidId' })
  if (tx.occurrenceDate !== undefined) checkDate(tx.occurrenceDate, `${p}occurrenceDate`, issues)
  if (tx.realizedAt !== undefined && !isValidTimestamp(tx.realizedAt)) issues.push({ path: `${p}realizedAt`, code: 'invalidTimestamp' })
  checkOptionalText(tx.note, `${p}note`, issues)
  checkOptionalText(tx.importRef, `${p}importRef`, issues, 200)
  checkTimestamps(tx, p, issues)
  return issues
}

export function validateSchedule(s: Schedule, ctx: ValidationContext): Issue[] {
  const p = ctx.prefix ?? ''
  const issues: Issue[] = []
  if (!isValidId(s.id)) issues.push({ path: `${p}id`, code: 'invalidId' })
  checkName(s.name, `${p}name`, issues)
  if (s.kind !== 'income' && s.kind !== 'expense') issues.push({ path: `${p}kind`, code: 'invalidValue' })
  checkPositiveAmount(s.amountMinor, `${p}amountMinor`, issues)
  if (typeof s.amountIsEstimate !== 'boolean') issues.push({ path: `${p}amountIsEstimate`, code: 'invalidValue' })
  if (s.currency !== ctx.data.settings.currency) {
    issues.push({ path: `${p}currency`, code: 'currencyMismatch', params: { expected: ctx.data.settings.currency } })
  }
  if (!ctx.data.accounts.some((a) => a.id === s.accountId)) issues.push({ path: `${p}accountId`, code: 'unknownAccount' })
  if (s.kind === 'income' || s.kind === 'expense') {
    if (!s.categoryId || !categoriesForKind(s.kind, ctx.data.categories, { includeArchived: true }).includes(s.categoryId)) issues.push({ path: `${p}categoryId`, code: 'invalidCategory' })
  }
  if (!isOneOf(FREQUENCIES, s.frequency)) issues.push({ path: `${p}frequency`, code: 'invalidValue' })
  checkDate(s.startDate, `${p}startDate`, issues)
  if (s.endDate !== undefined) {
    checkDate(s.endDate, `${p}endDate`, issues)
    if (isValidLocalDate(s.endDate) && isValidLocalDate(s.startDate) && s.endDate < s.startDate) {
      issues.push({ path: `${p}endDate`, code: 'endBeforeStart' })
    }
  }
  if (!Number.isInteger(s.reminderDaysBefore) || s.reminderDaysBefore < 0 || s.reminderDaysBefore > LIMITS.reminderMaxDays) {
    issues.push({ path: `${p}reminderDaysBefore`, code: 'invalidValue' })
  }
  if (!Array.isArray(s.skippedDates) || !s.skippedDates.every(isValidLocalDate)) {
    issues.push({ path: `${p}skippedDates`, code: 'invalidDate' })
  }
  checkOptionalText(s.note, `${p}note`, issues)
  checkTimestamps(s, p, issues)
  return issues
}

export function validateGoal(g: Goal, ctx: Pick<ValidationContext, 'data' | 'prefix'>): Issue[] {
  const p = ctx.prefix ?? ''
  const issues: Issue[] = []
  if (!isValidId(g.id)) issues.push({ path: `${p}id`, code: 'invalidId' })
  checkName(g.name, `${p}name`, issues)
  if (g.kind !== 'goal' && g.kind !== 'emergency') issues.push({ path: `${p}kind`, code: 'invalidValue' })
  checkPositiveAmount(g.targetMinor, `${p}targetMinor`, issues)
  if (g.targetDate !== undefined) checkDate(g.targetDate, `${p}targetDate`, issues)
  if (g.currency !== ctx.data.settings.currency) {
    issues.push({ path: `${p}currency`, code: 'currencyMismatch', params: { expected: ctx.data.settings.currency } })
  }
  if (g.fundedFrom !== 'budget' && g.fundedFrom !== 'external') issues.push({ path: `${p}fundedFrom`, code: 'invalidValue' })
  if (!Array.isArray(g.allocations)) {
    issues.push({ path: `${p}allocations`, code: 'invalidValue' })
  } else {
    const ids = new Set<string>()
    g.allocations.forEach((a, i) => {
      const ap = `${p}allocations[${i}].`
      if (!a || typeof a !== 'object') {
        issues.push({ path: `${p}allocations[${i}]`, code: 'invalidValue' })
        return
      }
      if (!isValidId(a.id)) issues.push({ path: `${ap}id`, code: 'invalidId' })
      else if (ids.has(a.id)) issues.push({ path: `${ap}id`, code: 'duplicateId' })
      else ids.add(a.id)
      if (!isMinorAmount(a.amountMinor) || a.amountMinor === 0) issues.push({ path: `${ap}amountMinor`, code: 'invalidAmount' })
      else if (Math.abs(a.amountMinor) > MAX_AMOUNT_MINOR) issues.push({ path: `${ap}amountMinor`, code: 'amountTooLarge' })
      checkDate(a.date, `${ap}date`, issues)
      if (!isValidTimestamp(a.createdAt)) issues.push({ path: `${ap}createdAt`, code: 'invalidTimestamp' })
    })
    if (issues.length === 0) {
      const saved = sumMinor(g.allocations.map((a) => a.amountMinor))
      if (saved < 0) issues.push({ path: `${p}allocations`, code: 'exceedsSaved' })
    }
  }
  checkTimestamps(g, p, issues)
  return issues
}
