import { mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { go, openAddSheet, openApp, setupFirstUse, startDemo } from '../e2e/helpers'

/**
 * Captura cada pantalla principal en los tres tamaños y los dos temas, con la demo y con el
 * estado de primer uso de `docs/MANUAL-TEST.md`. Salida: docs/screenshots/<etiqueta>/.
 * No comprueba nada: existe para comparar «antes» y «después» a ojo (docs/VISUAL-QA.md).
 */
const LABEL = process.env.SHOTS_LABEL ?? 'after'
const OUT = `docs/screenshots/${LABEL}`
const THEMES = ['dark', 'light'] as const

// Pantalla visible en PNG; página completa en JPEG (una página de Ajustes de 12 000 px pesaba 1,3 MB en PNG).
const file = (project: string, theme: string, screen: string, full = false) => `${OUT}/${project}-${theme}-${screen}${full ? '-full.jpg' : '.png'}`

async function shot(page: Page, project: string, theme: string, screen: string) {
  await page.waitForTimeout(250)
  await page.mouse.move(0, 0)
  await page.screenshot({ path: file(project, theme, screen), fullPage: false })
  await page.screenshot({ path: file(project, theme, screen, true), fullPage: true, type: 'jpeg', quality: 70 })
}

for (const theme of THEMES) {
  test.describe(`tema ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      mkdirSync(OUT, { recursive: true })
      await page.addInitScript((t) => localStorage.setItem('clara.theme', t), theme)
    })

    test('primer uso: bienvenida, categorías e Inicio', async ({ page }, info) => {
      const p = info.project.name
      await openApp(page)
      await expect(page.getByRole('heading', { name: 'Hola, esto es Clara' })).toBeVisible()
      await shot(page, p, theme, 'bienvenida')
      await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
      await expect(page.getByRole('heading', { name: 'Tus categorías' })).toBeVisible()
      await shot(page, p, theme, 'setup-categorias')
      await page.goto('/')
      await setupFirstUse(page)
      await shot(page, p, theme, 'inicio-primer-uso')
    })

    test('demo: Inicio, registro, historial, plan, estadísticas, ajustes, cuenta y Pro', async ({ page }, info) => {
      const p = info.project.name
      test.setTimeout(180_000)
      await startDemo(page)
      await shot(page, p, theme, 'inicio-demo')
      await openAddSheet(page)
      await shot(page, p, theme, 'hoja-agregar')
      await page.keyboard.press('Escape')

      await go(page, '/movimientos/nuevo')
      await expect(page.getByLabel('Importe', { exact: true })).toBeVisible()
      await shot(page, p, theme, 'formulario-movimiento')

      await go(page, '/asistente')
      await page.getByLabel('Texto').fill('café 45 en Starbucks, uber 80 ayer y cobré 500 de freelance')
      await page.getByRole('button', { name: 'Analizar' }).click()
      await expect(page.getByTestId('assistant-preview')).toBeVisible()
      await shot(page, p, theme, 'asistente-vista-previa')

      await go(page, '/movimientos')
      await shot(page, p, theme, 'movimientos')

      for (const tab of ['planes', 'calendario', 'metas', 'periodos', 'proyeccion']) {
        await go(page, `/plan/${tab}`)
        await shot(page, p, theme, `plan-${tab}`)
      }

      await go(page, '/estadisticas')
      await expect(page.getByTestId('stats-tiles')).toBeVisible()
      await shot(page, p, theme, 'estadisticas')

      await go(page, '/ajustes')
      await shot(page, p, theme, 'ajustes')
      await go(page, '/ajustes/categorias')
      await shot(page, p, theme, 'ajustes-categorias')
      await go(page, '/ajustes?seccion=copia')
      await shot(page, p, theme, 'ajustes-copia')
      await go(page, '/ajustes?seccion=notificaciones')
      await shot(page, p, theme, 'ajustes-notificaciones')

      await go(page, '/cuenta')
      await shot(page, p, theme, 'cuenta')
      await go(page, '/pro')
      await shot(page, p, theme, 'pro')
    })
  })
}
