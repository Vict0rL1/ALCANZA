import { describe, expect, it } from 'vitest'
import { countEntries, entryToDraft, parseEntry, parseText, type ParseContext } from './parser'
import { EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS } from './categories'

/**
 * F2 (ronda 3): las comas separan movimientos («pizza 20, cine 15») pero NUNCA parten un importe
 * («rent 1,450», «café 3,50»). Todas las pruebas pasan por `parseText`, que es lo que usa el
 * asistente: `parseEntry` solo ya leía bien estos números y por eso el fallo no se veía.
 */
const ctx = (currency: string, language: ParseContext['language']): ParseContext => ({
  today: '2026-10-07',
  currency,
  language,
  categories: [...EXPENSE_CATEGORY_IDS.map((id) => ({ id, kind: 'expense' as const })), ...INCOME_CATEGORY_IDS.map((id) => ({ id, kind: 'income' as const }))],
})
const amounts = (text: string, currency: string, language: ParseContext['language']) => parseText(text, ctx(currency, language)).map((e) => e.amountMinor)

describe('comas dentro de un importe (parseText)', () => {
  it.each([
    ['rent 1,450', 'CAD', 'en', [145000]],
    ['groceries 1,234.56', 'CAD', 'en', [123456]],
    ['coffee 4.50, uber 12', 'CAD', 'en', [450, 1200]],
    ['supermercado 1,234.56', 'MXN', 'es', [123456]],
    ['renta 1,450', 'MXN', 'es', [145000]],
    ['café 3,50', 'EUR', 'es', [350]],
    ['supermercado 1.234,56', 'EUR', 'es', [123456]],
    ['café 3,50, uber 12', 'EUR', 'es', [350, 1200]],
    ['loyer 1 450,50', 'EUR', 'fr', [145050]],
    ['café 3,50 et taxi 12', 'EUR', 'fr', [350, 1200]],
    ['mercado 1.234,56', 'BRL', 'pt', [123456]],
    ['pizza 20, cinema 15', 'BRL', 'pt', [2000, 1500]],
    ['pizza 20, cine 15', 'MXN', 'es', [2000, 1500]],
    ['pizza 20,cine 15', 'MXN', 'es', [2000, 1500]],
  ])('%s (%s/%s) → %j', (text, currency, language, expected) => {
    expect(amounts(text, currency, language as ParseContext['language'])).toEqual(expected)
  })

  it('COP con puntos de miles: «arriendo 1.200.000, luz 85.000» son dos movimientos con sus importes exactos', () => {
    const c = ctx('COP', 'es')
    const entries = parseText('arriendo 1.200.000, luz 85.000', c)
    expect(entries.map((e) => e.amountMinor)).toEqual([parseEntry('arriendo 1.200.000', c).amountMinor, parseEntry('luz 85.000', c).amountMinor])
    expect(entries.map((e) => e.description)).toEqual(['arriendo', 'luz'])
  })
})

describe('varios importes en una línea y tope de líneas (F1)', () => {
  it('«café 4.50 uber 12» no pierde el segundo importe en silencio: queda marcada para revisar', () => {
    const [entry, ...rest] = parseText('café 4.50 uber 12', ctx('CAD', 'en'))
    expect(rest).toEqual([])
    expect(entry!.amountMinor).toBe(450)
    expect(entry!.hints).toContain('multipleAmounts')
    expect(entry!.confidence).toBeLessThan(0.6)
  })

  it('una línea con un solo importe no se marca', () => {
    expect(parseText('uber 12 ayer', ctx('MXN', 'es'))[0]!.hints).not.toContain('multipleAmounts')
  })

  it('countEntries cuenta todas las líneas; parseText analiza las primeras 200', () => {
    const text = Array.from({ length: 205 }, (_, i) => `gasto ${i + 1}`).join('\n')
    expect(countEntries(text)).toBe(205)
    expect(parseText(text, ctx('MXN', 'es'))).toHaveLength(200)
    expect(countEntries('café 4.50\nuber 12\nsupermercado 45.20')).toBe(3)
  })
})

describe('diccionario (G4): helados y transferencias a ahorros', () => {
  it.each([
    ['helado 45', 'MXN', 'es'],
    ['ice cream 5', 'CAD', 'en'],
    ['sorvete 8', 'BRL', 'pt'],
    ['glace 4', 'EUR', 'fr'],
    ['gelato 6', 'EUR', 'es'],
  ] as const)('«%s» → restaurantes y café', (text, currency, language) => {
    expect(parseText(text, ctx(currency, language))[0]!.categoryId).toBe('dining')
  })

  it.each([
    ['transferencia a ahorros 200', 'MXN', 'es'],
    ['transfer to savings 200', 'CAD', 'en'],
    ['transferência para poupança 200', 'BRL', 'pt'],
    ['virement épargne 200', 'EUR', 'fr'],
  ] as const)('«%s» sugiere Transferencia con confianza < 0,6 y marca de revisión; nunca un gasto', (text, currency, language) => {
    const [entry] = parseText(text, ctx(currency, language))
    expect(entry!.kind).toBe('transfer')
    expect(entry!.amountMinor).toBe(20000)
    expect(entry!.confidence).toBeLessThan(0.6)
    expect(entry!.hints).toContain('transferKeyword')
    expect(entryToDraft(entry!)).toBeNull()
  })
})
