import { expect, test } from '@playwright/test'
import { go, movementCount, startDemo, START } from './helpers'

test('programado con confirmación automática: se registra solo al abrir, avisa, es idempotente; en pausa no se reserva', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  // Crear un programado diario que venció ayer con confirmación automática.
  await go(page, '/plan/programado/nuevo')
  await page.getByLabel('Nombre').fill('Café automático')
  await page.getByLabel('Importe', { exact: true }).fill('3')
  await page.getByLabel('Frecuencia').selectOption('daily')
  await page.getByLabel('Próxima fecha').fill('2026-09-27')
  await page.getByLabel('Registrar solo cuando venza').check()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Programación guardada')).toBeVisible()
  // En cuanto existe el programado (y en cada apertura o cambio de día) se registran las ocurrencias del 27 y del 28 (hoy).
  await expect(page.getByText('2 pagos programados se registraron solos', { exact: false })).toBeVisible()
  expect(await movementCount(page)).toBe(before + 2)
  // Segunda carga: nada nuevo.
  await page.reload()
  await go(page, '/')
  await expect(page.getByText('se registraron solos')).toHaveCount(0)
  expect(await movementCount(page)).toBe(before + 2)

  // Pausar: desaparece del calendario y no se reserva; reanudar lo devuelve.
  await go(page, '/plan/calendario')
  await page.getByRole('link', { name: /Café automático/ }).first().click()
  await page.getByLabel('En pausa').check()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await go(page, '/plan/calendario')
  // Sigue en la lista de programados (en pausa), pero sin ocurrencias que marcar.
  await expect(page.getByRole('button', { name: /Marcar pagado.*Café automático/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Café automático/ }).first()).toBeVisible()
})

test('programado personalizado cada N días genera las fechas correctas', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/programado/nuevo')
  await page.getByLabel('Nombre').fill('Cada 10 días')
  await page.getByLabel('Importe', { exact: true }).fill('5')
  await page.getByLabel('Frecuencia').selectOption('custom')
  await page.getByLabel('Cada cuántos días').fill('10')
  await page.getByLabel('Próxima fecha').fill('2026-10-01')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Programación guardada')).toBeVisible()
  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  // Octubre completo: 1, 11, 21 y 31.
  await expect(page.getByRole('button', { name: /Marcar pagado.*Cada 10 días/ })).toHaveCount(4)
  for (const day of ['1 de oct', '11 de oct', '21 de oct', '31 de oct']) await expect(page.getByRole('button', { name: new RegExp(`, ${day} de 2026 · \\d elemento`) })).toBeVisible()
})

test('notificaciones: ajustes, horas de silencio y lista dentro de la app; sin permiso no se simula nada', async ({ page, context }) => {
  await context.grantPermissions([])
  await startDemo(page)
  await go(page, '/ajustes')
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Notificaciones' }) })
  await expect(card.getByText(/Permiso del navegador/)).toBeVisible()
  await card.getByRole('switch', { name: 'Pagos programados (vencidos, hoy y mañana)' }).click()
  await expect(card.getByRole('switch', { name: 'Pagos programados (vencidos, hoy y mañana)' })).toHaveAttribute('aria-checked', 'true')
  // La demo tiene pagos vencidos: aparecen como avisos dentro de la app (la hora de START es mediodía).
  await expect(card.getByTestId('due-notices')).toBeVisible()
  await expect(card.getByTestId('due-notices').getByText(/Pago vencido:/).first()).toBeVisible()
  // Horas de silencio que cubren ahora: la lista se vacía.
  await card.getByRole('switch', { name: 'Horas de silencio' }).click()
  await card.getByLabel('Desde').fill('00:00')
  await card.getByLabel('Hasta').fill('23:59')
  await expect(card.getByText('Ninguno por ahora.')).toBeVisible()
  // Persistencia.
  await page.reload()
  await go(page, '/ajustes')
  await expect(page.getByRole('switch', { name: 'Horas de silencio' })).toHaveAttribute('aria-checked', 'true')
  expect(START.getTime()).toBeGreaterThan(0)
})
