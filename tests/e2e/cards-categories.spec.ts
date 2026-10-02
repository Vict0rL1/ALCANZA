import { expect, test } from '@playwright/test'
import { go, startDemo } from './helpers'

test('tarjeta con límite, tasa y fechas: resumen y recordatorio de pago', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  await page.getByRole('button', { name: 'Agregar cuenta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await dialog.getByLabel('Nombre').fill('Visa estudiante')
  await dialog.getByLabel('Tipo de cuenta').selectOption('credit')
  await dialog.getByLabel('Deuda actual de la tarjeta').fill('300')
  await dialog.getByLabel('Límite de crédito (opcional)').fill('1000')
  await dialog.getByLabel('Tasa de interés anual % (opcional)').fill('150')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(dialog.getByText('Escribe un porcentaje entre 0 y 100')).toBeVisible()
  await dialog.getByLabel('Tasa de interés anual % (opcional)').fill('19,99')
  // 28-sep + 5 días = 3-oct: dentro de la ventana del recordatorio.
  await dialog.getByLabel('Día de pago (opcional)').selectOption('3')
  await dialog.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Usado $300.00 de $1,000.00 (30%)')).toBeVisible()
  await expect(page.getByText('Crédito disponible: $700.00')).toBeVisible()
  await expect(page.getByText('Pago mínimo estimado: $10.00')).toBeVisible() // 3 % de 300 = 9 → mínimo 10
  await expect(page.getByText('aprox. $5.00')).toBeVisible() // 300 × 19.99 % / 12 = 4.9975 → 5.00

  await go(page, '/')
  await expect(page.getByText('Pago de tarjeta')).toBeVisible()
  await expect(page.getByText(/Visa estudiante: vence el .* mínimo estimado \$10\.00/)).toBeVisible()
  // La deuda de una tarjeta del presupuesto se descuenta: 136.78 − 300.
  await expect(page.getByTestId('available')).toHaveText('-$163.22')
})

test('categorías personalizadas: crear, usar, filtrar y archivar', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva categoría' })
  await dialog.getByLabel('Nombre').fill('Mascotas')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Categoría guardada')).toBeVisible()

  // Nombre duplicado
  await page.getByRole('button', { name: 'Nueva categoría' }).click()
  await page.getByRole('dialog', { name: 'Nueva categoría' }).getByLabel('Nombre').fill('mascotas')
  await page.getByRole('dialog', { name: 'Nueva categoría' }).getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Ya existe una categoría con ese nombre.')).toBeVisible()
  await page.getByRole('dialog', { name: 'Nueva categoría' }).getByRole('button', { name: 'Cancelar' }).click()

  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('25')
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Mascotas' })
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Mascotas' })
  await expect(page.locator('.summary-line')).toContainText('1 movimiento')

  // Archivar: desaparece de formularios pero el movimiento la conserva.
  await go(page, '/ajustes')
  await page.getByRole('button', { name: /Archivar.*Mascotas/ }).click()
  await expect(page.getByText('Categoría archivada')).toBeVisible()
  await go(page, '/movimientos/nuevo')
  await expect(page.getByLabel('Categoría', { exact: true }).locator('option', { hasText: 'Mascotas' })).toHaveCount(0)
  await go(page, '/movimientos')
  await expect(page.locator('.item__meta', { hasText: 'Mascotas' }).first()).toBeVisible()
})
