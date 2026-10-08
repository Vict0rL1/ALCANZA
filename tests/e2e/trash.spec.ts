import { expect, test, type Page } from '@playwright/test'
import { openMoreMenu, available, go, movementCount, startDemo, openDetails } from './helpers'

async function openCoffee(page: Page) {
  await go(page, '/movimientos')
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('café')
  // «Café» de hoy (4.25), no «Café y pan».
  await page.locator('a.item', { hasText: '$4.25' }).filter({ hasText: 'Café' }).first().click()
  await expect(page.getByRole('heading', { name: 'Editar movimiento' })).toBeVisible()
}

test('papelera: eliminar, sigue ahí tras recargar, restaurar y eliminar definitivamente', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await openCoffee(page)
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText('Movimiento enviado a la papelera')).toBeVisible()
  expect(await movementCount(page)).toBe(before - 1)
  // Ya no cuenta en el saldo: el disponible sube 4.25.
  await expect(await available(page)).toHaveText('$141.03')

  // Persistente: tras recargar sigue en la papelera con sus detalles.
  await page.reload()
  await go(page, '/movimientos')
  await (await openMoreMenu(page)).getByRole('link', { name: /Papelera \(1\)/ }).click()
  await expect(page.getByRole('heading', { name: 'Papelera' })).toBeVisible()
  const entry = page.locator('.item', { hasText: 'Café' })
  await expect(entry).toContainText('Eliminado el')
  await expect(entry).toContainText('$4.25')
  await expect(entry).toContainText('Restaurantes y café')

  await entry.getByRole('button', { name: /^Restaurar/ }).click()
  await expect(page.getByText('Movimiento restaurado.')).toBeVisible()
  await expect(page.getByText('La papelera está vacía.')).toBeVisible()
  await expect(await available(page)).toHaveText('$136.78')

  // Eliminar definitivamente pide confirmación explícita.
  await openCoffee(page)
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await go(page, '/movimientos/papelera')
  await page.getByRole('button', { name: /^Eliminar definitivamente/ }).click()
  const dialog = page.getByRole('dialog', { name: '¿Eliminar definitivamente este movimiento?' })
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.locator('.item', { hasText: 'Café' })).toBeVisible()
  await page.getByRole('button', { name: /^Eliminar definitivamente/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente' }).click()
  await expect(page.getByText('1 movimiento eliminado definitivamente')).toBeVisible()
  await expect(page.getByText('La papelera está vacía.')).toBeVisible()
  expect(await movementCount(page)).toBe(before - 1)
})

test('papelera: «Deshacer» restaura; una transferencia vuelve completa a ambas cuentas', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Transferencia' }).check()
  await page.getByLabel('Importe').fill('20')
  await page.getByLabel('Hacia la cuenta').selectOption({ label: 'Ahorros' })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$116.78')

  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Cuenta de cheques → Ahorros' }).first().click()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(await available(page)).toHaveText('$136.78')
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText('Movimiento restaurado.')).toBeVisible()
  await expect(await available(page)).toHaveText('$116.78')

  // Ahorros también recuperó los 20.00 (el otro lado de la transferencia).
  await go(page, '/ajustes/cuentas')
  await expect(page.locator('.item', { hasText: 'Ahorros' }).locator('.item__amount')).toHaveText('$420.00')
})

test('papelera: un pago del calendario ya pagado de nuevo no se restaura dos veces; vaciar pide confirmación', async ({ page }) => {
  await startDemo(page)
  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: /Marcar pagado.*Recibo de luz/ }).first().click()
  await page.getByRole('dialog', { name: 'Marcar como pagado' }).getByRole('button', { name: 'Confirmar pago' }).click()
  await page.getByRole('button', { name: /Desmarcar.*Recibo de luz/ }).click()
  // Vuelve a estar vencido y reservado: el disponible no cambia en ningún momento.
  await expect(await available(page)).toHaveText('$136.78')
  await expect(page.getByText('Tienes 1 pago vencido sin marcar')).toBeVisible()

  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: /Marcar pagado.*Recibo de luz/ }).first().click()
  await page.getByRole('dialog', { name: 'Marcar como pagado' }).getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.getByText('«Recibo de luz» marcado como pagado').first()).toBeVisible()

  await go(page, '/movimientos/papelera')
  await page.getByRole('button', { name: /^Restaurar/ }).click()
  await expect(page.getByText(/ya está registrado con otro movimiento/)).toBeVisible()
  await expect(await available(page)).toHaveText('$136.78')

  await go(page, '/movimientos/papelera')
  await page.getByRole('button', { name: 'Vaciar papelera' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Vaciar la papelera?' })
  await expect(dialog).toContainText('Se eliminará definitivamente 1 movimiento')
  await dialog.getByRole('button', { name: 'Vaciar papelera' }).click()
  await expect(page.getByText('La papelera está vacía.')).toBeVisible()
})

test('papelera: reimportar un CSV no restaura en silencio lo que está en la papelera', async ({ page }) => {
  await startDemo(page)
  const csv = ['Date,Description,Amount', '09/27/2026,Farmacia central,-12.00', '09/27/2026,Librería,-8.00'].join('\n')
  const load = async () => {
    await go(page, '/movimientos/importar')
    await page.getByTestId('bank-file').setInputFiles({ name: 'banco.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.getByRole('heading', { name: '3. Revisa y confirma' })).toBeVisible()
  }
  await load()
  await page.getByRole('button', { name: 'Importar 2 movimientos' }).click()
  await expect(page.getByText('2 movimientos importados')).toBeVisible()

  await page.locator('a.item', { hasText: 'Librería' }).first().click()
  await page.getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByText('Movimiento enviado a la papelera')).toBeVisible()

  await load()
  await expect(page.getByText('1 en la papelera')).toBeVisible()
  await expect(page.getByText('1 ya importado')).toBeVisible()
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /Librería/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Importar 0 movimientos' })).toBeDisabled()
})
