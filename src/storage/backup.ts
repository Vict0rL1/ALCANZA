/**
 * Copias de seguridad: exportación a JSON e importación validada.
 *
 * Una importación NUNCA se aplica a medias: o todo el archivo es válido, o no
 * se cambia nada. Se copian solo los campos conocidos (se descarta lo demás).
 */
import { isValidId } from '../domain/ids'
import type {
  Account,
  AppData,
  BackupState,
  CategoryLimit,
  CategoryRule,
  CustomCategory,
  Favorite,
  Goal,
  GoalAllocation,
  IncomeDistribution,
  IncomeDistributionLine,
  InboxState,
  PeriodBudget,
  PlannedExpense,
  PlannedExpenseCycle,
  Reconciliation,
  SavedScenario,
  ScenarioChange,
  SplitLine,
  Schedule,
  Settings,
  Transaction,
  TrashEntry,
} from '../domain/types'
import { SCHEMA_VERSION } from '../domain/types'
import {
  validateAccount,
  validateBackupState,
  validateCategory,
  validateCategoryLimit,
  validateCategoryRule,
  validateFavorite,
  validateGoal,
  validateIncomeDistribution,
  validateInbox,
  validatePeriodBudget,
  validateReconciliation,
  validateScenario,
  validateSchedule,
  validateSettings,
  validateTransaction,
  validateTrashEntry,
  type Issue,
} from '../domain/validation'
import { migrate } from './migrations'

// Identificador interno del formato (la app se llamaba «Margen»): no cambia, para que las
// copias anteriores sigan siendo válidas.
export const BACKUP_FORMAT = 'margen-backup'
export const BACKUP_FORMAT_VERSION = 1
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024
export const MAX_RECORDS = 50_000

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  formatVersion: number
  exportedAt: string
  /** Nombre de la app que generó el archivo («Margen» en copias anteriores). No se valida. */
  app: string
  appVersion: string
  data: AppData
}

export type BackupIssueCode = 'invalidJson' | 'notABackup' | 'schemaTooNew' | 'tooLarge' | 'tooManyRecords' | 'noAccounts' | 'migrationFailed'

export type ImportIssue = Issue | { path: string; code: BackupIssueCode; params?: Record<string, string | number> }

export type ImportResult = { ok: true; data: AppData; exportedAt: string | null } | { ok: false; issues: ImportIssue[] }

export function createBackup(data: AppData, now: Date, appVersion: string): BackupFile {
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    app: 'Clara',
    appVersion,
    data,
  }
}

/**
 * Genera el archivo y se lo entrega a `write` (en la app: pedir la descarga al
 * navegador). Si algo falla, devuelve `ok: false` y quien llama NO debe registrar
 * la exportación como hecha.
 */
export function performExport(
  data: AppData,
  now: Date,
  appVersion: string,
  write: (filename: string, text: string) => void,
): { ok: true; exportedAt: string; filename: string } | { ok: false } {
  try {
    const filename = backupFileName(now, data.isDemo)
    write(filename, JSON.stringify(createBackup(data, now, appVersion), null, 2))
    return { ok: true, exportedAt: now.toISOString(), filename }
  } catch {
    return { ok: false }
  }
}

export function backupFileName(now: Date, isDemo: boolean): string {
  const stamp = now.toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return `clara-${isDemo ? 'demo-' : ''}copia-${stamp}.json`
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function pick<T>(src: Obj, keys: readonly string[]): T {
  const out: Obj = {}
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k]
  return out as T
}

const SETTINGS_KEYS = ['currency', 'numberLocale', 'dateStyle', 'timeZone', 'language', 'fallbackHorizonDays', 'weeklyReview'] as const
const ACCOUNT_KEYS = ['id', 'name', 'kind', 'includeInBudget', 'anchor', 'card', 'createdAt', 'updatedAt'] as const
const ANCHOR_KEYS = ['amountMinor', 'date', 'setAt'] as const
const CARD_KEYS = ['limitMinor', 'aprBps', 'statementDay', 'dueDay', 'minPaymentBps', 'minPaymentFloorMinor'] as const
const CATEGORY_KEYS = ['id', 'name', 'kind', 'archived', 'createdAt', 'updatedAt'] as const
const TX_KEYS = [
  'id', 'kind', 'status', 'amountMinor', 'currency', 'date', 'accountId', 'toAccountId', 'categoryId',
  'refundOfId', 'note', 'scheduleId', 'occurrenceDate', 'realizedAt', 'importRef',
  'adjustmentDirection', 'reconciliationId', 'partialSettlement', 'splits', 'createdAt', 'updatedAt',
] as const
const SPLIT_KEYS = ['id', 'categoryId', 'amountMinor', 'note'] as const

/** Movimiento con solo las claves conocidas (también en sus líneas). */
function pickTx(t: Obj): Transaction {
  const tx = pick<Transaction>(t, TX_KEYS)
  if (Array.isArray(t.splits)) tx.splits = t.splits.map((l) => (isObj(l) ? pick<SplitLine>(l, SPLIT_KEYS) : (l as SplitLine)))
  return tx
}
const SCHEDULE_KEYS = [
  'id', 'name', 'kind', 'amountMinor', 'amountIsEstimate', 'range', 'currency', 'accountId', 'categoryId', 'frequency',
  'startDate', 'endDate', 'reminderDaysBefore', 'skippedDates', 'note', 'createdAt', 'updatedAt',
] as const
const GOAL_KEYS = ['id', 'name', 'kind', 'targetMinor', 'targetDate', 'currency', 'fundedFrom', 'allocations', 'plan', 'createdAt', 'updatedAt'] as const
const ALLOCATION_KEYS = ['id', 'amountMinor', 'date', 'createdAt', 'reason', 'distributionId'] as const
const PLAN_KEYS = ['repeatEveryMonths', 'link', 'categoryId', 'history', 'paidAt'] as const
const CYCLE_KEYS = ['dueDate', 'targetMinor', 'reservedMinor', 'paidMinor', 'txId', 'surplus', 'paidAt'] as const

/** Lista opcional de objetos (ausente en copias antiguas = vacía). */
function listOf(value: unknown, path: string, issues: ImportIssue[]): Obj[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_RECORDS || !value.every(isObj)) {
    issues.push({ path, code: 'invalidValue' })
    return []
  }
  return value
}

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
  let migrated: Obj
  try {
    migrated = migrate(raw)
  } catch {
    // Nunca se borra nada por un fallo de migración: los datos originales quedan intactos.
    return { ok: false, issues: [{ path: 'schemaVersion', code: 'migrationFailed', params: { version } }] }
  }

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

  const transactions = (migrated.transactions as Obj[]).map(pickTx)
  const schedules = (migrated.schedules as Obj[]).map((s) => pick<Schedule>(s, SCHEDULE_KEYS))
  const goals = (migrated.goals as Obj[]).map((g) => {
    const goal = pick<Goal>(g, GOAL_KEYS)
    if (Array.isArray(g.allocations)) {
      goal.allocations = g.allocations.map((a) => (isObj(a) ? pick<GoalAllocation>(a, ALLOCATION_KEYS) : (a as GoalAllocation)))
    }
    if (isObj(g.plan)) {
      const plan = pick<PlannedExpense>(g.plan, PLAN_KEYS)
      if (isObj(g.plan.link)) plan.link = pick(g.plan.link, ['scheduleId', 'occurrenceDate'])
      if (Array.isArray(g.plan.history)) plan.history = g.plan.history.map((c) => (isObj(c) ? pick<PlannedExpenseCycle>(c, CYCLE_KEYS) : (c as PlannedExpenseCycle)))
      goal.plan = plan
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
  const rawRules = Array.isArray(migrated.categoryRules) ? migrated.categoryRules : []
  if (rawRules.length > MAX_RECORDS || !rawRules.every(isObj)) issues.push({ path: 'categoryRules', code: 'invalidValue' })
  const categoryRules = (rawRules as Obj[]).map((r) => pick<CategoryRule>(r, ['id', 'pattern', 'kind', 'categoryId', 'createdAt', 'updatedAt']))
  categoryRules.forEach((r, i) => issues.push(...validateCategoryRule(r, categoryRules, categories, `categoryRules[${i}].`)))
  checkDuplicates(categoryRules, 'categoryRules', issues)
  const ctxData = { accounts, transactions, settings, categories }
  transactions.forEach((t, i) => issues.push(...validateTransaction(t, { data: ctxData, prefix: `transactions[${i}].` })))
  schedules.forEach((s, i) => issues.push(...validateSchedule(s, { data: ctxData, prefix: `schedules[${i}].` })))
  goals.forEach((g, i) => issues.push(...validateGoal(g, { data: ctxData, prefix: `goals[${i}].` })))
  checkDuplicates(transactions, 'transactions', issues)
  checkDuplicates(schedules, 'schedules', issues)
  checkDuplicates(goals, 'goals', issues)
  // Una ocurrencia programada tiene como mucho UNA liquidación final (las parciales pueden ser varias).
  const settled = new Set<string>()
  transactions.forEach((t, i) => {
    if (t.status === 'realized' && t.scheduleId && t.occurrenceDate && !t.partialSettlement) {
      const key = `${t.scheduleId}:${t.occurrenceDate}`
      if (settled.has(key)) issues.push({ path: `transactions[${i}].occurrenceDate`, code: 'duplicateId' })
      settled.add(key)
    }
  })

  // v5: papelera, huellas purgadas, favoritos, conciliaciones y registro de copias (opcionales en copias antiguas).
  const rawTrash = listOf(migrated.trash, 'trash', issues)
  const trash = rawTrash.map((e) => {
    const entry = pick<TrashEntry>(e, ['id', 'deletedAt', 'unlinkedRefundIds', 'unlinkedRefundSplits'])
    if (isObj(e.transaction)) entry.transaction = pickTx(e.transaction)
    return entry
  })
  trash.forEach((e, i) => issues.push(...validateTrashEntry(e, { data: ctxData, prefix: `trash[${i}].` })))
  checkDuplicates(trash, 'trash', issues)
  const liveIds = new Set(transactions.map((t) => t.id))
  trash.forEach((e, i) => {
    if (liveIds.has(e.id)) issues.push({ path: `trash[${i}].id`, code: 'duplicateId' })
  })

  const rawRefs = Array.isArray(migrated.purgedImportRefs) ? migrated.purgedImportRefs : []
  if (migrated.purgedImportRefs !== undefined && !Array.isArray(migrated.purgedImportRefs)) issues.push({ path: 'purgedImportRefs', code: 'invalidValue' })
  if (rawRefs.length > MAX_RECORDS || !rawRefs.every((r) => typeof r === 'string' && r.length > 0 && r.length <= 200)) {
    issues.push({ path: 'purgedImportRefs', code: 'invalidValue' })
  }
  const purgedImportRefs = [...new Set(rawRefs as string[])]

  const favorites = listOf(migrated.favorites, 'favorites', issues).map((f) =>
    pick<Favorite>(f, ['id', 'name', 'kind', 'accountId', 'categoryId', 'amountMinor', 'note', 'order', 'createdAt', 'updatedAt']),
  )
  favorites.forEach((f, i) => issues.push(...validateFavorite(f, { data: { accounts, categories }, prefix: `favorites[${i}].` })))
  checkDuplicates(favorites, 'favorites', issues)

  const reconciliations = listOf(migrated.reconciliations, 'reconciliations', issues).map((r) =>
    pick<Reconciliation>(r, [
      'id', 'accountId', 'date', 'observedMinor', 'computedMinor', 'differenceMinor', 'resolution',
      'adjustmentTxId', 'reason', 'fingerprint', 'createdAt', 'updatedAt',
    ]),
  )
  reconciliations.forEach((r, i) => issues.push(...validateReconciliation(r, { data: { accounts }, prefix: `reconciliations[${i}].` })))
  checkDuplicates(reconciliations, 'reconciliations', issues)

  const backup = isObj(migrated.backup)
    ? pick<BackupState>(migrated.backup, ['reminder', 'lastExportAt', 'lastExportDataAt', 'lastVerifiedAt', 'verifiedExportedAt', 'snoozedUntil'])
    : ({ reminder: 'weekly' } as BackupState)
  if (migrated.backup !== undefined && !isObj(migrated.backup)) issues.push({ path: 'backup', code: 'invalidValue' })

  // v6: presupuestos por periodo y escenarios guardados.
  const periodBudgets = listOf(migrated.periodBudgets, 'periodBudgets', issues).map((b) =>
    pick<PeriodBudget>(b, ['id', 'name', 'template', 'startDate', 'endDate', 'allocatedMinor', 'currency', 'txIds', 'goalId', 'ruleCategoryIds', 'archived', 'note', 'createdAt', 'updatedAt']),
  )
  periodBudgets.forEach((b, i) => issues.push(...validatePeriodBudget(b, { data: { settings, goals }, prefix: `periodBudgets[${i}].` })))
  checkDuplicates(periodBudgets, 'periodBudgets', issues)
  const scenarios = listOf(migrated.scenarios, 'scenarios', issues).map((sc) => {
    const scenario = pick<SavedScenario>(sc, ['id', 'name', 'changes', 'baseFingerprint', 'createdAt', 'updatedAt'])
    if (Array.isArray(sc.changes)) {
      scenario.changes = sc.changes.map((c) =>
        isObj(c) ? pick<ScenarioChange>(c, ['type', 'amountMinor', 'date', 'note', 'accountId', 'scheduleId', 'newAmountMinor']) : (c as ScenarioChange),
      )
    }
    return scenario
  })
  scenarios.forEach((sc, i) => issues.push(...validateScenario(sc, `scenarios[${i}].`)))
  checkDuplicates(scenarios, 'scenarios', issues)
  // v7: bandeja de pendientes y distribuciones de ingresos.
  let inbox: InboxState = { snoozed: [], dismissed: [] }
  if (migrated.inbox !== undefined) {
    if (!isObj(migrated.inbox)) issues.push({ path: 'inbox', code: 'invalidValue' })
    else {
      const snoozed = listOf(migrated.inbox.snoozed, 'inbox.snoozed', issues).map((s) => pick<InboxState['snoozed'][number]>(s, ['id', 'until', 'at']))
      const dismissed = listOf(migrated.inbox.dismissed, 'inbox.dismissed', issues).map((d) => pick<InboxState['dismissed'][number]>(d, ['id', 'fingerprint', 'at']))
      inbox = { snoozed, dismissed }
      issues.push(...validateInbox(inbox))
    }
  }
  const incomeDistributions = listOf(migrated.incomeDistributions, 'incomeDistributions', issues).map((d) => {
    const dist = pick<IncomeDistribution>(d, ['id', 'incomeTxId', 'incomeFingerprint', 'incomeAmountMinor', 'lines', 'createdAt', 'undoneAt'])
    if (Array.isArray(d.lines)) {
      dist.lines = d.lines.map((l) =>
        isObj(l) ? pick<IncomeDistributionLine>(l, ['kind', 'goalId', 'allocationId', 'amountMinor', 'createdGoal', 'scheduleId', 'occurrenceDate']) : (l as IncomeDistributionLine),
      )
    }
    return dist
  })
  incomeDistributions.forEach((d, i) => issues.push(...validateIncomeDistribution(d, `incomeDistributions[${i}].`)))
  checkDuplicates(incomeDistributions, 'incomeDistributions', issues)
  issues.push(...validateBackupState(backup, 'backup.'))
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
    categoryRules,
    trash,
    purgedImportRefs,
    favorites: [...favorites].sort((a, b) => a.order - b.order),
    reconciliations,
    backup,
    periodBudgets,
    scenarios,
    inbox,
    incomeDistributions,
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
