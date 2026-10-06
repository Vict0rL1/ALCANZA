/**
 * Recorrido completo (petición §7) con cifras calculadas A MANO, no leídas de la app:
 * configurar → ingreso → distribuir → compra dividida con plantilla → devolución parcial →
 * pagar el compromiso apartado → «¿Qué cambió?» → simular y revisar el faltante → corregir
 * un movimiento → exportar, restaurar y comprobar que todo es equivalente.
 *
 * Invariantes comprobadas por el camino: transferir no cambia el saldo consolidado; dividir
 * no multiplica el gasto; distribuir no crea dinero; pago + apartado no se restan dos veces;
 * una preferencia visual no cambia cifras; simular no toca registros; reintentar no duplica.
 */
import { expect, test, type Page } from '@playwright/test'
import { available, go, movementCount, openApp, openDetails, storedData } from './helpers'

/** Saldo consolidado de las cuentas del presupuesto, según lo guardado (independiente de la UI). */
async function consolidated(page: Page): Promise<number> {
  const d = JSON.parse((await storedData(page)) ?? '{}')
  const applies = (t: { status: string; date: string; createdAt: string }, a: { anchor: { date: string; setAt: string } }) =>
    t.status === 'realized' && (t.date > a.anchor.date || (t.date === a.anchor.date && t.createdAt > a.anchor.setAt))
  let total = 0
  for (const a of d.accounts.filter((x: { includeInBudget: boolean }) => x.includeInBudget)) {
    let b = a.anchor.amountMinor
    for (const t of d.transactions) {
      if (!applies(t, a)) continue
      if (t.kind === 'income' || t.kind === 'refund') b += t.accountId === a.id ? t.amountMinor : 0
      else if (t.kind === 'expense') b -= t.accountId === a.id ? t.amountMinor : 0
      else if (t.kind === 'transfer') b += (t.toAccountId === a.id ? t.amountMinor : 0) - (t.accountId === a.id ? t.amountMinor : 0)
    }
    total += b
  }
  return total
}

/** Colecciones financieras (se comparan por valor: la importación puede reordenar las claves). */
const financial = (raw: string | null) => {
  const d = JSON.parse(raw ?? '{}')
  return [d.accounts, d.transactions, d.schedules, d.goals, d.trash, d.incomeDistributions, d.templates]
}

test('recorrido completo con invariantes y cifras independientes', async ({ page }) => {
  test.setTimeout(180_000)
  await openApp(page)

  // 1. Configurar: cuenta con 1,000.00; ingreso de 800.00 el 9-oct; renta de 300.00 el 5-oct.
  await page.getByRole('button', { name: 'Configurar con mis datos' }).click()
  await page.getByLabel('Saldo disponible').fill('1000')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Importe esperado').fill('800')
  await page.getByLabel('Fecha del próximo ingreso').fill('2026-10-09')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Agregar un pago' }).click()
  await page.getByLabel('Nombre').fill('Renta')
  await page.getByLabel('Importe', { exact: true }).fill('300')
  await page.getByLabel('Próxima fecha de pago').fill('2026-10-05')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Ver resumen' }).click()
  await page.getByRole('button', { name: 'Empezar a usar Clara' }).click()
  // 1000 − 300 (renta antes del ingreso) = 700
  await expect(page.getByTestId('available')).toHaveText('$700.00')
  expect(await consolidated(page)).toBe(100000)

  // Segunda cuenta del presupuesto y transferencia: el consolidado no cambia.
  await go(page, '/ajustes?seccion=cuentas')
  await page.getByRole('button', { name: 'Agregar cuenta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await dialog.getByLabel('Nombre').fill('Efectivo')
  await dialog.getByLabel('Saldo actual').fill('0')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Transferencia' }).check()
  await page.getByLabel('Importe', { exact: true }).fill('100')
  await page.getByLabel('Hacia la cuenta').selectOption({ label: 'Efectivo' })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$700.00')
  expect(await consolidated(page)).toBe(100000)

  // 2. Recibir un ingreso de 500.00 (no programado): 700 + 500 = 1,200.
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Ingreso' }).check()
  await page.getByLabel('Importe', { exact: true }).fill('500')
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Beca')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$1,200.00')

  // 3. Distribuir parte: 300 a la renta (ya reservada) → el disponible y el saldo no cambian.
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Beca' }).first().click()
  await page.getByRole('link', { name: 'Distribuir este ingreso' }).click()
  await page.getByRole('radio', { name: 'Lo reparto yo' }).check()
  await page.getByLabel('Renta · 5 oct').fill('300')
  await expect(page.getByTestId('dist-preview')).toContainText('$1,200.00 → $1,200.00')
  const countBeforeDist = await (async () => {
    const d = JSON.parse((await storedData(page)) ?? '{}')
    return d.transactions.length
  })()
  await page.getByRole('button', { name: 'Aplicar distribución' }).click()
  await expect(page.getByText(/Distribuiste \$300\.00/)).toBeVisible()
  expect(JSON.parse((await storedData(page)) ?? '{}').transactions.length).toBe(countBeforeDist) // no crea dinero ni movimientos
  expect(await consolidated(page)).toBe(150000)
  await expect(await available(page)).toHaveText('$1,200.00')

  // 4. Compra dividida desde una plantilla 60 % / 40 %: 50.00 → 30.00 + 20.00. Un solo gasto.
  await go(page, '/movimientos/plantillas/nueva?tipo=split')
  await page.getByLabel('Nombre').fill('Súper')
  await page.getByLabel('Categoría (línea 1)').selectOption({ label: 'Supermercado' })
  await page.getByLabel('Porcentaje (línea 1)').fill('60')
  await page.getByRole('button', { name: 'Añadir línea' }).click()
  await page.getByLabel('Categoría (línea 2)').selectOption({ label: 'Vivienda' })
  await page.getByLabel('Porcentaje (línea 2)').fill('40')
  await page.getByRole('button', { name: 'Guardar plantilla' }).click()
  const before = await movementCount(page)
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('50')
  await page.getByLabel('Dividir con una plantilla').selectOption({ label: 'Súper' })
  await expect(page.getByLabel('Importe de la línea 1')).toHaveValue('30.00')
  await expect(page.getByLabel('Importe de la línea 2')).toHaveValue('20.00')
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill('Mercado')
  // Reintento: doble clic en Guardar no duplica.
  await page.getByRole('button', { name: 'Guardar', exact: true }).dblclick()
  expect(await movementCount(page)).toBe(before + 1)
  await expect(await available(page)).toHaveText('$1,150.00') // 1200 − 50 (no 1200 − 100)

  // 5. Devolución parcial de 10.00 repartida 6 + 4: 1150 + 10 = 1,160.
  await go(page, '/movimientos/nuevo')
  await page.getByRole('radio', { name: 'Devolución' }).check()
  await page.getByLabel('Importe', { exact: true }).fill('10')
  await page.getByLabel('Gasto original (opcional)').selectOption({ index: 1 })
  await page.getByLabel('Importe de la línea 1').fill('6')
  await page.getByLabel('Importe de la línea 2').fill('4')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$1,160.00')

  // 6. Pagar la renta (apartada por la distribución): sale del saldo y deja de reservarse.
  await go(page, '/')
  await page.getByRole('button', { name: /Marcar pagado.*Renta/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(await available(page)).toHaveText('$1,160.00') // no se resta dos veces
  expect(await consolidated(page)).toBe(150000 - 5000 + 1000 - 30000) // 1,160.00

  // 7. ¿Por qué cambió? Desde el inicio del historial: 700 → 1,160 = +460 exactos.
  await go(page, '/cambios')
  await page.getByLabel('Comparar con').selectOption('historyStart')
  await expect(page.getByTestId('changes-total')).toHaveText('El disponible subió $460.00.')
  const calc = page.getByTestId('changes-calc')
  await expect(calc).toContainText('Ingresos registrados (1)')
  await expect(calc).toContainText('$500.00')
  await expect(calc).toContainText('Gastos registrados (1)')
  await expect(calc).toContainText('Devoluciones (1)')
  await expect(page.getByText('El desglose suma exactamente la diferencia.')).toBeVisible()

  // 8. Simular y revisar un faltante: compra PREVISTA de 1,500.00 el 2-oct.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('1500')
  await openDetails(page)
  await page.getByRole('radio', { name: 'Previsto' }).check()
  await page.getByLabel('Fecha').fill('2026-10-02')
  await page.getByLabel('Nota (opcional)').fill('Portátil')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  // Saldo 1,160 − 1,500 = −340 el 2-oct.
  const beforeSim = await storedData(page)
  await go(page, '/alcanza/faltante')
  await expect(page.getByTestId('shortfall-first')).toContainText('$340.00')
  await page.getByTestId('lever-postponePlanned').getByRole('checkbox').check()
  await expect(page.getByTestId('shortfall-combined')).toContainText('Ya no baja de cero')
  expect(await storedData(page)).toBe(beforeSim) // simular no cambia nada

  // Una preferencia visual no cambia cifras.
  await go(page, '/')
  await page.getByTestId('privacy-toggle').click()
  await page.getByTestId('privacy-toggle').click()
  await expect(page.getByTestId('available')).toHaveText('-$340.00') // 1,160 − 1,500 (previsto reservado)
  expect(await storedData(page)).toBe(beforeSim)

  // 9. Corregir un movimiento: el portátil cuesta 500.00 → 1,160 − 500 = 660.
  await go(page, '/movimientos')
  await page.locator('a.item', { hasText: 'Portátil' }).first().click()
  await page.getByLabel('Importe', { exact: true }).fill('500')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$660.00')

  // 10. Exportar, restaurar y comprobar equivalencia.
  const snapshot = financial(await storedData(page))
  await go(page, '/ajustes?seccion=copia')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()])
  const file = await download.path()
  // Un cambio después de exportar, que la restauración debe deshacer.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('99')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(await available(page)).toHaveText('$561.00')
  await go(page, '/ajustes?seccion=copia')
  await page.getByTestId('import-file').setInputFiles(file)
  await page.getByRole('dialog').getByRole('button', { name: 'Reemplazar datos' }).click()
  await expect(page.getByText('Copia importada').first()).toBeVisible()
  await expect(await available(page)).toHaveText('$660.00')
  expect(financial(await storedData(page))).toEqual(snapshot)
})
