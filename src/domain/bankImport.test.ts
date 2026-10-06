import { describe, expect, it } from 'vitest'
import { accountBalance } from './balances'
import {
  defaultSelection,
  detectDelimiter,
  guessMapping,
  isImportable,
  looksLikeHeader,
  parseBankDate,
  parseCsv,
  possibleDateFormats,
  previewImport,
  type ImportOptions,
} from './bankImport'
import { importTransactions, removeTransactions, saveTransaction, type ImportInput } from './operations'
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
