/**
 * Conservación de datos ante fallos del navegador (cuota, permisos, otra pestaña).
 * Se usa un `localStorage` simulado con fallos controlados.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { saveTransaction } from '../domain/operations'
import type { AppData } from '../domain/types'
import { AppStore } from '../state/store'
import { baseData, ctx, tx } from '../test/fixtures'
import { LocalStorageRepository, STORAGE_KEY } from './localStorageRepository'

type Mode = 'ok' | 'full' | 'blocked' | 'readBlocked'

function fakeStorage() {
  const map = new Map<string, string>()
  const state = { mode: 'ok' as Mode, writes: 0 }
  const fail = (name: string) => {
    throw Object.assign(new Error(name), { name })
  }
  const storage = {
    getItem: (k: string) => (state.mode === 'readBlocked' ? fail('SecurityError') : (map.get(k) ?? null)),
    setItem: (k: string, v: string) => {
      if (state.mode === 'full') fail('QuotaExceededError')
      if (state.mode === 'blocked' || state.mode === 'readBlocked') fail('SecurityError')
      state.writes++
      map.set(k, v)
    },
    removeItem: (k: string) => void map.delete(k),
  }
  return { map, state, storage }
}

let fake: ReturnType<typeof fakeStorage>
const g = globalThis as { localStorage?: unknown }
let original: unknown
beforeEach(() => {
  fake = fakeStorage()
  original = g.localStorage
  g.localStorage = fake.storage
})
afterEach(() => {
  g.localStorage = original
})

const withTx = (d: AppData, id: string) => {
  const r = saveTransaction(d, tx({ id, amountMinor: 1000, categoryId: 'dining' }), ctx)
  if (!r.ok) throw new Error('op')
  return r.data
}

describe('almacenamiento lleno', () => {
  it('al abrir con el almacenamiento lleno se leen los datos (no se muestra la app vacía)', async () => {
    fake.map.set(STORAGE_KEY, JSON.stringify(baseData({ transactions: [tx({ id: 'a' })] })))
    fake.state.mode = 'full'
    const loaded = await new LocalStorageRepository().load()
    expect(loaded.status).toBe('ok')
    expect(loaded.status === 'ok' && loaded.data.transactions.map((t) => t.id)).toEqual(['a'])
    // Y la app no cae al modo «solo en memoria».
    const store = new AppStore(new LocalStorageRepository())
    await store.init()
    const s = store.getState()
    expect(s.phase === 'ready' && s.storage).toBe('local')
    expect(store.data?.transactions).toHaveLength(1)
  })

  it('si guardar falla, lo almacenado queda intacto, se marca «sin guardar» y reintentar lo resuelve', async () => {
    const initial = baseData()
    fake.map.set(STORAGE_KEY, JSON.stringify(initial))
    const store = new AppStore(new LocalStorageRepository())
    await store.init()
    const before = fake.map.get(STORAGE_KEY)
    fake.state.mode = 'full'
    expect(await store.commit(withTx(store.data!, 'x'))).toBe(false)
    expect(fake.map.get(STORAGE_KEY)).toBe(before) // último estado válido intacto
    const s = store.getState()
    expect(s.phase === 'ready' && [s.unsaved, s.save]).toEqual([true, { state: 'error', error: 'quota' }])
    expect(store.hasUnsavedChanges).toBe(true)
    // Lo que se ve conserva el cambio (no se reemplaza por una demostración ni por vacío).
    expect(store.data!.transactions.map((t) => t.id)).toEqual(['x'])
    fake.state.mode = 'ok'
    expect(await store.retrySave()).toBe(true)
    expect(store.hasUnsavedChanges).toBe(false)
    expect(JSON.parse(fake.map.get(STORAGE_KEY)!).transactions.map((t: { id: string }) => t.id)).toEqual(['x'])
  })

  it('permiso bloqueado al guardar → «no disponible», sin escrituras', async () => {
    const store = new AppStore(new LocalStorageRepository())
    fake.map.set(STORAGE_KEY, JSON.stringify(baseData()))
    await store.init()
    fake.state.mode = 'blocked'
    expect(await store.commit(withTx(store.data!, 'x'))).toBe(false)
    const s = store.getState()
    expect(s.phase === 'ready' && s.save).toEqual({ state: 'error', error: 'unavailable' })
    expect(fake.state.writes).toBe(0)
  })

  it('si el navegador no deja ni leer, se trabaja en memoria y se avisa (nada se borra)', async () => {
    fake.map.set(STORAGE_KEY, 'algo')
    fake.state.mode = 'readBlocked'
    const store = new AppStore(new LocalStorageRepository())
    await store.init()
    const s = store.getState()
    expect(s.phase === 'ready' && s.storage).toBe('memory')
    expect(fake.map.get(STORAGE_KEY)).toBe('algo')
  })
})

describe('dos pestañas', () => {
  it('no se sobrescriben en silencio los cambios guardados por otra pestaña', async () => {
    fake.map.set(STORAGE_KEY, JSON.stringify(baseData()))
    const tabA = new AppStore(new LocalStorageRepository())
    const tabB = new AppStore(new LocalStorageRepository())
    await tabA.init()
    await tabB.init()
    expect(await tabA.commit(withTx(tabA.data!, 'from-a'))).toBe(true)
    const savedByA = fake.map.get(STORAGE_KEY)
    // B todavía tiene los datos antiguos: su guardado se rechaza y se le avisa.
    expect(await tabB.commit(withTx(tabB.data!, 'from-b'))).toBe(false)
    expect(fake.map.get(STORAGE_KEY)).toBe(savedByA)
    const s = tabB.getState()
    expect(s.phase === 'ready' && [s.unsaved, s.externalChange, s.save]).toEqual([true, true, { state: 'error', error: 'conflict' }])
    // Reintentar no fuerza nada; cargar lo guardado trae los cambios de A.
    expect(await tabB.retrySave()).toBe(false)
    await tabB.reload()
    expect(tabB.data!.transactions.map((t) => t.id)).toEqual(['from-a'])
    expect(await tabB.commit(withTx(tabB.data!, 'from-b'))).toBe(true)
    expect(JSON.parse(fake.map.get(STORAGE_KEY)!).transactions.map((t: { id: string }) => t.id).sort()).toEqual(['from-a', 'from-b'])
  })

  it('una pestaña antigua no puede guardar encima de datos ya migrados por una versión nueva', async () => {
    fake.map.set(STORAGE_KEY, JSON.stringify(baseData()))
    const oldTab = new AppStore(new LocalStorageRepository())
    await oldTab.init()
    // Otra versión de la app guardó datos de un formato futuro.
    const future = JSON.stringify({ ...baseData(), schemaVersion: 99 })
    fake.map.set(STORAGE_KEY, future)
    expect(await oldTab.commit(withTx(oldTab.data!, 'x'))).toBe(false)
    expect(fake.map.get(STORAGE_KEY)).toBe(future)
    // Al recargar, la versión antigua lo reconoce como «más nuevo» y no lo toca.
    await oldTab.reload()
    const s = oldTab.getState()
    expect(s.phase === 'corrupt' && s.issues.map((i) => i.code)).toEqual(['schemaTooNew'])
    expect(fake.map.get(STORAGE_KEY)).toBe(future)
  })

  it('empezar en una pestaña vacía mientras otra ya configuró: tampoco se pisa', async () => {
    const tabA = new AppStore(new LocalStorageRepository())
    const tabB = new AppStore(new LocalStorageRepository())
    await tabA.init()
    await tabB.init()
    expect(await tabA.commit(baseData())).toBe(true)
    expect(await tabB.commit(baseData({ budgetId: 'other' }))).toBe(false)
    expect(JSON.parse(fake.map.get(STORAGE_KEY)!).budgetId).not.toBe('other')
  })
})
