import { describe, expect, it } from 'vitest'
import { createDemoData } from '../demo/demoData'
import { clearErrors, collectUserStrings, ERROR_LOG_KEY, MAX_ERRORS, MAX_TEXT, readErrors, recordError, reportText, sanitizeErrorText, type ErrorEntry } from './errorLog'

/** Almacenamiento en memoria con la forma de `localStorage`. */
function memoryStorage(): Storage & { dump: () => Record<string, string> } {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
    dump: () => Object.fromEntries(m),
  }
}
const meta = { version: '1.0.0-beta.1', route: '/movimientos', at: '2026-10-09T16:00:00.000Z' }

describe('M3 · informe de errores: saneado', () => {
  it('cambia cada dígito por # y recorta a 40 caracteres', () => {
    expect(sanitizeErrorText('Fallo al guardar 12.50 en la fila 3', [])).toBe('Fallo al guardar ##.## en la fila #')
    const long = sanitizeErrorText('TypeError: Cannot read properties of undefined (reading map)', [])
    expect(long.length).toBeLessThanOrEqual(MAX_TEXT)
    expect(long.endsWith('…')).toBe(true)
  })

  it('quita lo que va entre comillas y cualquier texto que la persona escribió (sin distinguir mayúsculas)', () => {
    expect(sanitizeErrorText('Error "Café con Ana" y \'Starbucks\' en «Ahorros»', [])).toBe('Error … y … en …')
    expect(sanitizeErrorText('TypeError: starbucks ahorros is not a function', ['Starbucks', 'Ahorros'])).toBe('TypeError: … … is not a function')
  })

  it('con los datos de la demostración no queda ningún importe, nota, comercio ni nombre de cuenta', () => {
    const data = createDemoData({ now: new Date('2026-09-28T16:00:00.000Z'), timeZone: 'America/Toronto' })
    const secrets = collectUserStrings(data)
    const tx = data.transactions.find((t) => t.note && t.merchant) ?? data.transactions.find((t) => t.note)!
    const account = data.accounts[0]!.name
    const raw = `Error: ${account} ${tx.note} ${tx.merchant ?? ''} ${tx.amountMinor / 100}`
    const clean = sanitizeErrorText(raw, secrets)
    for (const s of [account, tx.note!, tx.merchant].filter(Boolean) as string[]) expect(clean.toLowerCase()).not.toContain(s.toLowerCase())
    expect(clean).not.toMatch(/\d/)
  })
})

describe('M3 · informe de errores: almacenamiento del dispositivo', () => {
  it('guarda hora, versión, ruta y mensaje saneados; la ruta sin consulta (allí van comercio e importe)', () => {
    const storage = memoryStorage()
    recordError({ ...meta, route: '/movimientos/nuevo?importe=12.50&comercio=Starbucks', message: 'Fallo 42' }, [], storage)
    const [entry] = readErrors(storage)
    expect(entry).toEqual<ErrorEntry>({ at: meta.at, version: meta.version, route: '/movimientos/nuevo', message: 'Fallo ##' })
    expect(JSON.stringify(storage.dump())).not.toContain('Starbucks')
  })

  it('conserva solo los 20 últimos', () => {
    const storage = memoryStorage()
    for (let i = 0; i < MAX_ERRORS + 5; i++) recordError({ ...meta, message: `Fallo ${'x'.repeat(i)}` }, [], storage)
    const entries = readErrors(storage)
    expect(entries).toHaveLength(MAX_ERRORS)
    expect(entries.at(-1)!.message).toBe(sanitizeErrorText(`Fallo ${'x'.repeat(MAX_ERRORS + 4)}`, []))
  })

  it('«Borrar» lo vacía; un contenido roto se lee como vacío y nunca lanza', () => {
    const storage = memoryStorage()
    recordError({ ...meta, message: 'x' }, [], storage)
    clearErrors(storage)
    expect(readErrors(storage)).toEqual([])
    storage.setItem(ERROR_LOG_KEY, '{roto')
    expect(readErrors(storage)).toEqual([])
    storage.setItem(ERROR_LOG_KEY, JSON.stringify([{ at: 1 }, { at: meta.at, version: 'v', route: '/', message: 'ok' }]))
    expect(readErrors(storage)).toHaveLength(1)
    const throwing = { ...memoryStorage(), setItem: () => { throw new Error('lleno') }, getItem: () => { throw new Error('bloqueado') } } as Storage
    expect(() => recordError({ ...meta, message: 'x' }, [], throwing)).not.toThrow()
    expect(readErrors(throwing)).toEqual([])
  })

  it('el texto para copiar lleva versión y compilación, una línea por error', () => {
    const text = reportText([{ at: meta.at, version: '1.0.0-beta.1', route: '/', message: 'TypeError: …' }], { version: '1.0.0-beta.1', build: 'abc1234' })
    expect(text.split('\n')).toEqual(['Clara 1.0.0-beta.1 (abc1234)', `${meta.at} · 1.0.0-beta.1 · / · TypeError: …`])
  })
})
