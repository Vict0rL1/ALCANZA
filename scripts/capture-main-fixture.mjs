// Captura `tests/e2e/fixtures/main-schema8.json` usando la compilación REAL de `main` (esquema 8),
// no a mano (H3). Lo que guarda es exactamente lo que `main` escribió en IndexedDB, más las cifras
// que `main` mostraba en ese momento, para comprobar que la versión nueva enseña las mismas.
//
// Uso (desde la raíz del repositorio):
//   git worktree add /tmp/clara-main origin/main
//   ln -s "$PWD/node_modules" /tmp/clara-main/node_modules   # mismas dependencias que esta rama
//   (cd /tmp/clara-main && npx vite build && npx vite preview --port 4190 --strictPort &)
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chromium node scripts/capture-main-fixture.mjs http://localhost:4190 <commit de main>
import { writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BASE = process.argv[2] ?? 'http://localhost:4190'
const COMMIT = process.argv[3] ?? 'desconocido'
// El mismo «hoy» que usan las pruebas e2e (helpers.ts › START).
const START = new Date('2026-09-28T12:00:00-04:00')

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined })
const page = await (await browser.newContext({ locale: 'es-MX', timezoneId: 'America/Toronto' })).newPage()
await page.clock.install({ time: START })
// Cambia de pantalla y espera a llegar (tras guardar, main navega por su cuenta: no hay que pisarlo).
const go = async (hash) => {
  for (let i = 0; i < 5; i++) {
    await page.evaluate((h) => (window.location.hash = h), hash)
    await page.waitForTimeout(400)
    if (new URL(page.url()).hash === `#${hash}`) return
  }
  throw new Error(`No se pudo abrir ${hash}`)
}
const toast = (text) => page.getByText(text).first().waitFor()

await page.goto(BASE)
// 1. Configuración inicial: cuenta con 1,200.00, ingreso de 800.00 el 8-oct, renta de 600.00 el 3-oct
//    y una reserva de emergencia de 200.00.
await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
await page.getByLabel('Saldo disponible').fill('1200')
const period = page.getByLabel('Periodo del presupuesto')
if (await period.count()) await period.selectOption({ label: 'Hasta mi próximo ingreso' })
await page.getByRole('button', { name: 'Continuar' }).click()
await page.getByLabel('Importe esperado').fill('800')
await page.getByLabel('Fecha del próximo ingreso').fill('2026-10-08')
await page.getByRole('button', { name: 'Continuar' }).click()
await page.getByRole('button', { name: 'Agregar un pago' }).click()
await page.getByLabel('Nombre').fill('Renta')
await page.getByLabel('Importe', { exact: true }).fill('600')
await page.getByLabel('Próxima fecha de pago').fill('2026-10-03')
await page.getByRole('button', { name: 'Continuar' }).click()
const reserve = page.getByLabel('Cantidad reservada')
if (await reserve.count()) await reserve.fill('200')
await page.getByRole('button', { name: 'Ver resumen' }).click()
await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()
await page.getByTestId('available').waitFor()

// 2. Categorías propias: una creada con la app en español y otra con la app en inglés.
const newCategory = async (button, dialogName, name, saved) => {
  await go('/ajustes')
  await page.getByRole('button', { name: button }).click()
  const dialog = page.getByRole('dialog', { name: dialogName })
  await dialog.getByLabel(/^(Nombre|Name)$/).fill(name)
  await dialog.getByRole('button', { name: /^(Guardar|Save)$/ }).click()
  await toast(saved)
}
await newCategory('Nueva categoría', 'Nueva categoría', 'Mascotas', 'Categoría guardada')
await go('/ajustes')
await page.getByLabel('Idioma').selectOption({ label: 'English' })
await page.waitForTimeout(500)
await newCategory('New category', 'New category', 'Coffee shops', 'Category saved')
await go('/ajustes')
await page.getByLabel('Language').selectOption({ label: 'Español' })
await page.waitForTimeout(500)

// 3. Movimientos realizados con categorías del sistema y propias.
const expense = async (amount, category, note) => {
  await go('/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill(amount)
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: category })
  // «Más detalles» (fecha, estado, nota…) plegado: igual que el helper openDetails de main.
  const details = page.getByTestId('movement-details')
  if ((await details.count()) && !(await details.evaluate((el) => el.open))) await details.locator('summary').click()
  await page.getByLabel('Nota (opcional)').fill(note)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await toast('Movimiento guardado')
  await page.waitForURL(/#\/movimientos$/)
}
await expense('45.20', 'Supermercado', 'Súper de la semana')
await expense('4.50', 'Coffee shops', 'Café con leche')
await expense('12', 'Transporte', 'Uber al trabajo')
await expense('25', 'Mascotas', 'Croquetas')

// 4. Una meta con fecha.
await go('/plan/metas/nueva')
await page.getByLabel('Nombre', { exact: true }).fill('Laptop')
await page.getByLabel('Importe objetivo').fill('900')
await page.getByLabel('Fecha objetivo (opcional)').fill('2027-01-26')
await page.getByRole('button', { name: 'Guardar', exact: true }).click()
await toast('Meta guardada')

// 5. Lo que `main` muestra y lo que guardó.
await go('/')
const available = (await page.getByTestId('available').textContent()).trim()
const data = await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('clara', 1)
      req.onsuccess = () => {
        const get = req.result.transaction('kv', 'readonly').objectStore('kv').get('data')
        get.onsuccess = () => resolve(get.result)
        get.onerror = () => reject(get.error)
      }
      req.onerror = () => reject(req.error)
    }),
)
await browser.close()
if (data.schemaVersion !== 8) throw new Error(`Se esperaba esquema 8 y main guardó ${data.schemaVersion}`)
const fixture = {
  _about:
    'Datos guardados por la compilación real de main (esquema 8), capturados con scripts/capture-main-fixture.mjs. ' +
    'No se editan a mano: si main cambia, se vuelven a capturar con ese script. «expected» es lo que main mostraba.',
  capturedFrom: { branch: 'main', commit: COMMIT, today: '2026-09-28', timeZone: 'America/Toronto' },
  expected: { available, transactions: data.transactions.length },
  data,
}
writeFileSync(new URL('../tests/e2e/fixtures/main-schema8.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n')
console.log(`Fixture guardado: esquema ${data.schemaVersion}, ${data.transactions.length} movimientos, «Puedes gastar» ${available}`)
