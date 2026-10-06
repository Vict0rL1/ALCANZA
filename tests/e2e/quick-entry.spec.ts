import { expect, test } from '@playwright/test'
import { available, go, movementCount, openDetails, startDemo } from './helpers'

test('registro rápido: borrador persistente, guardar y agregar otro, duplicar y atajo', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)

  // Un movimiento a medio escribir se conserva como borrador (no cuenta en nada).
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('7.50')
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Borrador de prueba')
  await page.waitForTimeout(500)
  await go(page, '/')
  await expect(page.getByTestId('available')).toHaveText('$136.78')
  await page.reload()
  await go(page, '/movimientos/nuevo')
  await expect(page.getByText('Tienes un movimiento sin guardar')).toBeVisible()
  await page.getByRole('button', { name: 'Recuperar borrador' }).click()
  await expect(page.getByLabel('Importe')).toHaveValue('7.50')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$129.28')
  await go(page, '/movimientos/nuevo')
  await expect(page.getByText('Tienes un movimiento sin guardar')).toHaveCount(0)

  // Guardar y agregar otro: el formulario vuelve vacío, con la misma cuenta.
  await page.getByLabel('Importe').fill('1')
  await page.getByRole('button', { name: 'Guardar y agregar otro' }).click()
  await expect(page.getByText('Guardado. Registra el siguiente.')).toBeVisible()
  await expect(page.getByLabel('Importe')).toHaveValue('')
  await expect(page.getByText('La última cuenta que usaste para este tipo')).toBeVisible()
  await page.getByLabel('Importe').fill('2')
  // Ctrl+Intro guarda.
  await page.getByLabel('Importe').press('Control+Enter')
  await expect(page.getByRole('heading', { name: 'Nuevo movimiento' })).toHaveCount(0)
  expect(await movementCount(page)).toBe(before + 3)

  // Duplicar: crea un borrador nuevo; el original no cambia.
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('Borrador de prueba')
  await page.locator('a.item', { hasText: 'Borrador de prueba' }).first().click()
  await page.getByRole('link', { name: 'Duplicar como borrador' }).click()
  await expect(page.getByText('Copia de «Borrador de prueba»')).toBeVisible()
  await expect(page.getByLabel('Importe')).toHaveValue('7.50')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  expect(await movementCount(page)).toBe(before + 4)
  await expect(await available(page)).toHaveText('$118.78')

  // Atajo N: abre un movimiento nuevo (no actúa mientras se escribe).
  await go(page, '/')
  await page.keyboard.press('n')
  await expect(page.getByRole('heading', { name: 'Nuevo movimiento' })).toBeVisible()
})

test('plantilla de división: porcentajes con redondeo explícito, vista previa y nada se registra solo', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/movimientos/plantillas')
  await page.getByRole('link', { name: 'Nueva plantilla de división' }).click()
  await page.getByLabel('Nombre').fill('Súper y casa')
  await page.getByLabel('Categoría (línea 1)').selectOption({ label: 'Supermercado' })
  await page.getByLabel('Porcentaje (línea 1)').fill('70')
  await page.getByRole('button', { name: 'Añadir línea' }).click()
  await page.getByLabel('Categoría (línea 2)').selectOption({ label: 'Vivienda' })
  await page.getByLabel('Porcentaje (línea 2)').fill('30')
  // Vista previa con un total de ejemplo: 49.99 → 35.00 (incluye 0.01 de redondeo) + 14.99.
  await page.getByLabel('Probar con un total de').fill('49.99')
  const example = page.getByTestId('template-example')
  await expect(example).toContainText('Supermercado: $35.00 (incluye $0.01 de redondeo)')
  await expect(example).toContainText('Vivienda: $14.99')
  await page.getByRole('button', { name: 'Guardar plantilla' }).click()
  await expect(page.getByText('Plantilla «Súper y casa» guardada')).toBeVisible()
  // Crear la plantilla no registra nada.
  expect(await movementCount(page)).toBe(before)

  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('49.99')
  await page.getByLabel('Dividir con una plantilla').selectOption({ label: 'Súper y casa' })
  await expect(page.getByText('Plantilla «Súper y casa» aplicada al formulario (aún sin guardar)')).toBeVisible()
  await expect(page.getByLabel('Importe de la línea 1')).toHaveValue('35.00')
  await expect(page.getByLabel('Importe de la línea 2')).toHaveValue('14.99')
  expect(await page.evaluate(() => document.querySelectorAll('.split-line').length)).toBe(2)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  // Un solo movimiento por el total: la división no multiplica el gasto.
  expect(await movementCount(page)).toBe(before + 1)
  await expect(await available(page)).toHaveText('$86.79')
})

test('un borrador sin recuperar no se pierde al registrar otro movimiento desde un acceso con datos', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('33.33')
  await page.waitForTimeout(500)
  // Otro movimiento desde un acceso rápido (formulario con datos de partida): se guarda aparte.
  await go(page, '/movimientos/nuevo?kind=income&returnTo=/')
  await page.getByLabel('Importe').fill('10')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$146.78')
  // El borrador anterior sigue ofreciéndose.
  await go(page, '/movimientos/nuevo')
  await expect(page.getByText('Tienes un movimiento sin guardar')).toBeVisible()
  await page.getByRole('button', { name: 'Recuperar borrador' }).click()
  await expect(page.getByLabel('Importe')).toHaveValue('33.33')
})
