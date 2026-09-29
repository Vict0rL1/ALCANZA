import { describe, expect, it } from 'vitest'
import { computeBudget } from '../domain/budget'
import { createInitialData, deleteTransaction, restoreTransaction, saveTransaction } from '../domain/operations'
import { projectBalance } from '../domain/projection'
import { createDemoData } from '../demo/demoData'
import { baseData, ctx, NOW, TODAY, tx, TZ } from '../test/fixtures'
import { createBackup, parseBackup, validateAppData } from './backup'
import { MemoryRepository } from './localStorageRepository'

const backupText = (data = baseData({ transactions: [tx({ id: 't1' })] })) => JSON.stringify(createBackup(data, new Date(NOW), '0.1.0'))

describe('copias de seguridad', () => {
  it('exportar e importar conserva los datos', () => {
    const data = baseData({ transactions: [tx({ id: 't1', note: 'Café' })] })
    const r = parseBackup(backupText(data))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toEqual(data)
      expect(r.exportedAt).toBe(NOW)
    }
  })

  it('rechaza archivos que no son JSON o no son copias de Margen', () => {
    expect(parseBackup('esto no es json')).toMatchObject({ ok: false, issues: [{ code: 'invalidJson' }] })
    expect(parseBackup('{"hola":1}')).toMatchObject({ ok: false, issues: [{ code: 'notABackup' }] })
    expect(parseBackup('[]')).toMatchObject({ ok: false, issues: [{ code: 'notABackup' }] })
  })

  it('rechaza versiones más nuevas que la app', () => {
    const file = JSON.parse(backupText())
    file.data.schemaVersion = 99
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, issues: [{ code: 'schemaTooNew' }] })
  })

  it('rechaza importes con decimales, negativos o de otra moneda', () => {
    const cases: [string, unknown, string][] = [
      ['amountMinor', 12.5, 'invalidAmount'],
      ['amountMinor', -300, 'amountNotPositive'],
      ['amountMinor', '1000', 'invalidAmount'],
      ['currency', 'USD', 'currencyMismatch'],
      ['accountId', 'no-existe', 'unknownAccount'],
      ['date', '2026-02-30', 'invalidDate'],
      ['kind', 'creditCardPayment', 'invalidValue'],
    ]
    for (const [field, value, code] of cases) {
      const file = JSON.parse(backupText())
      file.data.transactions[0][field] = value
      const r = parseBackup(JSON.stringify(file))
      expect(r.ok, `${field}=${String(value)}`).toBe(false)
      if (!r.ok) expect(r.issues.map((i) => i.code)).toContain(code)
    }
  })

  it('rechaza ids duplicados y ocurrencias liquidadas dos veces', () => {
    const dupIds = baseData({ transactions: [tx({ id: 'same' }), tx({ id: 'same' })] })
    expect(validateAppData(dupIds)).toMatchObject({ ok: false })
    const doublePaid = baseData({
      transactions: [
        tx({ id: 'a', scheduleId: 'rent', occurrenceDate: '2026-09-01', date: '2026-09-01' }),
        tx({ id: 'b', scheduleId: 'rent', occurrenceDate: '2026-09-01', date: '2026-09-01' }),
      ],
    })
    expect(validateAppData(doublePaid)).toMatchObject({ ok: false })
  })

  it('no cambia nada si la importación falla y descarta campos desconocidos', () => {
    const file = JSON.parse(backupText())
    file.data.transactions[0].campoRaro = 'x'
    file.data.__proto__ = { hacked: true }
    const r = parseBackup(JSON.stringify(file))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect('campoRaro' in r.data.transactions[0]!).toBe(false)
      expect(({} as Record<string, unknown>).hacked).toBeUndefined()
    }
  })

  it('exige al menos una cuenta', () => {
    const file = JSON.parse(backupText(baseData({ accounts: [] })))
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false })
  })
})

describe('guardado y recuperación', () => {
  it('guardar repetidamente y recargar devuelve exactamente lo mismo', async () => {
    const repo = new MemoryRepository()
    let data = baseData()
    const draft = { id: 'fixed-id', kind: 'expense' as const, status: 'realized' as const, amountMinor: 1234, date: TODAY, accountId: 'main', categoryId: 'dining' }
    for (let i = 0; i < 5; i++) {
      const r = saveTransaction(data, draft, ctx)
      if (!r.ok) throw new Error('rechazado')
      data = r.data
      await repo.save(data)
    }
    expect(data.transactions).toHaveLength(1)
    const loaded = await repo.load()
    expect(loaded).toEqual({ status: 'ok', data })
  })

  it('eliminar y deshacer restaura el mismo registro y su vínculo de devolución', () => {
    const purchase = tx({ id: 'buy', amountMinor: 5000 })
    const refund = tx({ id: 'ref', kind: 'refund', categoryId: 'groceries', amountMinor: 1000, refundOfId: 'buy' })
    const data = baseData({ transactions: [purchase, refund] })
    const del = deleteTransaction(data, 'buy', ctx)
    if (!del.ok) throw new Error('rechazado')
    expect(del.data.transactions.find((t) => t.id === 'ref')?.refundOfId).toBeUndefined()
    expect(validateAppData(del.data).ok).toBe(true)
    const undo = restoreTransaction(del.data, del.value.tx, ctx, del.value.unlinkedRefundIds)
    if (!undo.ok) throw new Error('rechazado')
    expect(undo.data.transactions.find((t) => t.id === 'ref')?.refundOfId).toBe('buy')
    const undoAgain = restoreTransaction(undo.data, del.value.tx, ctx)
    expect(undoAgain.ok && undoAgain.data.transactions.length).toBe(2)
  })
})

describe('datos iniciales y demostración', () => {
  it('la configuración inicial crea cuenta, ingreso, pagos y reserva válidos', () => {
    const r = createInitialData(
      {
        currency: 'CAD',
        timeZone: TZ,
        numberLocale: 'es-MX',
        language: 'es',
        accountName: 'Mi banco',
        balanceMinor: 120000,
        balanceDate: TODAY,
        income: { name: 'Sueldo', amountMinor: 80000, date: '2026-10-09', frequency: 'biweekly', isEstimate: false },
        fallbackHorizonDays: null,
        bills: [{ name: 'Renta', amountMinor: 60000, date: '2026-10-01', frequency: 'monthly' }],
        reserve: { amountMinor: 20000, fundedFrom: 'budget', name: 'Reserva de emergencia' },
      },
      ctx,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(validateAppData(r.data).ok).toBe(true)
    const b = computeBudget(r.data, TODAY)
    expect(b.availableMinor).toBe(120000 - 60000 - 20000)
    expect(b.horizon?.days).toBe(11)
  })

  it('los datos de demostración existen en inglés con los mismos importes', () => {
    const now = new Date('2026-09-28T12:00:00-04:00')
    const en = createDemoData({ now, timeZone: TZ, language: 'en' })
    expect(validateAppData(en).ok).toBe(true)
    expect(en.settings.language).toBe('en')
    expect(en.accounts[0]!.name).toBe('Chequing account')
    expect(computeBudget(en, '2026-09-28').availableMinor).toBe(computeBudget(createDemoData({ now, timeZone: TZ }), '2026-09-28').availableMinor)
  })

  it('los datos de demostración son válidos y muestran un posible faltante', () => {
    for (const hour of ['04:30', '12:00', '23:59']) {
      const now = new Date(`2026-09-28T${hour}:00-04:00`)
      const demo = createDemoData({ now, timeZone: TZ })
      const v = validateAppData(demo)
      expect(v.ok, JSON.stringify(!v.ok && v.issues)).toBe(true)
      expect(demo.isDemo).toBe(true)
      const b = computeBudget(demo, '2026-09-28')
      expect(b.status).toBe('ok')
      expect(b.horizon?.days).toBe(6)
      expect(b.overdueBills).toHaveLength(1)
      expect(b.availableMinor).toBeGreaterThan(0)
      const p = projectBalance(demo, '2026-09-28', { dailySpendMinor: 1400 })
      expect(p.firstNegativeDate).not.toBeNull()
    }
  })
})
