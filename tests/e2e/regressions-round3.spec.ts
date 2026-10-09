import { expect, test, type Page } from '@playwright/test'
import { expectNoHorizontalScroll, go, movementCount, openAddSheet, openApp, setLanguage, startDemo, storedData, type UiLanguage } from './helpers'

/**
 * Regresiones de la ronda 3: lo que la revisión externa encontró (F1 pegado de varias líneas,
 * F2 comas en importes, F3 desplazamiento horizontal en Plan, F4 aviso en el idioma anterior) y lo
 * que ya funcionaba y debe seguir así (doble toque en Guardar, deshacer tras recargar, modo privado
 * en seis pantallas, teclado en la hoja «+», la historia COP con formato colombiano).
 */

const LANGUAGES: UiLanguage[] = ['Español', 'English', 'Português', 'Français']
const ROUTES = ['/', '/movimientos', '/movimientos/nuevo', '/asistente', '/plan/planes', '/plan/calendario', '/plan/metas', '/plan/periodos', '/plan/proyeccion', '/estadisticas', '/ajustes', '/ajustes/formato', '/cuenta']
const PRIVACY_SCREENS = ['/', '/movimientos', '/estadisticas', '/plan/planes', '/plan/metas', '/cuenta']

async function analyze(page: Page, text: string) {
  await go(page, '/asistente')
  await page.getByLabel('Texto').fill(text)
  await page.getByRole('button', { name: 'Analizar' }).click()
  return page.getByTestId('assistant-preview').locator('.assistant__line')
}

test.describe('F1 · varias líneas en el asistente', () => {
  test('pegar tres líneas da tres filas con sus importes', async ({ page }) => {
    await startDemo(page)
    const lines = await analyze(page, 'café 4.50\nuber 12\nsupermercado 45.20')
    await expect(lines).toHaveCount(3)
    await expect(lines.nth(0).getByLabel('Importe')).toHaveValue('4.50')
    await expect(lines.nth(1).getByLabel('Importe')).toHaveValue('12.00')
    await expect(lines.nth(2).getByLabel('Importe')).toHaveValue('45.20')
  })

  test('con 201 líneas se analizan 200 y se avisa de las que faltan', async ({ page }) => {
    await startDemo(page)
    const lines = await analyze(page, Array.from({ length: 201 }, (_, i) => `g${i + 1} 1`).join('\n'))
    await expect(lines).toHaveCount(200)
    await expect(page.getByTestId('assistant-truncated')).toContainText('200')
    await expect(page.getByTestId('assistant-truncated')).toContainText('201')
  })

  test('Ctrl+Enter analiza; Enter solo añade una línea', async ({ page }) => {
    await startDemo(page)
    await go(page, '/asistente')
    const box = page.getByLabel('Texto')
    await box.fill('café 4.50')
    await box.press('Enter')
    await box.type('uber 12')
    await expect(page.getByTestId('assistant-preview')).toHaveCount(0)
    await box.press('Control+Enter')
    await expect(page.getByTestId('assistant-preview').locator('.assistant__line')).toHaveCount(2)
  })

  test('una línea con dos importes sin separador queda marcada para revisar', async ({ page }) => {
    await startDemo(page)
    const lines = await analyze(page, 'café 4.50 uber 12')
    await expect(lines).toHaveCount(1)
    await expect(lines.first()).toContainText('más de un importe')
  })
})

test.describe('F2 · las comas no parten un importe', () => {
  for (const [text, expected] of [
    ['rent 1,450', ['1450.00']],
    ['supermercado 1,234.56', ['1234.56']],
    ['café 3,50, uber 12', ['3.50', '12.00']],
    ['pizza 20, cine 15', ['20.00', '15.00']],
  ] as const) {
    test(`«${text}» → ${expected.join(' + ')}`, async ({ page }) => {
      await startDemo(page)
      const lines = await analyze(page, text)
      await expect(lines).toHaveCount(expected.length)
      for (const [i, value] of expected.entries()) await expect(lines.nth(i).getByLabel('Importe')).toHaveValue(value)
    })
  }
})

test('F4 · el aviso «Ajuste guardado» llega en el idioma nuevo (es → fr → pt → en → es)', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes/formato')
  const chips = page.getByTestId('language-chips')
  await chips.getByRole('button', { name: /Français/ }).click()
  await expect(page.getByText('Réglage enregistré')).toBeVisible()
  await chips.getByRole('button', { name: /Português/ }).click()
  await expect(page.getByText('Ajuste salvo')).toBeVisible()
  await chips.getByRole('button', { name: /English/ }).click()
  await expect(page.getByText('Setting saved')).toBeVisible()
  await chips.getByRole('button', { name: /Español/ }).click()
  await expect(page.getByText('Ajuste guardado')).toBeVisible()
})

test('un doble toque en «Guardar» registra un solo movimiento', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('7')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click({ clickCount: 2 })
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  expect(await movementCount(page)).toBe(before + 1)
})

test('eliminar → «Deshacer» → recargar conserva el movimiento', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/movimientos')
  await page.getByRole('button', { name: 'Seleccionar' }).click()
  await page.locator('.tx-group input[type="checkbox"]').first().check()
  await page.getByRole('button', { name: 'Enviar a la papelera' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar a la papelera' }).click()
  await expect(page.getByText('1 movimiento enviado a la papelera').first()).toBeVisible()
  await page.getByRole('button', { name: 'Deshacer' }).first().click()
  await expect(page.getByText('1 movimiento restaurado').first()).toBeVisible()
  await page.reload()
  await expect(page.locator('#page-title')).toBeVisible()
  expect(await movementCount(page)).toBe(before)
})

test.describe('modo privado: ningún importe visible ni en nombres accesibles', () => {
  for (const level of [1, 2] as const) {
    for (const route of PRIVACY_SCREENS) {
      test(`nivel ${level} en ${route}`, async ({ page }) => {
        await startDemo(page)
        for (let i = 0; i < level; i++) await page.getByTestId('privacy-toggle').click()
        await expect(page.getByTestId('privacy-toggle')).toHaveAttribute('data-privacy-level', String(level))
        await go(page, route)
        await expect(page.locator('#main')).not.toContainText(/\$\s?\d/)
        const labels = await page.locator('#main').evaluate((el) => [...el.querySelectorAll('[aria-label], [aria-valuetext]')].map((n) => `${n.getAttribute('aria-label') ?? ''} ${n.getAttribute('aria-valuetext') ?? ''}`).join(' '))
        expect(labels, route).not.toMatch(/\$\s?\d/)
      })
    }
  }
})

test('la hoja «+» se cierra con Esc y devuelve el foco al botón que la abrió', async ({ page }) => {
  await startDemo(page)
  await openAddSheet(page)
  const sheet = page.getByRole('dialog', { name: '¿Qué quieres registrar?' })
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return `${el?.getAttribute('aria-label') ?? ''} ${el?.textContent ?? ''}`.trim()
  })
  expect(focused).toMatch(/Agregar/)
})

test('historia COP con formato colombiano: cifras exactas en configuración, formulario y asistente', async ({ page }) => {
  test.setTimeout(90_000)
  await openApp(page)
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Moneda').selectOption('COP')
  await page.getByLabel('Saldo disponible').fill('1200000')
  await page.getByLabel('Periodo del presupuesto').selectOption({ label: 'Hasta mi próximo ingreso' })
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Importe esperado').fill('800000')
  await page.getByLabel('Fecha del próximo ingreso').fill('2026-10-08')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Agregar un pago' }).click()
  await page.getByLabel('Nombre').fill('Arriendo')
  await page.getByLabel('Importe', { exact: true }).fill('600000')
  await page.getByLabel('Próxima fecha de pago').fill('2026-10-03')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Cantidad reservada').fill('200000')
  await page.getByRole('button', { name: 'Ver resumen' }).click()
  await expect(page.locator('.hero__value')).toContainText('400')
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()
  const skip = page.getByRole('button', { name: 'Omitir' })
  if ((await skip.count()) > 0) await skip.click()
  // Formato colombiano: puntos de miles, sin decimales.
  await go(page, '/ajustes/formato')
  await page.getByLabel('Formato de números').selectOption('es-CO')
  await go(page, '/')
  await expect(page.getByTestId('available')).toContainText('400.000')
  await expect(page.getByTestId('available')).not.toContainText('400,000')
  // Formulario: «85.000» son ochenta y cinco mil, no 85.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('85.000')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await go(page, '/')
  await expect(page.getByTestId('available')).toContainText('315.000')
  // Asistente: dos movimientos, importes exactos (COP no tiene decimales).
  const lines = await analyze(page, 'arriendo 1.200.000, luz 85.000')
  await expect(lines).toHaveCount(2)
  await expect(lines.nth(0).getByLabel('Importe')).toHaveValue('1200000')
  await expect(lines.nth(1).getByLabel('Importe')).toHaveValue('85000')
})

test.describe('sin desplazamiento horizontal en 13 rutas', () => {
  for (const language of LANGUAGES) {
    test(language, async ({ page }) => {
      test.setTimeout(180_000)
      await startDemo(page)
      await setLanguage(page, language)
      for (const route of ROUTES) {
        await go(page, route)
        await expectNoHorizontalScroll(page, `${language} ${route}`)
      }
    })
  }
})

test.describe('Bloque G · asistente y formulario', () => {
  test('G4 · «transferencia a ahorros» se sugiere como transferencia y no se registra como gasto', async ({ page }) => {
    await startDemo(page)
    const before = await movementCount(page)
    const lines = await analyze(page, 'transferencia a ahorros 200')
    await expect(lines).toHaveCount(1)
    await expect(lines.first()).toContainText('Parece una transferencia')
    await expect(page.getByTestId('assistant-transfer-blocked')).toBeVisible()
    await expect(page.getByRole('button', { name: /Registrar 1 movimiento/ })).toBeDisabled()
    // Al cambiar el tipo a mano, la fila vuelve a ser registrable.
    await lines.first().getByRole('radio', { name: 'Ingreso' }).check()
    await expect(page.getByTestId('assistant-transfer-blocked')).toHaveCount(0)
    await page.getByRole('button', { name: /Registrar 1 movimiento/ }).click()
    await expect(page.getByText('1 movimiento registrado')).toBeVisible()
    expect(await movementCount(page)).toBe(before + 1)
  })

  test('G4 · «helado» va a restaurantes y café', async ({ page }) => {
    await startDemo(page)
    const lines = await analyze(page, 'helado 45')
    await expect(lines.first().getByLabel('Categoría')).toHaveAttribute('data-value', 'dining')
  })

  test('G5 · un gasto de 50 000 con 136.78 disponibles pide confirmación una vez y se guarda tal cual', async ({ page }) => {
    await startDemo(page)
    const before = await movementCount(page)
    await go(page, '/movimientos/nuevo')
    await page.getByLabel('Importe', { exact: true }).fill('50000')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /¿Seguro\? Es 365 veces lo que puedes gastar/ })
    await expect(dialog).toBeVisible()
    await expect(page.getByText('Movimiento guardado')).toHaveCount(0) // nada se guarda antes de confirmar
    await dialog.getByRole('button', { name: 'Sí, es correcto' }).click()
    await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
    expect(await movementCount(page)).toBe(before + 1)
  })

  test('G5 · un gasto normal no pregunta; en la vista previa del asistente la fila desproporcionada queda marcada', async ({ page }) => {
    await startDemo(page)
    await go(page, '/movimientos/nuevo')
    await page.getByLabel('Importe', { exact: true }).fill('9')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
    // Disponible 127.78: 50 000 son 391 veces; 3 no se marca.
    const lines = await analyze(page, 'tele 50000\ncafé 3')
    await expect(lines.nth(0).getByTestId('assistant-implausible')).toContainText('veces lo que puedes gastar')
    await expect(lines.nth(1).getByTestId('assistant-implausible')).toHaveCount(0)
  })
})

test('D1 · ‹ › en Inicio: periodos pasados al cierre, aviso ámbar, el actual no cambia y nada se guarda', async ({ page }) => {
  await startDemo(page)
  const before = await storedData(page)
  await expect(page.getByTestId('period-label')).toContainText(/septiembre/i)
  await expect(page.getByTestId('period-next')).toBeDisabled()
  await expect(page.getByTestId('available')).toHaveText('$136.78')

  await page.getByTestId('period-prev').click()
  await expect(page.getByTestId('period-label')).toContainText(/agosto/i)
  await expect(page.getByTestId('period-banner')).toContainText('Estás viendo otro periodo')
  await expect(page.locator('.hero__sub')).toContainText('Cifras al cierre')
  await expect(page.getByTestId('period-next')).toBeEnabled()
  // Solo lectura: sin «¿Me alcanza?», sin avisos ni secciones; la explicación sigue disponible.
  await expect(page.getByRole('link', { name: '¿Me alcanza?' })).toHaveCount(0)
  await expect(page.locator('main .alert')).toHaveCount(0)
  await expect(page.locator('.hero .explain > summary')).toBeVisible()

  await page.getByTestId('period-prev').click()
  await expect(page.getByTestId('period-label')).toContainText(/julio/i)
  await page.getByTestId('period-next').click()
  await page.getByTestId('period-next').click()
  await expect(page.getByTestId('period-banner')).toHaveCount(0)
  await expect(page.getByTestId('period-label')).toContainText(/septiembre/i)
  await expect(page.getByTestId('available')).toHaveText('$136.78')

  await page.getByTestId('period-prev').click()
  await page.getByTestId('period-back').click()
  await expect(page.getByTestId('period-banner')).toHaveCount(0)
  expect(await storedData(page)).toBe(before)
})

test.describe('D5 · selector de categoría', () => {
  test('búsqueda sin acentos, recientes, grupos y teclado (flechas, Enter, Esc)', async ({ page }) => {
    await startDemo(page)
    await go(page, '/movimientos/nuevo')
    const field = page.getByLabel('Categoría', { exact: true })
    await field.click()
    const picker = page.getByTestId('category-picker')
    await expect(picker.getByRole('heading', { name: 'Recientes' })).toBeVisible()
    await expect(picker.getByRole('heading', { name: 'Comida y bebida' })).toBeVisible()
    await picker.getByRole('searchbox').fill('telefono')
    await expect(picker.getByRole('option')).toHaveCount(1)
    await expect(picker.getByRole('option', { name: 'Teléfono e internet' })).toBeVisible()
    await picker.getByRole('searchbox').fill('zzz')
    await expect(picker.getByRole('status')).toContainText('zzz')
    await picker.getByRole('searchbox').fill('')
    await picker.getByRole('option').first().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
    await page.keyboard.press('Enter')
    await expect(picker).toBeHidden()
    await expect(field).toContainText(focused ?? '')
    await field.click()
    await page.keyboard.press('Escape')
    await expect(picker).toBeHidden()
    await expect(field).toBeFocused()
  })

  test('«+ Nueva categoría» crea y elige sin salir del formulario', async ({ page }) => {
    await startDemo(page)
    await go(page, '/movimientos/nuevo')
    await page.getByLabel('Importe', { exact: true }).fill('12')
    await page.getByLabel('Categoría', { exact: true }).click()
    await page.getByTestId('picker-new').click()
    await page.getByTestId('picker-new-name').fill('Acuario')
    await page.getByTestId('picker-new-save').click()
    await expect(page.getByTestId('category-picker')).toBeHidden()
    await expect(page.getByLabel('Categoría', { exact: true })).toContainText('Acuario')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
    await expect(page.locator('.item__meta', { hasText: 'Acuario' }).first()).toBeVisible()
  })

  test('el formulario de límite elige varias categorías con el mismo selector', async ({ page }) => {
    await startDemo(page)
    await go(page, '/plan/planes/nuevo')
    await expect(page.getByRole('heading', { name: 'Nuevo límite' })).toBeVisible()
    const field = page.getByTestId('plan-categories')
    await field.click()
    const picker = page.getByTestId('category-picker')
    await picker.getByRole('option', { name: 'Restaurantes y café' }).first().click()
    await picker.getByRole('option', { name: 'Transporte' }).first().click()
    await page.getByRole('button', { name: 'Listo' }).click()
    await expect(field).toContainText('Restaurantes y café, Transporte')
    await expect(field).toHaveAttribute('data-value', 'dining,transport')
  })
})

test('D6 · guardar con «Repetir · Cada mes» crea el programado; el calendario muestra el mes siguiente y nada se cuenta dos veces', async ({ page }) => {
  await startDemo(page)
  const before = await movementCount(page)
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('10')
  await page.getByRole('switch', { name: 'Repetir' }).click()
  await page.getByLabel('Frecuencia').selectOption('monthly')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado y programado creado').first()).toBeVisible()
  expect(await movementCount(page)).toBe(before + 1)
  await go(page, '/')
  await expect(page.getByTestId('available')).toHaveText('$126.78') // 136.78 − 10, no − 20
  await go(page, '/plan/calendario')
  await expect(page.getByText(/próximo: 28 oct/)).toBeVisible()
  await page.getByRole('button', { name: 'Mes siguiente' }).click()
  await expect(page.locator('.cal-day.has-items .cal-day__num', { hasText: /^28$/ })).toBeVisible()
})

