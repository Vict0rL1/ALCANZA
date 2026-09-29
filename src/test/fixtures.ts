/** Utilidades para pruebas: construyen datos pequeños y legibles. */
import type { Account, AppData, Goal, Schedule, Transaction } from '../domain/types'
import { SCHEMA_VERSION } from '../domain/types'

export const TZ = 'America/Toronto'
export const TODAY = '2026-09-28'
/** Mediodía en Toronto del 28-sep-2026. */
export const NOW = '2026-09-28T16:00:00.000Z'
export const EARLIER = '2026-09-28T13:00:00.000Z'
export const ctx = { today: TODAY, now: NOW }

let counter = 0
export const id = (prefix = 'id') => `${prefix}-${++counter}`

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: overrides.id ?? id('acc'),
    name: 'Cuenta',
    kind: 'bank',
    includeInBudget: true,
    anchor: { amountMinor: 100000, date: TODAY, setAt: EARLIER },
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...overrides,
  }
}

export function baseData(overrides: Partial<AppData> = {}): AppData {
  const main = account({ id: 'main', name: 'Principal' })
  return {
    schemaVersion: SCHEMA_VERSION,
    budgetId: 'budget-1',
    isDemo: false,
    settings: {
      currency: 'CAD',
      numberLocale: 'es-MX',
      dateStyle: 'medium',
      timeZone: TZ,
      language: 'es',
      fallbackHorizonDays: null,
    },
    accounts: [main],
    transactions: [],
    schedules: [],
    goals: [],
    categories: [],
    categoryLimits: [],
    categoryRules: [],
    createdAt: EARLIER,
    updatedAt: EARLIER,
    revision: 0,
    ...overrides,
  }
}

export function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: overrides.id ?? id('sch'),
    name: 'Pago',
    kind: 'expense',
    amountMinor: 1000,
    amountIsEstimate: false,
    currency: 'CAD',
    accountId: 'main',
    categoryId: overrides.kind === 'income' ? 'salary' : 'other_expense',
    frequency: 'once',
    startDate: TODAY,
    reminderDaysBefore: 2,
    skippedDates: [],
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...overrides,
  }
}

export function income(date: string, amountMinor: number, overrides: Partial<Schedule> = {}): Schedule {
  return schedule({ name: 'Sueldo', kind: 'income', categoryId: 'salary', amountMinor, startDate: date, ...overrides })
}

export function bill(date: string, amountMinor: number, overrides: Partial<Schedule> = {}): Schedule {
  return schedule({ name: 'Factura', kind: 'expense', categoryId: 'utilities', amountMinor, startDate: date, ...overrides })
}

export function tx(overrides: Partial<Transaction> = {}): Transaction {
  const status = overrides.status ?? 'realized'
  return {
    id: overrides.id ?? id('tx'),
    kind: 'expense',
    status,
    amountMinor: 1000,
    currency: 'CAD',
    date: TODAY,
    accountId: 'main',
    categoryId: overrides.kind === 'income' ? 'salary' : overrides.kind === 'transfer' ? undefined : 'groceries',
    ...(status === 'realized' ? { realizedAt: NOW } : {}),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: overrides.id ?? id('goal'),
    name: 'Meta',
    kind: 'goal',
    targetMinor: 50000,
    currency: 'CAD',
    fundedFrom: 'budget',
    allocations: [],
    createdAt: EARLIER,
    updatedAt: EARLIER,
    ...overrides,
  }
}

/** Congela recursivamente para detectar mutaciones accidentales. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}
