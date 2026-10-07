/**
 * Copias cifradas (§7.8 · «cifrado en el dispositivo antes de subir»). Sin servicio de
 * sincronización, el cifrado se ofrece sobre la copia exportada: AES-GCM 256 con clave derivada
 * de una frase por PBKDF2-SHA-256 (WebCrypto). La frase no se guarda en ningún sitio: si se
 * pierde, la copia no se puede abrir, y la interfaz lo dice antes de exportar.
 */
export const ENCRYPTED_FORMAT = 'clara-encrypted-backup'
export const ENCRYPTED_VERSION = 1
export const PBKDF2_ITERATIONS = 310_000
export const MIN_PASSPHRASE = 8

export interface EncryptedEnvelope {
  format: typeof ENCRYPTED_FORMAT
  version: number
  kdf: 'PBKDF2-SHA-256'
  iterations: number
  /** base64 */
  salt: string
  /** base64 */
  iv: string
  cipher: 'AES-GCM-256'
  /** base64 */
  data: string
}

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

export function isEncryptedBackup(raw: unknown): raw is EncryptedEnvelope {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return r.format === ENCRYPTED_FORMAT && typeof r.version === 'number' && typeof r.salt === 'string' && typeof r.iv === 'string' && typeof r.data === 'string'
}

/** Detecta sin parsear todo: el archivo empieza por el formato cifrado. */
export function looksEncrypted(text: string): boolean {
  return text.slice(0, 200).includes(ENCRYPTED_FORMAT)
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number, crypto: Crypto): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFKC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptBackup(json: string, passphrase: string, crypto: Crypto = globalThis.crypto): Promise<EncryptedEnvelope> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error('passphrase')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS, crypto)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(json))
  return { format: ENCRYPTED_FORMAT, version: ENCRYPTED_VERSION, kdf: 'PBKDF2-SHA-256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt), iv: toB64(iv), cipher: 'AES-GCM-256', data: toB64(new Uint8Array(data)) }
}

export type DecryptResult = { ok: true; json: string } | { ok: false; reason: 'wrongPassphrase' | 'unsupported' }

export async function decryptBackup(envelope: EncryptedEnvelope, passphrase: string, crypto: Crypto = globalThis.crypto): Promise<DecryptResult> {
  if (envelope.version > ENCRYPTED_VERSION || envelope.kdf !== 'PBKDF2-SHA-256' || envelope.cipher !== 'AES-GCM-256') return { ok: false, reason: 'unsupported' }
  try {
    const key = await deriveKey(passphrase, fromB64(envelope.salt), envelope.iterations, crypto)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) as BufferSource }, key, fromB64(envelope.data) as BufferSource)
    return { ok: true, json: new TextDecoder().decode(plain) }
  } catch {
    // AES-GCM falla la autenticación con otra frase: no distingue «frase incorrecta» de «archivo alterado».
    return { ok: false, reason: 'wrongPassphrase' }
  }
}
