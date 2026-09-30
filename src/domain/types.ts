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

export const SCHEMA_VERSION = 6 as const

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

/**
 * 'adjustment' = ajuste de conciliación: corrige el saldo de UNA cuenta para que
 * coincida con el saldo observado en el banco. No es ingreso ni gasto: no aparece
 * en resúmenes de consumo ni en el promedio de gasto diario.
 */
export type TxKind = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment'
export type TxStatus = 'planned' | 'realized'
export type AdjustmentDirection = 'increase' | 'decrease'

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
  /** Solo ajustes: si sube o baja el saldo de la cuenta (el importe siempre es positivo). */
  adjustmentDirection?: AdjustmentDirection
  /** Solo ajustes: conciliación que lo originó. */
  reconciliationId?: string
  /**
   * Solo liquidaciones de ocurrencias: `true` = pago o cobro parcial, todavía se espera
   * el resto. Una ocurrencia queda cerrada cuando tiene una liquidación NO parcial.
   */
  partialSettlement?: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Rango de un ingreso variable. El importe esperado es `Schedule.amountMinor`. */
export interface IncomeRange {
  /** Mínimo estimado (≥ 0). También es una estimación, no una garantía. */
  minMinor: number
  /** Escenario extra u optimista (≥ esperado). */
  extraMinor: number
}

export type IncomeScenario = 'min' | 'expected' | 'extra'

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
  /** Solo ingresos variables: mínimo y extra. `amountMinor` es el esperado. */
  range?: IncomeRange
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
  /**
   * Motivo (opcional; las copias antiguas no lo tienen):
   * contribution = aporte confirmado; release = liberado a mano;
   * payment = usado al pagar un gasto planificado; carry = sobrante que pasa al siguiente periodo.
   */
  reason?: AllocationReason
}

export type AllocationReason = 'contribution' | 'release' | 'payment' | 'carry'

/** Un periodo ya pagado de un gasto planificado (historial). */
export interface PlannedExpenseCycle {
  dueDate: LocalDate
  targetMinor: number
  /** Lo que estaba apartado al pagar. */
  reservedMinor: number
  paidMinor: number
  /** Movimiento real del pago. */
  txId: string
  /** Qué se hizo con el sobrante (si lo hubo). */
  surplus: 'none' | 'release' | 'carry'
  paidAt: Timestamp
}

/** Datos extra de una meta de tipo «gasto planificado» (matrícula, seguro, regalos…). */
export interface PlannedExpense {
  /** Cada cuántos meses se repite (1–24). Sin valor = una sola vez. */
  repeatEveryMonths?: number
  /** Ocurrencia del calendario que este dinero cubrirá (opcional). */
  link?: { scheduleId: string; occurrenceDate: LocalDate }
  /** Categoría del gasto real al pagar. */
  categoryId?: string
  history: PlannedExpenseCycle[]
  /** Solo gastos de una vez: ya se pagó (queda como historial). */
  paidAt?: Timestamp
}

export type GoalFunding = 'budget' | 'external'

export interface Goal {
  id: string
  name: string
  /** 'expense' = gasto planificado (anual o poco frecuente): exige fecha de vencimiento. */
  kind: 'goal' | 'emergency' | 'expense'
  targetMinor: number
  /** En gastos planificados, la fecha de vencimiento del periodo actual. */
  targetDate?: LocalDate
  currency: CurrencyCode
  /**
   * 'budget': el dinero apartado está en cuentas del presupuesto y se descuenta del disponible.
   * 'external': el dinero está en otra cuenta fuera del presupuesto; solo se registra el progreso.
   */
  fundedFrom: GoalFunding
  allocations: GoalAllocation[]
  /** Solo `kind: 'expense'`. */
  plan?: PlannedExpense
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

/**
 * Regla de categoría: si la descripción contiene `pattern` (sin distinguir mayúsculas
 * ni acentos), se propone `categoryId`. Solo PROPONE: la persona puede cambiarla.
 */
export interface CategoryRule {
  id: string
  pattern: string
  kind: 'expense' | 'income'
  categoryId: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/**
 * Movimiento en la papelera. Ya NO está en `transactions`, así que no participa en
 * saldos, presupuestos, proyecciones ni reportes. Una transferencia es un único
 * registro con sus dos lados, por lo que se elimina y restaura completa.
 */
export interface TrashEntry {
  /** Igual al id del movimiento. */
  id: string
  deletedAt: Timestamp
  transaction: Transaction
  /** Devoluciones que perdieron el vínculo con este gasto al eliminarlo (se recuperan al restaurar). */
  unlinkedRefundIds: string[]
}

/** Plantilla de un gasto o ingreso frecuente. Nunca registra nada por sí sola. */
export interface Favorite {
  id: string
  name: string
  kind: 'expense' | 'income'
  /** Puede apuntar a una cuenta que ya no existe: el formulario pide elegir otra. */
  accountId: string
  categoryId: string
  amountMinor?: number
  note?: string
  /** Posición en la lista (0, 1, 2…). */
  order: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type ReconciliationResolution = 'matched' | 'adjusted' | 'unresolved'

/** Comparación entre el saldo de la app y el saldo observado en el banco o en efectivo. */
export interface Reconciliation {
  id: string
  accountId: string
  /** Fecha del saldo observado (fin de ese día). */
  date: LocalDate
  /** Saldo observado. En tarjetas, negativo = deuda. */
  observedMinor: number
  /** Saldo calculado por la app para esa fecha, ANTES de cualquier ajuste. */
  computedMinor: number
  /** observado − calculado. */
  differenceMinor: number
  resolution: ReconciliationResolution
  /** Solo si se resolvió con un ajuste. */
  adjustmentTxId?: string
  /** Motivo del ajuste o nota de la persona. */
  reason?: string
  /** Huella del saldo de referencia y los movimientos hasta `date` al conciliar (detecta cambios posteriores). */
  fingerprint: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export type BackupReminder = 'weekly' | 'monthly' | 'off'

/**
 * Registro de copias de seguridad de ESTE dispositivo. Cambiarlo no cuenta como
 * "dato nuevo" (no modifica `AppData.updatedAt`).
 */
export interface BackupState {
  reminder: BackupReminder
  /** Cuándo se generó y se pidió al navegador descargar la última copia (no prueba que se guardara). */
  lastExportAt?: Timestamp
  /** `updatedAt` de los datos exportados: si los datos cambian después, hay cambios sin respaldar. */
  lastExportDataAt?: Timestamp
  /** Cuándo la persona eligió un archivo de copia y la app comprobó que es válido y de este presupuesto. */
  lastVerifiedAt?: Timestamp
  /** Fecha de exportación del archivo verificado. */
  verifiedExportedAt?: Timestamp
  /** No mostrar el recordatorio antes de esta fecha. */
  snoozedUntil?: LocalDate
}

export type NumberLocale ='es-MX' | 'es-ES' | 'en-CA' | 'fr-CA'
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
  /** Mostrar la revisión semanal en Inicio (por defecto sí). */
  weeklyReview?: boolean
}

export type PeriodTemplate = 'semester' | 'trip' | 'custom'

/**
 * Presupuesto para un periodo (semestre, viaje…). ASIGNAR no mueve ni reserva dinero:
 * es un límite para organizarse. Los movimientos se asocian por id (un movimiento puede
 * pertenecer a varios periodos sin duplicarse).
 */
export interface PeriodBudget {
  id: string
  name: string
  template: PeriodTemplate
  startDate: LocalDate
  endDate: LocalDate
  allocatedMinor: number
  currency: CurrencyCode
  /** Gastos y devoluciones asociados (ids de movimientos). */
  txIds: string[]
  /** Meta de presupuesto usada para reservar dinero para el periodo (opcional). */
  goalId?: string
  /**
   * Regla opcional: al registrar un gasto de estas categorías dentro de las fechas, el
   * formulario PROPONE asociarlo a este periodo (la persona puede desmarcarlo).
   */
  ruleCategoryIds?: string[]
  archived: boolean
  note?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Un cambio simulado. Nunca se aplica a los datos reales. */
export type ScenarioChange =
  /** Compra simulada. Sin `accountId`, en la primera cuenta que cuenta para el presupuesto. */
  | { type: 'purchase'; amountMinor: number; date: LocalDate; note?: string; accountId?: string }
  | { type: 'scheduleAmount'; scheduleId: string; newAmountMinor: number }
  /** Ingreso hipotético: solo entra en la proyección, NUNCA en «Puedes gastar». */
  | { type: 'income'; amountMinor: number; date: LocalDate; note?: string; accountId?: string }

export interface SavedScenario {
  id: string
  name: string
  changes: ScenarioChange[]
  /** Huella de los datos reales cuando se guardó o revisó por última vez. */
  baseFingerprint: string
  createdAt: Timestamp
  updatedAt: Timestamp
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
  categoryRules: CategoryRule[]
  /** Movimientos eliminados que aún se pueden restaurar. */
  trash: TrashEntry[]
  /**
   * Huellas de importación de movimientos eliminados definitivamente (sin datos
   * financieros). Al reimportar un CSV, esas filas se ofrecen desmarcadas.
   */
  purgedImportRefs: string[]
  favorites: Favorite[]
  reconciliations: Reconciliation[]
  backup: BackupState
  periodBudgets: PeriodBudget[]
  scenarios: SavedScenario[]
  createdAt: Timestamp
  updatedAt: Timestamp
  /** Aumenta en cada guardado. Sirve para detectar cambios en otra pestaña. */
  revision: number
}
