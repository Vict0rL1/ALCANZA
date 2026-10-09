import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { AUTO_BACKUP_INTERVAL_MS, backupsToPrune, isAutoBackupDue, LocalBackups } from './autoBackup'
import { parseBackup } from './backup'
import { baseData, NOW, tx } from '../test/fixtures'

describe('copias automáticas locales', () => {
  it('toca cada 24 h solo si los datos cambiaron y nunca en la demo', () => {
    const data = baseData()
    const now = new Date('2026-09-29T17:00:00.000Z')
    expect(isAutoBackupDue(data, null, now)).toBe(true)
    expect(isAutoBackupDue(data, { createdAt: '2026-09-28T16:00:00.000Z', dataUpdatedAt: 'old' }, now)).toBe(true)
    expect(isAutoBackupDue(data, { createdAt: '2026-09-28T16:00:00.000Z', dataUpdatedAt: data.updatedAt }, now)).toBe(false)
    expect(isAutoBackupDue(data, { createdAt: new Date(now.getTime() - AUTO_BACKUP_INTERVAL_MS + 1000).toISOString(), dataUpdatedAt: 'old' }, now)).toBe(false)
    expect(isAutoBackupDue({ ...data, isDemo: true }, null, now)).toBe(false)
  })

  it('conserva las 10 más recientes', () => {
    const list = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, createdAt: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }))
    expect(backupsToPrune(list)).toEqual(['b1', 'b0'])
    expect(backupsToPrune(list.slice(0, 3))).toEqual([])
  })

  it('guarda, lista con metadatos, lee una copia válida, poda y borra (IndexedDB aparte)', async () => {
    const backups = new LocalBackups(new IDBFactory())
    const data = baseData({ transactions: [tx({ id: 't1' })] })
    const saved = await backups.save(data, 'manual', new Date(NOW), '0.1.0')
    expect(saved).toMatchObject({ reason: 'manual', budgetId: 'budget-1', counts: { transactions: 1, accounts: 1 } })
    expect(saved.size).toBeGreaterThan(100)
    for (let i = 1; i <= 11; i++) await backups.save(data, 'auto', new Date(Date.parse(NOW) + i * 60_000), '0.1.0')
    const list = await backups.list()
    expect(list).toHaveLength(10)
    expect(list[0]!.createdAt > list[9]!.createdAt).toBe(true)
    expect(list.some((b) => b.id === saved.id)).toBe(false)
    const json = await backups.read(list[0]!.id)
    const parsed = parseBackup(json!)
    expect(parsed.ok && parsed.data.transactions).toHaveLength(1)
    await backups.remove(list[0]!.id)
    expect(await backups.list()).toHaveLength(9)
    expect(await backups.read('nope')).toBeNull()
  })
})
