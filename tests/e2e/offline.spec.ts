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

test('borrar la caché de la app y el service worker no borra los registros financieros', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
  await expect(page.getByTestId('available')).toBeVisible()
  const before = await page.getByTestId('available').textContent()
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active)
  // La caché solo contiene archivos de la app (nunca datos).
  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) urls.push(new URL(req.url).pathname)
    return urls
  })
  expect(cached.length).toBeGreaterThan(0)
  // Fuentes incluidas (woff2) son archivos de la app, igual que js y css.
  expect(cached.every((p) => p === '/' || /\.(html|js|css|svg|png|webmanifest|json|ico|woff2)$/.test(p))).toBe(true)
  await page.evaluate(async () => {
    for (const key of await caches.keys()) await caches.delete(key)
    for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister()
  })
  await page.reload()
  await expect(page.getByTestId('available')).toHaveText(before!)
  await expect(page.getByText('Modo demostración:')).toBeVisible()
})
