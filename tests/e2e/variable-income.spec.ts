import { expect, test } from '@playwright/test'
import { available, go, startDemo } from './helpers'

const SALARY = 'Sueldo (trabajo de medio tiempo)'

test('ingresos variables: escenarios en la proyección sin tocar el disponible ni los movimientos', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/proyeccion')
  const scenario = page.getByRole('group', { name: 'Escenario de ingresos variables' })
  await expect(scenario.getByRole('radio', { name: 'Mínimo' })).toBeChecked()
  // Dos cobros en 30 días (4-oct y 18-oct): 2 × 520, 2 × 612.40 y 2 × 700, más un reembolso fijo previsto de 18.00.
  const table = page.getByTestId('scenario-table')
  await expect(table.locator('tr', { hasText: 'Mínimo' })).toContainText('$1,058.00')
  await expect(table.locator('tr', { hasText: 'Esperado' })).toContainText('$1,242.80')
  await expect(table.locator('tr', { hasText: 'Extra' })).toContainText('$1,418.00')
  await expect(page.getByText(/Ingresos variables con el escenario «Mínimo»/)).toBeVisible()

  await scenario.getByRole('radio', { name: 'Extra' }).check()
  await expect(page.getByText(/Ingresos variables con el escenario «Extra»/)).toBeVisible()
  // El dinero disponible nunca suma ingresos futuros, sea cual sea el escenario.
  await expect(await available(page)).toHaveText('$136.78')

  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(page.locator('.item', { hasText: SALARY }).first()).toContainText('Entre $520.00 y $700.00')
})

test('ingresos variables: validación del rango y cobro parcial con resto pendiente', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await page.getByRole('link', { name: new RegExp(`Editar.*${SALARY.replace(/[()]/g, '\\$&')}`) }).first().click()
  await expect(page.getByRole('heading', { name: 'Editar programación' })).toBeVisible()
  await expect(page.getByLabel('Ingreso variable: indicar mínimo y extra')).toBeChecked()
  await page.getByLabel('Mínimo estimado').fill('700')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Debe cumplirse: mínimo ≤ esperado ≤ extra.')).toBeVisible()
  await page.getByLabel('Mínimo estimado').fill('500')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Programación guardada')).toBeVisible()

  // Llega solo una parte: se espera el resto.
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await page.getByRole('button', { name: new RegExp(`Marcar recibido.*${SALARY.replace(/[()]/g, '\\$&')}`) }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Marcar como recibido' })
  await dialog.getByLabel('Importe real').fill('300')
  await dialog.getByRole('radio', { name: 'Sí, espero el resto ($312.40)' }).check()
  await dialog.getByRole('button', { name: 'Confirmar ingreso' }).click()
  await expect(page.getByText(`«${SALARY}» marcado como recibido`)).toBeVisible()
  const item = page.locator('.item', { hasText: SALARY }).filter({ hasText: 'faltan' }).first()
  await expect(item).toContainText('Recibido $300.00; faltan $312.40')
  // Lo recibido ya está en el saldo; lo que falta no se suma.
  await expect(await available(page)).toHaveText('$436.78')

  // Se da la previsión por terminada: no queda nada pendiente de esa fecha.
  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await page.getByRole('button', { name: /Dar por terminado/ }).first().click()
  await expect(page.getByText(`Previsión de «${SALARY}» dada por terminada`)).toBeVisible()
  await expect(page.locator('.item', { hasText: SALARY }).filter({ hasText: 'faltan' })).toHaveCount(0)
})

test('ingreso registrado a mano: se vincula con su previsión y no se duplica', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Ingreso' }).check()
  await page.getByLabel('Importe').fill('612.40')
  const link = page.getByLabel('Vincular con un ingreso previsto')
  await link.selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()

  // La ocurrencia quedó recibida: ya no se ofrece para vincular otra vez.
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Ingreso' }).check()
  await expect(page.getByLabel('Vincular con un ingreso previsto')).toHaveCount(0)
  await go(page, '/movimientos')
  await expect(page.getByText('Del calendario').first()).toBeVisible()
})
