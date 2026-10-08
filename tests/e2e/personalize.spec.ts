import { expect, test } from '@playwright/test'
import { go, startDemo, storedData } from './helpers'

test('modo privado: oculta importes en pantalla y en etiquetas accesibles, sin cambiar datos ni cifras', async ({ page }) => {
  await startDemo(page)
  await go(page, '/')
  await expect(page.getByTestId('available')).toHaveText('$136.78')
  const before = await storedData(page)

  await page.getByTestId('privacy-toggle').click()
  await expect(page.getByTestId('privacy-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('available')).toHaveText('$-----')
  await expect(page.getByText('no es una contraseña ni cifra tus datos')).toBeVisible()
  // Ningún importe visible ni en atributos accesibles de Inicio.
  const main = page.locator('#main')
  await expect(main).not.toContainText('$136.78')
  const labels = await main.evaluate((el) => [...el.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label')).join(' '))
  expect(labels).not.toMatch(/\$\d/)
  await expect(page.getByTestId('chart-hidden').first()).toBeVisible()
  // También en listas y en otras pantallas; persiste al recargar.
  await go(page, '/movimientos')
  await expect(page.locator('#main')).not.toContainText(/\$\d/)
  await page.reload()
  await go(page, '/')
  await expect(page.getByTestId('available')).toHaveText('$-----')
  // No cambia lo guardado.
  expect(await storedData(page)).toBe(before)

  // Nivel 2 (discreto): sigue oculto y además difumina descripciones; el tercer toque vuelve a mostrar todo.
  await page.getByTestId('privacy-toggle').click()
  await expect(page.getByTestId('privacy-toggle')).toHaveAttribute('data-privacy-level', '2')
  await expect(page.getByTestId('available')).toHaveText('$-----')
  await expect(page.locator('html')).toHaveClass(/is-discreet/)
  await page.getByTestId('privacy-toggle').click()
  await expect(page.getByTestId('available')).toHaveText('$136.78')
  await expect(page.locator('html')).not.toHaveClass(/is-discreet/)
})

/** Solo lo financiero: ocultar la revisión semanal es un ajuste guardado (cambia la revisión). */
const financial = (raw: string | null) => {
  const d = JSON.parse(raw ?? '{}')
  return JSON.stringify([d.accounts, d.transactions, d.schedules, d.goals, d.trash, d.reconciliations, d.incomeDistributions, d.periodBudgets])
}

test('personalizar Inicio: orden con botones, ocultar secciones, vista esencial y restaurar sin tocar datos', async ({ page }) => {
  await startDemo(page)
  const before = financial(await storedData(page))
  await go(page, '/ajustes?seccion=personalizar')
  await page.getByRole('button', { name: 'Subir «Metas»' }).click()
  await page.getByRole('button', { name: 'Subir «Metas»' }).click()
  await page.getByLabel('Mostrar la revisión semanal en Inicio').uncheck()
  await page.getByRole('checkbox', { name: 'Registrar ingreso' }).check()

  await go(page, '/')
  const order = await page.getByTestId('home-sections').evaluate((el) => [...el.querySelectorAll('[data-section]')].map((n) => n.getAttribute('data-section')))
  expect(order).toEqual(['inbox', 'reminders', 'goals', 'upcoming', 'freshness'])
  await expect(page.getByRole('link', { name: 'Registrar ingreso' })).toBeVisible()

  // Vista esencial: lo esencial sigue ahí y el resto es accesible desde «Más herramientas».
  await go(page, '/ajustes?seccion=personalizar')
  await page.getByRole('radio', { name: 'Esencial' }).check()
  await go(page, '/')
  await expect(page.getByTestId('available')).toHaveText('$136.78')
  await expect(page.getByText('¿Cómo se calculó?').first()).toBeVisible()
  await expect(page.getByRole('link', { name: '¿Me alcanza?' }).first()).toBeVisible()
  await expect(page.getByTestId('home-sections')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Más herramientas' })).toBeVisible()

  // Restaurar diseño: vuelve todo y los datos financieros no cambian.
  await go(page, '/ajustes?seccion=personalizar')
  await page.getByRole('button', { name: 'Restaurar diseño predeterminado' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restaurar diseño predeterminado' }).click()
  await expect(page.getByText('Diseño predeterminado restaurado')).toBeVisible()
  await go(page, '/')
  await expect(page.getByTestId('home-sections')).toBeVisible()
  await expect(page.getByTestId('week-home')).toBeVisible()
  expect(financial(await storedData(page))).toBe(before)
})
