/**
 * Capturas para docs/QA-REPORT.md (Fase 12): versión compilada con datos de demostración, celular 390×844,
 * tema oscuro (predeterminado) salvo una captura en claro. JPEG para que pesen poco.
 *
 *   npm run build && npx vite preview --port 4181 --strictPort &
 *   node scripts/qa-screenshots.mjs
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const base = process.env.QA_URL ?? 'http://localhost:4181'
const out = 'docs/qa'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? '/opt/pw-browsers/chromium'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, timezoneId: 'America/Toronto', locale: 'es-MX', colorScheme: 'dark' })
const page = await context.newPage()
await page.clock.install({ time: new Date('2026-09-28T12:00:00-04:00') })
const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 70, fullPage: false })
const go = async (hash) => {
  await page.evaluate((h) => (window.location.hash = h), hash)
  await page.locator('#page-title').waitFor()
  await page.waitForTimeout(400)
}

await page.goto(`${base}/`)
await page.getByRole('heading', { name: 'Hola, esto es Clara' }).waitFor()
await shot('01-bienvenida')
await page.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
await page.getByTestId('available').waitFor()
await page.waitForTimeout(600)
await shot('02-inicio')
await page.getByTestId('privacy-toggle').click()
await page.waitForTimeout(300)
await shot('03-inicio-privado')
await page.getByTestId('privacy-toggle').click()
await page.getByTestId('privacy-toggle').click()
await go('/movimientos')
await shot('04-historial')
// Un límite para que Planes tenga contenido real.
await go('/plan/planes/nuevo')
await page.getByLabel('Límite máximo').fill('30')
await page.getByTestId('plan-categories').getByRole('button', { name: 'Restaurantes y café' }).click()
await page.getByRole('button', { name: 'Guardar', exact: true }).click()
await page.getByTestId('plan-spent').waitFor()
await page.waitForTimeout(400)
await shot('06-plan-detalle')
await go('/plan/planes')
await shot('05-planes')
await go('/estadisticas')
await page.getByTestId('stats-tiles').waitFor()
await page.waitForTimeout(400)
await shot('07-estadisticas')
await go('/ajustes')
await shot('08-ajustes')
await go('/cuenta')
await shot('10-cuenta')
await go('/pro')
await shot('11-pro')
// Bloqueo: se configura un PIN y se recarga.
await go('/ajustes?seccion=bloqueo')
await page.getByRole('switch', { name: 'Pedir PIN al abrir' }).click()
const dialog = page.getByRole('dialog', { name: 'Elige un PIN' })
await dialog.getByLabel('PIN', { exact: true }).fill('2468')
await dialog.getByLabel('Repite el PIN').fill('2468')
await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
await page.getByText('PIN guardado').waitFor()
await page.reload()
await page.getByTestId('lock-screen').waitFor()
await shot('09-bloqueo')
await page.getByLabel('PIN').fill('2468')
await page.getByRole('button', { name: 'Desbloquear' }).click()
// Tema claro, una captura de Inicio.
await context.close()
const light = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Toronto', locale: 'es-MX', colorScheme: 'light' })
const p2 = await light.newPage()
await p2.clock.install({ time: new Date('2026-09-28T12:00:00-04:00') })
await p2.goto(`${base}/`)
await p2.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
await p2.getByTestId('available').waitFor()
await p2.evaluate(() => localStorage.setItem('clara.theme', 'light'))
await p2.reload()
await p2.getByTestId('available').waitFor()
await p2.waitForTimeout(600)
await p2.screenshot({ path: `${out}/12-inicio-claro.jpg`, type: 'jpeg', quality: 70 })
await browser.close()
console.log('capturas en', out)
