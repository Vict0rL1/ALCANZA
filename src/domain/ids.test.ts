import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidId, newId } from './ids'

describe('ids', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sin contexto seguro (la app abierta por IP en la red local) también genera UUID v4 válidos', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('randomUUID no disponible')
    })
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(isValidId(id)).toBe(true)
    }
  })
})
