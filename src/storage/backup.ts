/**
 * Copias de seguridad: exportación a JSON e importación validada.
 *
 * Una importación NUNCA se aplica a medias: o todo el archivo es válido, o no
 * se cambia nada. Se copian solo los campos conocidos (se descarta lo demás).
 */
import { isValidId } from '../domain/ids'
import type { Account, AppData, CategoryLimit, CustomCategory, Goal, GoalAllocation, Schedule, Settings, Transaction } from '../domain/types'
import { SCHEMA_VERSION } from '../domain/types'
import {
  validateAccount,
  validateCategory,
  validateCategoryLimit,
  validateGoal,
  validateSchedule,
  validateSettings,
  validateTransaction,
  type Issue,
} from '../domain/validation'
import { migrate } from './migrations'

export const BACKUP_FORMAT = 'margen-backup'
export const BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export const MAX_RECORDS = 50_000

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  exportedAt: string
  app: 'Margen'
  appVersion: string
  data: AppData
}

export type BackupIssueCode = 'invalidJson' | 'notABackup' | 'schemaTooNew' | 'tooLarge' | 'tooManyRecords' | 'noAccounts'

export type ImportIssue = Issue | { path: string; code: BackupIssueCode; params?: Record<string, string | number> }

export type ImportResult = { ok: true; data: AppData; exportedAt: string | null } | { ok: false; issues: ImportIssue[] }

export function createBackup(data: AppData, now: Date, appVersion: string): BackupFile {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    app: 'Margen',
    appVersion,
    data,
  }
}

export function backupFileName(now: Date, isDemo: boolean): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return `margen-${isDemo ? 'demo-' : ''}copia-${stamp}.json`
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function pick<T>(src: Obj, keys: readonly string[]): T {
  const out: Obj = {}
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k]
  return out as T
}

const SETTINGS_KEYS = ['currency', 'numberLocale', 'dateStyle', 'timeZone', 'language', 'fallbackHorizonDays'] as const
const ACCOUNT_KEYS = ['id', 'name', 'kind', 'includeInBudget', 'anchor', 'card', 'createdAt', 'updatedAt'] as const
const ANCHOR_KEYS = ['amountMinor', 'date', 'setAt'] as const
const CARD_KEYS = ['limitMinor', 'aprBps', 'statementDay', 'dueDay', 'minPaymentBps', 'minPaymentFloorMinor'] as const
const CATEGORY_KEYS = ['id', 'name', 'kind', 'archived', 'createdAt', 'updatedAt'] as const
const TX_KEYS = [
  'id', 'kind', 'status', 'amountMinor', 'currency', 'date', 'accountId', 'toAccountId', 'categoryId',
  'refundOfId', 'note', 'scheduleId', 'occurrenceDate', 'realizedAt', 'createdAt', 'updatedAt',
] as const
const SCHEDULE_KEYS = [
  'id', 'name', 'kind', 'amountMinor', 'amountIsEstimate', 'currency', 'accountId', 'categoryId', 'frequency',
  'startDate', 'endDate', 'reminderDaysBefore', 'skippedDates', 'note', 'createdAt', 'updatedAt',
] as const
const GOAL_KEYS = ['id', 'name', 'kind', 'targetMinor', 'targetDate', 'currency', 'fundedFrom', 'allocations', 'createdAt', 'updatedAt'] as const
const ALLOCATION_KEYS = ['id', 'amountMinor', 'date', 'createdAt'] as const

function checkDuplicates(list: { id: string }[], path: string, issues: ImportIssue[]) {
  const seen = new Set<string>()
  list.forEach((item, i) => {
    if (seen.has(item.id)) issues.push({ path: `${path}[${i}].id`, code: 'duplicateId' })
    seen.add(item.id)
  })
}

/** Valida y limpia datos completos de la app (de una copia o del almacenamiento local). */
export function validateAppData(raw: unknown): ImportResult {
  const issues: ImportIssue[] = []
  if (!isObj(raw)) return { ok: false, issues: [{ path: 'data', code: 'notABackup' }] }
  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, issues: [{ path: 'schemaVersion', code: 'notABackup' }] }
  }
  if (version > SCHEMA_VERSION) return { ok: false, issues: [{ path: 'schemaVersion', code: 'schemaTooNew', params: { version } }] }
  const migrated = migrate(raw)

  if (!isValidId(migrated.budgetId)) issues.push({ path: 'budgetId', code: 'invalidId' })
  if (typeof migrated.isDemo !== 'boolean') issues.push({ path: 'isDemo', code: 'invalidValue' })
  if (!isObj(migrated.settings)) issues.push({ path: 'settings', code: 'required' })
  for (const key of ['accounts', 'transactions', 'schedules', 'goals', 'categories'] as const) {
    const value = migrated[key]
    if (!Array.isArray(value)) issues.push({ path: key, code: 'required' })
    else if (value.length > MAX_RECORDS) issues.push({ path: key, code: 'tooManyRecords', params: { max: MAX_RECORDS } })
    else if (!value.every(isObj)) issues.push({ path: key, code: 'invalidValue' })
  }
  if (issues.length) return { ok: false, issues }

  const settings = pick<Settings>(migrated.settings as Obj, SETTINGS_KEYS)
  if (settings.fallbackHorizonDays === undefined) settings.fallbackHorizonDays = null
  issues.push(...validateSettings(settings, 'settings.'))

  const accounts = (migrated.accounts as Obj[]).map((a) => {
    const acc = pick<Account>(a, ACCOUNT_KEYS)
    if (isObj(a.anchor)) acc.anchor = pick(a.anchor, ANCHOR_KEYS)
    if (isObj(a.card)) acc.card = pick(a.card, CARD_KEYS)
    return acc
  })
  accounts.forEach((a, i) => issues.push(...validateAccount(a, `accounts[${i}].`)))
  if (accounts.length === 0) issues.push({ path: 'accounts', code: 'noAccounts' })
  checkDuplicates(accounts, 'accounts', issues)
  if (issues.length) return { ok: false, issues: issues.slice(0, 50) }

  const transactions = (migrated.transactions as Obj[]).map((t) => pick<Transaction>(t, TX_KEYS))
  const schedules = (migrated.schedules as Obj[]).map((s) => pick<Schedule>(s, SCHEDULE_KEYS))
  const goals = (migrated.goals as Obj[]).map((g) => {
    const goal = pick<Goal>(g, GOAL_KEYS)
    if (Array.isArray(g.allocations)) {
      goal.allocations = g.allocations.map((a) => (isObj(a) ? pick<GoalAllocation>(a, ALLOCATION_KEYS) : (a as GoalAllocation)))
    }
    return goal
  })

  const categories = (migrated.categories as Obj[]).map((c) => pick<CustomCategory>(c, CATEGORY_KEYS))
  categories.forEach((c, i) => issues.push(...validateCategory(c, categories, `categories[${i}].`)))
  checkDuplicates(categories, 'categories', issues)
  // Opcional: copias v2 anteriores a los límites no lo traen.
  const rawLimits = Array.isArray(migrated.categoryLimits) ? migrated.categoryLimits : []
  if (rawLimits.length > MAX_RECORDS || !rawLimits.every(isObj)) issues.push({ path: 'categoryLimits', code: 'invalidValue' })
  const categoryLimits = (rawLimits as Obj[]).map((l) => pick<CategoryLimit>(l, ['categoryId', 'monthlyLimitMinor']))
  categoryLimits.forEach((l, i) => issues.push(...validateCategoryLimit(l, categories, `categoryLimits[${i}].`)))
  if (new Set(categoryLimits.map((l) => l.categoryId)).size !== categoryLimits.length) issues.push({ path: 'categoryLimits', code: 'duplicateId' })
  const ctxData = { accounts, transactions, settings, categories }
  transactions.forEach((t, i) => issues.push(...validateTransaction(t, { data: ctxData, prefix: `transactions[${i}].` })))
  schedules.forEach((s, i) => issues.push(...validateSchedule(s, { data: ctxData, prefix: `schedules[${i}].` })))
  goals.forEach((g, i) => issues.push(...validateGoal(g, { data: ctxData, prefix: `goals[${i}].` })))
  checkDuplicates(transactions, 'transactions', issues)
  checkDuplicates(schedules, 'schedules', issues)
  checkDuplicates(goals, 'goals', issues)
  // Una ocurrencia programada solo puede liquidarse una vez.
  const settled = new Set<string>()
  transactions.forEach((t, i) => {
    if (t.status === 'realized' && t.scheduleId && t.occurrenceDate) {
      const key = `${t.scheduleId}:${t.occurrenceDate}`
      if (settled.has(key)) issues.push({ path: `transactions[${i}].occurrenceDate`, code: 'duplicateId' })
      settled.add(key)
    }
  })
  if (issues.length) return { ok: false, issues: issues.slice(0, 50) }

  const data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    budgetId: migrated.budgetId as string,
    isDemo: migrated.isDemo as boolean,
    settings,
    accounts,
    transactions,
    schedules,
    goals,
    categories,
    categoryLimits,
    createdAt: typeof migrated.createdAt === 'string' ? migrated.createdAt : new Date().toISOString(),
    updatedAt: typeof migrated.updatedAt === 'string' ? migrated.updatedAt : new Date().toISOString(),
    revision: typeof migrated.revision === 'number' && Number.isSafeInteger(migrated.revision) ? migrated.revision : 0,
  }
  return { ok: true, data, exportedAt: null }
}

/** Lee el texto de un archivo de copia de seguridad. */
export function parseBackup(text: string): ImportResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, issues: [{ path: 'file', code: 'tooLarge' }] }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, issues: [{ path: 'file', code: 'invalidJson' }] }
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT || !isObj(raw.data)) {
    return { ok: false, issues: [{ path: 'file', code: 'notABackup' }] }
  }
  if (typeof raw.formatVersion !== 'number' || raw.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, issues: [{ path: 'formatVersion', code: 'schemaTooNew', params: { version: String(raw.formatVersion) } }] }
  }
  const result = validateAppData(raw.data)
  if (!result.ok) return result
  return { ...result, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null }
}
