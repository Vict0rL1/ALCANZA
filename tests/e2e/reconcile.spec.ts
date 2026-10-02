import { expect, test, type Page } from '@playwright/test'
import { available, go, startDemo } from './helpers'

async function compare(page: Page, observed: string) {
  await page.getByLabel(/Saldo que ves|Deuda que muestra/).fill(observed)
  await page.getByRole('button', { name: 'Comparar' }).click()
  await expect(page.getByTestId('reconcile-result')).toBeVisible()
}

/** Lee el saldo calculado por la app ("$1,234.56" → "1234.56"). */
async function computedText(page: Page) {
  const value = await page.getByTestId('reconcile-result').locator('.calc-row', { hasText: 'Saldo según la app' }).locator('.calc-row__value').textContent()
  return (value ?? '').replace(/[^\d.-]/g, '')
}

async function netSpending(page: Page) {
  await go(page, '/movimientos')
  return page.locator('.month-summary .stat', { hasText: 'Gasto neto' }).locator('.stat__value').textContent()
}

test('conciliación: coincidencia exacta, diferencia con ajuste explícito y cambios retroactivos', async ({ page }) => {
  await startDemo(page)
  const verification = page.getByTestId('verification')
  await expect(verification).toContainText('Último movimiento registrado:')
  await expect(verification).toContainText('2 cuentas sin verificar con tu banco')
  const spendingBefore = await netSpending(page)

  await go(page, '/')
  await page.getByRole('link', { name: 'Verificar saldo' }).click()
  await expect(page.getByRole('heading', { name: 'Verificar saldo' })).toBeVisible()
  await expect(page.getByText('¿Qué saldo usar?')).toBeVisible()

  // Coincidencia exacta: se guarda sin crear nada.
  await compare(page, '0')
  const computed = await computedText(page)
  await compare(page, computed)
  await expect(page.getByText('Coinciden', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Guardar verificación' }).click()
  await expect(page.getByText('Saldo verificado')).toBeVisible()
  await expect(page.locator('.item', { hasText: 'Coincidía' })).toBeVisible()
  await expect(await available(page)).toHaveText('$136.78')
  await expect(page.getByTestId('verification')).toContainText('1 cuenta sin verificar con tu banco')

  // Diferencia: el banco muestra 5.00 menos. Se revisan cercanos y se crea un ajuste confirmado.
  await go(page, '/conciliar')
  await compare(page, (Number(computed) - 5).toFixed(2))
  await expect(page.getByText('Hay una diferencia de $5.00')).toBeVisible()
  await expect(page.getByText('Tu banco muestra $5.00 menos que la app')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Movimientos cercanos (±7 días)' })).toBeVisible()
  await page.getByRole('button', { name: 'Crear ajuste' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Crear un ajuste de $5.00?' })
  await dialog.getByRole('button', { name: 'Crear ajuste' }).click()
  await expect(dialog.getByText('Escribe el motivo del ajuste.')).toBeVisible()
  await dialog.getByLabel('Motivo del ajuste').fill('Comisión bancaria')
  await dialog.getByRole('button', { name: 'Crear ajuste' }).click()
  await expect(page.getByText('Ajuste creado y saldo verificado')).toBeVisible()
  await expect(page.locator('.item', { hasText: 'Ajustado' })).toContainText('Motivo: Comisión bancaria')

  // El ajuste corrige el saldo pero no es un gasto: el gasto neto del mes no cambia.
  await expect(await available(page)).toHaveText('$131.78')
  expect(await netSpending(page)).toBe(spendingBefore)
  await expect(page.locator('a.item', { hasText: 'Comisión bancaria' })).toContainText('Ajuste de conciliación')

  // Cambio retroactivo en el periodo conciliado: queda pendiente de revisión.
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('café')
  await page.locator('a.item', { hasText: '$4.25' }).filter({ hasText: 'Café' }).first().click()
  await page.getByLabel('Importe').fill('5.25')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await go(page, '/')
  await expect(page.getByTestId('verification')).toContainText('1 verificación necesita revisión')
  await go(page, '/conciliar')
  await expect(page.getByText('Pendiente de revisión: cambiaron movimientos de ese periodo').first()).toBeVisible()
})

test('conciliación de tarjeta: se compara la deuda (saldo negativo), nunca el crédito disponible', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  await page.getByRole('button', { name: 'Agregar cuenta' }).click()
  const accountDialog = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await accountDialog.getByLabel('Nombre').fill('Visa')
  await accountDialog.getByLabel('Tipo de cuenta').selectOption('credit')
  await accountDialog.getByLabel('Deuda actual de la tarjeta').fill('300')
  await accountDialog.getByLabel('Límite de crédito (opcional)').fill('1000')
  await accountDialog.getByLabel('Contar esta cuenta para lo que puedo gastar').uncheck()
  await accountDialog.getByRole('button', { name: 'Guardar' }).click()

  await go(page, '/conciliar')
  await page.getByLabel('Cuenta').selectOption({ label: 'Visa' })
  await expect(page.getByText(/nunca el crédito disponible/).first()).toBeVisible()
  await compare(page, '310')
  await expect(page.getByTestId('reconcile-result')).toContainText('Debes $310.00')
  await expect(page.getByTestId('reconcile-result')).toContainText('Debes $300.00')
  // Tu banco muestra «menos dinero» porque debes más.
  await expect(page.getByText('Tu banco muestra $10.00 menos que la app')).toBeVisible()
  await expect(page.getByText('Hay una diferencia de $10.00')).toBeVisible()
  await page.getByRole('button', { name: 'Crear ajuste' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Crear un ajuste de $10.00?' })
  await dialog.getByLabel('Motivo del ajuste').fill('Intereses del mes')
  await dialog.getByRole('button', { name: 'Crear ajuste' }).click()
  await expect(page.getByText('Ajuste creado y saldo verificado')).toBeVisible()
  await go(page, '/ajustes')
  await expect(page.locator('.item', { hasText: 'Visa' }).locator('.item__amount').first()).toHaveText('Debes $310.00')
  // La tarjeta no está en el presupuesto: el disponible no cambia.
  await expect(await available(page)).toHaveText('$136.78')
})
