import { expect, test } from '@playwright/test'
import { go, startDemo, openDetails } from './helpers'

test('reglas de categoría en Ajustes: crear, evitar duplicados, eliminar y deshacer', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes?seccion=reglas')
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Reglas de categoría' }) })
  await expect(section.getByText('«supermercado» → Supermercado')).toBeVisible()

  await section.getByRole('button', { name: 'Nueva regla' }).click()
  let dialog = page.getByRole('dialog', { name: 'Nueva regla de categoría' })
  await dialog.getByLabel('Si la descripción contiene').fill('Uber')
  await dialog.getByLabel('Categoría').selectOption({ label: 'Transporte' })
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(section.getByText('«Uber» → Transporte')).toBeVisible()

  // Mismo texto (sin importar acentos ni mayúsculas) para gastos: no se permite.
  await section.getByRole('button', { name: 'Nueva regla' }).click()
  dialog = page.getByRole('dialog', { name: 'Nueva regla de categoría' })
  await dialog.getByLabel('Si la descripción contiene').fill('CAFE')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dialog.getByText('Ya hay una regla con ese texto para este tipo.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()

  await section.getByRole('button', { name: /^Eliminar ?: Uber$/ }).click()
  await expect(section.getByText('«Uber» → Transporte')).toHaveCount(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(section.getByText('«Uber» → Transporte')).toBeVisible()
})

test('nuevo movimiento: la nota propone la categoría hasta que la eliges a mano', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  const category = page.getByLabel('Categoría')
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Café con Ana')
  await expect(category).toHaveValue('dining')
  await expect(page.getByText('Propuesta por la regla «café». Puedes cambiarla.')).toBeVisible()
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Libros')
  await expect(category).toHaveValue('other_expense')

  await category.selectOption({ label: 'Regalos' })
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Farmacia')
  await expect(category).toHaveValue('gifts')
})

test('importar CSV: las reglas proponen la categoría y se puede crear una regla desde una fila', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/importar')
  const csv = ['Fecha,Descripción,Importe', '2026-09-27,SUPERMERCADO CENTRAL,-20.00', '2026-09-27,Tienda de mascotas,-15.00', '2026-09-27,Tienda de mascotas norte,-5.00'].join('\n')
  await page.getByTestId('bank-file').setInputFiles({ name: 'banco.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })

  await expect(page.getByLabel('Categoría: SUPERMERCADO CENTRAL')).toHaveValue('groceries')
  await expect(page.getByText('regla «supermercado»')).toBeVisible()
  const pets = page.getByLabel('Categoría: Tienda de mascotas', { exact: true })
  await expect(pets).toHaveValue('other_expense')

  await pets.selectOption({ label: 'Regalos' })
  await page.getByRole('button', { name: /^Crear regla ?: Tienda de mascotas$/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva regla de categoría' })
  await expect(dialog.getByLabel('Si la descripción contiene')).toHaveValue('Tienda de mascotas')
  await dialog.getByLabel('Si la descripción contiene').fill('mascotas')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  // La nueva regla se aplica también a la otra fila.
  await expect(page.getByLabel('Categoría: Tienda de mascotas norte')).toHaveValue('gifts')

  await page.getByRole('button', { name: 'Importar 3 movimientos' }).click()
  await expect(page.getByText('3 movimientos importados')).toBeVisible()
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('mascotas')
  await expect(page.locator('.item', { hasText: 'Tienda de mascotas norte' })).toContainText('Regalos')
})
