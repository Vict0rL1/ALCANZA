/**
 * Datos de DEMOSTRACIÓN (ficticios). Se generan con fechas relativas a hoy para
 * que la demo siempre muestre pagos próximos, un pago vencido y un posible faltante.
 * `isDemo: true` hace que la app muestre un aviso permanente.
 */
import { addDays, localDateInTimeZone } from '../domain/dates'
import { newId } from '../domain/ids'
import type { Account, AppData, Goal, LocalDate, Schedule, Timestamp, Transaction } from '../domain/types'
import { SCHEMA_VERSION } from '../domain/types'

export interface DemoOptions {
  now: Date
  timeZone: string
  currency?: string
}

export function createDemoData({ now, timeZone, currency = 'CAD' }: DemoOptions): AppData {
  const nowTs: Timestamp = now.toISOString()
  const today = localDateInTimeZone(now, timeZone)
  const d = (offset: number): LocalDate => addDays(today, offset)
  const hoursAgo = (h: number): Timestamp => new Date(now.getTime() - h * 3_600_000).toISOString()

  // Saldo de referencia escrito "hace unas 47 horas".
  const anchorSetAt = hoursAgo(47)
  const anchorDate = localDateInTimeZone(new Date(anchorSetAt), timeZone)
  const historyCreatedAt = hoursAgo(24 * 30)
  const recentCreatedAt = hoursAgo(1)

  const main: Account = {
    id: newId(),
    name: 'Cuenta de cheques',
    kind: 'bank',
    includeInBudget: true,
    anchor: { amountMinor: 90512, date: anchorDate, setAt: anchorSetAt },
    createdAt: historyCreatedAt,
    updatedAt: anchorSetAt,
  }
  const cash: Account = {
    id: newId(),
    name: 'Efectivo',
    kind: 'cash',
    includeInBudget: true,
    anchor: { amountMinor: 4250, date: anchorDate, setAt: anchorSetAt },
    createdAt: historyCreatedAt,
    updatedAt: anchorSetAt,
  }
  const savings: Account = {
    id: newId(),
    name: 'Ahorros',
    kind: 'savings',
    includeInBudget: false,
    anchor: { amountMinor: 40000, date: anchorDate, setAt: anchorSetAt },
    createdAt: historyCreatedAt,
    updatedAt: anchorSetAt,
  }

  const schedule = (s: Omit<Schedule, 'id' | 'currency' | 'createdAt' | 'updatedAt' | 'skippedDates'>): Schedule => ({
    ...s,
    id: newId(),
    currency,
    skippedDates: [],
    createdAt: historyCreatedAt,
    updatedAt: historyCreatedAt,
  })

  const salary = schedule({
    name: 'Sueldo (trabajo de medio tiempo)',
    kind: 'income',
    amountMinor: 61240,
    amountIsEstimate: true,
    accountId: main.id,
    categoryId: 'salary',
    frequency: 'biweekly',
    startDate: d(-22),
    reminderDaysBefore: 0,
    note: 'Las horas varían; el importe es aproximado.',
  })
  const rent = schedule({
    name: 'Renta de habitación',
    kind: 'expense',
    amountMinor: 65000,
    amountIsEstimate: false,
    accountId: main.id,
    categoryId: 'housing',
    frequency: 'monthly',
    startDate: d(-27),
    reminderDaysBefore: 3,
  })
  const music = schedule({
    name: 'Suscripción de música',
    kind: 'expense',
    amountMinor: 1199,
    amountIsEstimate: false,
    accountId: main.id,
    categoryId: 'subscriptions',
    frequency: 'monthly',
    startDate: d(-25),
    reminderDaysBefore: 1,
  })
  const phone = schedule({
    name: 'Plan de celular',
    kind: 'expense',
    amountMinor: 3500,
    amountIsEstimate: false,
    accountId: main.id,
    categoryId: 'phone_internet',
    frequency: 'monthly',
    startDate: d(-20),
    reminderDaysBefore: 2,
  })
  const transit = schedule({
    name: 'Pase mensual de transporte',
    kind: 'expense',
    amountMinor: 12815,
    amountIsEstimate: false,
    accountId: main.id,
    categoryId: 'transport',
    frequency: 'monthly',
    startDate: d(-18),
    reminderDaysBefore: 2,
  })
  const electricity = schedule({
    name: 'Recibo de luz',
    kind: 'expense',
    amountMinor: 4280,
    amountIsEstimate: false,
    accountId: main.id,
    categoryId: 'utilities',
    frequency: 'once',
    startDate: d(-1),
    reminderDaysBefore: 2,
  })
  const tuition = schedule({
    name: 'Cuota de matrícula',
    kind: 'expense',
    amountMinor: 40000,
    amountIsEstimate: false,
    accountId: main.id,
    categoryId: 'education',
    frequency: 'once',
    startDate: d(18),
    reminderDaysBefore: 7,
  })

  const tx = (t: Omit<Transaction, 'id' | 'currency' | 'createdAt' | 'updatedAt' | 'realizedAt'> & { recent?: boolean }): Transaction => {
    const { recent, ...rest } = t
    const created = recent ? recentCreatedAt : historyCreatedAt
    return {
      ...rest,
      id: newId(),
      currency,
      ...(rest.status === 'realized' ? { realizedAt: created } : {}),
      createdAt: created,
      updatedAt: created,
    }
  }
  const spend = (offset: number, amountMinor: number, categoryId: string, note: string, account = main, recent = false) =>
    tx({ kind: 'expense', status: 'realized', amountMinor, date: d(offset), accountId: account.id, categoryId, note, recent })

  const headphones = spend(-17, 4999, 'shopping', 'Audífonos')

  const transactions: Transaction[] = [
    tx({ kind: 'income', status: 'realized', amountMinor: 64000, date: d(-22), accountId: main.id, categoryId: 'salary', note: salary.name, scheduleId: salary.id, occurrenceDate: d(-22) }),
    tx({ kind: 'expense', status: 'realized', amountMinor: 65000, date: d(-27), accountId: main.id, categoryId: 'housing', note: rent.name, scheduleId: rent.id, occurrenceDate: d(-27) }),
    tx({ kind: 'expense', status: 'realized', amountMinor: 1199, date: d(-25), accountId: main.id, categoryId: 'subscriptions', note: music.name, scheduleId: music.id, occurrenceDate: d(-25) }),
    tx({ kind: 'expense', status: 'realized', amountMinor: 3500, date: d(-20), accountId: main.id, categoryId: 'phone_internet', note: phone.name, scheduleId: phone.id, occurrenceDate: d(-20) }),
    tx({ kind: 'expense', status: 'realized', amountMinor: 12815, date: d(-18), accountId: main.id, categoryId: 'transport', note: transit.name, scheduleId: transit.id, occurrenceDate: d(-18) }),
    spend(-26, 5230, 'groceries', 'Supermercado'),
    spend(-25, 335, 'transport', 'Pasaje de autobús', cash),
    spend(-24, 1475, 'dining', 'Almuerzo con amigos'),
    spend(-22, 2800, 'education', 'Libros usados'),
    spend(-20, 4785, 'groceries', 'Supermercado'),
    spend(-19, 1200, 'entertainment', 'Cine (precio de estudiante)'),
    headphones,
    spend(-15, 1840, 'personal', 'Artículos de higiene'),
    tx({ kind: 'income', status: 'realized', amountMinor: 59810, date: d(-8), accountId: main.id, categoryId: 'salary', note: salary.name, scheduleId: salary.id, occurrenceDate: d(-8) }),
    tx({ kind: 'transfer', status: 'realized', amountMinor: 5000, date: d(-8), accountId: main.id, toAccountId: savings.id, note: 'Ahorro quincenal' }),
    spend(-13, 6120, 'groceries', 'Supermercado'),
    spend(-10, 625, 'dining', 'Café y pan', cash),
    tx({ kind: 'refund', status: 'realized', amountMinor: 1500, date: d(-9), accountId: main.id, categoryId: 'shopping', refundOfId: headphones.id, note: 'Devolución parcial: audífonos (ajuste de precio)' }),
    spend(-8, 2200, 'health', 'Farmacia'),
    spend(-6, 4410, 'groceries', 'Supermercado'),
    spend(-4, 1180, 'dining', 'Comida rápida'),
    spend(-3, 1500, 'entertainment', 'Juego de mesa usado', cash),
    // Posteriores al saldo de referencia: sí cambian el saldo actual.
    spend(0, 425, 'dining', 'Café', main, true),
    spend(0, 335, 'transport', 'Pasaje de autobús', cash, true),
    // Previstos (no cambian el saldo hasta marcarlos como realizados).
    tx({ kind: 'income', status: 'planned', amountMinor: 1800, date: d(2), accountId: main.id, categoryId: 'other_income', note: 'Reembolso de Ana por la cena' }),
    tx({ kind: 'expense', status: 'planned', amountMinor: 2500, date: d(9), accountId: main.id, categoryId: 'gifts', note: 'Regalo de cumpleaños' }),
  ]
  // Ayer, después del saldo de referencia: también cambia el saldo actual.
  transactions.push(spend(-1, 3845, 'groceries', 'Supermercado', main, true))

  const goals: Goal[] = [
    {
      id: newId(),
      name: 'Fondo de emergencia',
      kind: 'emergency',
      targetMinor: 100000,
      targetDate: d(180),
      currency,
      fundedFrom: 'external',
      allocations: [
        { id: newId(), amountMinor: 35000, date: d(-40), createdAt: historyCreatedAt },
        { id: newId(), amountMinor: 5000, date: d(-8), createdAt: historyCreatedAt },
      ],
      createdAt: historyCreatedAt,
      updatedAt: historyCreatedAt,
    },
    {
      id: newId(),
      name: 'Laptop para la escuela',
      kind: 'goal',
      targetMinor: 90000,
      targetDate: d(120),
      currency,
      fundedFrom: 'budget',
      allocations: [{ id: newId(), amountMinor: 6000, date: d(-8), createdAt: historyCreatedAt }],
      createdAt: historyCreatedAt,
      updatedAt: historyCreatedAt,
    },
  ]

  return {
    schemaVersion: SCHEMA_VERSION,
    budgetId: newId(),
    isDemo: true,
    settings: {
      currency,
      numberLocale: 'es-MX',
      dateStyle: 'medium',
      timeZone,
      language: 'es',
      fallbackHorizonDays: null,
    },
    accounts: [main, cash, savings],
    transactions,
    schedules: [salary, rent, music, phone, transit, electricity, tuition],
    goals,
    createdAt: nowTs,
    updatedAt: nowTs,
    revision: 0,
  }
}
