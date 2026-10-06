import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { available, go, movementCount, startDemo, openDetails } from './helpers'

// Fechas mes/día/año (el 27 obliga a reconocerlo). El saldo de referencia de la demo es del 26-sep.
const CSV = [
  'Date,Description,Amount',
  '09/27/2026,"Grocery store, downtown",-12.00',
  '09/28/2026,Coffee shop,-4.25',
  '09/20/2026,Old purchase,-30.00',
  '09/15/2026,Broken row,oops',
].join('\r\n')

async function loadFile(page: Page, text = CSV) {
  await go(page, '/movimientos/importar')
  await page.getByTestId('bank-file').setInputFiles({ name: 'banco.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })
  await expect(page.getByRole('heading', { name: '3. Revisa y confirma' })).toBeVisible()
}

test('importar CSV: vista previa, posibles duplicados, importar y no duplicar al repetir', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/movimientos')
  await page.getByRole('link', { name: 'Importar CSV' }).click()
  await expect(page.getByRole('heading', { name: 'Importar movimientos del banco' })).toBeVisible()

  await loadFile(page)
  await expect(page.getByLabel('Formato de fecha')).toHaveValue('mdy')
  await expect(page.getByText('2 nuevos')).toBeVisible()
  await expect(page.getByText('1 posible duplicado')).toBeVisible()
  await expect(page.getByText('1 con error')).toBeVisible()
  // El café ya estaba registrado a mano: queda desmarcado.
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /Coffee shop/ })).not.toBeChecked()
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /Grocery store, downtown/ })).toBeChecked()
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /Broken row/ })).toBeDisabled()
  await expect(page.getByText('no cambia el saldo')).toBeVisible()

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

  await page.getByRole('button', { name: 'Importar 2 movimientos' }).click()
  await expect(page.getByText('2 movimientos importados')).toBeVisible()
  expect(await movementCount(page)).toBe(before + 2)
  // Solo cuenta la compra posterior al saldo de referencia (−12.00); la antigua ya estaba incluida.
  await expect(await available(page)).toHaveText('$124.78')

  // El mismo archivo otra vez: nada nuevo.
  await loadFile(page)
  await expect(page.getByText('2 ya importados')).toBeVisible()
  await expect(page.getByText('0 nuevos')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Importar 0 movimientos' })).toBeDisabled()
})

test('importar CSV: deshacer quita lo importado; cargos y abonos separados', async ({ page }) => {
  await startDemo(page)
  await loadFile(page, ['Fecha;Concepto;Cargo;Abono', '27/09/2026;Farmacia;8,50;', '27/09/2026;Reembolso amigo;;20,00'].join('\n'))
  await expect(page.getByLabel('Columna de cargos (gastos)')).toHaveValue('2')
  await expect(page.getByText('Seleccionados: 2 · efecto total +$11.50')).toBeVisible()
  await page.getByRole('button', { name: 'Importar 2 movimientos' }).click()
  await expect(page.getByText('2 movimientos importados')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(await available(page)).toHaveText('$136.78')
})

test('importar CSV: un archivo que no es CSV se rechaza sin cambiar nada', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/importar')
  await page.getByTestId('bank-file').setInputFiles({ name: 'estado.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') })
  await expect(page.getByText('No se encontraron columnas en el archivo.')).toBeVisible()
  await expect(await available(page)).toHaveText('$136.78')
})
