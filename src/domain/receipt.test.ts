import { describe, expect, it } from 'vitest'
import { amountsInLine, dateInText, merchantInLines, parseReceiptText } from './receipt'
import { TODAY } from '../test/fixtures'

const ctx = { today: TODAY, currency: 'CAD' as const, language: 'es' as const, categories: [{ id: 'groceries', kind: 'expense' as const }, { id: 'dining', kind: 'expense' as const }, { id: 'transport', kind: 'expense' as const }], learned: {}, rules: [] }

describe('recibos: total, fecha, comercio y categoría a partir del texto OCR', () => {
  it('importes de una línea: separadores, sin decimales en COP, años y horas no cuentan', () => {
    // Una cantidad suelta («2») también se lee como importe: por eso la línea «total» tiene prioridad sobre la cifra mayor.
    expect(amountsInLine('Leche 2 x 3.50 = 7.00', 2)).toEqual([200, 350, 700])
    expect(amountsInLine('TOTAL 1,234.56', 2)).toEqual([123456])
    expect(amountsInLine('TOTAL 1.234,56', 2)).toEqual([123456])
    expect(amountsInLine('Fecha 2026 hora 12:30', 2)).toEqual([])
    expect(amountsInLine('TOTAL $ 25.000', 0)).toEqual([25000])
    expect(amountsInLine('nada', 2)).toEqual([])
  })

  it('fecha en varios formatos, nunca futura', () => {
    expect(dateInText('Fecha: 27/09/2026 12:30', TODAY)).toBe('2026-09-27')
    expect(dateInText('2026-09-01', TODAY)).toBe('2026-09-01')
    expect(dateInText('01-09-26', TODAY)).toBe('2026-09-01')
    expect(dateInText('05/10/2026', TODAY)).toBeNull()
    expect(dateInText('sin fecha', TODAY)).toBeNull()
  })

  it('comercio = primera línea en mayúsculas o capitalizada sin importes', () => {
    expect(merchantInLines(['*** SUPERMERCADO LA ESQUINA ***', 'RFC XAXX010101', 'Leche 3.50'])).toBe('SUPERMERCADO LA ESQUINA')
    expect(merchantInLines(['Ticket 1234', 'Café Luna', 'total 4.50'])).toBe('Café Luna')
    expect(merchantInLines(['total 4.50', '12/12/2025'])).toBeNull()
  })

  it('texto completo: total junto a «TOTAL» gana a la cifra mayor; sin palabra total se toma la mayor; categoría por diccionario', () => {
    const r = parseReceiptText('SUPERMERCADO LA ESQUINA\nAv. Siempre Viva 123\n27/09/2026 18:02\nLeche 3.50\nPan 2.25\nVino 18.00\nSUBTOTAL 23.75\nIVA 1.90\nTOTAL 25.65\nEFECTIVO 50.00\nCAMBIO 24.35', ctx)
    expect(r).toMatchObject({ totalMinor: 2565, date: '2026-09-27', merchant: 'SUPERMERCADO LA ESQUINA', categoryId: 'groceries', confidence: 1 })
    // El número de la calle (123) también cuenta como importe visto: solo el total de la línea «TOTAL» se propone.
    expect(r.amountsMinor).toContain(5000)
    expect(r.amountsMinor[0]).toBe(12300)
    const noTotal = parseReceiptText('UBER\nViaje 12.40\nPropina 2.00', ctx)
    expect(noTotal).toMatchObject({ totalMinor: 1240, date: null, merchant: 'UBER', categoryId: 'transport' })
    expect(noTotal.confidence).toBeCloseTo(0.55)
    expect(parseReceiptText('', ctx)).toMatchObject({ totalMinor: null, date: null, merchant: null, categoryId: null, confidence: 0 })
  })
})
