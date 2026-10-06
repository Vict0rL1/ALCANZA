import { expect, type Page } from '@playwright/test'

/** Mediodía del 28-sep-2026 en Toronto. El reloj avanza con normalidad desde aquí. */
export const START = new Date('2026-09-28T12:00:00-04:00')

export async function openApp(page: Page, time: Date = START) {
  await page.clock.install({ time })
  await page.goto('/')
}

/** Abre la app y carga los datos de demostración (fechas relativas a START). */
export async function startDemo(page: Page, time: Date = START) {
  await openApp(page, time)
  await page.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
  await expect(page.getByTestId('available')).toBeVisible()
}

export function nav(page: Page, name: 'Inicio' | 'Movimientos' | 'Plan' | 'Ajustes') {
  return page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name })
}

export async function go(page: Page, hash: string) {
  // Como una persona: espera a que termine de guardarse lo anterior (el guardado es asíncrono
  // y, al terminar, el formulario vuelve a su pantalla de origen).
  await expect(page.locator('.save-indicator--saving')).toHaveCount(0)
  await page.waitForTimeout(0)
  await page.evaluate((h) => {
    window.location.hash = h
  }, hash)
  await expect(page.locator('#page-title')).toBeVisible()
}

export async function available(page: Page) {
  await go(page, '/')
  return page.getByTestId('available')
}

/** Número de movimientos según el resumen de la lista. */
export async function movementCount(page: Page): Promise<number> {
  await go(page, '/movimientos')
  if ((await page.getByText('Todavía no hay movimientos').count()) > 0) return 0
  const text = (await page.locator('.summary-line').textContent()) ?? ''
  return Number(/(\d+) movimiento/.exec(text)?.[1] ?? NaN)
}

/** Inicio agrupa los avisos secundarios en «N avisos más»: los despliega si existen. */
export async function showAllNotices(page: Page) {
  const more = page.getByTestId('more-notices')
  if ((await more.count()) > 0 && !(await more.evaluate((d) => (d as HTMLDetailsElement).open))) await more.locator('summary').click()
}

/* ------------------------------------------------------------------ */
/* Almacenamiento real de la app (IndexedDB «clara», almacén «kv»).    */
/* ------------------------------------------------------------------ */

/** Texto JSON de los datos guardados (o null si no hay). */
export async function storedData(page: Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open('clara', 1)
        req.onsuccess = () => {
          const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('data')
          get.onsuccess = () => {
            resolve(get.result === undefined ? null : JSON.stringify(get.result))
            req.result.close()
          }
          get.onerror = () => reject(get.error)
        }
        req.onerror = () => reject(req.error)
      }),
  )
}

/** Sustituye los datos guardados (como si otra versión o pestaña los hubiera escrito). */
export async function writeStoredData(page: Page, data: unknown) {
  await page.evaluate(
    (d) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('clara', 1)
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readwrite')
          tx.objectStore('kv').put(d, 'data')
          tx.objectStore('kv').put({ revision: 1_000_000 + Math.floor(Math.random() * 1000), savedAt: new Date().toISOString() }, 'meta')
          tx.oncomplete = () => {
            req.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
    data,
  )
}

/** Hace que IndexedDB rechace escrituras (como con el almacenamiento lleno). */
export async function failStorageWrites(page: Page, name: 'QuotaExceededError' | 'InvalidStateError' = 'QuotaExceededError') {
  await page.evaluate((n) => {
    const w = window as unknown as { __realPut?: typeof IDBObjectStore.prototype.put }
    w.__realPut ??= IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('simulado', n)
    }
  }, name)
}

export async function restoreStorageWrites(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __realPut?: typeof IDBObjectStore.prototype.put }
    if (w.__realPut) IDBObjectStore.prototype.put = w.__realPut
  })
}

/** Lee cualquier registro del almacén (p. ej. la copia previa a un cambio de formato). */
export async function storedRecord(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (k) =>
      new Promise<unknown>((resolve, reject) => {
        const req = indexedDB.open('clara', 1)
        req.onsuccess = () => {
          const get = req.result.transaction('kv', 'readonly').objectStore('kv').get(k)
          get.onsuccess = () => {
            resolve(get.result ?? null)
            req.result.close()
          }
          get.onerror = () => reject(get.error)
        }
        req.onerror = () => reject(req.error)
      }),
    key,
  )
}

/** Simula a alguien que viene de una versión anterior: datos solo en localStorage. */
export async function seedLegacyLocalStorage(page: Page, data: unknown) {
  await page.evaluate(
    (text) =>
      new Promise<void>((resolve) => {
        localStorage.setItem('margen.data.v1', text)
        localStorage.removeItem('margen.data.pre-idb')
        const req = indexedDB.deleteDatabase('clara')
        req.onsuccess = () => resolve()
        req.onblocked = () => resolve()
        req.onerror = () => resolve()
      }),
    JSON.stringify(data),
  )
}
