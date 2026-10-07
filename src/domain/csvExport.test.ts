import { describe, expect, it } from 'vitest'
import { signedAmount, transactionsToCsv } from './csvExport'
import { tx } from '../test/fixtures'

const labels = { headers: ['Fecha', 'Tipo', 'Estado', 'Importe', 'Moneda', 'Categoría', 'Cuenta', 'Hacia', 'Nota', 'Comercio', 'Id'], kind: (t: ReturnType<typeof tx>) => t.kind, status: (t: ReturnType<typeof tx>) => t.status, category: (t: ReturnType<typeof tx>) => t.categoryId ?? '', account: (id?: string) => id ?? '' }

describe('exportación CSV', () => {
  it('una fila por movimiento, importes con signo y punto decimal, comillas escapadas, BOM y CRLF', () => {
    const csv = transactionsToCsv(
      [tx({ id: 'a', amountMinor: 1250, note: 'café, "con" leche', merchant: 'Starbucks' }), tx({ id: 'b', kind: 'income', categoryId: 'salary', amountMinor: 50000 }), tx({ id: 'c', kind: 'transfer', categoryId: undefined, toAccountId: 'sav', amountMinor: 1000 })],
      labels,
    )
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Fecha,Tipo,Estado,Importe,Moneda,Categoría,Cuenta,Hacia,Nota,Comercio,Id')
    expect(lines[1]).toBe('2026-09-28,expense,realized,-12.50,CAD,groceries,main,,"café, ""con"" leche",Starbucks,a')
    expect(lines[2]).toBe('2026-09-28,income,realized,500.00,CAD,salary,main,,,,b')
    expect(lines[3]).toBe('2026-09-28,transfer,realized,-10.00,CAD,,main,sav,,,c')
    expect(lines[4]).toBe('')
  })

  it('el ajuste de conciliación lleva el signo de su dirección', () => {
    expect(signedAmount(tx({ kind: 'adjustment', categoryId: undefined, adjustmentDirection: 'increase', amountMinor: 300 }))).toBe(300)
    expect(signedAmount(tx({ kind: 'adjustment', categoryId: undefined, adjustmentDirection: 'decrease', amountMinor: 300 }))).toBe(-300)
  })
})
