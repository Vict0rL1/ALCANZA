/**
 * Informe de errores (M3): los 20 últimos fallos de la app en ESTE dispositivo, para pegarlos en un
 * aviso de la beta. Vive en `localStorage` (`clara.errors.v1`), fuera de los datos y de las copias.
 *
 * Nada financiero puede quedar dentro. Cada texto se sanea así, en este orden:
 *   1. cualquier texto que la persona escribió (nombres, notas, comercios…) → «…»;
 *   2. lo que va entre comillas → «…» (ahí suelen ir los valores);
 *   3. cada dígito → «#» (importes, fechas, números de cuenta);
 *   4. como mucho 40 caracteres.
 * La ruta se guarda sin la consulta (`?importe=…&comercio=…`).
 */
import type { AppData } from '../domain/types'

export const ERROR_LOG_KEY = 'clara.errors.v1'
export const MAX_ERRORS = 20
export const MAX_TEXT = 40

export interface ErrorEntry {
  /** Marca de tiempo ISO (UTC). */
  at: string
  version: string
  route: string
  message: string
}

/** Claves cuyo valor nunca es texto de la persona (ids, enumeraciones, formatos). */
const NOT_USER_TEXT = /^(id|.*Id|.*Ids|currency|kind|type|source|status|timeZone|language|numberLocale|theme|color|icon|.*Uri|.*At|date|.*Date|schemaVersion|importRef|fingerprint)$/
const ISO_LIKE = /^\d{4}-\d{2}-\d{2}/

/**
 * Todo texto que la persona pudo escribir: se recorre el objeto entero en vez de enumerar campos
 * (un campo nuevo queda cubierto sin acordarse de añadirlo aquí). Más largo primero.
 */
export function collectUserStrings(data: AppData): string[] {
  const out = new Set<string>()
  const visit = (value: unknown, key: string) => {
    if (typeof value === 'string') {
      const s = value.trim()
      if (s.length >= 3 && s.length <= 500 && /\p{L}/u.test(s) && !ISO_LIKE.test(s) && !s.startsWith('data:') && !NOT_USER_TEXT.test(key)) out.add(s)
      return
    }
    if (Array.isArray(value)) {
      for (const v of value) visit(v, key)
      return
    }
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) visit(v, k)
  }
  visit(data, '')
  return [...out].sort((a, b) => b.length - a.length)
}

const QUOTED = /"[^"]*"|'[^']*'|«[^»]*»|“[^”]*”|‘[^’]*’|`[^`]*`/g

export function sanitizeErrorText(text: string, userStrings: readonly string[]): string {
  let s = String(text).slice(0, 4000)
  if (userStrings.length > 0) {
    for (const secret of userStrings) {
      const needle = secret.toLowerCase()
      let lower = s.toLowerCase()
      let at = lower.indexOf(needle)
      while (at !== -1) {
        s = `${s.slice(0, at)}…${s.slice(at + secret.length)}`
        lower = s.toLowerCase()
        at = lower.indexOf(needle, at + 1)
      }
    }
  }
  s = s.replace(QUOTED, '…').replace(/\d/g, '#').replace(/\s+/g, ' ').trim()
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s
}

const isEntry = (e: unknown): e is ErrorEntry => {
  const x = e as Record<string, unknown> | null
  return !!x && typeof x === 'object' && ['at', 'version', 'route', 'message'].every((k) => typeof x[k] === 'string')
}

export function readErrors(storage: Storage | undefined = safeLocalStorage()): ErrorEntry[] {
  try {
    const raw = storage?.getItem(ERROR_LOG_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch {
    return []
  }
}

export function recordError(input: ErrorEntry, userStrings: readonly string[], storage: Storage | undefined = safeLocalStorage()): void {
  try {
    const entry: ErrorEntry = {
      at: input.at,
      version: input.version,
      route: sanitizeErrorText(input.route.split('?')[0] || '/', userStrings),
      message: sanitizeErrorText(input.message, userStrings),
    }
    storage?.setItem(ERROR_LOG_KEY, JSON.stringify([...readErrors(storage), entry].slice(-MAX_ERRORS)))
  } catch {
    // Sin espacio o sin permiso: el informe es una ayuda, nunca otro fallo.
  }
}

export function clearErrors(storage: Storage | undefined = safeLocalStorage()): void {
  try {
    storage?.removeItem(ERROR_LOG_KEY)
  } catch {
    // Igual que arriba.
  }
}

/** Texto para «Copiar»: versión y compilación, y una línea por error. */
export function reportText(entries: readonly ErrorEntry[], build: { version: string; build: string }): string {
  return [`Clara ${build.version} (${build.build})`, ...entries.map((e) => `${e.at} · ${e.version} · ${e.route} · ${e.message}`)].join('\n')
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/* ---------------- En el navegador ---------------- */

let context: { version: string; userStrings: () => readonly string[] } | null = null

const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

/** Registra un fallo (lo usan los manejadores globales y el límite de error de las pantallas). */
export function logError(error: unknown): void {
  if (!context) return
  let userStrings: readonly string[] = []
  try {
    userStrings = context.userStrings()
  } catch {
    // Sin datos cargados: se sanea igual (comillas, dígitos y longitud).
  }
  recordError({ at: new Date().toISOString(), version: context.version, route: window.location.hash.slice(1) || '/', message: describe(error) }, userStrings)
}

/**
 * `window.onerror` y `unhandledrejection`. Se ignora lo que viene de extensiones del navegador (la CSP
 * no deja cargar scripts de otros sitios) y el aviso benigno de ResizeObserver.
 */
export function installErrorLog(options: { version: string; userStrings: () => readonly string[] }): void {
  context = options
  window.addEventListener('error', (event) => {
    if (/^[a-z-]+-extension:/.test(event.filename ?? '')) return
    if (/ResizeObserver loop/.test(event.message)) return
    logError(event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => logError(event.reason))
}
