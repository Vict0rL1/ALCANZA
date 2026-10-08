import { expect, test } from '@playwright/test'
import { go, movementCount, startDemo } from './helpers'

/**
 * B4: en el celular solo se ve un aviso a la vez (el nuevo sustituye al anterior) y la acción
 * «Deshacer» del aviso sustituido sigue disponible unos segundos; borrar en lote se deshace entero.
 */
async function trashRows(page: Parameters<typeof go>[0], count: number) {
  await page.getByRole('button', { name: 'Seleccionar' }).click()
  const boxes = page.locator('.tx-group input[type="checkbox"]')
  for (let i = 0; i < count; i++) await boxes.nth(i).check()
  await page.getByRole('button', { name: 'Enviar a la papelera' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar a la papelera' }).click()
}

test('tres avisos seguidos: uno visible en el celular (dos en escritorio) y el «Deshacer» anterior se conserva', async ({ page }, info) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/movimientos')
  for (let i = 0; i < 3; i++) {
    await trashRows(page, 1)
    await expect(page.getByText('1 movimiento enviado a la papelera').last()).toBeVisible()
  }
  const narrow = info.project.name !== 'escritorio'
  await expect(page.locator('.toasts .toast:not(.toast--held)')).toHaveCount(narrow ? 1 : 2)
  await expect(page.getByTestId('toast-held')).toBeVisible()
  // El botón conservado deshace el borrado anterior. Su aviso «restaurado» sustituye al visible,
  // cuyo «Deshacer» pasa a su vez al botón conservado: un segundo toque deshace el último borrado.
  await page.getByTestId('toast-held').getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText('1 movimiento restaurado').first()).toBeVisible()
  await expect(page.locator('.summary-line')).toContainText(`${before - 2} movimientos`)
  await page.getByRole('button', { name: 'Deshacer' }).first().click()
  await expect(page.locator('.summary-line')).toContainText(`${before - 1} movimientos`)
  expect(await movementCount(page)).toBe(before - 1)
})

test('borrar en lote tiene «Deshacer» y devuelve exactamente los mismos movimientos', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/movimientos')
  await trashRows(page, 3)
  await expect(page.getByText('3 movimientos enviados a la papelera')).toBeVisible()
  await expect(page.locator('.summary-line')).toContainText(`${before - 3} movimientos`)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText('3 movimientos restaurados')).toBeVisible()
  expect(await movementCount(page)).toBe(before)
})
