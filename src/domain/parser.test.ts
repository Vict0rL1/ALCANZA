import { describe, expect, it } from 'vitest'
import { entryToDraft, learnCategories, parseEntry, parseText, type ParseContext } from './parser'
import { EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS } from './categories'
import { baseData, tx } from '../test/fixtures'

const TODAY = '2026-10-07' // miércoles
const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  today: TODAY,
  currency: 'MXN',
  language: 'es',
  categories: [...EXPENSE_CATEGORY_IDS.map((id) => ({ id, kind: 'expense' as const })), ...INCOME_CATEGORY_IDS.map((id) => ({ id, kind: 'income' as const }))],
  ...over,
})

// Los casos con comas y separadores de miles también se prueban a través de `parseText` en
// `parser.split.test.ts` (F2): `parseEntry` leía bien «1,450» mientras `splitEntries` lo partía.
describe('parser local (§8): importes', () => {
  it.each([
    ['café 25', 2500],
    ['café 25.50', 2550],
    ['café 25,50', 2550],
    ['renta 1,234.56', 123456],
    ['renta 1.234,56', 123456],
    ['renta 1 234,56', 123456],
    ['$25 café', 2500],
    ['25€ café', 2500],
    ['café $ 25.5', 2550],
    ['bono 25k', 2500000],
    ['bono 2.5k', 250000],
    ['renta 25 mil', 2500000],
    ['venta 1.2M', 120000000],
    ['veinticinco de café', 2500],
    ['dos mil quinientos de renta', 250000],
    ['twenty five coffee', 2500],
    ['one hundred and fifty rent', 15000],
    ['cinquante euros de courses', 5000],
    ['cem reais de mercado', 10000],
    ['café 0.99', 99],
    ['pago 1000', 100000],
  ])('«%s» → %i', (text, minor) => {
    expect(parseEntry(text, ctx()).amountMinor).toBe(minor)
  })

  it('moneda sin decimales (COP): «25.000» son 25 000 pesos; «25,5» se redondea a entero', () => {
    expect(parseEntry('almuerzo 25.000', ctx({ currency: 'COP' })).amountMinor).toBe(25000)
    expect(parseEntry('almuerzo 25k', ctx({ currency: 'COP' })).amountMinor).toBe(25000)
    expect(parseEntry('almuerzo 25,5', ctx({ currency: 'COP' })).amountMinor).toBe(25)
  })

  it('sin importe: lo dice y no inventa uno; la fecha no se confunde con un importe', () => {
    const e = parseEntry('café con Ana', ctx())
    expect(e.amountMinor).toBeNull()
    expect(e.hints).toContain('noAmount')
    expect(e.confidence).toBeLessThan(0.3)
    expect(entryToDraft(e)).toBeNull()
    const d = parseEntry('cena 15/10 450', ctx())
    expect(d.amountMinor).toBe(45000)
    expect(d.date).toBe('2026-10-07') // 15/10 es futuro: se usa hoy
  })
})

describe('parser local: tipo, fecha, comercio y separadores', () => {
  it.each([
    ['cobré 500 de freelance', 'income'],
    ['me pagaron 1200', 'income'],
    ['sueldo 15000', 'income'],
    ['got paid 2000', 'income'],
    ['salary 3000', 'income'],
    ['recebi 800 do cliente', 'income'],
    ['salaire 2500', 'income'],
    ['café 25', 'expense'],
    ['uber 80', 'expense'],
    ['refund from amazon 30', 'income'],
  ])('«%s» es %s', (text, kind) => {
    expect(parseEntry(text, ctx()).kind).toBe(kind)
  })

  it.each([
    ['café 25 ayer', '2026-10-06'],
    ['café 25 anteayer', '2026-10-05'],
    ['coffee 4 yesterday', '2026-10-06'],
    ['café 25 hoy', '2026-10-07'],
    ['café 25 el lunes', '2026-10-05'],
    ['coffee 4 last friday', '2026-10-02'],
    ['café 25 el 3 de octubre', '2026-10-03'],
    ['coffee 4 oct 3', '2026-10-03'],
    ['café 25 03/10', '2026-10-03'],
    ['café 25 2026-09-30', '2026-09-30'],
    ['café 25 ontem', '2026-10-06'],
    ['café 25 hier', '2026-10-06'],
    ['café 25 miércoles', '2026-10-07'],
  ])('«%s» → %s', (text, date) => {
    // Texto en inglés con interfaz en inglés: «oct 3» es mes-día; en español «3 oct» es día-mes.
    const e = parseEntry(text, ctx({ language: text.includes('coffee') ? 'en' : 'es' }))
    expect(e.date).toBe(date)
    expect(e.hints).toContain('dateDetected')
    expect(e.amountMinor).toBe(text.includes('coffee') ? 400 : 2500)
  })

  it('comercio tras «en/at» o en mayúscula; la descripción no incluye el importe', () => {
    expect(parseEntry('café 45 en Starbucks', ctx())).toMatchObject({ merchant: 'Starbucks', description: 'café', categoryId: 'dining' })
    expect(parseEntry('lunch at Tim Hortons 12.5', ctx({ language: 'en' }))).toMatchObject({ merchant: 'Tim Hortons', categoryId: 'dining', amountMinor: 1250 })
    expect(parseEntry('Uber 80', ctx())).toMatchObject({ categoryId: 'transport', amountMinor: 8000 })
  })

  it.each([
    ['café 25, uber 80 y super 450', 3],
    ['café 25\nuber 80\nsuper 450', 3],
    ['café 25; uber 80', 2],
    ['café 25 and groceries 45', 2],
    ['café con leche y pan 25', 1],
    ['renta 5000, luz 300, agua 150, internet 500', 4],
  ])('«%s» → %i entradas', (text, n) => {
    const entries = parseText(text, ctx())
    expect(entries).toHaveLength(n)
    expect(entries.every((e) => e.amountMinor !== null)).toBe(true)
  })

  it('máximo 200 líneas', () => {
    const text = Array.from({ length: 250 }, (_, i) => `gasto ${i + 1}`).join('\n')
    expect(parseText(text, ctx())).toHaveLength(200)
  })
})

describe('parser local: categorías (diccionario, aprendizaje, reglas) y confianza', () => {
  it.each([
    ['café 25', 'dining'],
    ['uber 80', 'transport'],
    ['gasolina 500', 'fuel'],
    ['super 450', 'groceries'],
    ['netflix 199', 'subscriptions'],
    ['farmacia 120', 'health'],
    ['renta 5000', 'housing'],
    ['luz 300', 'utilities'],
    ['internet 500', 'phone_internet'],
    ['cine 150', 'entertainment'],
    ['tenis 1200', 'shopping'],
    ['regalo mamá 400', 'gifts'],
    ['croquetas perro 300', 'pets'],
    ['guardería 2500', 'children'],
    ['corte de pelo 150', 'personal'],
    ['curso udemy 200', 'education'],
    ['sueldo 15000', 'salary'],
    ['cobré freelance 500', 'freelance'],
    ['groceries 45', 'groceries'],
    ['courses 50', 'groceries'],
    ['aluguel 1500', 'housing'],
    ['loyer 900', 'housing'],
  ])('«%s» → %s', (text, categoryId) => {
    const e = parseEntry(text, ctx())
    expect(e.categoryId).toBe(categoryId)
    expect(e.hints).toContain('categoryDictionary')
  })

  it('sin pista de categoría no la inventa; una categoría archivada no se sugiere', () => {
    expect(parseEntry('cosa 25', ctx()).categoryId).toBeUndefined()
    expect(parseEntry('netflix 199', ctx({ categories: ctx().categories.filter((c) => c.id !== 'subscriptions') })).categoryId).toBeUndefined()
  })

  it('aprende del historial: la palabra se asocia a la categoría más usada (≥ 2 veces y mayoría)', () => {
    const data = baseData({
      transactions: [
        tx({ id: '1', note: 'Oxxo', categoryId: 'groceries' }),
        tx({ id: '2', note: 'oxxo cerveza', categoryId: 'groceries' }),
        tx({ id: '3', note: 'OXXO', categoryId: 'dining' }),
        tx({ id: '4', note: 'cena', categoryId: 'dining' }),
      ],
    })
    const learned = learnCategories(data)
    expect(learned).toEqual({ oxxo: 'groceries' })
    const e = parseEntry('oxxo 45', ctx({ learned }))
    expect(e).toMatchObject({ categoryId: 'groceries' })
    expect(e.hints).toContain('categoryLearned')
    expect(e.confidence).toBeGreaterThan(parseEntry('cosa 45', ctx()).confidence)
  })

  it('las reglas de la persona mandan sobre el diccionario', () => {
    const e = parseEntry('café oxxo 45', ctx({ rules: [{ pattern: 'oxxo', kind: 'expense', categoryId: 'groceries' }] }))
    expect(e.categoryId).toBe('groceries')
    expect(e.hints).toContain('categoryRule')
  })

  it('la confianza sube con importe, categoría y fecha, y nunca pasa de 0.95', () => {
    const a = parseEntry('cosa 45', ctx()).confidence
    const b = parseEntry('café 45', ctx()).confidence
    const c = parseEntry('café 45 ayer', ctx()).confidence
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(c).toBeLessThanOrEqual(0.95)
    expect(parseEntry('veinticinco de café', ctx()).confidence).toBeLessThan(b)
  })

  it('entryToDraft produce un borrador con origen «ai_text» sin cuenta ni id', () => {
    const d = entryToDraft(parseEntry('café 45 en Starbucks ayer', ctx()), 'ai_text')
    expect(d).toEqual({ kind: 'expense', amountMinor: 4500, date: '2026-10-06', note: 'café', categoryId: 'dining', merchant: 'Starbucks', source: 'ai_text' })
  })
})
