import { expect, test } from '@playwright/test'
import { openApp } from './helpers'

test('configuración inicial con mis datos y recuperación tras recargar', async ({ page }) => {
  await openApp(page)
  await expect(page.getByRole('heading', { name: 'Hola, esto es Clara' })).toBeVisible()
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  // Paso de categorías: las propuestas vienen marcadas; se continúa.
  await expect(page.getByRole('heading', { name: 'Tus categorías' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Saldo: sin importe muestra un error claro.
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Escribe un importe.')).toBeVisible()
  await page.getByLabel('Saldo disponible').fill('1200')
  // Esta prueba comprueba la fórmula «hasta mi próximo ingreso» (el periodo mensual es el predeterminado).
  await page.getByLabel('Periodo del presupuesto').selectOption({ label: 'Hasta mi próximo ingreso' })
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Paso 2: próximo ingreso (el día del ingreso no cuenta en el periodo).
  await page.getByLabel('Importe esperado').fill('800')
  await page.getByLabel('Fecha del próximo ingreso').fill('2026-10-09')
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Paso 3: un pago pendiente.
  await page.getByRole('button', { name: 'Agregar un pago' }).click()
  await page.getByLabel('Nombre').fill('Renta')
  await page.getByLabel('Importe', { exact: true }).fill('600')
  await page.getByLabel('Próxima fecha de pago').fill('2026-10-01')
  await page.getByRole('button', { name: 'Continuar' }).click()

  // Paso 4: reserva de emergencia dentro del saldo.
  await page.getByLabel('Cantidad reservada').fill('200')
  await page.getByRole('button', { name: 'Ver resumen' }).click()

  // 1200 − 600 − 200 = 400
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible()
  await expect(page.locator('.hero__value')).toHaveText('$400.00')
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()

  await expect(page.getByTestId('available')).toHaveText('$400.00')
  await expect(page.locator('.hero__sub')).toContainText('11 días')
  await expect(page.locator('.stat__value').first()).toHaveText('$36.36') // 400 / 11 redondeado hacia abajo
  await expect(page.getByText('Modo demostración')).toHaveCount(0)

  // Recuperación tras recargar: los datos siguen ahí.
  await page.reload()
  await expect(page.getByTestId('available')).toHaveText('$400.00')
})

test('sin fecha de ingreso pide un horizonte y no divide entre cero', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  // Paso de categorías: las propuestas vienen marcadas; se continúa.
  await expect(page.getByRole('heading', { name: 'Tus categorías' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Saldo disponible').fill('-25,50')
  await page.getByLabel('Periodo del presupuesto').selectOption({ label: 'Hasta mi próximo ingreso' })
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('radio', { name: 'No tengo fecha' }).check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ver resumen' }).click()
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()
  // Saldo negativo aceptado; horizonte de 14 días elegido por defecto.
  await expect(page.getByTestId('available')).toHaveText('-$25.50')
  await expect(page.getByText('Te faltan $25.50 para cubrir pagos y apartados')).toBeVisible()
  await expect(page.locator('.stat__value').first()).toHaveText('$0.00')
})

test('camino corto: saldo + próximo ingreso → resultado provisional sin pasos opcionales', async ({ page }) => {
  await openApp(page)
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  // Paso de categorías: las propuestas vienen marcadas; se continúa.
  await expect(page.getByRole('heading', { name: 'Tus categorías' })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Saldo disponible').fill('500')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Importe esperado').fill('800')
  await page.getByLabel('Fecha del próximo ingreso').fill('2026-10-08')
  await page.getByRole('button', { name: 'Continuar' }).click()
  // Sin pagos: se puede ver el resultado ya (el apartado se configura después).
  await page.getByRole('button', { name: 'Ver mi resultado ahora' }).click()
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible()
  await expect(page.locator('.hero__value')).toHaveText('$500.00') // el ingreso futuro no se suma
  await expect(page.getByText('Cálculo provisional')).toBeVisible()
  await expect(page.getByText(/No agregaste pagos próximos/)).toBeVisible()
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()
  await expect(page.getByTestId('available')).toHaveText('$500.00')
  await expect(page.getByText('Modo demostración')).toHaveCount(0)
})
