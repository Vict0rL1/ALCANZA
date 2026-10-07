/**
 * Bloqueo con PIN (§7.7 · Datos y seguridad). El PIN nunca se guarda en claro: se guarda un
 * hash SHA-256 con sal aleatoria (WebCrypto) en localStorage DEL DISPOSITIVO; no viaja en las
 * copias de seguridad. Es una barrera de pantalla, NO cifrado: los datos siguen legibles en el
 * navegador y la interfaz lo dice.
 */
export const LOCK_KEY = 'clara.lock.v1'
export const RELOCK_AFTER_MS = 60_000
export const PIN_MIN = 4
export const PIN_MAX = 8

export interface LockConfig {
  /** Hash hexadecimal de sal + PIN. */
  pinHash: string
  salt: string
  /** Id de la credencial WebAuthn (base64url) si la persona registró una. */
  credentialId?: string
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomSalt(crypto: Crypto = globalThis.crypto): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes.buffer)
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`).test(pin)
}

export async function hashPin(pin: string, salt: string, crypto: Crypto = globalThis.crypto): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  return toHex(await crypto.subtle.digest('SHA-256', data))
}

export async function createLockConfig(pin: string, crypto: Crypto = globalThis.crypto): Promise<LockConfig> {
  const salt = randomSalt(crypto)
  return { pinHash: await hashPin(pin, salt, crypto), salt }
}

export async function verifyPin(pin: string, config: LockConfig, crypto: Crypto = globalThis.crypto): Promise<boolean> {
  if (!isValidPin(pin)) return false
  const hash = await hashPin(pin, config.salt, crypto)
  // Comparación de longitud constante: no revela cuántos caracteres coinciden.
  if (hash.length !== config.pinHash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ config.pinHash.charCodeAt(i)
  return diff === 0
}

export function readLockConfig(storage: Storage | null = safeStorage()): LockConfig | null {
  try {
    const raw = storage?.getItem(LOCK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LockConfig>
    if (typeof parsed.pinHash !== 'string' || typeof parsed.salt !== 'string') return null
    return { pinHash: parsed.pinHash, salt: parsed.salt, ...(typeof parsed.credentialId === 'string' ? { credentialId: parsed.credentialId } : {}) }
  } catch {
    return null
  }
}

export function writeLockConfig(config: LockConfig | null, storage: Storage | null = safeStorage()): boolean {
  try {
    if (!storage) return false
    if (config) storage.setItem(LOCK_KEY, JSON.stringify(config))
    else storage.removeItem(LOCK_KEY)
    return true
  } catch {
    return false
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** ¿Hay que volver a pedir el PIN? Tras 60 s con la app en segundo plano. */
export function shouldRelock(hiddenAt: number | null, now: number): boolean {
  return hiddenAt !== null && now - hiddenAt >= RELOCK_AFTER_MS
}
