import { expect, test } from '@playwright/test'
import { go, startDemo, movementCount, storedData } from './helpers'

test('asistente: texto → vista previa editable → registro todo o nada; nada se guarda antes de confirmar', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/')
  // FAB → hoja → asistente.
  await page.getByRole('button', { name: 'Agregar movimiento' }).click()
  const sheet = page.getByRole('dialog', { name: '¿Qué quieres registrar?' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('link', { name: /Escribir o dictar/ }).click()
  await expect(page.getByRole('heading', { name: 'Asistente de registro' })).toBeVisible()

  const stored = await storedData(page)
  await page.getByLabel('Texto').fill('café 45 en Starbucks, uber 80 ayer y cobré 500 de freelance')
  await page.getByRole('button', { name: 'Analizar' }).click()
  const preview = page.getByTestId('assistant-preview')
  await expect(preview.locator('.assistant__line')).toHaveCount(3)
  // Primera línea: gasto, 45, restaurantes, hoy. Tercera: ingreso.
  const first = preview.locator('.assistant__line').nth(0)
  await expect(first.getByLabel('Importe')).toHaveValue('45.00')
  await expect(first.getByLabel('Categoría')).toHaveValue('dining')
  await expect(first.getByRole('radio', { name: 'Gasto' })).toBeChecked()
  const second = preview.locator('.assistant__line').nth(1)
  await expect(second.getByLabel('Fecha')).toHaveValue('2026-09-27')
  const third = preview.locator('.assistant__line').nth(2)
  await expect(third.getByRole('radio', { name: 'Ingreso' })).toBeChecked()
  await expect(third.getByLabel('Importe')).toHaveValue('500.00')
  // Nada registrado todavía: lo guardado tiene los mismos movimientos (solo cambió el contador de usos).
  const txCount = (json: string | null) => (JSON.parse(json ?? '{}') as { transactions?: unknown[] }).transactions?.length
  expect(txCount(await storedData(page))).toBe(txCount(stored))
  // Editar una línea y quitar otra.
  await second.getByLabel('Importe').fill('85')
  await third.getByRole('button', { name: 'Quitar esta línea' }).click()
  await expect(preview.locator('.assistant__line')).toHaveCount(2)
  await page.getByRole('button', { name: 'Registrar 2 movimientos' }).click()
  await expect(page.getByText('2 movimientos registrados')).toBeVisible()
  expect(await movementCount(page)).toBe(before + 2)
  await go(page, '/movimientos')
  await expect(page.locator('.item', { hasText: 'café' }).first()).toContainText('$45.00')
  await expect(page.locator('.item', { hasText: 'uber' }).first()).toContainText('$85.00')
})

test('asistente: sin importe no inventa nada; un importe inválido bloquea todo el registro', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/asistente')
  await page.getByLabel('Texto').fill('café con Ana')
  await page.getByRole('button', { name: 'Analizar' }).click()
  const line = page.getByTestId('assistant-preview').locator('.assistant__line').first()
  await expect(line.getByLabel('Importe')).toHaveValue('')
  await expect(line.getByText('Sin importe: escríbelo.')).toBeVisible()
  await page.getByRole('button', { name: 'Registrar 1 movimiento' }).click()
  await expect(line.getByText('Escribe un importe.')).toBeVisible()
  expect(await movementCount(page)).toBe(before)
})
