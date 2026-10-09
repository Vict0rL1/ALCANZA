import { expect, test, type Page } from '@playwright/test'
import { setupFirstUse, startDemo, storedData } from './helpers'

/**
 * K3 · «Protege tus datos» justo después de la configuración, una vez: pedir al navegador que
 * conserve los datos (aceptado, rechazado o sin soporte) y hacer la primera copia; cada paso dice
 * su resultado y el recordatorio de copias sigue activo.
 */
type PersistMode = 'granted' | 'denied' | 'unsupported'

const stubPersist = (page: Page, mode: PersistMode) =>
  page.addInitScript((m) => {
    const w = window as unknown as { __persisted?: boolean }
    if (m === 'unsupported') {
      Object.defineProperty(StorageManager.prototype, 'persist', { value: undefined, configurable: true })
      Object.defineProperty(StorageManager.prototype, 'persisted', { value: undefined, configurable: true })
      return
    }
    Object.defineProperty(StorageManager.prototype, 'persisted', { value: async () => !!w.__persisted, configurable: true })
    Object.defineProperty(StorageManager.prototype, 'persist', {
      configurable: true,
      value: async () => {
        w.__persisted = m === 'granted'
        return w.__persisted
      },
    })
  }, mode)

const backupState = async (page: Page) => (JSON.parse((await storedData(page)) ?? '{}') as { backup?: { reminder?: string; lastExportAt?: string } }).backup

for (const [mode, after] of [
  ['granted', 'El navegador aceptó conservar estos datos'],
  ['denied', 'El navegador puede borrar estos datos si le falta espacio'],
  ['unsupported', 'Este navegador no permite pedir que se conserven los datos'],
] as const) {
  test(`tras configurar: conservar los datos (${mode}) y primera copia, una sola vez`, async ({ page }) => {
    await stubPersist(page, mode)
    await setupFirstUse(page)
    const card = page.getByTestId('safety-card')
    await expect(card).toContainText('Protege tus datos')
    const persist = card.getByTestId('safety-persist')
    if (mode === 'unsupported') {
      await expect(persist).toHaveAttribute('data-status', 'unsupported')
      await expect(card.getByRole('button', { name: 'Pedir al navegador que conserve los datos' })).toHaveCount(0)
    } else {
      await expect(persist).toHaveAttribute('data-status', 'notGranted')
      await card.getByRole('button', { name: 'Pedir al navegador que conserve los datos' }).click()
      await expect(persist).toHaveAttribute('data-status', mode === 'granted' ? 'granted' : 'notGranted')
    }
    await expect(persist).toContainText(after)

    // Primera copia (aquí, descarga; con hoja de compartir sería K1): el resultado se ve en la tarjeta.
    await expect(card.getByTestId('safety-backup')).toHaveAttribute('data-done', 'no')
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Exportar copia' }).click()])
    expect(download.suggestedFilename()).toMatch(/^clara-copia-.*\.json$/)
    await expect(card.getByTestId('safety-backup')).toHaveAttribute('data-done', 'yes')
    await expect(card.getByTestId('safety-backup')).toContainText('Copia hecha')
    const backup = await backupState(page)
    expect(backup?.lastExportAt).toBeTruthy()
    // El recordatorio de copias sigue activo.
    expect(backup?.reminder).toBe('weekly')

    await card.getByRole('button', { name: 'Listo' }).click()
    await expect(card).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('available')).toBeVisible()
    await expect(page.getByTestId('safety-card')).toHaveCount(0)
  })
}

test('«Ahora no» también cuenta como preguntado', async ({ page }) => {
  await setupFirstUse(page)
  await page.getByTestId('safety-card').getByRole('button', { name: 'Ahora no' }).click()
  await page.reload()
  await expect(page.getByTestId('available')).toBeVisible()
  await expect(page.getByTestId('safety-card')).toHaveCount(0)
})

test('la demostración no lo pregunta', async ({ page }) => {
  await startDemo(page)
  await expect(page.getByTestId('safety-card')).toHaveCount(0)
})
