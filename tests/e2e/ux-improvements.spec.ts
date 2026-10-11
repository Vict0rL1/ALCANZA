import { expect, test } from '@playwright/test'
import { account, baseData } from '../../src/test/fixtures'
import { go, openDetails, seedStoredData, startDemo } from './helpers'

/** Mejoras de uso de la auditoría 2026-10-09 (§8, decisión 139): textos y pistas, sin cambios de cálculo. */

test('importar: un pago de tarjeta se señala y queda desmarcado, en el banco y en la tarjeta; el resto se importa igual', async ({ page }) => {
  const data = baseData({
    accounts: [
      account({ id: 'main', name: 'Principal', anchor: { amountMinor: 100000, date: '2026-09-10', setAt: '2026-09-10T15:00:00.000Z' } }),
      account({ id: 'visa', name: 'Visa', kind: 'credit', anchor: { amountMinor: -40000, date: '2026-09-10', setAt: '2026-09-10T15:00:00.000Z' } }),
    ],
  })
  await seedStoredData(page, data)
  await go(page, '/movimientos/importar')
  const bank = ['Fecha,Concepto,Importe', '2026-09-20,PAGO TARJETA VISA 1234,-200.00', '2026-09-21,Supermercado,-30.00'].join('\r\n')
  await page.getByTestId('bank-file').setInputFiles({ name: 'banco.csv', mimeType: 'text/csv', buffer: Buffer.from(bank) })
  await expect(page.getByRole('heading', { name: '3. Revisa y confirma' })).toBeVisible()
  await expect(page.getByText('Posible pago de tarjeta')).toBeVisible()
  await expect(page.getByTestId('import-card-payment-note')).toContainText('1 fila parece el pago de una tarjeta')
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /PAGO TARJETA VISA/ })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: /PAGO TARJETA VISA/ })).toBeEnabled()
  await expect(page.getByRole('checkbox', { name: /Supermercado/ })).toBeChecked()
  await expect(page.getByRole('button', { name: /^Importar 1 movimiento/ })).toBeEnabled()

  // En el extracto de la tarjeta, el pago recibido tampoco es un ingreso.
  await page.getByLabel('Cuenta a la que pertenece el archivo').selectOption('visa')
  const card = ['Date,Description,Amount', '2026-09-22,PAYMENT - THANK YOU,200.00', '2026-09-22,Coffee,-4.00'].join('\r\n')
  await page.getByTestId('bank-file').setInputFiles({ name: 'tarjeta.csv', mimeType: 'text/csv', buffer: Buffer.from(card) })
  await expect(page.getByRole('heading', { name: '3. Revisa y confirma' })).toBeVisible()
  await expect(page.getByText('Posible pago de tarjeta')).toBeVisible()
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /PAYMENT - THANK YOU/ })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Coffee/ })).toBeChecked()
})

test('quincena del calendario frente a «cada 2 semanas»: la etiqueta lo dice y el aviso solo aparece con ese periodo', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes/formato')
  const period = page.getByLabel('Periodo del presupuesto')
  await expect(period.locator('option[value="biweek"]')).toHaveText('Quincena del calendario (1–15 y 16–fin)')
  await period.selectOption('biweek')
  await expect(page.getByText('La quincena del calendario va del 1 al 15 y del 16 a fin de mes')).toBeVisible()
  await expect(page.getByTestId('current-period')).toBeVisible()
  await period.selectOption('month')
  await expect(page.getByText('La quincena del calendario va del 1 al 15')).toHaveCount(0)
  // La frecuencia de un programado se llama «Cada 2 semanas», no «quincenal».
  await go(page, '/plan/programado/nuevo')
  await expect(page.getByLabel('Frecuencia').locator('option[value="biweekly"]')).toHaveText('Cada 2 semanas')
})

test('ejemplos y explicaciones: apartados virtuales, copia exportada frente a copias locales y qué conserva «Borrar todo»', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/metas')
  // «¿Por qué?» es un <summary> con el texto largo oculto en pantallas estrechas: se abre por su contenedor.
  await page.locator('.why__more > summary').first().click()
  await expect(page.getByText('el banco sigue mostrando 1 000 y Clara muestra 700 para gastar')).toBeVisible()
  await go(page, '/ajustes/copia')
  await expect(page.getByText('Es la única copia que sobrevive si pierdes este dispositivo')).toBeVisible()
  await go(page, '/ajustes/reinicio')
  await page.getByRole('button', { name: 'Borrar todos los datos' }).click()
  const danger = page.getByRole('dialog', { name: '¿Borrar todos los datos?' })
  await expect(danger).toContainText('Se conservan las copias locales automáticas')
  await danger.getByRole('button', { name: 'Cancelar' }).click()
})
