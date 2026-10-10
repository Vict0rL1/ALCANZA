import { describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { transactionsToCsv } from '../src/domain/csvExport'
import { baseData, ctx, tx } from '../src/test/fixtures'
import { IndexedDbRepository, openDatabase } from '../src/storage/indexedDbRepository'
import { AppStore } from '../src/state/store'
import { saveTransaction } from '../src/domain/operations'
import { backupText, parseBackup } from '../src/storage/backup'
import { decryptBackup, encryptBackup } from '../src/storage/encryptedBackup'
import { performance } from 'node:perf_hooks'

describe('seguridad y persistencia en entorno simulado', () => {
  it('dos pestañas: rechaza un guardado obsoleto sin borrar la versión nueva', async () => {
    const factory = new IDBFactory()
    const db = await openDatabase(factory)
    const a = new IndexedDbRepository(db)
    const b = new IndexedDbRepository(db)
    await a.load(); await b.load()
    expect((await a.save({ ...baseData(), revision: 1 })).ok).toBe(true)
    expect(await b.save({ ...baseData({ transactions: [tx()] }), revision: 1 })).toEqual({ ok: false, error: 'conflict' })
    const read = await a.load()
    expect(read.status === 'ok' && read.data.transactions.length).toBe(0)
    db.close()
  })
  it('guardados consecutivos de la misma pestaña conservan ambas operaciones', async () => {
    const db = await openDatabase(new IDBFactory())
    const repo = new IndexedDbRepository(db)
    const store = new AppStore(repo)
    await store.init(); await store.commit(baseData())
    const a = saveTransaction(store.data!, tx({ id: 'a' }), ctx)
    if (!a.ok) throw new Error('fixture a')
    const first = store.commit(a.data)
    const b = saveTransaction(store.data!, tx({ id: 'b' }), ctx)
    if (!b.ok) throw new Error('fixture b')
    const second = store.commit(b.data)
    expect(await Promise.all([first, second])).toEqual([true, true])
    const read = await repo.load()
    expect(read.status === 'ok' && read.data.transactions.map(t => t.id).sort()).toEqual(['a','b'])
    db.close()
  })
  it('copia cifrada: frase correcta restaura y frase errónea no descifra', async () => {
    const plain = backupText(baseData(), new Date(ctx.now), 'audit')
    const encrypted = await encryptBackup(plain, 'frase-ficticia-qa')
    expect(await decryptBackup(encrypted, 'frase-ficticia-qa')).toEqual({ ok: true, json: plain })
    expect((await decryptBackup(encrypted, 'otra-frase-ficticia')).ok).toBe(false)
  })
  it('JSON truncado y referencia de cuenta rota no se restauran', () => {
    expect(parseBackup('{').ok).toBe(false)
    const invalid = baseData({ transactions: [tx({ accountId: 'missing' })] })
    expect(parseBackup(backupText(invalid, new Date(ctx.now), 'audit')).ok).toBe(false)
  })
  it('50.000 movimientos: ida/vuelta JSON valida, sin perder centavos ni registros', () => {
    const data = baseData({ transactions: Array.from({ length: 50000 }, (_, i) => tx({ id: `load-${i}`, amountMinor: 1 })) })
    const start = performance.now()
    const json = backupText(data, new Date(ctx.now), 'audit')
    const restored = parseBackup(json)
    console.log(JSON.stringify({ benchmark: '50000-flat-transactions-backup-roundtrip', durationMs: +(performance.now() - start).toFixed(2), bytes: Buffer.byteLength(json), runtime: process.version }))
    expect(restored.ok).toBe(true)
    if (restored.ok) expect(restored.data.transactions).toEqual(data.transactions)
  })
})

describe('regresiones de seguridad: no se ejecutan fórmulas ni cargas costosas', () => {
  it('QA-07: una nota =1+1 no debe exportarse como fórmula activa', () => {
    const csv = transactionsToCsv([tx({ note: '=1+1' })], { headers: ['date','kind','status','amount','currency','category','account','destination','note','merchant','id'], kind: () => 'expense', status: () => 'realized', category: () => 'groceries', account: () => 'bank' })
    expect(csv).not.toContain(',=1+1,')
  })
  it('QA-08: iteraciones de KDF desmesuradas deben rechazarse antes de derivar la clave', async () => {
    // El crypto simulado no ejecuta PBKDF2: prueba segura de validación de entrada.
    const deriveKey = vi.fn().mockRejectedValue(new Error('blocked by safe test double'))
    const crypto = { subtle: { importKey: vi.fn().mockResolvedValue({}), deriveKey } } as unknown as Crypto
    await decryptBackup({ format: 'clara-encrypted-backup', version: 1, kdf: 'PBKDF2-SHA-256', cipher: 'AES-GCM-256', iterations: 4294967295, salt: 'AA==', iv: 'AA==', data: 'AA==' }, 'test-passphrase', crypto)
    expect(deriveKey).not.toHaveBeenCalled()
  })
})
