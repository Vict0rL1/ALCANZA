import { expect, test } from '@playwright/test'
import { go, startDemo } from './helpers'
import { SETTINGS_SECTIONS } from '../../src/ui/screens/settings/sections'

/**
 * B6: cada enlace profundo de Ajustes lleva a su sección (antes, «notificaciones» apuntaba a un id
 * inexistente y «reglas» no estaba en el índice). Los ids vienen del mapa SETTINGS_SECTIONS.
 */
test('todos los enlaces profundos de Ajustes muestran su sección', async ({ page }) => {
  test.setTimeout(90_000)
  await startDemo(page)
  for (const section of SETTINGS_SECTIONS) {
    if (section.href) {
      await go(page, section.href)
      await expect(page.locator('#page-title'), section.id).toBeVisible()
      continue
    }
    await go(page, `/ajustes?seccion=${section.id}`)
    await expect(page.locator(`#${section.id}`), section.id).toBeInViewport()
  }
  // Un id antiguo guardado en un marcador sigue funcionando.
  await go(page, '/ajustes?seccion=reset-title')
  await expect(page.locator('#reinicio')).toBeInViewport()
})

test('el índice de Ajustes enlaza cada sección exactamente una vez', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  const toc = page.getByRole('navigation', { name: 'En esta página' })
  for (const section of SETTINGS_SECTIONS) {
    const target = section.href ?? `/ajustes?seccion=${section.id}`
    await expect(toc.locator(`a[href="#${target}"]`), section.id).toHaveCount(1)
  }
})
