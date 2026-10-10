import { describe, expect, it, vi } from 'vitest'
import { MAX_BACKUP_BYTES } from './backup'
import { base64Bytes, DATA_BYTES, decryptBackup, encryptBackup, isEncryptedBackup, looksEncrypted, MAX_PBKDF2_ITERATIONS, PBKDF2_ITERATIONS, validateEnvelope, type EncryptedEnvelope } from './encryptedBackup'

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

describe('QA-08 · el sobre se valida entero antes de tocar WebCrypto', () => {
  /** Doble de WebCrypto que registra llamadas sin ejecutar PBKDF2: la prueba nunca paga el coste que comprueba. */
  const double = () => {
    const deriveKey = vi.fn().mockRejectedValue(new Error('no debería llegar aquí'))
    const crypto = { subtle: { importKey: vi.fn().mockResolvedValue({}), deriveKey, decrypt: vi.fn() } } as unknown as Crypto
    return { crypto, deriveKey, importKey: crypto.subtle.importKey as unknown as ReturnType<typeof vi.fn> }
  }
  const b64 = (n: number) => btoa(String.fromCharCode(...new Uint8Array(n)))
  const valid: EncryptedEnvelope = { format: 'clara-encrypted-backup', version: 1, kdf: 'PBKDF2-SHA-256', cipher: 'AES-GCM-256', iterations: PBKDF2_ITERATIONS, salt: b64(16), iv: b64(12), data: b64(32) }

  it('un sobre bien formado pasa la validación y sí llega a derivar la clave', async () => {
    expect(validateEnvelope(valid)).toEqual({ ok: true })
    const { crypto, deriveKey } = double()
    expect(await decryptBackup(valid, 'una frase larga', crypto)).toEqual({ ok: false, reason: 'wrongPassphrase' })
    expect(deriveKey).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['desmesuradas', 4294967295],
    ['por encima del tope', MAX_PBKDF2_ITERATIONS + 1],
    ['cero', 0],
    ['negativas', -1],
    ['fraccionarias', 1000.5],
    ['infinitas', Number.POSITIVE_INFINITY],
    ['ausentes', undefined],
    ['texto', '310000'],
  ])('iteraciones %s → «no válida» sin derivar nada', async (_label, iterations) => {
    const envelope = { ...valid, iterations } as unknown as EncryptedEnvelope
    expect(validateEnvelope(envelope)).toEqual({ ok: false, reason: 'invalid', problem: 'iterations' })
    const { crypto, deriveKey, importKey } = double()
    expect(await decryptBackup(envelope, 'una frase larga', crypto)).toEqual({ ok: false, reason: 'invalid' })
    expect(deriveKey).not.toHaveBeenCalled()
    expect(importKey).not.toHaveBeenCalled()
  })

  it('el tope de iteraciones deja margen sobre las propias y se acepta justo en el límite', async () => {
    expect(MAX_PBKDF2_ITERATIONS).toBeGreaterThan(PBKDF2_ITERATIONS)
    expect(validateEnvelope({ ...valid, iterations: MAX_PBKDF2_ITERATIONS })).toEqual({ ok: true })
    expect(validateEnvelope({ ...valid, iterations: 1 })).toEqual({ ok: true })
  })

  it.each([
    ['sal corta', { salt: b64(4) }, 'salt'],
    ['sal larga', { salt: b64(65) }, 'salt'],
    ['sal que no es base64', { salt: 'no-es-base64!' }, 'salt'],
    ['sal vacía', { salt: '' }, 'salt'],
    ['IV corto', { iv: b64(8) }, 'iv'],
    ['IV largo', { iv: b64(32) }, 'iv'],
    ['IV con relleno imposible', { iv: 'AAA=AAAA' }, 'iv'],
    ['datos sin etiqueta de autenticación', { data: b64(15) }, 'data'],
    ['datos que no son base64', { data: 'A'.repeat(31) + '%' }, 'data'],
    ['KDF que no es texto', { kdf: 7 }, 'kdf'],
    ['cifrado que no es texto', { cipher: null }, 'cipher'],
    ['versión 0', { version: 0 }, 'version'],
    ['versión negativa', { version: -1 }, 'version'],
    ['versión fraccionaria', { version: 1.5 }, 'version'],
    ['formato distinto', { format: 'clara-backup' }, 'version'],
  ])('%s → «no válida» sin derivar nada', async (_label, patch, problem) => {
    const envelope = { ...valid, ...patch } as unknown as EncryptedEnvelope
    expect(validateEnvelope(envelope)).toEqual({ ok: false, reason: 'invalid', problem })
    const { crypto, deriveKey } = double()
    expect(await decryptBackup(envelope, 'una frase larga', crypto)).toEqual({ ok: false, reason: 'invalid' })
    expect(deriveKey).not.toHaveBeenCalled()
  })

  it.each([
    ['versión más nueva', { version: 2 }, 'version'],
    ['otro KDF', { kdf: 'Argon2id' }, 'kdf'],
    ['otro cifrado', { cipher: 'ChaCha20-Poly1305' }, 'cipher'],
  ])('%s → «no admitida», que no es lo mismo que dañada', async (_label, patch, problem) => {
    const envelope = { ...valid, ...patch } as unknown as EncryptedEnvelope
    expect(validateEnvelope(envelope)).toEqual({ ok: false, reason: 'unsupported', problem })
    const { crypto, deriveKey } = double()
    expect(await decryptBackup(envelope, 'una frase larga', crypto)).toEqual({ ok: false, reason: 'unsupported' })
    expect(deriveKey).not.toHaveBeenCalled()
  })

  it('el tamaño de los datos se acota al de una copia sin decodificar el base64', () => {
    expect(DATA_BYTES.max).toBe(MAX_BACKUP_BYTES)
    expect(base64Bytes(b64(16))).toBe(16)
    expect(base64Bytes(b64(17))).toBe(17)
    expect(base64Bytes('AAAA')).toBe(3)
    expect(base64Bytes('AAA')).toBeNull()
    expect(base64Bytes('AA==AA==')).toBeNull()
    expect(base64Bytes(42)).toBeNull()
    // El tamaño se deduce de la longitud del texto (4 caracteres → 3 bytes), sin decodificar.
    expect(base64Bytes('A'.repeat(4000))).toBe(3000)
    expect(base64Bytes('A'.repeat(3998) + '==')).toBe(2998)
  })

  it('control positivo: una copia propia sigue abriéndose con WebCrypto real y una frase incorrecta sigue siendo «frase incorrecta»', async () => {
    const json = JSON.stringify({ format: 'clara-backup', data: {} })
    const env = await encryptBackup(json, 'una frase larga')
    expect(validateEnvelope(env)).toEqual({ ok: true })
    expect(await decryptBackup(env, 'una frase larga')).toEqual({ ok: true, json })
    expect(await decryptBackup(env, 'otra frase larga')).toEqual({ ok: false, reason: 'wrongPassphrase' })
  })
})
