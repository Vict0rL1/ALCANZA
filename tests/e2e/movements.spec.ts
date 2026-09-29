import { expect, test } from '@playwright/test'
import { available, go, movementCount, startDemo } from './helpers'

test('agregar, buscar, editar y eliminar con deshacer', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)

  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('12,50')
  await page.getByLabel('Nota (opcional)').fill('Café de prueba')
  // Doble clic: no debe crear dos movimientos (mismo id = misma operación).
  await page.getByRole('button', { name: 'Guardar' }).dblclick()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  expect(await movementCount(page)).toBe(before + 1)
  await expect(await available(page)).toHaveText('$124.28')

  // Búsqueda
  await go(page, '/movimientos')
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('café de prueba')
  await expect(page.locator('.summary-line')).toContainText('1 movimiento')

  // Edición
  await page.getByRole('link', { name: /Café de prueba/ }).click()
  await expect(page.getByRole('heading', { name: 'Editar movimiento' })).toBeVisible()
  await page.getByLabel('Importe').fill('10')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()
  await expect(await available(page)).toHaveText('$126.78')

  // Eliminar y deshacer
  await go(page, '/movimientos')
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('café de prueba')
  await page.getByRole('link', { name: /Café de prueba/ }).click()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText('Movimiento eliminado')).toBeVisible()
  await expect(page.locator('.summary-line')).toContainText(`${before} movimientos`)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.locator('.summary-line')).toContainText(`${before + 1} movimientos`)
  await expect(await available(page)).toHaveText('$126.78')
})

test('previstos vs realizados: un realizado no puede tener fecha futura', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('30')
  await page.getByLabel('Fecha').fill('2026-10-05')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Un movimiento realizado no puede tener fecha futura')).toBeVisible()
  // Como previsto sí se guarda y no cambia el saldo. Vence después del ingreso (4-oct), así que no se reserva aún.
  await page.getByRole('radio', { name: 'Previsto' }).check()
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Previstos' })).toBeVisible()
  await expect(await available(page)).toHaveText('$136.78')
})

test('transferencias: entre cuentas del presupuesto no cambian el disponible; hacia ahorro sí', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Transferencia' }).check()
  await page.getByLabel('Importe').fill('20')
  await page.getByLabel('Hacia la cuenta').selectOption({ label: 'Efectivo' })
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await expect(await available(page)).toHaveText('$136.78')

  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Transferencia' }).check()
  await page.getByLabel('Importe').fill('20')
  await page.getByLabel('Hacia la cuenta').selectOption({ label: 'Ahorros' })
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await expect(await available(page)).toHaveText('$116.78')
})

test('devolución parcial: no puede superar lo que queda por devolver', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Devolución' }).check()
  await page.getByLabel('Importe').fill('40')
  // Audífonos 49.99 con 15.00 ya devueltos: quedan 34.99.
  const original = page.getByLabel('Gasto original (opcional)')
  const value = await original.locator('option', { hasText: 'Audífonos' }).getAttribute('value')
  await original.selectOption(value!)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('La devolución supera lo que queda por devolver de ese gasto ($34.99)')).toBeVisible()
  await page.getByLabel('Importe').fill('34.99')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await expect(await available(page)).toHaveText('$171.77')
})

test('resumen del mes: gasto por categoría ordenado y navegación entre meses', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos')
  const summary = page.locator('.month-summary')
  await expect(summary.getByRole('heading', { name: /Resumen de septiembre de 2026/i })).toBeVisible()
  // La renta (650.00) es el mayor gasto; el supermercado suma 243.90 en septiembre.
  await expect(summary.locator('.bars__row').first()).toContainText('Vivienda')
  await expect(summary.locator('.bars__row').first()).toContainText('$650.00')
  await expect(summary.locator('.bars__row', { hasText: 'Supermercado' })).toContainText('$243.90')
  await expect(summary.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
  await summary.getByRole('button', { name: 'Mes anterior' }).click()
  await expect(summary.getByRole('heading', { name: /agosto de 2026/i })).toBeVisible()
  await expect(summary.getByText('No hay gastos realizados en este mes.')).toBeVisible()
})

test('límite mensual por categoría: progreso, aviso en Inicio y quitar con deshacer', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos')
  const summary = page.locator('.month-summary')
  await summary.getByRole('button', { name: 'Agregar límite' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo límite mensual' })
  await dialog.getByLabel('Categoría').selectOption({ label: 'Comida fuera y café' })
  await dialog.getByLabel('Límite por mes').fill('30')
  await dialog.getByRole('button', { name: 'Guardar' }).click()
  // En septiembre la demo gasta 37.05 en comida fuera.
  await expect(summary.getByText('$37.05 de $30.00')).toBeVisible()
  await expect(summary.getByText('Pasado por $7.05')).toBeVisible()

  await go(page, '/')
  await expect(page.getByText('Te pasaste del límite en 1 categoría')).toBeVisible()
  await expect(page.getByTestId('available')).toHaveText('$136.78') // informativo: no cambia el disponible

  await go(page, '/movimientos')
  await summary.getByRole('button', { name: /Quitar.*Comida fuera/ }).click()
  await expect(summary.getByText('Sin límites.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(summary.getByText('$37.05 de $30.00')).toBeVisible()
})
