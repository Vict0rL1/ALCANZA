import { expect, test } from '@playwright/test'
import { available, go, movementCount, startDemo } from './helpers'

test('¿Me alcanza?: simula sin guardar y registra solo con acción explícita', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/alcanza')
  await page.getByLabel('Precio').fill('150')
  // 136.78 − 150 < 0, pero con los 60.00 apartados alcanzaría.
  await expect(page.getByTestId('verdict')).toHaveText('Solo alcanza usando dinero apartado')
  await page.getByLabel('Precio').fill('500')
  await expect(page.getByTestId('verdict')).toHaveText('No te alcanza por ahora')
  await page.getByLabel('Precio').fill('45')
  await expect(page.getByTestId('available-after')).toHaveText('$91.78')
  // Con el gasto diario promedio, la proyección ya baja de cero: se avisa y se dice que no es por la compra.
  await expect(page.getByText('aun sin esta compra')).toBeVisible()
  await expect(page.getByTestId('verdict')).toHaveText('Te alcanza, pero queda justo')

  // Simular no guardó nada.
  expect(await movementCount(page)).toBe(before)

  await go(page, '/alcanza')
  await page.getByLabel('Precio').fill('20')
  await page.getByText('Suposiciones de la proyección').click()
  await page.getByLabel(/Incluir mi gasto diario habitual/).uncheck()
  await expect(page.getByTestId('verdict')).toHaveText('Sí, te alcanza')
  await page.getByRole('link', { name: 'Registrar esta compra' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo movimiento' })).toBeVisible()
  await expect(page.getByLabel('Importe')).toHaveValue('20.00')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByTestId('available')).toHaveText('$116.78')
  expect(await movementCount(page)).toBe(before + 1)
})

test('calendario: marcar un pago como realizado no lo descuenta dos veces', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: /Marcar pagado.*Recibo de luz/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Marcar como pagado' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.getByText('«Recibo de luz» marcado como pagado')).toBeVisible()
  // Ya no se puede volver a marcar.
  await expect(page.getByRole('button', { name: /Marcar pagado.*Recibo de luz/ })).toHaveCount(0)
  // El saldo baja 42.80 y la reserva también: el disponible no cambia.
  await expect(await available(page)).toHaveText('$136.78')
  await expect(page.getByText('Tienes 1 pago vencido sin marcar')).toHaveCount(0)
  expect(await movementCount(page)).toBe(before + 1)
  await expect(page.getByText('Del calendario').first()).toBeVisible()
})

test('calendario: omitir una vez un pago recurrente y deshacer', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(page.getByRole('heading', { name: 'octubre de 2026', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Omitir esta vez.*Renta de habitación/ }).click()
  await expect(await available(page)).toHaveText('$786.78')
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByTestId('available')).toHaveText('$136.78')
})

test('metas: no se puede apartar dos veces el mismo dinero', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/metas')
  await expect(page.getByTestId('free-to-allocate')).toHaveText('$136.78')
  await expect(page.getByText('Los apartados son virtuales')).toBeVisible()
  await page.getByRole('button', { name: /Apartar.*Laptop para la escuela/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Importe').fill('200')
  await dialog.getByRole('button', { name: 'Apartar' }).click()
  await expect(dialog.getByText('Solo tienes $136.78 libres')).toBeVisible()
  await dialog.getByLabel('Importe').fill('36.78')
  await dialog.getByRole('button', { name: 'Apartar' }).click()
  await expect(page.getByTestId('free-to-allocate')).toHaveText('$100.00')
  await expect(await available(page)).toHaveText('$100.00')
})

test('proyección: muestra suposiciones, posible faltante y tabla', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/proyeccion')
  await expect(page.getByText(/Posible faltante a partir del/)).toBeVisible()
  // E6: la explicación es una frase; el párrafo completo («Es una estimación…») está en «¿Por qué?».
  await expect(page.getByText('Estimación del saldo a 30 días con tus ingresos y pagos previstos.')).toBeVisible()
  await page.getByRole('radio', { name: 'No incluir' }).check()
  await expect(page.getByText('Sin faltantes previstos con estas suposiciones')).toBeVisible()
  await page.getByText('Ver tabla').click()
  await expect(page.getByRole('table', { name: 'Saldo proyectado por día' })).toBeVisible()
  // El gráfico se puede recorrer con teclado (control deslizante nativo).
  const slider = page.getByRole('slider', { name: 'Recorrer la proyección día por día' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('1')
  await expect(page.locator('.chart__tooltip')).toBeVisible()
})
