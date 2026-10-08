import { expect, test } from '@playwright/test'
import { nav, openAddSheet, openApp } from './helpers'

/**
 * La prueba manual de `docs/MANUAL-TEST.md`, paso a paso y con las mismas cifras, para que el
 * documento no se quede desfasado. Hoy = 28-sep-2026 (START); «dentro de 10 días» = 8-oct.
 */
test('prueba manual: configuración, Inicio, registro, historial, planes, estadísticas, ajustes y cuenta', async ({ page }) => {
  test.setTimeout(120_000)
  await openApp(page)

  // A1. Bienvenida: el idioma cambia al instante.
  await expect(page.getByRole('heading', { name: 'Hola, esto es Clara' })).toBeVisible()
  await page.getByRole('radio', { name: 'English' }).check()
  await expect(page.getByRole('heading', { name: 'Hi, this is Clara' })).toBeVisible()
  await page.getByRole('radio', { name: 'Español' }).check()
  await expect(page.getByRole('heading', { name: 'Hola, esto es Clara' })).toBeVisible()

  // A2. Categorías con contador en vivo.
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  await expect(page.getByRole('heading', { name: 'Tus categorías' })).toBeVisible()
  await expect(page.getByText('Gastos · 16 seleccionadas')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Mascotas', exact: true }).uncheck()
  await expect(page.getByText('Gastos · 15 seleccionadas')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()

  // A3–A6. Saldo, ingreso, pago y reserva: 1200 − 600 − 200 = 400.
  await page.getByLabel('Saldo disponible').fill('1200')
  await page.getByLabel('Periodo del presupuesto').selectOption({ label: 'Hasta mi próximo ingreso' })
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Importe esperado').fill('800')
  await page.getByLabel('Fecha del próximo ingreso').fill('2026-10-08')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Agregar un pago' }).click()
  await page.getByLabel('Nombre').fill('Renta')
  await page.getByLabel('Importe', { exact: true }).fill('600')
  await page.getByLabel('Próxima fecha de pago').fill('2026-10-03')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Cantidad reservada').fill('200')
  await page.getByRole('button', { name: 'Ver resumen' }).click()
  await expect(page.locator('.hero__value')).toHaveText('$400.00')
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()

  // A7. Inicio: 400 en 10 días = 40 por día; recargar no vuelve a la configuración.
  await expect(page.getByTestId('available')).toHaveText('$400.00')
  await expect(page.locator('.hero__sub')).toContainText('10 días')
  await expect(page.locator('.stat__value').first()).toHaveText('$40.00')
  // Cajas INGRESOS / GASTOS y «Disponible · N %»: 400 ÷ (1 200 + 0) = 33 %.
  await expect(page.getByTestId('period-income')).toContainText('$0.00')
  await expect(page.getByTestId('period-expenses')).toContainText('$0.00')
  await expect(page.getByTestId('available-pct')).toContainText('Disponible · 33 %')
  await page.reload()
  await expect(page.getByTestId('available')).toHaveText('$400.00')

  // B1. Recorrido de 3 pasos, una sola vez.
  await expect(page.getByText('Paso 1 de 3')).toBeVisible()
  await page.getByRole('button', { name: 'Omitir' }).click()
  await page.reload()
  await expect(page.getByTestId('available')).toHaveText('$400.00')
  await expect(page.getByText('Paso 1 de 3')).toHaveCount(0)

  // B2. ¿Cómo se calculó?
  await page.getByText('¿Cómo se calculó?').click()
  for (const amount of ['$1,200.00', '$600.00', '$200.00']) await expect(page.locator('.hero').getByText(amount).first()).toBeVisible()
  await page.getByText('¿Cómo se calculó?').click()

  // B3. Privacidad: oculto → discreto → visible.
  const privacy = page.getByTestId('privacy-toggle')
  await expect(privacy).toHaveText('Ocultar importes')
  await privacy.click()
  await expect(page.getByTestId('available')).toHaveText('$-----')
  await expect(privacy).toHaveText('Modo discreto')
  await privacy.click()
  await expect(privacy).toHaveText('Mostrar todo')
  await privacy.click()
  await expect(page.getByTestId('available')).toHaveText('$400.00')

  // B5. Avatar en la cabecera → Cuenta. B6. Sin botón flotante: solo la pestaña «+».
  await page.getByTestId('avatar').click()
  await expect(page.getByText('Modo invitado').first()).toBeVisible()
  await nav(page, 'Inicio').click()
  await expect(page.getByTestId('available')).toHaveText('$400.00')
  await expect(page.locator('.fab')).toHaveCount(0)

  // C1. Gasto manual de 25: 375 en 10 días = 37.50 por día.
  await openAddSheet(page)
  const sheet = page.getByRole('dialog', { name: '¿Qué quieres registrar?' })
  for (const option of ['Gasto', 'Ingreso', 'Transferencia', 'Escribir o dictar']) await expect(sheet.getByRole('link', { name: new RegExp(`^${option}`) })).toBeVisible()
  await sheet.getByRole('link', { name: /^Gasto/ }).click()
  await page.getByLabel('Importe', { exact: true }).fill('25')
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Restaurantes y café' })
  await page.getByText('Más detalles').click()
  await page.getByLabel('Nota (opcional)').fill('Almuerzo')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await nav(page, 'Inicio').click()
  await expect(page.getByTestId('available')).toHaveText('$375.00')
  await expect(page.locator('.stat__value').first()).toHaveText('$37.50')

  // C2. Asistente: nada se guarda antes de confirmar; luego 375 − 12 − 3.50 = 359.50.
  await openAddSheet(page)
  await page.getByRole('dialog', { name: '¿Qué quieres registrar?' }).getByRole('link', { name: /Escribir o dictar/ }).click()
  await page.getByLabel('Texto').fill('taxi 12 y café 3.50')
  await page.getByRole('button', { name: 'Analizar' }).click()
  const lines = page.getByTestId('assistant-preview').locator('.assistant__line')
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(0).getByLabel('Importe')).toHaveValue('12.00')
  await expect(lines.nth(0).getByLabel('Categoría')).toHaveValue('transport')
  await expect(lines.nth(1).getByLabel('Importe')).toHaveValue('3.50')
  await expect(lines.nth(1).getByLabel('Categoría')).toHaveValue('dining')
  await nav(page, 'Inicio').click()
  await expect(page.getByTestId('available')).toHaveText('$375.00')
  await openAddSheet(page)
  await page.getByRole('dialog', { name: '¿Qué quieres registrar?' }).getByRole('link', { name: /Escribir o dictar/ }).click()
  await page.getByLabel('Texto').fill('taxi 12 y café 3.50')
  await page.getByRole('button', { name: 'Analizar' }).click()
  await page.getByRole('button', { name: 'Registrar 2 movimientos' }).click()
  await expect(page.getByText('2 movimientos registrados')).toBeVisible()
  await nav(page, 'Inicio').click()
  await expect(page.getByTestId('available')).toHaveText('$359.50')
  await expect(page.locator('.stat__value').first()).toHaveText('$35.95')

  // D1–D3. Historial: buscar, eliminar con Deshacer, exportar.
  await nav(page, 'Movimientos').click()
  const search = page.getByRole('searchbox', { name: 'Buscar' })
  await search.fill('taxi')
  await expect(page.locator('.tx-group .item--link')).toHaveCount(1)
  await search.fill('almuerzo')
  await page.getByRole('link', { name: /Almuerzo/ }).click()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText('Movimiento enviado a la papelera')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await nav(page, 'Inicio').click()
  await expect(page.getByTestId('available')).toHaveText('$359.50')
  await nav(page, 'Movimientos').click()
  await page.getByTestId('movements-more').click()
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: 'Exportar CSV' }).click()])
  expect(csv.suggestedFilename()).toMatch(/\.csv$/)

  // D4. Hoja «Filtros» con fichas; el filtro activo se quita desde su ficha; resumen del mes plegado.
  await page.getByTestId('open-filters').click()
  await page.getByRole('dialog', { name: 'Filtros' }).getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Gasto', exact: true }).click()
  await page.getByRole('dialog', { name: 'Filtros' }).getByRole('button', { name: 'Ver resultados' }).click()
  await expect(page.getByTestId('active-filters')).toContainText('Gasto')
  await expect(page.locator('.summary-line')).toContainText('3 movimientos')
  await page.getByRole('button', { name: 'Quitar filtro: Gasto' }).click()
  await expect(page.getByTestId('active-filters')).toHaveCount(0)
  await expect(page.locator('.month-summary__toggle')).toContainText('Gasto neto $40.50')
  await page.locator('.month-summary__toggle').click()
  await expect(page.locator('.month-summary').getByRole('heading', { name: /Resumen de/ })).toBeVisible()

  // E1. Plan de gasto: 25 + 12 + 3.50 = 40.50 de 100 (40 %, quedan 59.50) en el mes en curso.
  await nav(page, 'Plan').click()
  // Primera vez en Plan: abre en «Planes» con la introducción de 3 pantallas; «Omitir» y no vuelve.
  await expect(page.getByTestId('plans-onboarding')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dos tipos de planes' })).toBeVisible()
  await page.getByRole('button', { name: 'Omitir' }).click()
  await expect(page.getByTestId('plans-onboarding')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('#page-title')).toBeVisible()
  await expect(page.getByTestId('plans-onboarding')).toHaveCount(0)
  await page.getByRole('button', { name: 'Nuevo plan' }).click()
  await page.getByTestId('plan-create-sheet').getByRole('link', { name: /Controlar un gasto/ }).click()
  await page.getByLabel('Límite máximo').fill('100')
  await page.getByTestId('plan-categories').getByRole('button', { name: 'Restaurantes y café' }).click()
  await page.getByTestId('plan-categories').getByRole('button', { name: 'Transporte' }).click()
  await expect(page.getByText('Periodo en curso: 1 sep – 30 sep')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Plan guardado')).toBeVisible()
  await expect(page.getByTestId('plan-spent')).toHaveText('$40.50 / $100.00')
  await expect(page.getByText('Quedan $59.50').first()).toBeVisible()

  // F1. Estadísticas del mes.
  await nav(page, 'Inicio').click()
  await page.getByTestId('stats-link').click()
  const tiles = page.getByTestId('stats-tiles')
  await expect(tiles).toContainText('Ingresos')
  await expect(tiles).toContainText('Sin comparación')
  await expect(tiles).toContainText('$40.50')
  await expect(page.getByText('El saldo futuro se muestra con al menos dos semanas de historial')).toBeVisible()

  // G1–G4. Ajustes: idioma y tema al instante, copia local, borrar con doble confirmación.
  await nav(page, 'Ajustes').click()
  await page.getByTestId('settings-row-formato').click()
  await page.getByTestId('language-chips').getByRole('button', { name: /English/ }).click()
  const mainNav = page.getByRole('navigation', { name: 'Main navigation' })
  await expect(mainNav).toContainText('Home')
  await expect(mainNav).toContainText('Settings')
  await mainNav.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('.hero__label')).toHaveText('You can spend')
  await mainNav.getByRole('link', { name: 'Settings' }).click()
  await page.getByTestId('settings-row-formato').click()
  await page.getByTestId('language-chips').getByRole('button', { name: /Español/ }).click()
  await expect(nav(page, 'Inicio')).toBeVisible()
  await page.getByRole('radio', { name: 'Claro' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('radio', { name: 'Oscuro' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // G3. Copias locales: fila «Copias locales automáticas» del índice.
  await page.getByRole('link', { name: 'Ajustes' }).first().click()
  await page.getByTestId('settings-row-copias-locales').click()
  await page.getByRole('button', { name: 'Hacer copia ahora' }).click()
  await expect(page.getByText('Copia local guardada')).toBeVisible()
  await expect(page.getByTestId('local-backup-list').locator('li').first()).toContainText('3 movimientos · 1 cuenta')
  // G4. Borrado con doble confirmación: fila «Demostración y borrado».
  await page.getByRole('link', { name: 'Ajustes' }).first().click()
  await page.getByTestId('settings-row-reinicio').click()
  await page.getByRole('button', { name: 'Borrar todos los datos' }).click()
  const danger = page.getByRole('dialog', { name: '¿Borrar todos los datos?' })
  await expect(danger.getByRole('button', { name: 'Borrar todo' })).toBeDisabled()
  await danger.getByRole('button', { name: 'Cancelar' }).click()
  // G5. Búsqueda del índice por título y palabras clave.
  await page.getByRole('link', { name: 'Ajustes' }).first().click()
  await page.getByRole('searchbox', { name: 'Buscar en Ajustes' }).fill('tema')
  await expect(page.getByTestId('settings-row-formato')).toBeVisible()
  await expect(page.getByTestId('settings-row-galeria')).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Buscar en Ajustes' }).fill('')

  // H1–H2. Cuenta de invitado y Pro sin precio ni compra (filas en lo alto de Ajustes).
  await page.getByRole('link', { name: 'Ajustes' }).first().click()
  await page.getByTestId('account-link').click()
  await expect(page.getByText('Modo invitado').first()).toBeVisible()
  await expect(page.getByText('No se muestran botones de Google o Apple', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: /Google|Apple/ })).toHaveCount(0)
  await nav(page, 'Ajustes').click()
  await page.getByRole('link', { name: 'Descubrir Pro' }).click()
  await expect(page.locator('#page-title')).toBeVisible()
  await expect(page.getByRole('button', { name: /Suscrib|Comprar|Restaurar compras/ })).toHaveCount(0)
})
