import { expect, test } from '@playwright/test'
import { go, startDemo } from './helpers'

test('cuenta y Pro: invitado real sin botones falsos, copia cifrada que se exporta e importa con la frase, tarjeta Pro sin compra', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  await expect(page.getByTestId('ai-usage')).toContainText('Uso del asistente remoto este mes: 0 %')
  await page.getByTestId('account-link').click()
  await expect(page.getByRole('heading', { name: 'Modo invitado' })).toBeVisible()
  await expect(page.getByText('No se muestran botones de Google o Apple', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: /Google|Apple/ })).toHaveCount(0)

  // Exportar copia cifrada: frase corta rechazada; frases distintas rechazadas; luego descarga.
  await page.getByTestId('export-encrypted').click()
  const dialog = page.getByRole('dialog', { name: 'Copia cifrada con frase' })
  await dialog.getByLabel('Frase', { exact: true }).fill('corta')
  await dialog.getByRole('button', { name: 'Exportar copia cifrada' }).click()
  await expect(dialog.getByText('La frase debe tener al menos 8 caracteres.')).toBeVisible()
  await dialog.getByLabel('Frase', { exact: true }).fill('mi frase secreta')
  await dialog.getByLabel('Repite la frase').fill('otra frase secreta')
  await dialog.getByRole('button', { name: 'Exportar copia cifrada' }).click()
  await expect(dialog.getByText('Las dos frases no coinciden.')).toBeVisible()
  await dialog.getByLabel('Repite la frase').fill('mi frase secreta')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Exportar copia cifrada' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^clara-demo-copia-cifrada-.*\.json$/)
  const path = await file.path()
  const text = (await import('node:fs')).readFileSync(path!, 'utf8')
  expect(text).toContain('clara-encrypted-backup')
  expect(text).not.toContain('Renta')

  // Importar: con frase incorrecta se rechaza; con la correcta llega a la confirmación normal.
  await go(page, '/ajustes?seccion=copia')
  await page.getByTestId('import-file').setInputFiles({ name: 'cifrada.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  const open = page.getByRole('dialog', { name: 'Abrir copia cifrada' })
  await open.getByLabel('Frase', { exact: true }).fill('frase equivocada')
  await open.getByRole('button', { name: 'Abrir' }).click()
  await expect(open.getByText('Frase incorrecta o archivo alterado.')).toBeVisible()
  await open.getByLabel('Frase', { exact: true }).fill('mi frase secreta')
  await open.getByRole('button', { name: 'Abrir' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Reemplazar tus datos con esta copia?' })
  await expect(confirm).toContainText('Moneda: CAD')
  await confirm.getByRole('button', { name: 'Cancelar' }).click()

  // Pro: sin precio ni botón de compra; en la compilación de pruebas (producción) no hay interruptor de desarrollo.
  await go(page, '/pro')
  await expect(page.getByText('No hay suscripción que comprar en este prototipo')).toBeVisible()
  await expect(page.getByRole('button', { name: /Suscribirse|Restaurar compras/ })).toHaveCount(0)
  await expect(page.getByRole('switch', { name: /Simular Pro/ })).toHaveCount(0)
  await expect(page.getByText('todavía no existe').first()).toBeVisible()
})
