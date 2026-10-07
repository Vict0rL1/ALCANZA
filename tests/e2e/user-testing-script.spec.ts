/**
 * Ensayo del guion de `docs/USER_TESTING.md` con su escenario ficticio: comprueba que cada
 * tarea se puede completar y que las cifras que el moderador usa como referencia son las
 * correctas (calculadas a mano en los comentarios).
 *
 * Hoy: lunes 28-sep-2026 (Toronto). Saldo 1,240.00; cobro de 900.00 cada 2 semanas, el
 * próximo el 7-oct (dentro de 9 días); renta 650.00 el día 1; teléfono 45.00 el día 15;
 * 150.00 apartados para emergencias.
 */
import { expect, test, type Page } from '@playwright/test'
import { available, go, movementCount, openApp, openDetails } from './helpers'

async function setUp(page: Page) {
  await openApp(page)
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  // Paso de categorías: las propuestas vienen marcadas; se continúa.
  await expect(page.getByRole('heading', { name: 'Tus categorías' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Saldo disponible').fill('1240')
  await page.getByLabel('Periodo del presupuesto').selectOption({ label: 'Hasta mi próximo ingreso' })
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Importe esperado').fill('900')
  await page.getByLabel('Fecha del próximo ingreso').fill('2026-10-07')
  await page.getByLabel('Frecuencia').selectOption({ label: 'Cada 2 semanas' })
  await page.getByRole('button', { name: 'Continuar' }).click()
  for (const [name, amount, date] of [
    ['Renta', '650', '2026-10-01'],
    ['Teléfono', '45', '2026-10-15'],
  ]) {
    await page.getByRole('button', { name: 'Agregar un pago' }).click()
    const row = page.locator('fieldset.bill-row').last()
    await row.getByLabel('Nombre').fill(name!)
    await row.getByLabel('Importe', { exact: true }).fill(amount!)
    await row.getByLabel('Próxima fecha de pago').fill(date!)
    await row.getByLabel('Frecuencia').selectOption({ label: 'Cada mes' })
  }
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Cantidad reservada').fill('150')
  await page.getByRole('button', { name: 'Ver resumen' }).click()
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()
}

test('guion de la prueba con usuarios: las 9 tareas se pueden completar y las cifras de referencia son correctas', async ({ page }) => {
  test.setTimeout(120_000) // recorre la app completa
  // T1. Configurar.
  await setUp(page)

  // T2. 1,240 − 650 (renta del 1-oct, antes del cobro) − 150 (apartado) = 440.00.
  //     El teléfono (15-oct) es después del cobro: no se reserva. 9 días → 440 / 9 = 48.88.
  await expect(page.getByTestId('available')).toHaveText('$440.00')
  await expect(page.locator('.hero__sub')).toContainText('9 días')
  await expect(page.locator('.stat__value').first()).toHaveText('$48.88')

  // T3. Compra de 38.40 → 401.60.
  const before = await movementCount(page)
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('38.40')
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Supermercado')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$401.60')

  // T4. Dividirla: 28.40 súper + 10.00 hogar. El disponible no cambia.
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Supermercado' }).click()
  await page.getByRole('button', { name: 'Dividir entre categorías' }).click()
  const editor = page.getByTestId('split-editor')
  await editor.getByLabel('Categoría de la línea 1').selectOption({ label: 'Supermercado' })
  await editor.getByLabel('Importe de la línea 1').fill('28.40')
  await editor.getByLabel('Categoría de la línea 2').selectOption({ label: 'Vivienda y alquiler' })
  await editor.getByLabel('Importe de la línea 2').fill('10')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$401.60')
  expect(await movementCount(page)).toBe(before + 1)

  // T5. ¿Me alcanza 120.00? Quedarían 281.60; no se registra nada.
  await go(page, '/alcanza')
  await page.getByLabel('Precio').fill('120')
  await expect(page.getByText(/te quedarían \$281\.60/)).toBeVisible()
  expect(await movementCount(page)).toBe(before + 1)

  // T6. Ingreso extra de 300.00 → 701.60; apartar 100.00 para un viaje (meta nueva) → 601.60.
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Ingreso' }).check()
  await page.getByLabel('Importe', { exact: true }).fill('300')
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Trabajo extra')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$701.60')
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Trabajo extra' }).click()
  await page.getByRole('link', { name: 'Distribuir este ingreso' }).click()
  // Sin metas pendientes: se puede crear una y volver aquí.
  await page.getByRole('link', { name: 'Crear una meta' }).click()
  await page.getByLabel('Nombre').fill('Viaje')
  await page.getByLabel('Importe objetivo').fill('500')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Distribuir este ingreso' })).toBeVisible()
  await page.getByRole('radio', { name: 'Lo reparto yo' }).check()
  await page.getByLabel('Viaje').fill('100')
  await page.getByRole('button', { name: 'Aplicar distribución' }).click()
  await expect(page.getByText(/Distribuiste \$100\.00/)).toBeVisible()
  await expect(await available(page)).toHaveText('$601.60')
  expect(await movementCount(page)).toBe(before + 2) // apartar no crea movimientos

  // T7. Corregir 38.40 → 34.80: la división pide ajustar (sobran 3.60); mismo movimiento.
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Supermercado' }).click()
  await page.getByLabel('Importe', { exact: true }).fill('34.80')
  await expect(page.getByTestId('split-status')).toContainText('$3.60')
  await page.getByTestId('split-editor').getByLabel('Importe de la línea 1').fill('24.80')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$605.20')
  expect(await movementCount(page)).toBe(before + 2)

  // T8. Exportar y restaurar: mismas cifras.
  await go(page, '/ajustes')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  const file = await (await download).path()
  await page.getByTestId('import-file').setInputFiles(file)
  await page.getByRole('dialog').getByRole('button', { name: 'Reemplazar datos' }).click()
  await expect(await available(page)).toHaveText('$605.20')

  // T9. Inglés y de vuelta.
  await go(page, '/ajustes')
  await page.getByTestId('language-chips').getByRole('button', { name: /English/ }).click()
  await go(page, '/')
  await expect(page.getByText('You can spend', { exact: true })).toBeVisible()
  await go(page, '/ajustes')
  await page.getByTestId('language-chips').getByRole('button', { name: /Español/ }).click()
  await go(page, '/')
  await expect(page.getByText('Puedes gastar', { exact: true })).toBeVisible()
})
