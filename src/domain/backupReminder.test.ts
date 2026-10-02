import { describe, expect, it } from 'vitest'
import { backupStatus, recordExport, recordVerification, setBackupReminder, snoozeBackupReminder } from './backupReminder'
import { saveTransaction } from './operations'
import type { AppData } from './types'
import { parseBackup, performExport } from '../storage/backup'
import { baseData, ctx, TODAY } from '../test/fixtures'

function ok(r: { ok: true; data: AppData } | { ok: false; issues: unknown[] }): AppData {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.data
}

// Datos creados el 1-sep; hoy es 28-sep.
const created = baseData({ createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z' })

describe('recordatorio de respaldo', () => {
  it('nunca exportado: se indica y el plazo cuenta desde la creación de los datos', () => {
    const s = backupStatus(created, TODAY)
    expect(s).toMatchObject({ neverExported: true, hasUnbackedChanges: true, dueDate: '2026-09-08', due: true })
    expect(backupStatus(created, '2026-09-07').due).toBe(false)
  })

  it('tras exportar no hay cambios sin respaldar hasta que cambian los datos', () => {
    const exported = ok(recordExport(created, '2026-09-27T12:00:00.000Z'))
    // Registrar la copia no cuenta como dato nuevo.
    expect(exported.updatedAt).toBe(created.updatedAt)
    expect(backupStatus(exported, TODAY)).toMatchObject({ neverExported: false, hasUnbackedChanges: false, due: false, dueDate: '2026-10-04' })
    const changed = ok(saveTransaction(exported, { id: 'n', kind: 'expense', status: 'realized', amountMinor: 100, date: TODAY, accountId: 'main', categoryId: 'dining' }, ctx))
    expect(backupStatus(changed, TODAY).hasUnbackedChanges).toBe(true)
    // Con cambios, pero aún dentro del plazo semanal: no molesta.
    expect(backupStatus(changed, TODAY).due).toBe(false)
    expect(backupStatus(changed, '2026-10-04').due).toBe(true)
  })

  it('mensual, desactivado y posponer', () => {
    const monthly = ok(setBackupReminder(created, 'monthly'))
    expect(backupStatus(monthly, TODAY).due).toBe(false)
    expect(backupStatus(monthly, '2026-10-01').due).toBe(true)
    const off = ok(setBackupReminder(created, 'off'))
    expect(backupStatus(off, '2027-01-01')).toMatchObject({ due: false, dueDate: null })
    const snoozed = ok(snoozeBackupReminder(created, 7, ctx))
    expect(backupStatus(snoozed, TODAY)).toMatchObject({ due: false, snoozedUntil: '2026-10-05' })
    expect(backupStatus(snoozed, '2026-10-05').due).toBe(true)
    expect(snoozeBackupReminder(created, 0, ctx).ok).toBe(false)
  })

  it('los datos de demostración no muestran el recordatorio', () => {
    expect(backupStatus({ ...created, isDemo: true }, TODAY).due).toBe(false)
  })

  it('una exportación fallida no actualiza el registro', () => {
    const failed = performExport(created, new Date('2026-09-28T16:00:00Z'), 'test', () => {
      throw new Error('el navegador bloqueó la descarga')
    })
    expect(failed).toEqual({ ok: false })
    // La interfaz solo llama a recordExport si `ok`: el estado sigue como nunca exportado.
    expect(backupStatus(created, TODAY).neverExported).toBe(true)
    let written = ''
    const done = performExport(created, new Date('2026-09-28T16:00:00Z'), 'test', (_name, text) => (written = text))
    expect(done).toMatchObject({ ok: true, exportedAt: '2026-09-28T16:00:00.000Z' })
    expect(parseBackup(written).ok).toBe(true)
  })

  it('verificar distingue «descarga solicitada» de «copia comprobada» y exige el mismo presupuesto', () => {
    const exported = ok(recordExport(created, '2026-09-27T12:00:00.000Z'))
    expect(backupStatus(exported, TODAY).latestExportUnverified).toBe(true)
    const verified = ok(recordVerification(exported, { budgetId: created.budgetId, exportedAt: '2026-09-27T12:00:00.000Z' }, ctx))
    expect(backupStatus(verified, TODAY)).toMatchObject({ latestExportUnverified: false, lastVerifiedAt: ctx.now })
    const other = recordVerification(exported, { budgetId: 'otro-presupuesto', exportedAt: null }, ctx)
    expect(other.ok ? [] : other.issues.map((i) => i.code)).toEqual(['notABackupOfThisBudget'])
  })
})
