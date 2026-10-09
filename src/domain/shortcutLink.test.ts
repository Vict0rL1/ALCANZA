import { describe, expect, it } from 'vitest'
import { parseShortcutAmount, readMovementLink, suggestCategoryForMerchant } from './shortcutLink'
import { sourceGroupOf } from './txFilters'
import type { Transaction } from './types'
import { LIMITS } from './validation'

const q = (s: string) => new URLSearchParams(s)
const CAD = { currency: 'CAD', numberLocale: 'en-CA' }

describe('L1 · enlace externo a «nuevo movimiento»', () => {
  it('`amount` sigue en unidades menores (enlaces internos, V4) e `importe` en unidades mayores', () => {
    expect(readMovementLink(q('amount=25'), CAD).amountMinor).toBe(25) // 0.25
    expect(readMovementLink(q('importe=25'), CAD).amountMinor).toBe(2500) // 25.00
  })

  it('si vienen los dos, manda `importe`', () => {
    expect(readMovementLink(q('amount=25&importe=12.50'), CAD).amountMinor).toBe(1250)
  })

  it('acepta lo que produce Atajos en cualquier idioma', () => {
    for (const [text, minor] of [
      ['12.50', 1250],
      ['12,50', 1250],
      ['C$12.50', 1250],
      ['CA$12.50', 1250],
      ['$12.50', 1250],
      ['1,234.56', 123456],
      ['1.234,56', 123456],
      ['12 CAD', 1200],
      [' 12.50 ', 1250],
    ] as const) {
      expect(parseShortcutAmount(text, 'CAD', 'en-CA'), text).toEqual({ ok: true, minor })
    }
    // Otra moneda: se rellena el número tal cual, pero se avisa (nunca se convierte).
    expect(parseShortcutAmount('12 USD', 'CAD', 'en-CA')).toEqual({ ok: true, minor: 1200, foreignCurrency: 'USD' })
    expect(parseShortcutAmount('US$12.50', 'CAD', 'en-CA')).toEqual({ ok: true, minor: 1250, foreignCurrency: 'USD' })
    expect(parseShortcutAmount('12 USD', 'USD', 'en-US')).toEqual({ ok: true, minor: 1200 })
    expect(parseShortcutAmount('1.234,56', 'EUR', 'es-ES')).toEqual({ ok: true, minor: 123456 })
  })

  it('lo que no se entiende deja el importe vacío y lo dice; nunca adivina', () => {
    for (const text of ['doce', 'abc12', '12.50.30', '-5', '0', '']) {
      const link = readMovementLink(q(`importe=${encodeURIComponent(text)}`), CAD)
      expect(link.amountMinor, text).toBeUndefined()
      expect(link.amountUnreadable, text).toBe(true)
    }
    // Enorme: por encima del máximo que admite Clara.
    expect(readMovementLink(q('importe=99999999999999'), CAD).amountUnreadable).toBe(true)
    // Grande pero válido: se rellena; al guardar, la confirmación de importe desproporcionado (G5).
    expect(readMovementLink(q('importe=50000'), CAD).amountMinor).toBe(5_000_000)
  })

  it('`comercio` rellena el comercio (recortado) y `source=shortcut` marca el origen', () => {
    const link = readMovementLink(q('kind=expense&importe=12.50&comercio=%20Starbucks%20&source=shortcut'), CAD)
    expect(link).toMatchObject({ amountMinor: 1250, merchant: 'Starbucks', fromShortcut: true, kind: 'expense' })
    expect(readMovementLink(q('source=otra-cosa'), CAD).fromShortcut).toBe(false)
    expect(readMovementLink(q('comercio=' + 'x'.repeat(500)), CAD).merchant).toHaveLength(LIMITS.nameMax)
    expect(readMovementLink(q('comercio='), CAD).merchant).toBeUndefined()
  })

  it('el comercio sugiere categoría: regla de la persona > aprendizaje > diccionario', () => {
    const base = { transactions: [] as Transaction[], categoryRules: [], categories: [] }
    expect(suggestCategoryForMerchant('Starbucks', 'expense', base)).toBe('dining')
    const withRule = { ...base, categoryRules: [{ id: 'r1', pattern: 'starbucks', kind: 'expense' as const, categoryId: 'groceries', createdAt: '2026-09-01T00:00:00.000Z' }] }
    expect(suggestCategoryForMerchant('Starbucks', 'expense', withRule as never)).toBe('groceries')
    const learned = { ...base, transactions: [{ id: 't', kind: 'expense', status: 'realized', categoryId: 'health', note: 'farmaplus', merchant: 'Farmaplus', amountMinor: 100 }] as unknown as Transaction[] }
    expect(suggestCategoryForMerchant('Farmaplus', 'expense', learned)).toBe('health')
    expect(suggestCategoryForMerchant('Zzqx', 'expense', base)).toBeUndefined()
  })

  it('el origen «atajo» se distingue en los filtros', () => {
    expect(sourceGroupOf({ source: 'shortcut' } as Transaction)).toBe('shortcut')
  })
})
