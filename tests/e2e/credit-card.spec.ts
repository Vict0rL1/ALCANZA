import { expect, test } from '@playwright/test'
import { available, go, startDemo } from './helpers'

test('tarjeta de crédito: la deuda descuenta y el pago no cuenta dos veces', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  await page.getByRole('button', { name: 'Agregar cuenta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await dialog.getByLabel('Nombre').fill('Visa')
  await dialog.getByLabel('Tipo de cuenta').selectOption('credit')
  await dialog.getByLabel('Deuda actual de la tarjeta').fill('100')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Debes $100.00')).toBeVisible()
  await expect(await available(page)).toHaveText('$36.78')

  // Compra con tarjeta: gasto de la tarjeta.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('20')
  await page.getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Visa' })
  await expect(page.getByText('Compra con tarjeta: aumenta tu deuda', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(await available(page)).toHaveText('$16.78')

  // Pago de la tarjeta: transferencia banco → tarjeta, el disponible no cambia.
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Transferencia' }).check()
  await page.getByLabel('Importe').fill('120')
  await page.getByLabel('Hacia la cuenta').selectOption({ label: 'Visa' })
  await expect(page.getByText('Pago de tarjeta: reduce tu deuda', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(await available(page)).toHaveText('$16.78')
  await go(page, '/ajustes')
  await expect(page.getByText('Debes $0.00')).toBeVisible()
})
