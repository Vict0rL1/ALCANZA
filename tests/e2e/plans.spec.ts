import { expect, test } from '@playwright/test'
import { go, showAllNotices, startDemo } from './helpers'

// Demo (28-sep): gastos de «Restaurantes y café» en septiembre = 14.75 + 6.25 + 11.80 + 4.25 = 37.05.
test('planes: crear un límite, verlo superado en Inicio, pendientes y detalle; editar, pausar y eliminar con deshacer', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/planes')
  // La demo ya tiene metas: la lista las muestra como planes de ahorro; el límite se crea desde el botón flotante.
  await expect(page.getByTestId('plan-list')).toBeVisible()
  await expect(page.getByTestId('plan-list').locator('li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Nuevo plan' }).click()
  await page.getByTestId('plan-create-sheet').getByRole('link', { name: /Controlar un gasto/ }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo límite' })).toBeVisible()
  await page.getByLabel('Límite máximo').fill('30')
  await page.getByTestId('plan-categories').click()
  await page.getByTestId('category-picker').getByRole('option', { name: 'Restaurantes y café' }).first().click()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText('1 seleccionadas. Toca para añadir o quitar.')).toBeVisible()
  await expect(page.getByText(/Periodo en curso: /)).toBeVisible()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Plan guardado')).toBeVisible()

  // Detalle: gasto del mes frente al límite, superado por 7.05; movimientos del periodo.
  await expect(page.getByTestId('plan-spent')).toContainText('$37.05')
  await expect(page.getByText('Superado por $7.05').first()).toBeVisible()
  await expect(page.getByTestId('plan-transactions').locator('li')).toHaveCount(4)
  await page.getByRole('button', { name: 'Ver tabla' }).click()
  await expect(page.getByRole('table')).toBeVisible()

  // Lista con resumen automático.
  await go(page, '/plan/planes')
  await expect(page.getByTestId('plans-summary')).toContainText('Tienes 1 límite superado')
  await expect(page.getByTestId('plan-list')).toContainText('Restaurantes y café')

  // Inicio y pendientes avisan; nada cambia en el disponible.
  await go(page, '/')
  await showAllNotices(page)
  await expect(page.getByText('Te pasaste del límite en 1 categoría')).toBeVisible()
  await expect(page.getByTestId('available')).toHaveText('$136.78')
  await go(page, '/pendientes')
  await expect(page.getByText('«Restaurantes y café» superó su límite')).toBeVisible()

  // Editar a 50: quedan 12.95. Pausar y eliminar con deshacer.
  await go(page, '/plan/planes')
  await page.getByTestId('plan-list').getByRole('link', { name: /Restaurantes y café/ }).click()
  await page.getByRole('link', { name: 'Editar' }).click()
  await page.getByLabel('Límite máximo').fill('50')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Quedan $12.95').first()).toBeVisible()
  await page.getByRole('button', { name: 'Pausar' }).click()
  await expect(page.getByText('En pausa').first()).toBeVisible()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText('Plan eliminado')).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByTestId('plan-list')).toContainText('Restaurantes y café')
})

test('planes: un periodo personalizado ya vencido se cierra solo con resultado y se puede repetir; alertas de planes en Ajustes', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/planes/nuevo')
  await page.getByLabel('Límite máximo').fill('800')
  await page.getByLabel('Nombre (opcional)').fill('Semana de prueba')
  await page.getByLabel('Periodo').selectOption('custom')
  await page.getByLabel('Inicio del periodo personalizado').fill('2026-09-01')
  await page.getByLabel('Fin del periodo personalizado').fill('2026-09-07')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  // En el celular solo se ve un aviso: «Plan guardado» puede quedar sustituido de inmediato por el del cierre.
  await expect(page.getByText(/Plan guardado|Se cerró 1 plan/).first()).toBeVisible()
  // El cierre corre al tener planes: 1-7 sep terminó antes de hoy. Gasto de todas las categorías en esa semana:
  // 650.00 + 52.30 + 11.99 + 3.35 + 14.75 + 28.00 = 760.39 → dentro del límite por 39.61.
  await expect(page.getByText('Se cerró 1 plan')).toBeVisible()
  await expect(page.getByTestId('plan-result')).toContainText('Te quedaron $39.61 sin gastar')
  await page.getByRole('button', { name: 'Repetir' }).click()
  await expect(page.getByText('Plan repetido para el periodo actual')).toBeVisible()
  await expect(page.getByTestId('plan-spent')).toContainText('$800.00')
  await expect(page.getByRole('heading', { name: 'Semana de prueba' })).toBeVisible()
  await go(page, '/plan/planes?vista=completados')
  await expect(page.getByTestId('plan-list')).toContainText('Dentro del límite, sobraron $39.61')

  await go(page, '/ajustes?seccion=notificaciones')
  await showAllNotices(page)
  const toggle = page.getByRole('switch', { name: 'Alertas de planes (80 % y 100 %)' })
  await expect(toggle).toBeVisible()
})

test('metas en Planes: icono, color y aporte periódico; «Aportar ahora» propone el importe y no aparta nada solo', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/metas/nueva?returnTo=/plan/planes')
  await page.getByLabel('Nombre').fill('Viaje')
  await page.getByLabel('Importe objetivo').fill('300')
  await page.getByRole('button', { name: 'plane', exact: true }).click()
  await page.getByRole('button', { name: 'Celeste' }).click()
  await page.getByLabel('Aporte periódico (opcional)').fill('25')
  await page.getByRole('radio', { name: 'Semanal' }).check()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Meta guardada')).toBeVisible()
  const card = page.getByTestId(/^goal-card-/).filter({ hasText: 'Viaje' })
  await expect(card).toContainText('$25.00 por semana')
  await expect(card).toContainText('$0.00 / $300.00')
  await go(page, '/plan/metas')
  await page.getByRole('button', { name: /Aportar ahora \(\$25\.00\)/ }).click()
  await expect(page.getByRole('dialog').getByLabel('Importe')).toHaveValue('25.00')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByTestId('free-to-allocate')).toHaveText('$136.78')
})
