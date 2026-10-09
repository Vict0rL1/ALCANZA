import { expect, test, type Page } from '@playwright/test'
import { go, setupFirstUse, START, startDemo } from './helpers'

/**
 * K2 · Instalar Clara: lo que cada navegador permite de verdad (Ajustes › Instalar Clara) y una
 * tarjeta en Inicio, una sola vez, tras 3 días de uso y nunca dentro de la app instalada.
 */
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1'
const DAY = 24 * 60 * 60 * 1000

/** Simula la app abierta desde la pantalla de inicio (`display-mode: standalone`). */
const asInstalled = (page: Page) =>
  page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => (query.includes('display-mode: standalone') ? ({ ...original(query), matches: true, media: query } as MediaQueryList) : original(query))
  })

/** Simula el evento de Chrome/Edge que permite instalar con un botón. */
const withInstallPrompt = (page: Page) =>
  page.addInitScript(() => {
    window.addEventListener('load', () => {
      const event = new Event('beforeinstallprompt') as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
      event.prompt = async () => {
        ;(window as unknown as { __prompted?: boolean }).__prompted = true
      }
      event.userChoice = Promise.resolve({ outcome: 'accepted' })
      window.dispatchEvent(event)
    })
  })

test.describe('en iPhone (Safari)', () => {
  test.use({ userAgent: IPHONE_UA })

  test('pasos de Safari, aviso de datos separados y enlace a copiar e importar; sin botón', async ({ page }) => {
    await startDemo(page)
    await go(page, '/ajustes/instalar')
    const guide = page.getByTestId('install-guide')
    await expect(guide).toHaveAttribute('data-mode', 'ios')
    await expect(guide).toContainText('Safari › Compartir › Agregar a inicio')
    await expect(guide).toContainText(
      'La app instalada tiene sus propios datos, separados de Safari. Si ya usas Clara en Safari, exporta una copia, instala y luego importa la copia en la app instalada',
    )
    await expect(guide.getByRole('button')).toHaveCount(0)
    await guide.getByRole('link', { name: 'Cómo exportar e importar una copia' }).click()
    await expect(page.getByRole('button', { name: 'Exportar copia' })).toBeVisible()
  })
})

test('Chrome con instalación disponible: el botón abre el diálogo del navegador', async ({ page }) => {
  await withInstallPrompt(page)
  await startDemo(page)
  await go(page, '/ajustes/instalar')
  const guide = page.getByTestId('install-guide')
  await expect(guide).toHaveAttribute('data-mode', 'prompt')
  await guide.getByRole('button', { name: 'Instalar Clara' }).click()
  await expect(guide).toContainText('Listo: Clara quedó instalada')
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true)
})

test('sin instalación disponible: solo instrucciones, ningún botón que no haría nada', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes/instalar')
  const guide = page.getByTestId('install-guide')
  await expect(guide).toHaveAttribute('data-mode', 'manual')
  await expect(guide).toContainText('menú ⋮ › «Instalar Clara»')
  await expect(guide.getByRole('button')).toHaveCount(0)
})

test('dentro de la app instalada: lo dice y no muestra pasos', async ({ page }) => {
  await asInstalled(page)
  await startDemo(page)
  await go(page, '/ajustes/instalar')
  await expect(page.getByTestId('install-guide')).toHaveAttribute('data-mode', 'installed')
  await expect(page.getByTestId('install-guide')).toContainText('Clara ya está instalada')
})

test('tarjeta de Inicio: no antes de 3 días; luego una sola vez («Ahora no» no vuelve tras recargar)', async ({ page }) => {
  await setupFirstUse(page)
  await expect(page.getByTestId('install-card')).toHaveCount(0)
  await page.clock.setSystemTime(new Date(START.getTime() + 2 * DAY))
  await page.reload()
  await expect(page.getByTestId('available')).toBeVisible()
  await expect(page.getByTestId('install-card')).toHaveCount(0)

  await page.clock.setSystemTime(new Date(START.getTime() + 3 * DAY))
  await page.reload()
  await expect(page.getByTestId('available')).toBeVisible()
  const more = page.getByTestId('more-notices')
  if ((await more.count()) > 0 && !(await page.getByTestId('install-card').isVisible())) await more.locator('summary').click()
  const card = page.getByTestId('install-card')
  await expect(card).toContainText('Instala Clara en tu pantalla de inicio')
  await card.getByRole('button', { name: 'Ahora no' }).click()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('available')).toBeVisible()
  await expect(page.getByTestId('install-card')).toHaveCount(0)
})

test('tarjeta de Inicio: nunca dentro de la app instalada', async ({ page }) => {
  await asInstalled(page)
  await setupFirstUse(page)
  await page.clock.setSystemTime(new Date(START.getTime() + 5 * DAY))
  await page.reload()
  await expect(page.getByTestId('available')).toBeVisible()
  await expect(page.getByTestId('install-card')).toHaveCount(0)
})

test('tarjeta de Inicio: «Ver cómo» lleva a Ajustes › Instalar y no vuelve a salir', async ({ page }) => {
  await setupFirstUse(page)
  await page.clock.setSystemTime(new Date(START.getTime() + 4 * DAY))
  await page.reload()
  await expect(page.getByTestId('available')).toBeVisible()
  const more = page.getByTestId('more-notices')
  if ((await more.count()) > 0 && !(await page.getByTestId('install-card').isVisible())) await more.locator('summary').click()
  await page.getByTestId('install-card').getByRole('link', { name: 'Ver cómo' }).click()
  await expect(page.getByTestId('install-guide')).toBeVisible()
  await go(page, '/')
  await expect(page.getByTestId('install-card')).toHaveCount(0)
})
