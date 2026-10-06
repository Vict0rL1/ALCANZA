import { expect, test } from '@playwright/test'
import { available, go, openDetails, startDemo } from './helpers'

test('plan ante un faltante: diagnóstico, simulación sin cambios y aplicar con confirmación y deshacer', async ({ page }) => {
  await startDemo(page)
  // Compra PREVISTA grande dentro de 2 días: provoca el faltante.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('2500')
  await openDetails(page)
  await page.getByRole('radio', { name: 'Previsto' }).check()
  await page.getByLabel('Fecha').fill('2026-09-30')
  await page.getByLabel('Nota (opcional)').fill('Portátil')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  // Un previsto antes del próximo ingreso se reserva: baja el disponible (no el saldo).
  await expect(await available(page)).toHaveText('-$2,363.22')

  await go(page, '/alcanza/escenarios')
  await page.getByRole('link', { name: 'Ver plan ante el faltante' }).click()
  await expect(page.getByRole('heading', { name: 'Plan ante un faltante' })).toBeVisible()
  await expect(page.getByTestId('shortfall-first')).toContainText('El saldo baja de cero el')
  await expect(page.getByText('Pago programado (no se cambia)').first()).toBeVisible()

  // Sin el gasto diario estimado, el único faltante es el de la compra.
  await page.getByRole('checkbox', { name: /gasto diario/i }).uncheck()
  const reduce = page.getByTestId('lever-reducePlanned')
  await reduce.getByRole('checkbox').check()
  await expect(page.getByTestId('shortfall-combined')).toBeVisible()
  await page.getByLabel('Nuevo importe').fill('10')
  await expect(page.getByTestId('shortfall-combined')).toContainText('Ya no baja de cero')
  await page.getByRole('button', { name: /Aplicar 1 cambio a mi planificación/ }).click()
  const dialog = page.getByRole('dialog', { name: '¿Aplicar estos cambios a tu planificación?' })
  await expect(dialog).toContainText('Reducir «Portátil» de $2,500.00 a $10.00')
  await dialog.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByText('1 cambio aplicado a tu planificación')).toBeVisible()
  await expect(page.getByText('No hay faltante en los próximos 30 días')).toBeVisible()
  await expect(await available(page)).toHaveText('$126.78')

  // Deshacer desde el historial: la compra vuelve a 2,500.
  await go(page, '/ajustes/historial')
  const entry = page.locator('.history-entry').first()
  await expect(entry).toContainText('Desde un plan')
  await expect(entry).toContainText('Importe: $2,500.00 → $10.00')
  await entry.getByRole('button', { name: 'Revertir' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revertir' }).click()
  await expect(page.getByText('Cambio revertido')).toBeVisible()
  await expect(await available(page)).toHaveText('-$2,363.22')
  await go(page, '/alcanza/faltante')
  await expect(page.getByTestId('shortfall-first')).toBeVisible()
})
