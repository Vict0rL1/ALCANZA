import { expect, test } from '@playwright/test'
import { go, startDemo, storedData } from './helpers'

/**
 * M2 · Ajustes › Enviar comentarios: un correo con datos técnicos que la persona ve entero antes de
 * enviarlo. Ningún dato financiero (importes, notas, comercios, cuentas) aparece en él.
 */
test('el texto lleva versión, compilación, navegador, modo y pantalla; el mailto es ese mismo texto; nada financiero', async ({ page }, info) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => ((w.__copied = t), Promise.resolve()), readText: () => Promise.resolve('') } })
  })
  await startDemo(page)
  await go(page, '/ajustes/acerca')
  const build = ((await page.getByTestId('about-build').textContent()) ?? '').replace('Compilación: ', '').trim()
  await go(page, '/ajustes')
  await page.getByLabel('Buscar en Ajustes').fill('comentarios')
  await page.getByRole('link', { name: /Enviar comentarios/ }).click()

  const preview = page.getByTestId('feedback-preview')
  const text = (await preview.textContent())!
  const viewport = info.project.use.viewport!
  expect(text).toMatch(/^Asunto: Clara \d+\.\d+\.\d+\S* · comentarios de la beta\n\nQué hice, qué esperaba y qué pasó:/)
  expect(text).toMatch(/Versión: \d+\.\d+\.\d+/)
  expect(text).toContain(`Compilación: ${build}`)
  expect(text).toMatch(/Navegador: Chrome \d+/)
  expect(text).toContain('Modo: pestaña del navegador')
  expect(text).toContain(`(ventana ${viewport.width} × ${viewport.height})`)
  expect(text).toContain('Idioma: es')

  // El enlace abre el correo con el mismo texto (sin dirección en esta compilación: se avisa).
  await expect(page.getByText('Esta versión no tiene una dirección configurada')).toBeVisible()
  const href = (await page.getByTestId('feedback-mailto').getAttribute('href'))!
  const url = new URL(href)
  expect(url.protocol).toBe('mailto:')
  expect(url.pathname).toBe('')
  const subject = decodeURIComponent(href.match(/[?&]subject=([^&]*)/)![1]!)
  const body = decodeURIComponent(href.match(/[?&]body=([^&]*)/)![1]!).replace(/\r\n/g, '\n')
  expect(`Asunto: ${subject}\n\n${body}`).toBe(text)

  // Ningún dato financiero: ni cuentas, ni comercios, ni notas, ni importes con símbolo.
  const d = JSON.parse((await storedData(page))!) as { accounts: { name: string }[]; transactions: { note?: string; merchant?: string }[] }
  const secrets = [...d.accounts.map((a) => a.name), ...d.transactions.flatMap((t) => [t.note, t.merchant])].filter((s): s is string => !!s && s.length >= 4)
  expect(secrets.length).toBeGreaterThan(5)
  for (const s of new Set(secrets)) expect(text.toLowerCase(), s).not.toContain(s.toLowerCase())
  expect(text).not.toMatch(/\$\s?\d/)

  await page.getByRole('button', { name: 'Copiar texto' }).click()
  await expect(page.getByText('Texto copiado')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __copied?: string }).__copied)).toBe(text)
})
