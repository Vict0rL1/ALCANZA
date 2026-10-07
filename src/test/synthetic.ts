/**
 * Datos SINTÉTICOS para medir rendimiento (nunca datos del usuario). Deterministas: el mismo
 * tamaño produce siempre los mismos datos. Incluyen compras divididas, transferencias, pagos
 * de tarjeta, devoluciones parciales, pagos recurrentes liquidados y papelera.
 * Se marcan `isDemo: true` para que la app los identifique como ficticios.
 */
import { addDays, daysBetween } from '../domain/dates'
import { defaultCollectionsV9, defaultSettingsV9 } from '../domain/defaults'
import { occurrencesBetween } from '../domain/recurrence'
import { SCHEMA_VERSION, type Account, type AppData, type HistoryEntry, type Schedule, type Transaction, type TrashEntry } from '../domain/types'
import { HISTORY_MAX_ENTRIES } from '../domain/history'

/** Generador pseudoaleatorio reproducible (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const EXPENSE_CATS = ['groceries', 'dining', 'transport', 'housing', 'utilities', 'phone_internet', 'health', 'entertainment', 'shopping', 'subscriptions', 'personal', 'gifts']
const NOTES = ['Supermercado Norte', 'Café Central', 'Farmacia Luz', 'Gasolinera 24', 'Librería Sol', 'Mercado local', 'Panadería', 'Cine Plaza', 'Ferretería', 'Tienda en línea', 'Restaurante Mar', 'Metro']

export interface SyntheticOptions {
  /** Número aproximado de movimientos (vivos + papelera). */
  movements: number
  /** Hoy (fecha de calendario). */
  today: string
  timeZone?: string
}

export function createSyntheticData({ movements, today, timeZone = 'America/Toronto' }: SyntheticOptions): AppData {
  const rand = rng(movements)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!
  const cents = (min: number, max: number) => Math.round((min + rand() * (max - min)) * 100)
  const perDay = 20
  const days = Math.max(30, Math.ceil(movements / perDay))
  const start = addDays(today, -days)
  const stamp = (date: string, minute = 0) => `${date}T${String(12 + Math.floor(minute / 60) % 10).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00.000Z`
  const anchorSetAt = `${addDays(start, -1)}T10:00:00.000Z`
  const account = (id: string, name: string, kind: Account['kind'], includeInBudget: boolean, amountMinor: number, extra: Partial<Account> = {}): Account => ({
    id,
    name,
    kind,
    includeInBudget,
    anchor: { amountMinor, date: addDays(start, -1), setAt: anchorSetAt },
    createdAt: anchorSetAt,
    updatedAt: anchorSetAt,
    ...extra,
  })
  const accounts: Account[] = [
    account('chk', 'Cuenta de cheques', 'bank', true, 250000),
    account('cash', 'Efectivo', 'cash', true, 8000),
    account('sav', 'Ahorro', 'savings', false, 500000),
    account('visa', 'Visa', 'credit', true, 0, { card: { limitMinor: 300000, dueDay: 15, statementDay: 28 } }),
  ]
  const schedule = (id: string, name: string, kind: Schedule['kind'], amountMinor: number, frequency: Schedule['frequency'], startDate: string, extra: Partial<Schedule> = {}): Schedule => ({
    id,
    name,
    kind,
    amountMinor,
    amountIsEstimate: false,
    currency: 'CAD',
    accountId: 'chk',
    categoryId: kind === 'income' ? 'salary' : 'housing',
    frequency,
    startDate,
    reminderDaysBefore: 2,
    skippedDates: [],
    createdAt: anchorSetAt,
    updatedAt: anchorSetAt,
    ...extra,
  })
  const schedules: Schedule[] = [
    schedule('pay', 'Sueldo', 'income', 185000, 'biweekly', start),
    schedule('rent', 'Renta', 'expense', 120000, 'monthly', start),
    schedule('phone', 'Teléfono', 'expense', 4500, 'monthly', addDays(start, 10), { categoryId: 'phone_internet' }),
    schedule('music', 'Música', 'expense', 1199, 'monthly', addDays(start, 5), { categoryId: 'subscriptions' }),
  ]

  const txs: Transaction[] = []
  let n = 0
  const id = (p: string) => `${p}-${++n}`
  const base = (date: string, minute: number): Pick<Transaction, 'status' | 'currency' | 'date' | 'realizedAt' | 'createdAt' | 'updatedAt'> => ({
    status: 'realized',
    currency: 'CAD',
    date,
    realizedAt: stamp(date, minute),
    createdAt: stamp(date, minute),
    updatedAt: stamp(date, minute),
  })

  // Pagos recurrentes liquidados (vinculados a su ocurrencia).
  for (const s of schedules) {
    for (const occ of occurrencesBetween(s, start, addDays(today, -1))) {
      txs.push({ id: id('occ'), kind: s.kind, amountMinor: s.amountMinor, accountId: s.accountId, categoryId: s.categoryId, scheduleId: s.id, occurrenceDate: occ, ...base(occ, 1) })
    }
  }

  // Gastos diarios, compras divididas, transferencias (incl. pago de tarjeta) y devoluciones.
  const expenses: Transaction[] = []
  for (let d = 0; txs.length < movements && d <= days * 4; d++) {
    const date = addDays(start, d % (days + 1))
    if (date >= today) continue
    for (let k = 0; k < perDay && txs.length < movements; k++) {
      const r = rand()
      const minute = 2 + k
      if (r < 0.62) {
        const amountMinor = cents(2, 120)
        const tx: Transaction = { id: id('exp'), kind: 'expense', amountMinor, accountId: rand() < 0.25 ? 'visa' : rand() < 0.15 ? 'cash' : 'chk', categoryId: pick(EXPENSE_CATS), note: pick(NOTES), ...base(date, minute) }
        if (rand() < 0.12 && amountMinor >= 300) {
          const a = Math.floor(amountMinor * (0.3 + rand() * 0.4))
          const b = Math.floor((amountMinor - a) / 2)
          const c = amountMinor - a - b
          tx.splits = [
            { id: `${tx.id}-a`, categoryId: 'groceries', amountMinor: a },
            { id: `${tx.id}-b`, categoryId: 'housing', amountMinor: b },
            { id: `${tx.id}-c`, categoryId: 'personal', amountMinor: c },
          ]
          tx.categoryId = 'groceries'
        }
        txs.push(tx)
        expenses.push(tx)
      } else if (r < 0.7) {
        txs.push({ id: id('inc'), kind: 'income', amountMinor: cents(10, 300), accountId: 'chk', categoryId: 'freelance', note: 'Trabajo extra', ...base(date, minute) })
      } else if (r < 0.8) {
        const to = pick(['visa', 'cash', 'sav'] as const)
        txs.push({ id: id('trf'), kind: 'transfer', amountMinor: cents(20, 400), accountId: 'chk', toAccountId: to, note: to === 'visa' ? 'Pago de tarjeta' : to === 'sav' ? 'Ahorro' : 'Retiro', ...base(date, minute) })
      } else if (r < 0.84 && expenses.length > 0) {
        const original = expenses[Math.floor(rand() * expenses.length)]!
        const used = txs.filter((t) => t.refundOfId === original.id).length
        if (used === 0 && !original.splits && original.date <= date) {
          txs.push({ id: id('ref'), kind: 'refund', amountMinor: Math.max(1, Math.floor(original.amountMinor / 3)), accountId: original.accountId, categoryId: original.categoryId, refundOfId: original.id, note: `Devolución: ${original.note}`, ...base(date, minute) })
        }
      } else {
        txs.push({ id: id('exp'), kind: 'expense', amountMinor: cents(1, 15), accountId: 'cash', categoryId: 'dining', note: 'Café', ...base(date, minute) })
      }
    }
  }

  // Papelera: ~1 % de gastos simples sin devoluciones vinculadas.
  const refunded = new Set(txs.map((t) => t.refundOfId).filter(Boolean))
  const trash: TrashEntry[] = []
  for (const t of txs) {
    if (trash.length >= Math.ceil(movements / 100)) break
    if (t.kind === 'expense' && !t.splits && !t.scheduleId && !refunded.has(t.id) && rand() < 0.05) trash.push({ id: t.id, deletedAt: t.createdAt, transaction: t, unlinkedRefundIds: [] })
  }
  const trashed = new Set(trash.map((e) => e.id))
  const transactions = txs.filter((t) => !trashed.has(t.id))

  // Historial: el alta de los movimientos más recientes (como si se hubieran registrado en la
  // app), hasta el máximo que conserva la app. Coherente con los datos: deshacerlo los quita.
  const recent = [...transactions].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)).slice(-Math.min(HISTORY_MAX_ENTRIES, Math.ceil(movements / 10)))
  const history: HistoryEntry[] = recent.map((t, i) => ({ id: `h${i}`, at: t.createdAt, source: 'app', changes: [{ collection: 'transactions', id: t.id, before: null, after: t }] }))

  return {
    schemaVersion: SCHEMA_VERSION,
    budgetId: `synthetic-${movements}`,
    isDemo: true,
    settings: { currency: 'CAD', numberLocale: 'es-MX', dateStyle: 'medium', timeZone, language: 'es', fallbackHorizonDays: null, weeklyReview: true, ...defaultSettingsV9() },
    accounts,
    transactions,
    schedules,
    goals: [],
    categories: [],
    ...defaultCollectionsV9(),
    categoryLimits: [{ categoryId: 'dining', monthlyLimitMinor: 30000 }],
    categoryRules: [{ id: 'r1', pattern: 'Café', kind: 'expense', categoryId: 'dining', createdAt: anchorSetAt, updatedAt: anchorSetAt }],
    trash,
    purgedImportRefs: [],
    favorites: [],
    reconciliations: [],
    backup: { reminder: 'off' },
    periodBudgets: [],
    scenarios: [],
    inbox: { snoozed: [], dismissed: [] },
    incomeDistributions: [],
    templates: [],
    history,
    historyStartedAt: history[0]?.at ?? anchorSetAt,
    createdAt: anchorSetAt,
    updatedAt: anchorSetAt,
    revision: 1,
  } as AppData
}

/** Días cubiertos por los datos (para documentar las mediciones). */
export function syntheticSpanDays(data: AppData): number {
  const dates = data.transactions.map((t) => t.date).sort()
  return dates.length ? daysBetween(dates[0]!, dates[dates.length - 1]!) : 0
}
