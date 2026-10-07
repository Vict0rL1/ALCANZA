import { describe, expect, it } from 'vitest'
import { decryptBackup, encryptBackup, isEncryptedBackup, looksEncrypted } from './encryptedBackup'

describe('copias cifradas', () => {
  it('cifra y descifra con la misma frase; otra frase o un archivo alterado fallan; el texto no aparece en claro', async () => {
    const json = JSON.stringify({ format: 'clara-backup', data: { secret: 'Renta 650.00' } })
    const env = await encryptBackup(json, 'una frase larga')
    expect(isEncryptedBackup(env)).toBe(true)
    expect(looksEncrypted(JSON.stringify(env))).toBe(true)
    expect(JSON.stringify(env)).not.toContain('Renta')
    expect(await decryptBackup(env, 'una frase larga')).toEqual({ ok: true, json })
    expect(await decryptBackup(env, 'otra frase larga')).toEqual({ ok: false, reason: 'wrongPassphrase' })
    const tampered = { ...env, data: env.data.slice(0, -4) + 'AAAA' }
    expect((await decryptBackup(tampered, 'una frase larga')).ok).toBe(false)
    expect(await decryptBackup({ ...env, version: 99 }, 'una frase larga')).toEqual({ ok: false, reason: 'unsupported' })
    await expect(encryptBackup(json, 'corta')).rejects.toThrow()
    // Dos cifrados de lo mismo no coinciden (sal e IV aleatorios).
    const again = await encryptBackup(json, 'una frase larga')
    expect(again.data).not.toBe(env.data)
    expect(isEncryptedBackup({ format: 'otro' })).toBe(false)
  })
})
