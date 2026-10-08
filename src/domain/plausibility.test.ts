import { describe, expect, it } from 'vitest'
import { implausibilityRatio, isImplausibleAmount } from './plausibility'

describe('importes inverosímiles (G5)', () => {
  it('menos de 1 000 en la unidad mayor nunca es inverosímil, aunque supere 20× el disponible', () => {
    expect(isImplausibleAmount(25000, 1000, 'MXN')).toBe(false) // 250.00 vs 10.00
    expect(isImplausibleAmount(99999, 100, 'CAD')).toBe(false)
  })
  it('≥ 1 000 y ≥ 20× el disponible pide confirmación', () => {
    expect(isImplausibleAmount(150000, 500, 'MXN')).toBe(true) // 1 500.00 vs 5.00
    expect(isImplausibleAmount(100000, 5000, 'MXN')).toBe(true) // exactamente 20×
    expect(isImplausibleAmount(150000, 10000, 'MXN')).toBe(false) // 15×
    expect(isImplausibleAmount(2000000, 10000, 'MXN')).toBe(true)
  })
  it('sin disponible (0 o negativo) cualquier gasto ≥ 1 000 es inverosímil y la razón es null', () => {
    expect(isImplausibleAmount(100000, 0, 'MXN')).toBe(true)
    expect(isImplausibleAmount(100000, -5000, 'MXN')).toBe(true)
    expect(implausibilityRatio(100000, 0)).toBeNull()
  })
  it('respeta los decimales de la moneda: en COP 1 000 son 1 000 unidades', () => {
    expect(isImplausibleAmount(1000, 10, 'COP')).toBe(true)
    expect(isImplausibleAmount(999, 10, 'COP')).toBe(false)
  })
  it('la razón es entera hacia abajo', () => {
    expect(implausibilityRatio(150000, 500)).toBe(300)
    expect(implausibilityRatio(150000, 7000)).toBe(21)
  })
})
