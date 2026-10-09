import { expect, test } from '@playwright/test'
import { go, openDetails, startDemo } from './helpers'
import { tinyPng } from './png'

// PNG pequeño generado en la prueba: el navegador de pruebas no tiene detector de texto, así que la foto se adjunta y el importe se escribe.
const PNG = tinyPng(8)

test('asistente: foto de un recibo sin OCR → línea con la foto adjunta, importe a mano, registro y retirada desde el formulario', async ({ page }) => {
  await startDemo(page)
  await go(page, '/asistente')
  await expect(page.getByText('Este navegador no puede leer texto en fotos', { exact: false })).toBeVisible()
  await page.getByTestId('photo-input').setInputFiles({ name: 'recibo.png', mimeType: 'image/png', buffer: PNG })
  const line = page.getByTestId('assistant-preview').locator('.assistant__line')
  await expect(line).toHaveCount(1)
  await expect(line.getByRole('img', { name: 'Foto del recibo adjunta' })).toBeVisible()
  await expect(line).toContainText('Este navegador no lee texto en fotos')
  await expect(line.getByLabel('Importe')).toHaveValue('')
  await line.getByLabel('Importe').fill('12.50')
  await page.getByRole('button', { name: 'Registrar 1 movimiento' }).click()
  await expect(page.getByText('1 movimiento registrado')).toBeVisible()

  // El movimiento lleva la foto y origen «foto»; al editar se puede quitar.
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Recibo' }).first().click()
  await openDetails(page)
  await expect(page.getByTestId('receipt-field').getByRole('img')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Quitar la foto al guardar' }).check()
  await expect(page.getByText('La foto se quitará al guardar.')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Cambios guardados').first()).toBeVisible()
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Recibo' }).first().click()
  await openDetails(page)
  await expect(page.getByTestId('receipt-field')).toHaveCount(0)
})
