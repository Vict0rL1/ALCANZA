import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { available, go, movementCount, startDemo, openDetails } from './helpers'

async function newExpense(page: Page, amount: string, note: string) {
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill(amount)
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill(note)
}

test('compra dividida: líneas exactas, resto explícito, saldo una vez, filtros y quitar la división', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await newExpense(page, '120', 'Walmart')
  await page.getByRole('button', { name: 'Dividir entre categorías' }).click()
  const editor = page.getByTestId('split-editor')
  await editor.getByLabel('Categoría de la línea 1').selectOption({ label: 'Supermercado' })
  await editor.getByLabel('Importe de la línea 1').fill('75')
  await editor.getByLabel('Categoría de la línea 2').selectOption({ label: 'Vivienda y alquiler' })
  await editor.getByLabel('Importe de la línea 2').fill('30')
  await editor.getByRole('button', { name: 'Añadir línea' }).click()
  await editor.getByLabel('Categoría de la línea 3').selectOption({ label: 'Ropa y compras' })
  await editor.getByLabel('Importe de la línea 3').fill('14.99')
  await expect(page.getByTestId('split-status')).toHaveText(/Falta asignar \$0\.01/)
  // Un centavo de diferencia bloquea el guardado.
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo movimiento' })).toBeVisible()
  await expect(editor.getByRole('alert')).toContainText('exactamente el total')
  await editor.getByRole('button', { name: /Asignar el resto aquí.*Línea 3/ }).click()
  await expect(editor.getByLabel('Importe de la línea 3')).toHaveValue('15.00')
  await expect(page.getByTestId('split-status')).toHaveText(/Cuadra/)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()

  // Un único movimiento: el saldo baja 120 una sola vez.
  expect(await movementCount(page)).toBe(before + 1)
  await expect(await available(page)).toHaveText('$16.78')
  await go(page, '/movimientos')
  await expect(page.locator('a.item', { hasText: 'Walmart' })).toContainText('Dividida en 3 categorías')
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Vivienda y alquiler' })
  await expect(page.locator('a.item', { hasText: 'Walmart' })).toBeVisible()

  // Cambiar el total pide ajustar; quitar la división conserva el movimiento.
  await page.locator('a.item', { hasText: 'Walmart' }).click()
  await page.getByLabel('Importe', { exact: true }).fill('130')
  await expect(page.getByTestId('split-status')).toHaveText(/Falta asignar \$10\.00/)
  await page.getByRole('button', { name: 'Quitar la división' }).click()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  expect(await movementCount(page)).toBe(before + 1)
  await expect(await available(page)).toHaveText('$6.78')
})

test('bandeja de pendientes: acceso en Inicio, resolver, posponer y «son distintos»', async ({ page }) => {
  await startDemo(page)
  await expect(page.getByTestId('inbox-link')).toContainText(/pendientes? por revisar/)
  // Dos cafés iguales el mismo día: posible duplicado (solo una sugerencia).
  for (let i = 0; i < 2; i++) {
    await newExpense(page, '9.99', 'Cafetería Luna')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  }
  const count = await movementCount(page)
  await go(page, '/')
  await page.getByTestId('inbox-link').click()
  await expect(page.getByRole('heading', { name: 'Pendientes', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Saldos por verificar/ })).toBeVisible()
  const dup = page.locator('article', { hasText: '¿Duplicado? «Cafetería Luna»' })
  await expect(dup).toBeVisible()
  await dup.getByRole('button', { name: 'Son distintos' }).click()
  await expect(dup).toHaveCount(0)
  await expect(page.getByText('Descartado (1)')).toBeVisible()
  expect(await movementCount(page)).toBe(count) // nada se eliminó

  // Pago vencido: lenguaje neutral y se resuelve al registrar el pago.
  await go(page, '/pendientes')
  const bill = page.locator('article', { hasText: '«Recibo de luz»' })
  await expect(bill).toContainText('Puede que ya lo hayas pagado')
  await bill.getByRole('button', { name: /Posponer 7 días/ }).click()
  await expect(bill).toHaveCount(0)
  await page.getByText(/Pospuesto \(1\)/).click()
  await page.getByRole('button', { name: 'Mostrar ahora' }).click()
  await page.locator('article', { hasText: '«Recibo de luz»' }).getByRole('button', { name: 'Registrar pago' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.locator('article', { hasText: '«Recibo de luz»' })).toHaveCount(0)
})

test('distribuir un ingreso recibido: vista previa, saldo intacto, pago ya reservado sin doble resta y deshacer', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Ingreso' }).check()
  await page.getByLabel('Importe', { exact: true }).fill('1500')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$1,636.78')
  const count = await movementCount(page)
  await page.locator('a.item', { hasText: '$1,500.00' }).first().click()
  await page.getByRole('link', { name: 'Distribuir este ingreso' }).click()
  await expect(page.getByRole('heading', { name: 'Distribuir este ingreso' })).toBeVisible()
  await expect(page.getByText('El ingreso ya está en tu saldo')).toBeVisible()

  await page.getByRole('radio', { name: 'Lo reparto yo' }).check()
  // La renta (antes del próximo ingreso) ya se descuenta: apartarle no cambia «Puedes gastar».
  await page.getByLabel('Renta de habitación · 1 oct').fill('650')
  await expect(page.getByTestId('dist-preview')).toContainText('Puedes gastar: $1,636.78 → $1,636.78')
  await page.getByLabel('Laptop para la escuela').fill('200')
  await expect(page.getByTestId('dist-preview')).toContainText('Puedes gastar: $1,636.78 → $1,436.78')
  await expect(page.getByTestId('dist-preview')).toContainText('(no cambia)')
  await expect(page.getByTestId('dist-summary')).toContainText('$650.00') // queda sin reservar: 1500 − 850
  await page.getByRole('button', { name: 'Aplicar distribución' }).click()
  await expect(page.getByText(/Distribuiste \$850\.00/)).toBeVisible()
  expect(await movementCount(page)).toBe(count) // ningún movimiento nuevo
  await expect(await available(page)).toHaveText('$1,436.78')

  // Reabrir: muestra lo ya repartido; deshacer lo libera.
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: '$1,500.00' }).first().click()
  await page.getByRole('link', { name: 'Distribuir este ingreso' }).click()
  await expect(page.getByText('Ya repartido', { exact: true })).toBeVisible()
  await expect(page.getByText(/Pago «Renta de habitación»: \$650\.00/)).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer esta distribución' }).click()
  await expect(page.getByText(/Deshecha el/)).toBeVisible()
  await expect(await available(page)).toHaveText('$1,636.78')
})

test('pantallas nuevas: sin desplazamiento horizontal, accesibles y en inglés', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByRole('button', { name: 'Dividir entre categorías' }).click()
  for (const route of ['/pendientes', '/movimientos/nuevo']) {
    if (route !== '/movimientos/nuevo') await go(page, route)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), route).toBeLessThanOrEqual(0)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), route).toEqual([])
  }
  // Distribución (sobre el sueldo de la demo).
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: '$598.10' }).first().click()
  await page.getByRole('link', { name: 'Distribuir este ingreso' }).click()
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])

  // Inglés.
  await go(page, '/ajustes')
  await page.getByLabel('Idioma').selectOption('en')
  await go(page, '/pendientes')
  await expect(page.getByRole('heading', { name: 'To review', exact: true })).toBeVisible()
  await go(page, '/movimientos/nuevo')
  await page.getByRole('button', { name: 'Split across categories' }).click()
  await expect(page.getByTestId('split-editor')).toContainText('Purchase lines')
  await go(page, '/')
  await expect(page.getByTestId('inbox-link')).toContainText(/to review/)
})

test('sugerencia: dividir como la última vez en el mismo comercio (solo propone)', async ({ page }) => {
  await startDemo(page)
  await newExpense(page, '120', 'Costco')
  await page.getByRole('button', { name: 'Dividir entre categorías' }).click()
  const editor = page.getByTestId('split-editor')
  await editor.getByLabel('Categoría de la línea 1').selectOption({ label: 'Supermercado' })
  await editor.getByLabel('Importe de la línea 1').fill('90')
  await editor.getByLabel('Categoría de la línea 2').selectOption({ label: 'Vivienda y alquiler' })
  await editor.getByLabel('Importe de la línea 2').fill('30')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()

  // Nueva compra en el mismo comercio por 60: se propone 45 + 15 (misma proporción), sin aplicarse sola.
  await newExpense(page, '60', 'costco')
  const suggest = page.getByRole('button', { name: /Dividir como la última vez en «Costco»/ })
  await expect(suggest).toBeVisible()
  await expect(page.getByTestId('split-editor')).toHaveCount(0)
  await suggest.click()
  await expect(page.getByTestId('split-editor').getByLabel('Importe de la línea 1')).toHaveValue('45.00')
  await expect(page.getByTestId('split-editor').getByLabel('Importe de la línea 2')).toHaveValue('15.00')
  await expect(page.getByTestId('split-status')).toHaveText(/Cuadra/)
})

test('bandeja: límite de categoría superado lleva a los movimientos filtrados, sin cambiar cifras', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos')
  const summary = page.locator('.month-summary')
  await summary.getByRole('button', { name: 'Agregar límite' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo límite mensual' })
  await dialog.getByLabel('Categoría').selectOption({ label: 'Restaurantes y café' })
  await dialog.getByLabel('Límite por mes').fill('30')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()

  await go(page, '/pendientes')
  const item = page.locator('article', { hasText: '«Restaurantes y café» superó su límite de este mes' })
  await expect(item).toContainText('$7.05')
  await item.getByRole('link', { name: 'Ver movimientos de la categoría' }).click()
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('dining')
  await expect(page.getByLabel('Desde')).toHaveValue('2026-09-01')

  await go(page, '/pendientes')
  await page.locator('article', { hasText: 'superó su límite' }).getByRole('button', { name: 'Está bien así' }).click()
  await expect(page.locator('article', { hasText: 'superó su límite' })).toHaveCount(0)
  await expect(await available(page)).toHaveText('$136.78')
})
