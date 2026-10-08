import { expect, test, type Page } from '@playwright/test'
import { expectAboveFold, expectNoHorizontalScroll, expectNoMidWordBreaks, expectNoOverlap, expectNoTruncatedControls, go, openApp, pageHeightInScreens, setLanguage, setupFirstUse, startDemo, tabBarHeight } from './helpers'

/**
 * Guardas de maquetación y jerarquía (ronda 2 de pulido). Cada prueba corresponde a un punto
 * del informe: B1 palabras partidas, B2 botón flotante que tapa, B3 una sola entrada «Agregar»,
 * B10 controles recortados, C1 Inicio, C2 Movimientos, C3 Ajustes. Fallaban en c75532b.
 */

const LANGUAGES = ['Español', 'English', 'Português', 'Français'] as const
const INTERACTIVE = 'main a, main button, main input, main select, main summary, main [role="button"]'
const FLOATING = '.fab, .toasts .toast'

/** Preferencias de presentación del dispositivo (vista «esencial» o «completa») antes de cargar. */
const presetView = (page: Page, view: 'essential' | 'full') => page.addInitScript((v) => localStorage.setItem('clara.ui.v1', JSON.stringify({ view: v })), view)

test.describe('B1 · ninguna categoría se parte a media palabra', () => {
  for (const language of LANGUAGES) {
    test(`configuración inicial en ${language}`, async ({ page }) => {
      await openApp(page)
      await page.getByRole('radio', { name: language }).check()
      await page.getByRole('button', { name: /Configurar con mis datos|Set up with my data|Configurar com meus dados|Configurer avec mes données/ }).click()
      await expect(page.locator('.cat-option__label').first()).toBeVisible()
      await expectNoMidWordBreaks(page.locator('.cat-option__label'), `categorías en ${language}`)
    })
  }
  test('gestión de categorías en Ajustes', async ({ page }) => {
    await startDemo(page)
    await go(page, '/ajustes/categorias')
    await expectNoMidWordBreaks(page.locator('.list-row__title, .cat-option__label, .cat-chip__label, .cat-tile__label'))
  })
})

test.describe('B2 · nada flotante tapa un control', () => {
  for (const [name, prepare, route] of [
    ['Inicio (demo)', startDemo, '/'],
    ['Inicio (primer uso)', setupFirstUse, '/'],
    ['Planes', startDemo, '/plan/planes'],
  ] as const) {
    test(name, async ({ page }) => {
      await prepare(page)
      await go(page, route)
      await expectNoOverlap(page, page.locator(FLOATING), page.locator(INTERACTIVE), name)
    })
  }
})

test('B3 · una sola entrada «Agregar» en Inicio', async ({ page }) => {
  await startDemo(page)
  const controls = page.getByRole('link', { name: /^(Agregar|Add)\b/ }).or(page.getByRole('button', { name: /^(Agregar|Add)\b/ }))
  await expect(controls).toHaveCount(1)
})

test.describe('B10 · ningún control recorta su texto', () => {
  for (const route of ['/movimientos', '/plan/planes', '/ajustes']) {
    test(route, async ({ page }) => {
      await startDemo(page)
      await go(page, route)
      await expectNoTruncatedControls(page, route)
    })
  }
})

const PLAN_ROUTES = ['/plan/planes', '/plan/calendario', '/plan/metas', '/plan/periodos', '/plan/proyeccion']

test.describe('F3 · Plan sin desplazamiento horizontal ni controles recortados, en los cuatro idiomas', () => {
  for (const language of LANGUAGES) {
    test(language, async ({ page }) => {
      test.setTimeout(120_000)
      await startDemo(page)
      await setLanguage(page, language)
      await go(page, '/plan/planes')
      const detail = (await page.locator('a.plan-card').first().getAttribute('href'))?.replace(/^#/, '')
      for (const route of [...PLAN_ROUTES, ...(detail ? [detail] : [])]) {
        await go(page, route)
        await expectNoHorizontalScroll(page, `${language} ${route}`)
        await expectNoTruncatedControls(page, `${language} ${route}`)
      }
    })
  }
})

test.describe('C1 · Inicio: la cifra principal primero y cabe en pocas pantallas', () => {
  test('primer uso: la tarjeta «Puedes gastar» es la primera', async ({ page }) => {
    await setupFirstUse(page)
    const firstCard = page.locator('.home-grid .card').first()
    await expect(firstCard).toHaveClass(/\bhero\b/)
  })
  test('demo: cabecera, cifra, por día, ingresos/gastos y el primer aviso en la primera pantalla', async ({ page }, info) => {
    await startDemo(page)
    await expectAboveFold(page, page.locator('.topbar'), 'cabecera')
    await expectAboveFold(page, page.getByTestId('available'), 'cifra principal')
    await expectAboveFold(page, page.locator('.stat__value').first(), 'por día')
    await expectAboveFold(page, page.getByTestId('period-income'), 'caja INGRESOS')
    await expectAboveFold(page, page.getByTestId('period-expenses'), 'caja GASTOS')
    // A 320 × 640 la primera pantalla termina con la cifra; el aviso llega en la siguiente (DECISIONS).
    if (info.project.name !== 'celular-pequeno') await expectAboveFold(page, page.locator('main .alert').first(), 'primer aviso')
  })
  test('demo: ≤ 2 pantallas en «Esencial» y ≤ 3 en «Completa»', async ({ page }, info) => {
    await presetView(page, 'essential')
    await startDemo(page)
    // A 320 × 640 el aviso, los favoritos y «Más herramientas» ocupan más alto: hasta 2,5 (DECISIONS).
    expect(await pageHeightInScreens(page), 'vista esencial').toBeLessThanOrEqual(info.project.name === 'celular-pequeno' ? 2.5 : 2)
  })
  test('demo: ≤ 3 pantallas en «Completa»', async ({ page }) => {
    await presetView(page, 'full')
    await startDemo(page)
    expect(await pageHeightInScreens(page), 'vista completa').toBeLessThanOrEqual(3)
  })
})

test('C2 · Movimientos: título, búsqueda y al menos 3 filas en la primera pantalla', async ({ page }, info) => {
  await startDemo(page)
  await go(page, '/movimientos')
  await expectAboveFold(page, page.locator('#page-title'), 'título')
  await expectAboveFold(page, page.getByRole('searchbox'), 'búsqueda')
  const limit = page.viewportSize()!.height - (await tabBarHeight(page))
  const rows = await page.locator('.tx-group .item').evaluateAll((els, max) => els.filter((el) => el.getBoundingClientRect().bottom <= max).length, limit)
  // A 320 × 640 caben el título, la búsqueda, el resumen del mes y la primera fila (DECISIONS).
  expect(rows, 'filas de movimientos visibles sin desplazarse').toBeGreaterThanOrEqual(info.project.name === 'celular-pequeno' ? 1 : 3)
})

test.describe('C3 · Ajustes: índice corto y subpantallas acotadas', () => {
  test('índice ≤ 2,5 pantallas', async ({ page }, info) => {
    await startDemo(page)
    await go(page, '/ajustes')
    // A 320 × 640 las filas con valor ocupan dos líneas: hasta 3 pantallas (DECISIONS).
    expect(await pageHeightInScreens(page)).toBeLessThanOrEqual(info.project.name === 'celular-pequeno' ? 3 : 2.5)
  })
  for (const id of ['copia', 'notificaciones', 'cuentas', 'programados']) {
    test(`subpantalla ${id} ≤ 4 pantallas`, async ({ page }) => {
      await startDemo(page)
      await go(page, `/ajustes/${id}`)
      await expect(page.locator('#page-title')).not.toHaveText(/^Ajustes$/)
      expect(await pageHeightInScreens(page)).toBeLessThanOrEqual(4)
    })
  }
})
