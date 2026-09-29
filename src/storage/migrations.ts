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
