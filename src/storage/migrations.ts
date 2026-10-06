/**
 * Migraciones del formato guardado. Cada vez que cambie `SCHEMA_VERSION`,
 * añade aquí una función que convierta la versión anterior a la nueva.
 * Nunca se borra información sin una migración explícita y probada.
 */
import { SCHEMA_VERSION } from '../domain/types'

type Raw = Record<string, unknown>

const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  /** v1 → v2: categorías personalizadas (lista vacía). Los datos de tarjeta son opcionales. */
  1: (raw) => ({
    ...raw,
    schemaVersion: 2,
    categories: Array.isArray(raw.categories) ? raw.categories : [],
    categoryLimits: Array.isArray(raw.categoryLimits) ? raw.categoryLimits : [],
  }),
  /** v2 → v3: los movimientos pueden llevar `importRef` (opcional); no cambia nada existente. */
  2: (raw) => ({ ...raw, schemaVersion: 3 }),
  /** v3 → v4: reglas de categoría (lista vacía). */
  3: (raw) => ({ ...raw, schemaVersion: 4, categoryRules: Array.isArray(raw.categoryRules) ? raw.categoryRules : [] }),
  /**
   * v4 → v5: papelera, huellas de importación purgadas, favoritos, conciliaciones y
   * registro de copias (recordatorio semanal por defecto, sin exportaciones previas).
   * Los campos nuevos de movimientos y pagos programados son opcionales: nada existente cambia.
   */
  // Solo se rellenan los campos AUSENTES. Si existen con un formato incorrecto se
  // conservan tal cual para que la validación rechace el archivo: nunca se borran datos.
  4: (raw) => ({
    ...raw,
    schemaVersion: 5,
    trash: raw.trash ?? [],
    purgedImportRefs: raw.purgedImportRefs ?? [],
    favorites: raw.favorites ?? [],
    reconciliations: raw.reconciliations ?? [],
    backup: raw.backup ?? { reminder: 'weekly' },
  }),
  /**
   * v5 → v6: presupuestos por periodo, escenarios guardados y preferencia de revisión
   * semanal (activada). Las metas pueden llevar `plan` y los apartados `reason` (opcionales).
   */
  5: (raw) => ({
    ...raw,
    schemaVersion: 6,
    periodBudgets: raw.periodBudgets ?? [],
    scenarios: raw.scenarios ?? [],
    settings:
      raw.settings && typeof raw.settings === 'object' && !Array.isArray(raw.settings) && (raw.settings as Raw).weeklyReview === undefined
        ? { ...(raw.settings as Raw), weeklyReview: true }
        : raw.settings,
  }),
  /**
   * v6 → v7: bandeja de pendientes y distribuciones de ingresos. Las compras divididas
   * (`splits`) y `distributionId` son opcionales: los datos anteriores no cambian.
   */
  6: (raw) => ({
    ...raw,
    schemaVersion: 7,
    inbox: raw.inbox ?? { snoozed: [], dismissed: [] },
    incomeDistributions: raw.incomeDistributions ?? [],
  }),
  /**
   * v7 → v8: plantillas con nombre e historial local. No hay historial anterior: se empieza a
   * capturar desde esta versión (`historyStartedAt` = último guardado conocido).
   */
  7: (raw) => ({
    ...raw,
    schemaVersion: 8,
    templates: raw.templates ?? [],
    history: raw.history ?? [],
    historyStartedAt: raw.historyStartedAt ?? (typeof raw.updatedAt === 'string' ? raw.updatedAt : raw.createdAt),
  }),
}

export function migrate(raw: Raw): Raw {
  let current = raw
  let version = Number(current.schemaVersion)
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) throw new Error(`Falta la migración desde la versión ${version}`)
    current = step(current)
    version = Number(current.schemaVersion)
  }
  return current
}
