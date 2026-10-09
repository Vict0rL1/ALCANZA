import { expect, test } from '@playwright/test'
import { go, startDemo } from './helpers'

/**
 * Ronda 4 · preparación de la beta: versión visible (H1) y manifiesto instalable con sus iconos
 * precacheados (H2).
 */

test('H1 · Acerca de muestra la versión 1.0.0-beta.1 y el hash corto de la compilación', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes/acerca')
  await expect(page.getByText(/Clara 1\.0\.0-beta\.1 · prototipo local/)).toBeVisible()
  await expect(page.getByTestId('about-build')).toHaveText(/^Compilación: ([0-9a-f]{7}|dev)$/)
})
