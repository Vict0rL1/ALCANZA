import { describe, expect, it } from 'vitest'
import { accountBalance } from './balances'
import {
  defaultSelection,
  detectDelimiter,
  guessMapping,
  isImportable,
  looksLikeCardPayment,
  looksLikeHeader,
  parseBankDate,
  parseCsv,
  possibleDateFormats,
  previewImport,
  type ImportOptions,
} from './bankImport'
import { deleteTransaction, importTransactions, purgeTrash, removeTransactions, restoreFromTrash, saveTransaction, type ImportInput } from './operations'
import type { AppData } from './types'
import { account, baseData, ctx, deepFreeze, tx } from '../test/fixtures'

describe('lectura de CSV', () => {
  it('detecta el separador y respeta comillas, "" escapadas, CRLF y BOM', () => {
    const text = '﻿Fecha;Descripción;Importe\r\n2026-09-01;"Café ""Central""; centro";-4,50\r\n\r\n2026-09-02;"Línea\ncon salto";100\r\n'
    expect(detectDelimiter(text)).toBe(';')
    expect(parseCsv(text)).toEqual([
      ['Fecha', 'Descripción', 'Importe'],
      ['2026-09-01', 'Café "Central"; centro', '-4,50'],
      ['2026-09-02', 'Línea\ncon salto', '100'],
    ])
  })

  it('usa coma o tabulador cuando corresponde', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',')
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('reconoce cabeceras comunes en español, inglés y francés', () => {
    expect(guessMapping(['Fecha', 'Concepto', 'Importe', 'Saldo'])).toEqual({ date: 0, description: 1, amount: 2 })
    expect(guessMapping(['Date', 'Description', 'Withdrawals', 'Deposits', 'Balance'])).toEqual({ date: 0, description: 1, debit: 2, credit: 3 })
    expect(guessMapping(['Date', 'Libellé', 'Montant'])).toEqual({ date: 0, description: 1, amount: 2 })
    expect(guessMapping(['Col1', 'Col2'])).toBeNull()
    expect(looksLikeHeader(['Fecha', 'Concepto', 'Importe'])).toBe(true)
    expect(looksLikeHeader(['2026-09-01', 'Café', '-4.50'])).toBe(false)
  })
})

describe('fechas del banco', () => {
  it('lee ISO, compactas, con hora, día/mes, mes/día y con nombre de mes', () => {
    expect(parseBankDate('2026-09-05', 'dmy')).toBe('2026-09-05')
    expect(parseBankDate('2026/9/5', 'mdy')).toBe('2026-09-05')
    expect(parseBankDate('20260905', 'dmy')).toBe('2026-09-05')
    expect(parseBankDate('2026-09-05T10:30:00', 'dmy')).toBe('2026-09-05')
    expect(parseBankDate('05/09/2026', 'dmy')).toBe('2026-09-05')
    expect(parseBankDate('09/05/2026', 'mdy')).toBe('2026-09-05')
    expect(parseBankDate('5.9.26', 'dmy')).toBe('2026-09-05')
    expect(parseBankDate('5 Sep 2026', 'dmy')).toBe('2026-09-05')
    expect(parseBankDate('05-dic-2026', 'dmy')).toBe('2026-12-05')
  })

  it('rechaza fechas imposibles', () => {
    expect(parseBankDate('31/02/2026', 'dmy')).toBeNull()
    expect(parseBankDate('13/13/2026', 'mdy')).toBeNull()
    expect(parseBankDate('ayer', 'dmy')).toBeNull()
  })

  it('solo propone formatos con los que todas las fechas son válidas', () => {
    expect(possibleDateFormats(['2026-09-01', '2026-09-30'])).toEqual(['ymd'])
    expect(possibleDateFormats(['25/09/2026', '01/09/2026'])).toEqual(['dmy'])
    expect(possibleDateFormats(['09/25/2026', '09/01/2026'])).toEqual(['mdy'])
    // Todas con día ≤ 12: ambiguo, la persona elige.
    expect(possibleDateFormats(['01/09/2026', '05/09/2026'])).toEqual(['dmy', 'mdy'])
  })
})

const options = (overrides: Partial<ImportOptions> = {}): ImportOptions => ({
  accountId: 'bank',
  mapping: { date: 0, description: 1, amount: 2 },
  hasHeader: true,
  dateFormat: 'ymd',
  invertSign: false,
  locale: 'en-CA',
  today: '2026-09-28',
  ...overrides,
})

function data(overrides: Partial<AppData> = {}): AppData {
  return baseData({
    accounts: [account({ id: 'bank', name: 'Banco', anchor: { amountMinor: 100000, date: '2026-09-10', setAt: '2026-09-10T15:00:00.000Z' } })],
    ...overrides,
  })
}

const CSV = [
  ['Fecha', 'Descripción', 'Importe'],
  ['2026-09-05', 'Anterior al saldo', '-10.00'],
  ['2026-09-10', 'Mismo día del saldo', '-20.00'],
  ['2026-09-15', 'Café', '-4.50'],
  ['2026-09-15', 'Café', '-4.50'],
  ['2026-09-20', 'Nómina', '1,200.00'],
  ['2026-09-21', 'Sin importe', ''],
  ['2026-09-40', 'Fecha mala', '-1'],
  ['2026-10-01', 'Futuro', '-1'],
  ['2026-09-22', 'Cero', '0.00'],
]

describe('vista previa de la importación', () => {
  it('clasifica filas, calcula tipo e importe en enteros y marca la relación con el saldo', () => {
    const p = previewImport(CSV, data(), options())
    expect(p.counts).toEqual({ new: 5, duplicate: 0, possibleDuplicate: 0, trashed: 0, purged: 0, error: 4 })
    const [before, sameDay, cafe1, cafe2, salary] = p.rows
    expect(before).toMatchObject({ line: 2, kind: 'expense', amountMinor: 1000, anchorRelation: 'before' })
    expect(sameDay).toMatchObject({ anchorRelation: 'sameDay' })
    expect(salary).toMatchObject({ kind: 'income', amountMinor: 120000, anchorRelation: 'after' })
    // Dos cafés idénticos el mismo día son dos filas distintas (nº de repetición).
    expect(cafe1?.importRef).not.toBe(cafe2?.importRef)
    expect(p.rows.slice(5).map((r) => r.error)).toEqual(['amount', 'date', 'future', 'zero'])
  })

  it('columnas de cargo/abono y signo invertido (tarjetas)', () => {
    const table = [
      ['Date', 'Description', 'Debit', 'Credit'],
      ['2026-09-15', 'Store', '25.00', ''],
      ['2026-09-16', 'Refund', '', '5.00'],
    ]
    const p = previewImport(table, data(), options({ mapping: { date: 0, description: 1, debit: 2, credit: 3 } }))
    expect(p.rows.map((r) => [r.kind, r.amountMinor])).toEqual([['expense', 2500], ['income', 500]])
    const inverted = previewImport([['2026-09-15', 'Compra', '25.00']], data(), options({ hasHeader: false, invertSign: true }))
    expect(inverted.rows[0]).toMatchObject({ line: 1, kind: 'expense', amountMinor: 2500 })
  })

  it('importes con paréntesis o formato europeo', () => {
    const p = previewImport([['2026-09-15', 'A', '(12.34)'], ['2026-09-15', 'B', '-1.234,56']], data(), options({ hasHeader: false }))
    expect(p.rows.map((r) => r.amountMinor)).toEqual([1234, 123456])
  })

  it('posible duplicado: mismo importe y tipo, ±3 días, cuenta igual; cada movimiento empareja una sola fila', () => {
    const manual = tx({ id: 'manual', accountId: 'bank', date: '2026-09-13', amountMinor: 450, categoryId: 'dining' })
    const p = previewImport(CSV, data({ transactions: [manual] }), options())
    expect(p.rows[2]).toMatchObject({ status: 'possibleDuplicate', matchId: 'manual' })
    expect(p.rows[3]?.status).toBe('new')
    // Fuera de la ventana o en otra cuenta no coincide.
    const far = tx({ id: 'far', accountId: 'bank', date: '2026-09-19', amountMinor: 450 })
    expect(previewImport(CSV, data({ transactions: [far] }), options()).counts.possibleDuplicate).toBe(0)
  })

  it('solo las filas nuevas quedan marcadas por defecto', () => {
    const manual = tx({ id: 'manual', accountId: 'bank', date: '2026-09-15', amountMinor: 450 })
    const p = previewImport(CSV, data({ transactions: [manual] }), options())
    expect([...defaultSelection(p)]).toEqual([2, 3, 5, 6])
  })
})

function toInput(d: AppData, lines?: number[]): ImportInput {
  const p = previewImport(CSV, d, options())
  return {
    sameDayAlreadyInBalance: true,
    items: p.rows
      .filter(isImportable)
      .filter((r) => !lines || lines.includes(r.line))
      .map((r) => ({
        id: `imp-${r.line}`,
        kind: r.kind,
        amountMinor: r.amountMinor,
        date: r.date,
        accountId: 'bank',
        categoryId: r.kind === 'income' ? 'other_income' : 'other_expense',
        note: r.description,
        importRef: r.importRef,
      })),
  }
}

describe('importar movimientos', () => {
  it('guarda realizados con su huella; solo cambian el saldo los posteriores al saldo de referencia', () => {
    const d = deepFreeze(data())
    const r = importTransactions(d, toInput(d), ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.ids).toHaveLength(5)
    const bank = r.data.accounts[0]!
    // Antes del saldo (−10) y el mismo día marcado "ya incluido" (−20) no cuentan: −4.50 −4.50 +1200.
    expect(accountBalance(r.data, bank).balanceMinor).toBe(100000 - 900 + 120000)
  })

  it('importar dos veces el mismo archivo no duplica (y confirmar dos veces tampoco)', () => {
    const d = data()
    const first = importTransactions(d, toInput(d), ctx)
    if (!first.ok) throw new Error('import')
    expect(importTransactions(first.data, toInput(d), ctx)).toMatchObject({ ok: true, unchanged: true })
    const preview = previewImport(CSV, first.data, options())
    expect(preview.counts).toMatchObject({ new: 0, duplicate: 5 })
  })

  it('editar un movimiento importado conserva su huella', () => {
    const d = data()
    const r = importTransactions(d, toInput(d, [4]), ctx)
    if (!r.ok) throw new Error('import')
    const imported = r.data.transactions.find((t) => t.id === 'imp-4')!
    const { importRef: _ref, currency: _c, createdAt: _a, updatedAt: _u, realizedAt: _r, ...draft } = imported
    const edited = saveTransaction(r.data, { ...draft, categoryId: 'dining' }, ctx)
    if (!edited.ok) throw new Error('edit')
    expect(edited.data.transactions.find((t) => t.id === 'imp-4')?.importRef).toBe(imported.importRef)
  })

  it('todo o nada: una fila inválida impide importar las demás', () => {
    const d = data()
    const input = toInput(d)
    input.items[1] = { ...input.items[1]!, categoryId: 'salary' }
    const r = importTransactions(d, input, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.path).toBe('items[1].categoryId')
  })

  it('deshacer quita exactamente los movimientos importados', () => {
    const existing = tx({ id: 'keep', accountId: 'bank', date: '2026-09-12' })
    const d = data({ transactions: [existing] })
    const r = importTransactions(d, toInput(d), ctx)
    if (!r.ok) throw new Error('import')
    const undone = removeTransactions(r.data, r.value.ids, ctx)
    expect(undone.ok && undone.data.transactions.map((t) => t.id)).toEqual(['keep'])
  })
})

describe('moneda de las filas importadas (QA-05)', () => {
  const row = (amount: string, extra: Partial<ImportOptions> = {}) => previewImport([['2026-09-15', 'Fila', amount]], data(), options({ hasHeader: false, ...extra })).rows[0]!

  it('la moneda del presupuesto, escrita como código, prefijo o símbolo, se acepta sin tocar el número', () => {
    expect(row('CAD 12.00')).toMatchObject({ status: 'new', kind: 'income', amountMinor: 1200, currency: 'CAD' })
    expect(row('-12.00 CAD')).toMatchObject({ status: 'new', kind: 'expense', amountMinor: 1200, currency: 'CAD' })
    expect(row('CA$12.00')).toMatchObject({ status: 'new', amountMinor: 1200, currency: 'CAD' })
    expect(row('(1,200.00 CAD)')).toMatchObject({ status: 'new', kind: 'expense', amountMinor: 120000, currency: 'CAD' })
    expect(row('1.234,56 CAD', { locale: 'es-ES' })).toMatchObject({ status: 'new', amountMinor: 123456, currency: 'CAD' })
    // «$» solo no dice qué dólar es: se acepta por ser compatible con CAD, pero no se registra moneda explícita.
    const dollar = row('$ 45')
    expect(dollar).toMatchObject({ status: 'new', amountMinor: 4500 })
    expect(dollar.currency).toBeUndefined()
    expect(row('45')).toMatchObject({ status: 'new', amountMinor: 4500 })
  })

  it.each([
    ['USD 100.00', 'USD'],
    ['100.00 usd', 'USD'],
    ['US$100.00', 'USD'],
    ['EUR 12', 'EUR'],
    ['12,50 €', '€'],
    ['€12', '€'],
    ['JPY 100', 'JPY'],
    ['¥100', '¥'],
    ['(USD 100.00)', 'USD'],
    ['-1.234,56 EUR', 'EUR'],
  ])('«%s» en un presupuesto CAD no se importa: error de moneda con la marca «%s», nunca se asume CAD', (amount, found) => {
    const r = row(amount, { locale: amount.includes(',') && !amount.includes('.') ? 'es-ES' : 'en-CA' })
    expect(r).toMatchObject({ status: 'error', error: 'currency', currency: found, date: '2026-09-15' })
    expect(r.amountMinor).toBeUndefined()
    expect(isImportable(r)).toBe(false)
  })

  it('un código que no es moneda conocida se rechaza igual', () => {
    expect(row('XYZ 10.00')).toMatchObject({ status: 'error', error: 'currency', currency: 'XYZ' })
    expect(row('XY$ 10.00')).toMatchObject({ status: 'error', error: 'currency', currency: 'XY$' })
  })

  it('con cargo y abono separados la regla es la misma por columna', () => {
    const mapping = { date: 0, description: 1, debit: 2, credit: 3 }
    const p = previewImport(
      [
        ['2026-09-15', 'Store', 'USD 25.00', ''],
        ['2026-09-16', 'Refund', '', '5.00 CAD'],
        ['2026-09-17', 'Both', '1.00', '€2.00'],
      ],
      data(),
      options({ hasHeader: false, mapping }),
    )
    expect(p.rows.map((r) => [r.status, r.error, r.currency])).toEqual([
      ['error', 'currency', 'USD'],
      ['new', undefined, 'CAD'],
      ['error', 'currency', '€'],
    ])
    expect(p.rows[1]).toMatchObject({ kind: 'income', amountMinor: 500 })
  })

  it('columna de moneda: coincide, vacía o distinta (sin importar mayúsculas); el importe puede contradecirla', () => {
    const table = [
      ['Fecha', 'Concepto', 'Importe', 'Moneda'],
      ['2026-09-15', 'Igual', '-10.00', 'CAD'],
      ['2026-09-15', 'Vacía', '-10.00', ''],
      ['2026-09-15', 'Otra', '-10.00', 'usd'],
      ['2026-09-15', 'Desconocida', '-10.00', 'XYZ'],
      ['2026-09-15', 'Contradice', 'USD 10.00', 'CAD'],
    ]
    expect(guessMapping(table[0]!)).toEqual({ date: 0, description: 1, amount: 2, currency: 3 })
    const p = previewImport(table, data(), options({ mapping: guessMapping(table[0]!)! }))
    expect(p.rows.map((r) => [r.status, r.error, r.currency])).toEqual([
      ['new', undefined, 'CAD'],
      ['new', undefined, undefined],
      ['error', 'currency', 'USD'],
      ['error', 'currency', 'XYZ'],
      ['error', 'currency', 'USD'],
    ])
    expect(p.counts).toMatchObject({ new: 2, error: 3 })
    // La cabecera de moneda no roba la columna de descripción ni la de importe.
    expect(guessMapping(['Date', 'Currency', 'Description', 'Amount'])).toEqual({ date: 0, description: 2, amount: 3, currency: 1 })
    expect(guessMapping(['Date', 'Libellé', 'Montant', 'Devise'])).toEqual({ date: 0, description: 1, amount: 2, currency: 3 })
  })

  it('moneda declarada para todo el archivo: distinta de la del presupuesto → ninguna fila se importa; igual → como si no se dijera', () => {
    const usd = previewImport(CSV, data(), options({ fileCurrency: 'USD' }))
    const withDate = usd.rows.filter((r) => r.error !== 'date')
    expect(withDate.every((r) => r.status === 'error' && r.error === 'currency' && r.currency === 'USD')).toBe(true)
    expect(usd.counts).toEqual({ new: 0, duplicate: 0, possibleDuplicate: 0, trashed: 0, purged: 0, error: CSV.length - 1 })
    expect([...defaultSelection(usd)]).toEqual([])
    const cad = previewImport(CSV, data(), options({ fileCurrency: 'cad' }))
    expect(cad.rows).toEqual(previewImport(CSV, data(), options()).rows)
  })

  it('las filas importadas llevan la moneda del presupuesto', () => {
    const d = data()
    const r = importTransactions(d, toInput(d), ctx)
    if (!r.ok) throw new Error('import')
    expect(r.data.transactions.every((t) => t.currency === 'CAD')).toBe(true)
  })
})

describe('contrato de duplicados tras borrar, enviar a la papelera, restaurar o eliminar definitivamente', () => {
  it('borrado directo → vuelve como nueva; papelera → «en la papelera»; restaurar → duplicado; eliminar definitivamente → «eliminada»', () => {
    const d = data()
    const imported = importTransactions(d, toInput(d, [4]), ctx)
    if (!imported.ok) throw new Error('import')
    const status = (x: AppData) => previewImport(CSV, x, options()).rows[2]!.status
    expect(status(imported.data)).toBe('duplicate')
    // Deshacer la importación (borrado directo) no deja huella: la fila es nueva otra vez.
    const removed = removeTransactions(imported.data, imported.value.ids, ctx)
    if (!removed.ok) throw new Error('remove')
    expect(status(removed.data)).toBe('new')
    // Papelera: no se restaura ni se duplica desde la importación.
    const trashed = deleteTransaction(imported.data, 'imp-4', ctx)
    if (!trashed.ok) throw new Error('trash')
    expect(status(trashed.data)).toBe('trashed')
    const restored = restoreFromTrash(trashed.data, 'imp-4', ctx)
    if (!restored.ok) throw new Error('restore')
    expect(status(restored.data)).toBe('duplicate')
    const purged = purgeTrash(trashed.data, 'all', ctx)
    if (!purged.ok) throw new Error('purge')
    expect(status(purged.data)).toBe('purged')
  })
})

describe('pagos de tarjeta importados (§8): se señalan y quedan desmarcados, nunca se convierten solos', () => {
  const withCard = (extra: Partial<AppData> = {}) =>
    data({ accounts: [...data().accounts, account({ id: 'visa', name: 'Visa', kind: 'credit', anchor: { amountMinor: -50000, date: '2026-09-10', setAt: '2026-09-10T15:00:00.000Z' } })], ...extra })

  it('en el extracto de una tarjeta, el dinero que entra con palabras de pago parece un pago de la tarjeta; una devolución no', () => {
    expect(looksLikeCardPayment('PAYMENT - THANK YOU', 'income', 'credit', true)).toBe('toCard')
    expect(looksLikeCardPayment('Pago recibido, gracias', 'income', 'credit', true)).toBe('toCard')
    expect(looksLikeCardPayment('Paiement reçu — merci', 'income', 'credit', true)).toBe('toCard')
    expect(looksLikeCardPayment('Refund Amazon', 'income', 'credit', true)).toBeUndefined()
    expect(looksLikeCardPayment('PAYMENT - THANK YOU', 'expense', 'credit', true)).toBeUndefined()
  })

  it('en el extracto de un banco, dinero que sale con palabras de tarjeta y de pago, solo si hay alguna tarjeta en Clara', () => {
    expect(looksLikeCardPayment('PAGO TARJETA VISA 1234', 'expense', 'bank', true)).toBe('fromBank')
    expect(looksLikeCardPayment('Credit card payment', 'expense', 'bank', true)).toBe('fromBank')
    expect(looksLikeCardPayment('Transferência cartão', 'expense', 'bank', true)).toBe('fromBank')
    expect(looksLikeCardPayment('PAGO TARJETA VISA 1234', 'expense', 'bank', false)).toBeUndefined()
    expect(looksLikeCardPayment('Supermercado Visa', 'expense', 'bank', true)).toBeUndefined()
    expect(looksLikeCardPayment('Pago de renta', 'expense', 'bank', true)).toBeUndefined()
    expect(looksLikeCardPayment('PAGO TARJETA VISA', 'income', 'bank', true)).toBeUndefined()
  })

  it('la vista previa marca la pista, la fila sigue siendo nueva e importable pero no va marcada por defecto; tipo e importe no cambian', () => {
    const table = [['Fecha', 'Concepto', 'Importe'], ['2026-09-15', 'PAGO TARJETA VISA', '-200.00'], ['2026-09-15', 'Supermercado', '-30.00']]
    const p = previewImport(table, withCard(), options())
    expect(p.rows[0]).toMatchObject({ status: 'new', kind: 'expense', amountMinor: 20000, cardPaymentHint: 'fromBank' })
    expect(p.rows[1]!.cardPaymentHint).toBeUndefined()
    expect(isImportable(p.rows[0]!)).toBe(true)
    expect([...defaultSelection(p)]).toEqual([3])
    // Sin tarjeta en Clara no hay pista: todo marcado.
    expect([...defaultSelection(previewImport(table, data(), options()))]).toEqual([2, 3])
    // En el extracto de la tarjeta, el pago recibido.
    const card = previewImport([['Fecha', 'Concepto', 'Importe'], ['2026-09-15', 'PAYMENT - THANK YOU', '200.00'], ['2026-09-15', 'Store', '-30.00']], withCard(), options({ accountId: 'visa' }))
    expect(card.rows[0]).toMatchObject({ status: 'new', kind: 'income', cardPaymentHint: 'toCard' })
    expect([...defaultSelection(card)]).toEqual([3])
  })
})
