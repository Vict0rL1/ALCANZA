import { expect, test } from '@playwright/test'
import { openExplain, available, go, startDemo } from './helpers'

test('¿Qué cambió?: desglose exacto desde el inicio del historial y sin inventar lo anterior', async ({ page }) => {
  await startDemo(page)
  await expect(await available(page)).toHaveText('$136.78')

  // Información pendiente y supuestos visibles en «¿Cómo se calculó?».
  await openExplain(page)
  await expect(page.getByTestId('explain-pending')).toBeVisible()
  await expect(page.getByText('Se supone que', { exact: false }).first()).toBeVisible()

  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('12.50')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$124.28')

  await openExplain(page)
  await page.getByTestId('what-changed-link').click()
  await expect(page.getByRole('heading', { name: '¿Qué cambió?' })).toBeVisible()
  // El historial empezó hoy: «inicio de ayer» no se puede reconstruir y se dice.
  await expect(page.getByText('No hay historial para esa fecha')).toBeVisible()
  await page.getByRole('button', { name: 'Comparar desde el inicio del historial' }).click()

  await expect(page.getByTestId('changes-total')).toHaveText('El disponible bajó $12.50.')
  const calc = page.getByTestId('changes-calc')
  await expect(calc).toContainText('$136.78')
  await expect(calc).toContainText('Gastos registrados (1)')
  await expect(calc).toContainText('$124.28')
  await expect(page.getByText('El desglose suma exactamente la diferencia.')).toBeVisible()
  // Cada cambio enlaza con su movimiento.
  await page.locator('.changes-step a').first().click()
  await expect(page.getByRole('heading', { name: 'Editar movimiento' })).toBeVisible()
  await expect(page.getByLabel('Importe')).toHaveValue('12.50')
})
