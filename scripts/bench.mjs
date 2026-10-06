/**
 * Mediciones de rendimiento de la versión COMPILADA con datos sintéticos (nunca del usuario).
 *
 *   1. BENCH_OUT=/tmp/bench npx vitest run src/test/synthetic.test.ts   (genera los datos)
 *   2. npm run build && npx vite preview --port 4180 --strictPort        (en otra terminal)
 *   3. node scripts/bench.mjs /tmp/bench [etiqueta]
 *
 * Mide en Chromium de escritorio (headless) de ESTA máquina: los tiempos no se pueden
 * extrapolar a un teléfono. Cada cifra es la mediana de 3 repeticiones.
 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'

const dir = process.argv[2]
const label = process.argv[3] ?? 'medicion'
const base = process.env.BENCH_URL ?? 'http://localhost:4180'
const sizes = (process.env.BENCH_SIZES ?? '1000,10000,50000').split(',').map(Number)
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/opt/pw-browsers/chromium'

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const ms = (x) => Math.round(x)

async function time(fn) {
  const t0 = performance.now()
  await fn()
  return performance.now() - t0
}

async function go(page, hash, waitFor) {
  return time(async () => {
    await page.evaluate((h) => (window.location.hash = h), hash)
    await page.locator('#page-title').waitFor()
    if (waitFor) await page.locator(waitFor).first().waitFor()
  })
}

/** Escribe en un campo y espera al siguiente cuadro pintado (React confirma el cambio de forma síncrona). */
async function typeInto(page, selector, value) {
  return page.evaluate(
    async ({ selector, value }) => {
      const el = document.querySelector(selector)
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
      const t0 = performance.now()
      setter.call(el, value)
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
      return performance.now() - t0
    },
    { selector, value },
  )
}

const results = []
const browser = await chromium.launch({ executablePath })
for (const size of sizes) {
  const text = readFileSync(`${dir}/synthetic-${size}.json`, 'utf8')
  const row = { size, mb: +(text.length / 1024 / 1024).toFixed(2) }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Toronto', locale: 'es-MX', acceptDownloads: true })
  const page = await context.newPage()
  try {
    // Sembrar los datos en el almacenamiento original (localStorage), como un usuario existente.
    await page.goto(`${base}/manifest.webmanifest`)
    const seeded = await page.evaluate((t) => {
      try {
        localStorage.setItem('margen.data.v1', t)
        return 'ok'
      } catch (e) {
        return `${e.name}`
      }
    }, text)
    row.seed = seeded
    if (seeded !== 'ok') {
      row.note = `localStorage rechazó ${row.mb} MB (${seeded})`
      results.push(row)
      await context.close()
      continue
    }
    // Primera apertura (incluye una posible migración de almacenamiento).
    row.firstOpen = ms(await time(async () => {
      await page.goto(`${base}/`)
      await page.getByTestId('available').waitFor({ timeout: 120_000 })
    }))
    const opens = []
    for (let i = 0; i < 3; i++) {
      opens.push(await time(async () => {
        await page.reload()
        await page.getByTestId('available').waitFor({ timeout: 120_000 })
      }))
    }
    row.open = ms(median(opens))

    const nav = async (route, sel) => {
      const xs = []
      for (let i = 0; i < 3; i++) {
        await go(page, '/ajustes')
        xs.push(await go(page, route, sel))
      }
      return ms(median(xs))
    }
    row.home = await nav('/', '[data-testid="available"]')
    row.movements = await nav('/movimientos', '.summary-line')
    const searches = []
    for (const q of ['super', 'café', 'xyz123']) {
      searches.push(await typeInto(page, '.filters input[type=search]', q))
      await typeInto(page, '.filters input[type=search]', '')
    }
    row.search = ms(median(searches))
    const filters = []
    await page.getByLabel('Categoría', { exact: true }).evaluate((el) => el.setAttribute('data-bench', 'cat'))
    for (const c of ['groceries', 'dining', 'housing']) filters.push(await typeInto(page, 'select[data-bench="cat"]', c))
    await typeInto(page, 'select[data-bench="cat"]', 'all')
    row.filter = ms(median(filters))
    row.globalSearch = await nav('/buscar?q=farmacia', 'main')
    row.weeklyReview = await nav('/revision', 'main')
    row.projection = await nav('/plan/proyeccion', 'main')
    row.inbox = await nav('/pendientes', 'main')

    // Guardar un movimiento nuevo (formulario → guardado → vuelta a la lista).
    const saves = []
    for (let i = 0; i < 3; i++) {
      await go(page, '/movimientos/nuevo')
      await page.getByLabel('Importe', { exact: true }).fill('1.23')
      saves.push(await time(async () => {
        await page.getByRole('button', { name: 'Guardar', exact: true }).click()
        await page.getByText('Movimiento guardado').first().waitFor()
      }))
    }
    row.save = ms(median(saves))

    // Exportar e importar la copia completa.
    await go(page, '/ajustes')
    let file
    row.export = ms(await time(async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()])
      file = await download.path()
    }))
    row.importParse = ms(await time(async () => {
      await page.getByTestId('import-file').setInputFiles(file)
      await page.getByRole('dialog').getByRole('button', { name: 'Reemplazar datos' }).waitFor({ timeout: 120_000 })
    }))
    row.importApply = ms(await time(async () => {
      await page.getByRole('dialog').getByRole('button', { name: 'Reemplazar datos' }).click()
      await page.getByText('Copia importada').first().waitFor({ timeout: 120_000 })
    }))
  } catch (e) {
    row.error = String(e.message ?? e).split('\n')[0]
  }
  results.push(row)
  console.log(JSON.stringify(row))
  await context.close()
}
await browser.close()
writeFileSync(`${dir}/results-${label}.json`, JSON.stringify(results, null, 2))
