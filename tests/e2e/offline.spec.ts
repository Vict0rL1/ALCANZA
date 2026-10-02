import { expect, test } from '@playwright/test'

test('tras la primera visita, la app abre sin conexión y conserva los datos', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
  await expect(page.getByTestId('available')).toBeVisible()
  // Esperar a que el service worker controle la página.
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    return !!reg?.active
  })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('available')).toBeVisible()
  await expect(page.getByText('Modo demostración:')).toBeVisible()
  await page.goto('/#/ajustes')
  await expect(page.getByText('Uso sin conexión: activo', { exact: false })).toBeVisible()
  await context.setOffline(false)
})
