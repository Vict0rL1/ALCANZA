import { expect, test } from '@playwright/test'
import { pickCategory, applyFilters, openFilters, showFullHome, available, go, movementCount, startDemo, openDetails } from './helpers'

test('gasto planificado: vinculado al calendario, aporte confirmado y pago distinto de lo apartado', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/plan/metas')
  await page.getByRole('link', { name: 'Nuevo gasto planificado' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo gasto planificado' })).toBeVisible()
  const link = page.getByLabel('Vincular con un pago del calendario (opcional)')
  await link.selectOption((await link.locator('option', { hasText: 'Cuota de matrícula' }).getAttribute('value'))!)
  await expect(page.getByLabel('Nombre')).toHaveValue('Cuota de matrícula')
  await expect(page.getByLabel('Importe estimado')).toHaveValue('400.00')
  await page.getByLabel('Ya apartado (opcional)').fill('50')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()

  // Lo confirmado sí se descuenta; el plan sugerido no.
  const card = page.locator('article', { hasText: 'Cuota de matrícula' })
  await expect(card.getByTestId('planned-confirmed')).toHaveText('$50.00')
  await expect(card).toContainText('Vinculado al calendario')
  await expect(card).toContainText('Plan sugerido')
  await expect(await available(page)).toHaveText('$86.78')

  // Pagar más de lo apartado: se avisa del faltante y se registra UN gasto vinculado.
  await go(page, '/plan/metas')
  await card.getByRole('button', { name: /^Pagar/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Importe pagado de verdad').fill('420')
  await expect(dialog.getByText('Pagas $370.00 más de lo apartado')).toBeVisible()
  await dialog.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(card.getByText('Pagado', { exact: true })).toBeVisible()
  expect(await movementCount(page)).toBe(before + 1)
  // La reserva se liberó: 136.78 − 420 (el pago no es futuro, así que tampoco hay reserva del calendario).
  await expect(await available(page)).toHaveText('-$283.22')

  // Persistente tras recargar, con historial.
  await page.reload()
  await go(page, '/plan/metas')
  await card.getByText(/Historial \(1 pago\)/).click()
  await expect(card).toContainText('pagado $420.00, apartado $50.00')
})

test('presupuesto por periodo: asignar no cambia el disponible; gastos asociados, reserva sin doble descuento y archivo', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/periodos')
  await expect(page.getByText('Asignado no es dinero disponible')).toBeVisible()
  await page.getByRole('link', { name: 'Nuevo presupuesto' }).first().click()
  await page.getByRole('radio', { name: 'Viaje' }).check()
  await page.getByLabel('Nombre').fill('Viaje a Montreal')
  await page.getByLabel('Desde').fill('2026-09-28')
  await page.getByLabel('Hasta (incluido)').fill('2026-10-02')
  await page.getByLabel('Asignado').fill('100')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Viaje a Montreal' })).toBeVisible()
  await expect(page.getByTestId('period-spent')).toHaveText('$0.00')
  await expect(await available(page)).toHaveText('$136.78')

  // Registrar un gasto desde el periodo: queda asociado en la misma operación.
  const before = await movementCount(page)
  await go(page, '/plan/periodos')
  await page.getByRole('link', { name: /Viaje a Montreal/ }).click()
  await page.getByRole('link', { name: 'Registrar un gasto del periodo' }).click()
  await page.getByLabel('Importe').fill('12.50')
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /Viaje a Montreal/ })).toBeChecked()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByTestId('period-spent')).toHaveText('$12.50')
  await expect(page.getByTestId('period-remaining')).toHaveText('$87.50')
  expect(await movementCount(page)).toBe(before + 1)

  // Reservar 30: lo ya gastado en el periodo consume la reserva (no se descuenta dos veces).
  await go(page, '/plan/periodos')
  await page.getByRole('link', { name: /Viaje a Montreal/ }).click()
  await page.getByRole('button', { name: 'Reservar dinero' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Importe').fill('30')
  await expect(dialog.getByText('«Puedes gastar» pasará de $124.28 a $94.28.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Reservar dinero' }).click()
  await expect(page.getByTestId('period-reserve')).toContainText('$17.50')
  await expect(await available(page)).toHaveText('$106.78')

  // Otro presupuesto solapado con el mismo gasto: el total combinado no lo duplica.
  await go(page, '/plan/periodos/nuevo')
  await page.getByLabel('Nombre').fill('Otoño')
  await page.getByLabel('Desde').fill('2026-09-01')
  await page.getByLabel('Hasta (incluido)').fill('2026-12-20')
  await page.getByLabel('Asignado').fill('900')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.locator('.check', { hasText: '$12.50' }).getByRole('checkbox').check()
  await expect(page.getByTestId('period-spent')).toHaveText('$12.50')
  await go(page, '/plan/periodos')
  await expect(page.getByTestId('period-consolidated')).toHaveText('$12.50')
  await expect(page.getByText(/1 movimiento está en más de un periodo/)).toBeVisible()

  // Archivar conserva el historial.
  await page.getByRole('link', { name: /Otoño/ }).click()
  await page.getByRole('button', { name: 'Archivar' }).click()
  await expect(page.getByText('Presupuesto archivado. Su historial se conserva.')).toBeVisible()
  await go(page, '/plan/periodos')
  await page.getByText('Archivado (1)').click()
  await expect(page.getByRole('link', { name: /Otoño/ })).toContainText('$12.50 gastado de $900.00')
})

test('revisión semanal: tarjeta en Inicio, semanas anteriores, observaciones y preferencia', async ({ page }) => {
  await startDemo(page)
  await showFullHome(page)
  await expect(page.getByTestId('week-home')).toContainText('Gastado esta semana')
  await page.getByRole('link', { name: 'Ver revisión semanal' }).click()
  await expect(page.getByRole('heading', { name: 'Revisión semanal' })).toBeVisible()
  await expect(page.getByText(/Semana en curso \(hasta/)).toBeVisible()
  await expect(page.getByTestId('week-observations')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Próximos 7 días' })).toBeVisible()
  // Semana anterior (cerrada): 7 días contra 7 días; no hay «siguiente» más allá de hoy.
  await page.getByRole('link', { name: 'Semana anterior' }).click()
  await expect(page.getByText('Semana cerrada')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Próximos 7 días' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Semana siguiente' }).click()
  await expect(page.getByText(/Semana en curso \(hasta/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Semana siguiente' })).toHaveCount(0)

  // Muy atrás: sin datos, no se interpreta como «sin gastos».
  await go(page, '/revision?semana=2026-06-01')
  await expect(page.getByText('No hay registros de esta semana')).toBeVisible()
  await expect(page.getByTestId('week-spending-change')).toHaveText(/Sin comparación/)

  // Ocultar en Inicio, con deshacer; y volver a mostrar desde Ajustes.
  await go(page, '/')
  await showFullHome(page)
  await page.getByRole('button', { name: 'Ocultar', exact: true }).click()
  await expect(page.getByTestId('week-home')).toHaveCount(0)
  await go(page, '/ajustes/personalizar')
  await page.getByLabel('Mostrar la revisión semanal en Inicio').check()
  await go(page, '/')
  await showFullHome(page)
  await expect(page.getByTestId('week-home')).toBeVisible()
})

test('escenarios: se guardan sin tocar datos reales, se comparan y avisan si cambian los datos', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/alcanza')
  await page.getByLabel('Precio').fill('45')
  await page.getByRole('link', { name: 'Guardar como escenario' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo escenario' })).toBeVisible()
  await expect(page.getByLabel('Precio')).toHaveValue('45.00')
  await page.getByLabel('Nombre').fill('Audífonos hoy')
  await page.getByRole('button', { name: 'Guardar escenario' }).click()

  // Segundo escenario: subir la renta mensual.
  await page.getByRole('link', { name: 'Nuevo escenario' }).first().click()
  await page.getByLabel('Nombre').fill('Renta más cara')
  await page.getByRole('radio', { name: 'Cambiar un pago programado' }).check()
  await page.getByLabel('Pago programado', { exact: true }).selectOption({ label: 'Renta de habitación · $650.00' })
  await page.getByLabel('Nuevo importe').fill('700')
  await page.getByRole('button', { name: 'Guardar escenario' }).click()

  const table = page.getByTestId('scenario-table')
  await expect(table).toContainText('Situación actual')
  await expect(table).toContainText('Audífonos hoy')
  await expect(table.getByRole('row', { name: /Diferencia con la situación actual/ })).toContainText('-$45.00')
  expect(await movementCount(page)).toBe(before)
  await expect(await available(page)).toHaveText('$136.78')

  // Cambian los datos reales: se marca para revisar.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('3')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await go(page, '/alcanza/escenarios')
  await expect(page.getByText('Datos cambiados').first()).toBeVisible()
  await page.getByRole('button', { name: /Marcar como revisado.*Audífonos hoy/ }).click()
  await page.getByRole('button', { name: /Marcar como revisado.*Renta más cara/ }).click()
  await expect(page.getByText('Datos cambiados')).toHaveCount(0)

  // Crear un gasto previsto solo con acción explícita; luego se detecta el parecido.
  await page.getByRole('link', { name: 'Crear gasto previsto…' }).click()
  await openDetails(page)
  await expect(page.getByRole('radio', { name: 'Previsto' })).toBeChecked()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText(/Ya hay un gasto previsto parecido/)).toBeVisible()

  // Eliminar con deshacer.
  await page.getByRole('button', { name: /Eliminar.*Renta más cara/ }).click()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText('Comparar «Renta más cara»')).toBeVisible()
})

test('búsqueda global: acentos, categorías traducidas, papelera opcional y teclado', async ({ page }) => {
  await startDemo(page)
  await page.getByRole('link', { name: 'Buscar' }).click()
  const box = page.getByRole('searchbox', { name: 'Buscar en tus datos' })
  await expect(box).toBeFocused()
  await box.fill('CAFE')
  await expect(page.getByRole('heading', { name: /^Movimientos \(/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Categorías \(1\)/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Favoritos \(1\)/ })).toBeVisible()
  const count = await page.getByTestId('search-summary').textContent()
  await box.fill('café')
  await expect(page.getByTestId('search-summary')).toHaveText(count!)

  await box.fill('matricula')
  await expect(page.getByRole('heading', { name: /^Pagos e ingresos programados/ })).toBeVisible()

  await box.fill('zzzz')
  await expect(page.getByText('Nada coincide con «zzzz»')).toBeVisible()

  // Papelera: excluida por defecto.
  await box.fill('supermercado')
  const summary = await page.getByTestId('search-summary').textContent()
  await page.getByRole('link', { name: /Supermercado/ }).first().click()
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await go(page, '/buscar?q=supermercado')
  await expect(page.getByTestId('search-summary')).not.toHaveText(summary!)
  await page.getByLabel('Incluir la papelera').check()
  await expect(page.getByRole('heading', { name: /^En la papelera \(1\)/ })).toBeVisible()

  // Teclado: del campo al primer resultado.
  await go(page, '/buscar?q=renta')
  await page.getByRole('searchbox').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('#page-title')).not.toHaveText('Buscar')
})

test('English: new tools are translated and category search uses English names', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes/formato')
  await page.getByTestId('language-chips').getByRole('button', { name: /English/ }).click()
  await go(page, '/buscar?q=groceries')
  await expect(page.getByRole('heading', { name: /^Categories \(1\)/ })).toBeVisible()
  await go(page, '/buscar?q=supermercado')
  await expect(page.getByRole('heading', { name: /^Categories/ })).toHaveCount(0)
  for (const [route, heading] of [
    ['/revision', 'Weekly review'],
    ['/alcanza/escenarios', 'Compare scenarios'],
    ['/plan/periodos/nuevo', 'New period budget'],
    ['/plan/metas/nueva?tipo=gasto', 'New planned expense'],
  ] as const) {
    await go(page, route)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  await go(page, '/plan/periodos')
  await expect(page.getByText('Allocated is not available money')).toBeVisible()
})

test('pantallas nuevas con datos: sin desplazamiento horizontal ni problemas de accesibilidad (claro y oscuro)', async ({ page }) => {
  const AxeBuilder = (await import('@axe-core/playwright')).default
  await startDemo(page)
  // Datos: un gasto planificado, un presupuesto por periodo y un escenario.
  await go(page, '/plan/metas/nueva?tipo=gasto')
  await page.getByLabel('Nombre').fill('Seguro del auto')
  await page.getByLabel('Importe estimado').fill('600')
  await page.getByLabel('Fecha de vencimiento').fill('2027-03-01')
  await page.getByLabel('¿Se repite?').selectOption('12')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await go(page, '/plan/periodos/nuevo')
  await page.getByLabel('Nombre').fill('Semestre')
  await page.getByLabel('Asignado').fill('1500')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByTestId('period-spent')).toBeVisible()
  const periodUrl = new URL(page.url()).hash.slice(1)
  await go(page, '/alcanza/escenarios/nuevo?amount=4500')
  await page.getByLabel('Nombre').fill('Laptop')
  await page.getByRole('button', { name: 'Guardar escenario' }).click()
  await expect(page.getByTestId('scenario-table')).toBeVisible()

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const route of ['/plan/metas', periodUrl, '/alcanza/escenarios', '/revision', '/buscar?q=se']) {
      await go(page, route)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), route).toBeLessThanOrEqual(0)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), `${scheme} ${route}`).toEqual([])
    }
  }
})

test('búsqueda por importe y compra simulada en otra cuenta', async ({ page }) => {
  await startDemo(page)
  await go(page, '/buscar?q=4,25')
  await expect(page.getByRole('heading', { name: /^Movimientos \(/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Favoritos \(1\)/ })).toBeVisible()

  await go(page, '/alcanza/escenarios/nuevo')
  await page.getByLabel('Nombre').fill('Pagar con ahorro')
  await page.getByLabel('Precio').fill('100')
  await page.getByLabel('Cuenta', { exact: true }).selectOption({ label: 'Ahorros' })
  await page.getByRole('button', { name: 'Guardar escenario' }).click()
  await expect(page.getByText(/Compra de \$100\.00.*Ahorros/)).toBeVisible()
  // El ahorro no cuenta para el presupuesto: el disponible del escenario no cambia.
  await expect(page.getByTestId('scenario-table').getByRole('row', { name: /Diferencia con la situación actual/ })).toContainText('$0.00')
})

test('periodo: sugerencias por fecha con deshacer; movimientos filtrados por rango desde la revisión semanal', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/periodos/nuevo')
  await page.getByLabel('Nombre').fill('Septiembre')
  await page.getByLabel('Desde').fill('2026-09-01')
  await page.getByLabel('Hasta (incluido)').fill('2026-09-30')
  await page.getByLabel('Asignado').fill('2000')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const box = page.getByTestId('period-suggestions')
  await expect(box).toContainText(/Hay \d+ gastos en estas fechas/)
  await box.getByRole('button', { name: /Asociar \d+ gastos sugeridos/ }).click()
  await expect(page.getByTestId('period-spent')).not.toHaveText('$0.00')
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByTestId('period-spent')).toHaveText('$0.00')

  await go(page, '/revision')
  await page.getByRole('link', { name: 'Ver movimientos' }).click()
  // Las fechas llegan como filtros activos; sus valores se ven en la hoja «Filtros» (C2).
  let sheet = await openFilters(page)
  await expect(sheet.getByLabel('Desde')).toHaveValue('2026-09-28')
  await expect(sheet.getByLabel('Hasta')).toHaveValue('2026-09-28')
  await applyFilters(page)
  await page.getByRole('button', { name: 'Quitar filtros' }).first().click()
  sheet = await openFilters(page)
  await expect(sheet.getByLabel('Desde')).toHaveValue('')
  await applyFilters(page)
})

test('regla del periodo propone el gasto (se puede desmarcar) e ingreso hipotético solo cambia la proyección', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/periodos/nuevo')
  await page.getByLabel('Nombre').fill('Semana de exámenes')
  await page.getByLabel('Desde').fill('2026-09-28')
  await page.getByLabel('Hasta (incluido)').fill('2026-10-10')
  await page.getByLabel('Asignado').fill('80')
  await page.locator('summary', { hasText: 'Proponer gastos automáticamente' }).click()
  await page.getByLabel('Restaurantes y café').check()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText(/Regla: Restaurantes y café/)).toBeVisible()

  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('6')
  await openDetails(page)
  const period = page.getByRole('checkbox', { name: /Semana de exámenes/ })
  await expect(period).not.toBeChecked() // categoría por defecto: Otros gastos
  await pickCategory(page, page.getByLabel('Categoría', { exact: true }), 'Restaurantes y café')
  await expect(period).toBeChecked()
  await expect(page.getByText('Propuesto por la regla del periodo')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await go(page, '/plan/periodos')
  await page.getByRole('link', { name: /Semana de exámenes/ }).click()
  await expect(page.getByTestId('period-spent')).toHaveText('$6.00')

  // Desmarcar la propuesta: no se asocia.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe').fill('3')
  await pickCategory(page, page.getByLabel('Categoría', { exact: true }), 'Restaurantes y café')
  await openDetails(page)
  await page.getByRole('checkbox', { name: /Semana de exámenes/ }).uncheck()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await go(page, '/plan/periodos')
  await page.getByRole('link', { name: /Semana de exámenes/ }).click()
  await expect(page.getByTestId('period-spent')).toHaveText('$6.00')

  // Ingreso hipotético: «Puedes gastar» igual, proyección distinta.
  await go(page, '/alcanza/escenarios/nuevo')
  await page.getByLabel('Nombre').fill('Beca extra')
  await page.getByRole('radio', { name: 'Ingreso hipotético' }).check()
  await expect(page.getByText('Solo cambia la proyección')).toBeVisible()
  await page.getByLabel('Importe del ingreso').fill('300')
  await page.getByRole('button', { name: 'Guardar escenario' }).click()
  const table = page.getByTestId('scenario-table')
  await expect(table.getByRole('row', { name: /Diferencia con la situación actual/ })).toContainText('$0.00')
  await expect(page.getByText(/Ingreso hipotético de \$300\.00/)).toBeVisible()
})
