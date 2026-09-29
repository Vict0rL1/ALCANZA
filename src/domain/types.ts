/**
 * Modelo de datos de Margen.
 *
 * Reglas clave (ver docs/FORMULAS.md):
 * - Todo importe se guarda como ENTERO en unidades menores (centavos para CAD).
 * - Las fechas de calendario (`LocalDate`) son texto 'AAAA-MM-DD' sin hora ni zona.
 * - Las marcas de tiempo (`Timestamp`) son ISO 8601 en UTC ('2026-09-28T14:05:00.000Z').
 * - Un presupuesto usa una sola moneda; cada registro guarda su moneda y se valida.
 */

/** Fecha de calendario 'AAAA-MM-DD' (sin hora ni zona horaria). */
export type LocalDate = string
/** Marca de tiempo ISO 8601 en UTC. */
export type Timestamp = string
/** Código ISO 4217, por ejemplo 'CAD'. */
export type CurrencyCode = string

export const SCHEMA_VERSION = 3 as const

/**
 * 'credit' = tarjeta de crédito: su saldo es una DEUDA y se guarda como número
 * negativo. Las compras son gastos de esa cuenta; el pago de la tarjeta es una
 * transferencia desde otra cuenta (nunca un gasto), así nada se cuenta dos veces.
 */
export type AccountKind = 'bank' | 'cash' | 'savings' | 'credit' | 'other'

/**
 * Saldo de referencia que el usuario escribe (por ejemplo, copiado de su banco).
 * Se considera que incluye todo lo ocurrido hasta `setAt` en la fecha `date`.
 */
export interface BalanceAnchor {
  /** Puede ser negativo (sobregiro). */
  amountMinor: number
  date: LocalDate
  setAt: Timestamp
}

/**
 * Datos opcionales de una tarjeta de crédito. Las cifras derivadas (pago mínimo,
 * intereses) son ESTIMACIONES para orientar; el banco manda.
 */
export interface CardDetails {
  /** Límite de crédito. */
  limitMinor?: number
  /** Tasa anual en puntos básicos (19,99 % = 1999). */
  aprBps?: number
  /** Día del mes de la fecha de corte (1–31; en meses cortos, el último día). */
  statementDay?: number
  /** Día del mes en que vence el pago (1–31; en meses cortos, el último día). */
  dueDay?: number
  /** Pago mínimo: porcentaje de la deuda en puntos básicos (3 % = 300). */
  minPaymentBps?: number
  /** Pago mínimo: importe fijo mínimo. */
  minPaymentFloorMinor?: number
}

export interface Account {
  id: string
  name: string
  kind: AccountKind
  /** Si es `true`, su saldo cuenta para "Disponible hasta el próximo ingreso". */
  includeInBudget: boolean
  anchor: BalanceAnchor
  /** Solo tarjetas de crédito. */
  card?: CardDetails
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type TxKind = 'income' | 'expense' | 'transfer' | 'refund'
export type TxStatus = 'planned' | 'realized'

export interface Transaction {
  id: string
  kind: TxKind
  status: TxStatus
  /** Siempre positivo; el tipo decide si suma o resta. */
  amountMinor: number
  currency: CurrencyCode
  date: LocalDate
  /** Cuenta de origen (o la única cuenta si no es transferencia). */
  accountId: string
  /** Solo transferencias: cuenta de destino. */
  toAccountId?: string
  /** Ingresos, gastos y devoluciones. */
  categoryId?: string
  /** Devoluciones: gasto original (opcional). */
  refundOfId?: string
  note?: string
  /** Si este movimiento liquida una ocurrencia de un pago programado. */
  scheduleId?: string
  occurrenceDate?: LocalDate
  /**
   * Momento en que el movimiento pasó a "realizado". Decide, junto con la fecha,
   * si ya estaba incluido en el saldo de referencia de la cuenta.
   */
  realizedAt?: Timestamp
  /**
   * Huella de la fila del archivo bancario de la que vino (cuenta + fecha + importe +
   * descripción + nº de repetición). Evita importar dos veces la misma fila.
   */
  importRef?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type Frequency = 'once' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'
export type ScheduleKind = 'income' | 'expense'

/** Pago o ingreso programado (único o recurrente). */
export interface Schedule {
  id: string
  name: string
  kind: ScheduleKind
  amountMinor: number
  /** Importe aproximado (por ejemplo, ingresos variables). */
  amountIsEstimate: boolean
  currency: CurrencyCode
  accountId: string
  categoryId?: string
  frequency: Frequency
  /** Primera fecha pendiente. También fija el día del mes para pagos mensuales. */
  startDate: LocalDate
  endDate?: LocalDate
  reminderDaysBefore: number
  /** Ocurrencias que el usuario decidió omitir. */
  skippedDates: LocalDate[]
  note?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Movimiento virtual de dinero hacia (+) o desde (−) una meta. No toca el banco. */
export interface GoalAllocation {
  id: string
  amountMinor: number
  date: LocalDate
  createdAt: Timestamp
}

export type GoalFunding = 'budget' | 'external'

export interface Goal {
  id: string
  name: string
  kind: 'goal' | 'emergency'
  targetMinor: number
  targetDate?: LocalDate
  currency: CurrencyCode
  /**
   * 'budget': el dinero apartado está en cuentas del presupuesto y se descuenta del disponible.
   * 'external': el dinero está en otra cuenta fuera del presupuesto; solo se registra el progreso.
   */
  fundedFrom: GoalFunding
  allocations: GoalAllocation[]
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Categoría creada por la persona. Las fijas viven en `categories.ts`. */
export interface CustomCategory {
  /** Empieza por `c_` para no chocar nunca con una categoría fija. */
  id: string
  name: string
  kind: 'expense' | 'income'
  /** Archivada: no se ofrece en formularios, pero los movimientos antiguos la conservan. */
  archived: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Límite mensual de gasto neto para una categoría (informativo: no cambia el disponible). */
export interface CategoryLimit {
  categoryId: string
  monthlyLimitMinor: number
}

export type NumberLocale = 'es-MX' | 'es-ES' | 'en-CA' | 'fr-CA'
export type DateStyle = 'short' | 'medium' | 'iso'
export type Language = 'es' | 'en'

export interface Settings {
  currency: CurrencyCode
  numberLocale: NumberLocale
  dateStyle: DateStyle
  timeZone: string
  language: Language
  /** Horizonte (días) si no hay un próximo ingreso registrado. `null` = preguntar. */
  fallbackHorizonDays: number | null
}

export interface AppData {
  schemaVersion: typeof SCHEMA_VERSION
  /** Identificador único de este presupuesto (útil para sincronizar en el futuro). */
  budgetId: string
  isDemo: boolean
  settings: Settings
  accounts: Account[]
  transactions: Transaction[]
  schedules: Schedule[]
  goals: Goal[]
  categories: CustomCategory[]
  categoryLimits: CategoryLimit[]
  createdAt: Timestamp
  updatedAt: Timestamp
  /** Aumenta en cada guardado. Sirve para detectar cambios en otra pestaña. */
  revision: number
}
