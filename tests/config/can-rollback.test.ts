import { describe, expect, it } from 'vitest'
import { canRollback, deploymentMessage, schemaFrom } from '../../scripts/can-rollback.mjs'

describe('J5 · ¿se puede volver a un despliegue anterior?', () => {
  it('solo con el mismo SCHEMA_VERSION', () => {
    expect(canRollback(10, 10).ok).toBe(true)
    // V2: la versión con esquema 8 muestra una página en blanco con datos en esquema 10.
    const down = canRollback(10, 8)
    expect(down.ok).toBe(false)
    expect(down.reason).toMatch(/hacia delante/)
    // «Volver» a un esquema mayor migraría los datos de todos: es un despliegue normal, no una vuelta atrás.
    expect(canRollback(10, 11).ok).toBe(false)
  })

  it('entiende un número, el mensaje del despliegue o un commit de git', () => {
    const readTypes = (ref: string) => (ref === 'abc1234' ? "export const SCHEMA_VERSION = 9 as const\n" : null)
    expect(schemaFrom('10', readTypes)).toBe(10)
    expect(schemaFrom('schemaVersion=10 build=0b99c4c', readTypes)).toBe(10)
    expect(schemaFrom('abc1234', readTypes)).toBe(9)
    expect(() => schemaFrom('no-existe', readTypes)).toThrow(/no se reconoce/i)
  })

  it('el mensaje de cada despliegue lleva el esquema y la compilación', () => {
    expect(deploymentMessage(10, '0b99c4c5d6e7f8')).toBe('schemaVersion=10 build=0b99c4c')
  })
})
