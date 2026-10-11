import { expect, test, type Page } from '@playwright/test'
import { addDays, daysBetween } from '../../src/domain/dates'
import { account, baseData, bill, goal, income, tx } from '../../src/test/fixtures'
import { available, go, openApp, openDetails, openExplain, openMoreMenu, seedStoredData, setLanguage, startDemo, storedData, writeStoredData } from './helpers'

/**
 * Regresiones de la auditoría 2026-10-09 en el navegador (`qa/PLAN-E2E.md`): una prueba por hallazgo,
 * con la acción hecha desde la interfaz y un oráculo independiente (una suma calculada aquí, los
 * bytes del archivo descargado, los datos guardados tras recargar). Los importes son ficticios.
 */

async function newBudgetWithBalance(page: Page, balance: string) {
  await openApp(page)
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Saldo disponible').fill(balance)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('radio', { name: 'No tengo fecha' }).check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ver mi resultado ahora' }).click()
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()
  await expect(page.getByTestId('available')).toBeVisible()
}

test('QA-01 · con saldo de referencia y sin movimientos, cambiar a JPY o USD se bloquea y tras recargar sigue CAD 2000', async ({ page }) => {
  await newBudgetWithBalance(page, '2000')
  await expect(await available(page)).toHaveText('$2,000.00')
  for (const code of ['JPY', 'USD']) {
    await go(page, '/ajustes/formato')
    await expect(page.getByText('En esta fase cada presupuesto usa una sola moneda')).toBeVisible()
    await page.getByTestId('change-currency').click()
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${code}`) }).click()
    await expect(page.getByText('Ya hay importes guardados')).toBeVisible()
    await page.reload()
    await go(page, '/ajustes/formato')
    await expect(page.locator('#main')).toContainText('CAD · dólar canadiense')
    await expect(await available(page)).toHaveText('$2,000.00')
  }
  const stored = JSON.parse((await storedData(page))!) as { settings: { currency: string }; accounts: { anchor: { amountMinor: number } }[] }
  expect(stored.settings.currency).toBe('CAD')
  expect(stored.accounts[0]!.anchor.amountMinor).toBe(200000)
})

test('QA-02 · cobro parcial de 400 sobre un ingreso de 1000 con registro automático: al recargar se registra 600, no 1000; otra recarga no añade nada', async ({ page }) => {
  await newBudgetWithBalance(page, '100')
  // Un ingreso de 1 000 previsto para hoy que se registra solo cuando vence.
  await go(page, '/plan/programado/nuevo')
  await page.getByRole('radio', { name: 'Ingreso' }).check()
  await page.getByLabel('Nombre').fill('Beca')
  await page.getByLabel('Importe', { exact: true }).fill('1000')
  await page.getByLabel('Próxima fecha').fill('2026-09-28')
  await page.getByLabel('Registrar solo cuando venza').check()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  // El registro automático actúa al guardar: llega 1 000 entero (nada parcial todavía). Lo deshacemos para
  // dejar la ocurrencia abierta y registrar primero el cobro parcial a mano.
  await expect(page.getByText(/se registr(ó|aron) sol(o|os)/).first()).toBeVisible()
  await go(page, '/movimientos')
  const autoRow = page.getByRole('link', { name: /Beca/ }).first()
  await autoRow.click()
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.getByText(/enviado a la papelera|Movimiento eliminado/).first()).toBeVisible()
  await expect(await available(page)).toHaveText('$100.00')

  // Cobro parcial desde el calendario: 400 recibidos, se espera el resto (600).
  await go(page, '/plan/calendario')
  await page.getByRole('button', { name: /Marcar recibido.*Beca/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Marcar como recibido' })
  await dialog.getByLabel('Importe real').fill('400')
  await dialog.getByRole('radio', { name: 'Sí, espero el resto ($600.00)' }).check()
  await dialog.getByRole('button', { name: 'Confirmar ingreso' }).click()
  await expect(page.getByText('«Beca» marcado como recibido')).toBeVisible()
  await expect(await available(page)).toHaveText('$500.00')

  // Al recargar, el registro automático liquida SOLO el resto: 100 + 400 + 600 = 1 100, nunca 1 500.
  await page.reload()
  await expect(await available(page)).toHaveText('$1,100.00')
  await go(page, '/movimientos')
  await expect(page.locator('.summary-line')).toContainText('2 movimientos')
  await expect(page.getByText('$600.00').first()).toBeVisible()
  // Una segunda recarga no añade nada.
  await page.reload()
  await expect(await available(page)).toHaveText('$1,100.00')
  await go(page, '/movimientos')
  await expect(page.locator('.summary-line')).toContainText('2 movimientos')
})

test('QA-03 · sin arrastre: referencia −500 e ingreso de 1000 → saldo 500 y «Puedes gastar» 500, no 1000; la explicación lo dice', async ({ page }) => {
  const data = baseData({
    settings: { ...baseData().settings, budgetPeriod: { type: 'month', weekStartsOn: 1 }, carryOverBalance: false },
    accounts: [account({ id: 'main', name: 'Principal', anchor: { amountMinor: -50000, date: '2026-09-01', setAt: '2026-09-01T12:00:00.000Z' } })],
    transactions: [tx({ id: 'pay', kind: 'income', categoryId: 'salary', amountMinor: 100000, date: '2026-09-05' })],
  })
  await seedStoredData(page, data)
  await expect(await available(page)).toHaveText('$500.00')
  await openExplain(page)
  await expect(page.getByTestId('limited-by-balance')).toBeVisible()
  await expect(page.locator('.hero')).toContainText('Saldo real de hoy en las cuentas del presupuesto')
  // Con arrastre, la base es el saldo real: la misma cifra, por otra razón.
  await writeStoredData(page, { ...data, settings: { ...data.settings, carryOverBalance: true }, revision: 2 })
  await page.reload()
  await expect(await available(page)).toHaveText('$500.00')
})

test('QA-04 · un apartado hecho en septiembre no reduce el disponible de agosto; la pancarta declara el límite de la reconstrucción', async ({ page }) => {
  const data = baseData({
    settings: { ...baseData().settings, budgetPeriod: { type: 'month', weekStartsOn: 1 }, carryOverBalance: true },
    accounts: [account({ id: 'main', name: 'Principal', anchor: { amountMinor: 100000, date: '2026-08-01', setAt: '2026-08-01T12:00:00.000Z' } })],
    goals: [goal({ id: 'g', name: 'Portátil', targetMinor: 50000, createdAt: '2026-09-10T15:00:00.000Z', updatedAt: '2026-09-10T15:00:00.000Z', allocations: [{ id: 'a1', amountMinor: 30000, date: '2026-09-10', createdAt: '2026-09-10T15:00:00.000Z', reason: 'contribution' }] })],
  })
  await seedStoredData(page, data)
  // Septiembre (hoy): 1 000 − 300 apartados.
  await expect(await available(page)).toHaveText('$700.00')
  await page.getByTestId('period-prev').click()
  await expect(page.getByTestId('period-banner')).toContainText('Los programados y los ajustes (periodo, arrastre, cuentas) son los actuales')
  await expect(page.getByTestId('available')).toHaveText('$1,000.00')
  await page.getByTestId('period-back').click()
  await expect(page.getByTestId('available')).toHaveText('$700.00')
  // La navegación nunca escribe.
  const stored = JSON.parse((await storedData(page))!) as { goals: { allocations: unknown[] }[] }
  expect(stored.goals[0]!.allocations).toHaveLength(1)
})

test('QA-05 · un CSV con «USD 100.00» no se importa en un presupuesto CAD; «CAD 20.00» sí; la vista previa dice cuánto cambiará el saldo', async ({ page }) => {
  await startDemo(page)
  const csv = ['Date,Description,Amount', '2026-09-27,Refund in dollars,USD 100.00', '2026-09-27,Local purchase,CAD -20.00', '2026-09-27,Euro purchase,-12.50 €', '2026-09-27,Yen purchase,JPY -1000', '2026-09-27,Ambiguous dollar,$ -5.00'].join('\r\n')
  await go(page, '/movimientos/importar')
  await page.getByTestId('bank-file').setInputFiles({ name: 'banco.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByRole('heading', { name: '3. Revisa y confirma' })).toBeVisible()
  await expect(page.getByText('2 nuevos')).toBeVisible()
  await expect(page.getByText('3 con error')).toBeVisible()
  await expect(page.getByTestId('import-currency-note')).toContainText('3 filas están en otra moneda')
  await expect(page.getByText('Otra moneda (USD); este presupuesto usa CAD')).toBeVisible()
  await expect(page.getByText('Otra moneda (€); este presupuesto usa CAD')).toBeVisible()
  await expect(page.getByText('Otra moneda (JPY); este presupuesto usa CAD')).toBeVisible()
  await openDetails(page)
  await expect(page.getByRole('checkbox', { name: /Refund in dollars/ })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: /Local purchase/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /Ambiguous dollar/ })).toBeChecked()
  // Efecto sobre el saldo de las filas marcadas posteriores al saldo de referencia: −20.00 −5.00.
  await expect(page.getByTestId('import-balance-effect')).toContainText(/[−-]\$25\.00 \(2 posteriores/)
  await expect(page.getByRole('button', { name: 'Importar 2 movimientos' })).toBeEnabled()

  // Moneda declarada para todo el archivo: USD → ninguna fila se importa.
  await page.getByLabel('Moneda del archivo').selectOption('USD')
  await expect(page.getByText('5 con error')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Importar 0 movimientos' })).toBeDisabled()
  await page.getByLabel('Moneda del archivo').selectOption('CAD')
  await expect(page.getByText('2 nuevos')).toBeVisible()

  // Columna de moneda propia: la fila con USD se rechaza, la vacía y la CAD pasan.
  const withColumn = ['Fecha,Concepto,Importe,Moneda', '2026-09-27,Igual,-10.00,CAD', '2026-09-27,Vacía,-10.00,', '2026-09-27,Otra,-10.00,USD'].join('\r\n')
  await page.getByTestId('bank-file').setInputFiles({ name: 'banco2.csv', mimeType: 'text/csv', buffer: Buffer.from(withColumn) })
  await expect(page.getByRole('heading', { name: '3. Revisa y confirma' })).toBeVisible()
  await expect(page.getByLabel('Columna de moneda (opcional)')).toHaveValue('3')
  await expect(page.getByText('2 nuevos')).toBeVisible()
  await expect(page.getByText('1 con error')).toBeVisible()
  await expect(page.getByText('Otra moneda (USD); este presupuesto usa CAD')).toBeVisible()
})

test('QA-06 · un pago diario desde 2020 con 2 000 ocurrencias pagadas: los vencidos y el pago de hoy siguen reservados; nada se trunca en silencio', async ({ page }) => {
  const start = '2020-01-01'
  const paid = Array.from({ length: 2000 }, (_, i) => {
    const date = addDays(start, i)
    return tx({ id: `paid-${i}`, date, amountMinor: 100, scheduleId: 'daily', occurrenceDate: date, categoryId: 'other_expense' })
  })
  const data = baseData({
    schedules: [bill(start, 100, { id: 'daily', name: 'Transporte', frequency: 'daily' }), income('2026-10-12', 100000, { id: 'pay', name: 'Sueldo' })],
    transactions: paid,
  })
  await seedStoredData(page, data)
  // Oráculo independiente: desde el día 2 001 (2025-06-23) hasta el día del próximo ingreso (12-oct), un pago de 1.00 cada día.
  const firstUnpaid = addDays(start, 2000)
  expect(firstUnpaid).toBe('2025-06-23')
  const reservedDays = daysBetween(firstUnpaid, '2026-10-12') + 1
  const expected = 100000 - reservedDays * 100
  await expect(await available(page)).toHaveText(`$${(expected / 100).toFixed(2)}`)
  await expect(page.getByTestId('incomplete-reserves')).toHaveCount(0)
  await expect(page.getByText(`Tienes ${daysBetween(firstUnpaid, '2026-09-28')} pagos vencidos sin marcar`)).toBeVisible()
  // El calendario también ve el pago de hoy.
  await go(page, '/plan/calendario')
  await expect(page.getByRole('button', { name: /Marcar pagado.*Transporte/ }).first()).toBeVisible()
})

test('QA-07 · una nota «=1+1» sale del CSV como texto (con apóstrofo) y los importes siguen siendo números', async ({ page }) => {
  await startDemo(page)
  for (const note of ['=1+1', '+SUMA(A1:A9)', '@cmd', '-2+3']) {
    await go(page, '/movimientos/nuevo')
    await page.getByLabel('Importe', { exact: true }).fill('12.50')
    await openDetails(page)
    await page.getByLabel('Nota (opcional)').fill(note)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  }
  await go(page, '/movimientos')
  const download = page.waitForEvent('download')
  await (await openMoreMenu(page)).getByRole('button', { name: /Exportar CSV/ }).click()
  const file = await download
  const text = (await import('node:fs')).readFileSync((await file.path())!, 'utf8')
  const lines = text.split('\r\n')
  for (const note of ['=1+1', '+SUMA(A1:A9)', '@cmd', '-2+3']) {
    const line = lines.find((l) => l.includes(note))!
    expect(line, note).toBeDefined()
    // La nota va entre comillas si hace falta y siempre con el apóstrofo delante; el importe sigue siendo un número negativo.
    expect(line).toMatch(new RegExp(`(^|,)"?'${note.replace(/[+()]/g, '\\$&')}"?(,|$)`))
    expect(line).toMatch(/(^|,)-12\.50(,|$)/)
    expect(line).not.toMatch(new RegExp(`(^|,)${note.replace(/[+()]/g, '\\$&')}(,|$)`))
  }
})

test('QA-08 · una copia cifrada con parámetros imposibles se rechaza al instante sin tocar los datos; una válida sigue abriéndose', async ({ page }) => {
  await startDemo(page)
  const before = await storedData(page)
  const b64 = (n: number) => Buffer.alloc(n).toString('base64')
  const envelope = (patch: Record<string, unknown>) => JSON.stringify({ format: 'clara-encrypted-backup', version: 1, kdf: 'PBKDF2-SHA-256', cipher: 'AES-GCM-256', iterations: 310000, salt: b64(16), iv: b64(12), data: b64(64), ...patch })
  const cases: [string, Record<string, unknown>, string][] = [
    ['iteraciones desmesuradas', { iterations: 4294967295 }, 'Esta copia cifrada está dañada o no tiene el formato esperado'],
    ['iteraciones en cero', { iterations: 0 }, 'Esta copia cifrada está dañada o no tiene el formato esperado'],
    ['iteraciones negativas', { iterations: -1 }, 'Esta copia cifrada está dañada o no tiene el formato esperado'],
    ['iteraciones fraccionarias', { iterations: 1000.5 }, 'Esta copia cifrada está dañada o no tiene el formato esperado'],
    ['IV corto', { iv: b64(4) }, 'Esta copia cifrada está dañada o no tiene el formato esperado'],
    ['sal que no es base64', { salt: 'no-es-base64!' }, 'Esta copia cifrada está dañada o no tiene el formato esperado'],
    ['versión desconocida', { version: 7 }, 'Esta copia cifrada usa un formato más nuevo'],
  ]
  for (const [label, patch, message] of cases) {
    await go(page, '/ajustes?seccion=copia')
    await page.getByTestId('import-file').setInputFiles({ name: 'cifrada.json', mimeType: 'application/json', buffer: Buffer.from(envelope(patch)) })
    const open = page.getByRole('dialog', { name: 'Abrir copia cifrada' })
    await open.getByLabel('Frase', { exact: true }).fill('una frase larga')
    await open.getByRole('button', { name: 'Abrir' }).click()
    await expect(open.getByText(message), label).toBeVisible({ timeout: 2000 })
    await open.getByRole('button', { name: 'Cancelar' }).click()
  }
  expect(await storedData(page)).toBe(before)

  // Control positivo: la copia cifrada propia se abre con su frase.
  await go(page, '/cuenta')
  await page.getByTestId('export-encrypted').click()
  const dialog = page.getByRole('dialog', { name: 'Copia cifrada con frase' })
  await dialog.getByLabel('Frase', { exact: true }).fill('mi frase secreta')
  await dialog.getByLabel('Repite la frase').fill('mi frase secreta')
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Copia cifrada con frase' }).click()
  const text = (await import('node:fs')).readFileSync((await (await download).path())!, 'utf8')
  await go(page, '/ajustes?seccion=copia')
  await page.getByTestId('import-file').setInputFiles({ name: 'cifrada.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  const open = page.getByRole('dialog', { name: 'Abrir copia cifrada' })
  await open.getByLabel('Frase', { exact: true }).fill('mi frase secreta')
  await open.getByRole('button', { name: 'Abrir' }).click()
  await expect(page.getByRole('dialog', { name: '¿Reemplazar tus datos con esta copia?' })).toContainText('Moneda: CAD')
})

test('UX-01 · en inglés con formato numérico es-MX, la moneda se llama «Canadian Dollar» y la sección se llama como la cifra de Inicio', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  await expect(page.getByRole('link', { name: 'Puedes gastar' })).toBeVisible()
  await expect(page.locator('#main')).not.toContainText('Safe to spend')
  await setLanguage(page, 'English')
  await go(page, '/ajustes/formato')
  await expect(page.locator('#main')).toContainText('CAD · Canadian Dollar')
  await expect(page.locator('#main')).not.toContainText('dólar canadiense')
  // El formato numérico sigue siendo el elegido (es-MX): el ejemplo no cambia de forma.
  await expect(page.locator('#main')).toContainText('$1,234.56')
  await go(page, '/ajustes')
  await expect(page.getByRole('link', { name: 'You can spend' })).toBeVisible()
})
