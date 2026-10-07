import { expect, test } from '@playwright/test'
import { go, startDemo } from './helpers'

test('estadísticas: periodo, tres cifras, donut con enlace al historial, barras con tooltip, tendencia, top 5, promedio y saldo futuro', async ({ page }) => {
  await startDemo(page)
  await go(page, '/')
  await page.getByTestId('stats-link').click()
  await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible()
  // Ingresos de la demo en septiembre: 640.00 + 598.10 (el del 30-sep es previsto y no cuenta).
  await expect(page.getByTestId('stats-income')).toHaveText('$1,238.10')
  await expect(page.getByTestId('stats-tiles')).toContainText('Neto')

  // Donut: lista por categoría; tocar una lleva al historial filtrado por categoría y fechas.
  const dining = page.getByRole('button', { name: /Restaurantes y café/ })
  await expect(dining).toContainText('$37.05')
  await dining.click()
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveValue('dining')
  await expect(page.getByLabel('Desde')).toHaveValue('2026-09-01')
  await expect(page.getByLabel('Hasta')).toHaveValue('2026-09-30')

  await go(page, '/estadisticas')
  // Barras: el tooltip muestra el periodo activo con formatMoney (nunca «Proyectado en d»).
  await expect(page.getByTestId('bars-tooltip')).toContainText('septiembre de 2026 — Ingresos $1,238.10 · Gastos $1,243.18')
  await page.getByRole('button', { name: /^agosto de 2026/ }).click()
  await expect(page.getByTestId('bars-tooltip')).toContainText('agosto de 2026 — Ingresos $0.00')
  await page.getByRole('button', { name: 'Ver tabla' }).first().click()
  await expect(page.getByRole('table').first()).toBeVisible()

  // Top 5, promedio diario y día de la semana.
  await expect(page.getByTestId('stats-top').locator('li').first()).toContainText('Renta')
  await expect(page.getByTestId('stats-daily')).toContainText(/^\$[\d,]+\.\d\d$/)
  await expect(page.getByTestId('stats-weekday')).toContainText(/El día con más gasto es el .* \(\$[\d,]+\.\d\d\)\./)

  // Saldo futuro con banda y marcas; tooltip en 90 días.
  await expect(page.getByTestId('future-tooltip')).toContainText(/^En 90 días: -?\$[\d,]+\.\d\d \(entre -?\$[\d,]+\.\d\d y -?\$[\d,]+\.\d\d\)$/)
  await page.getByRole('button', { name: /^Hoy: / }).click()
  await expect(page.getByTestId('future-tooltip')).toContainText(/^Hoy: /)

  // Cambiar de periodo: semana y periodo anterior.
  await page.getByRole('button', { name: 'Semanal' }).click()
  await expect(page.getByText('Del 28 sep al 4 oct', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Periodo anterior' }).click()
  await expect(page.getByText('Del 21 sep al 27 sep', { exact: false })).toBeVisible()
})

test('estadísticas: sin movimientos muestra el estado vacío y el saldo futuro queda oculto; modo privado oculta gráficos', async ({ page }) => {
  await startDemo(page)
  await go(page, '/estadisticas?periodo=month&fecha=2026-05-10')
  await expect(page.getByText('Sin movimientos en este periodo')).toBeVisible()
  await expect(page.getByText('Sin comparación').first()).toBeVisible()
  await go(page, '/ajustes?seccion=personalizar')
  await page.getByRole('checkbox', { name: 'Modo privado (ocultar importes en pantalla)' }).check()
  await go(page, '/estadisticas')
  await expect(page.getByTestId('chart-hidden').first()).toBeVisible()
  await expect(page.getByTestId('stats-income')).toContainText('-----')
})
