/**
 * Copias cifradas (§7.8 · «cifrado en el dispositivo antes de subir»). Sin servicio de
 * sincronización, el cifrado se ofrece sobre la copia exportada: AES-GCM 256 con clave derivada
 * de una frase por PBKDF2-SHA-256 (WebCrypto). La frase no se guarda en ningún sitio: si se
 * pierde, la copia no se puede abrir, y la interfaz lo dice antes de exportar.
 *
 * Al abrir una copia, el sobre se valida ENTERO antes de tocar WebCrypto (QA-08): versión exacta,
 * algoritmos, iteraciones enteras y acotadas, base64 bien formado y tamaños de sal, IV y datos.
 * Un archivo que pida 4 294 967 295 iteraciones no llega a derivar nada. «No admitido» (formato más
 * nuevo) y «no válido» (dañado o inventado) se distinguen de «frase incorrecta».
 */
export const ENCRYPTED_FORMAT = 'clara-encrypted-backup'
export const ENCRYPTED_VERSION = 1
export const PBKDF2_ITERATIONS = 310_000
/** Tope de iteraciones que se aceptan al abrir (unas 6 veces las propias): más es un ataque de coste, no una copia. */
export const MAX_PBKDF2_ITERATIONS = 2_000_000
export const MIN_PASSPHRASE = 8
/** Tamaños admitidos (bytes) de lo que viene en el sobre. La sal propia mide 16 y el IV 12. */
export const SALT_BYTES = { min: 8, max: 64 } as const
export const IV_BYTES = { min: 12, max: 16 } as const
/** Los datos llevan al menos la etiqueta de autenticación de AES-GCM (16 bytes); el máximo es el de una copia (`MAX_BACKUP_BYTES`). */
export const DATA_BYTES = { min: 16, max: 100 * 1024 * 1024 } as const

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

/** Longitud en bytes de un base64 bien formado, o null si no lo es (sin decodificar nada). */
export function base64Bytes(s: unknown): number | null {
  if (typeof s !== 'string' || s.length === 0 || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return null
  const padding = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  return (s.length / 4) * 3 - padding
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

export type EnvelopeProblem = 'version' | 'kdf' | 'cipher' | 'iterations' | 'salt' | 'iv' | 'data'

export type EnvelopeCheck = { ok: true } | { ok: false; reason: 'unsupported' | 'invalid'; problem: EnvelopeProblem }

/**
 * Comprueba el sobre sin usar WebCrypto. `unsupported` = formato más nuevo que esta versión
 * (versión, KDF o cifrado desconocidos); `invalid` = valores imposibles o malformados.
 */
export function validateEnvelope(envelope: EncryptedEnvelope): EnvelopeCheck {
  const bad = (reason: 'unsupported' | 'invalid', problem: EnvelopeProblem): EnvelopeCheck => ({ ok: false, reason, problem })
  const e = envelope as Record<keyof EncryptedEnvelope, unknown>
  if (e.format !== ENCRYPTED_FORMAT) return bad('invalid', 'version')
  if (!Number.isInteger(e.version)) return bad('invalid', 'version')
  if ((e.version as number) > ENCRYPTED_VERSION) return bad('unsupported', 'version')
  if (e.version !== ENCRYPTED_VERSION) return bad('invalid', 'version')
  if (e.kdf !== 'PBKDF2-SHA-256') return bad(typeof e.kdf === 'string' ? 'unsupported' : 'invalid', 'kdf')
  if (e.cipher !== 'AES-GCM-256') return bad(typeof e.cipher === 'string' ? 'unsupported' : 'invalid', 'cipher')
  if (!Number.isInteger(e.iterations) || (e.iterations as number) < 1 || (e.iterations as number) > MAX_PBKDF2_ITERATIONS) return bad('invalid', 'iterations')
  const salt = base64Bytes(e.salt)
  if (salt === null || salt < SALT_BYTES.min || salt > SALT_BYTES.max) return bad('invalid', 'salt')
  const iv = base64Bytes(e.iv)
  if (iv === null || iv < IV_BYTES.min || iv > IV_BYTES.max) return bad('invalid', 'iv')
  const data = base64Bytes(e.data)
  if (data === null || data < DATA_BYTES.min || data > DATA_BYTES.max) return bad('invalid', 'data')
  return { ok: true }
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

/** `invalid`: sobre dañado o inventado (se rechaza antes de derivar la clave); `unsupported`: formato más nuevo. */
export type DecryptResult = { ok: true; json: string } | { ok: false; reason: 'wrongPassphrase' | 'unsupported' | 'invalid' }

export async function decryptBackup(envelope: EncryptedEnvelope, passphrase: string, crypto: Crypto = globalThis.crypto): Promise<DecryptResult> {
  const check = validateEnvelope(envelope)
  if (!check.ok) return { ok: false, reason: check.reason }
  try {
    const key = await deriveKey(passphrase, fromB64(envelope.salt), envelope.iterations, crypto)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(envelope.iv) as BufferSource }, key, fromB64(envelope.data) as BufferSource)
    return { ok: true, json: new TextDecoder().decode(plain) }
  } catch {
    // AES-GCM falla la autenticación con otra frase: no distingue «frase incorrecta» de «archivo alterado».
    return { ok: false, reason: 'wrongPassphrase' }
  }
}
