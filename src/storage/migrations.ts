/**
 * Migraciones del formato guardado. Cada vez que cambie `SCHEMA_VERSION`,
 * añade aquí una función que convierta la versión anterior a la nueva.
 * Nunca se borra información sin una migración explícita y probada.
 */
import { SCHEMA_VERSION } from '../domain/types'

type Raw = Record<string, unknown>

const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  // Ejemplo para el futuro:
  // 1: (raw) => ({ ...raw, schemaVersion: 2, nuevoCampo: valorPorDefecto }),
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
