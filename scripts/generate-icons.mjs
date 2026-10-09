// Genera los iconos PNG de la PWA a partir de public/icon.svg usando Chromium (Playwright).
// Uso: node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8')
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage()

async function render(size, file, maskable = false) {
  await page.setViewportSize({ width: size, height: size })
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#0f5c59;display:grid;place-items:center"><div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg}</div></div>`
    : `<div style="width:${size}px;height:${size}px">${svg}</div>`
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true })
}

// Icono de la pantalla de inicio de iOS (H2): cuadrado opaco de 180 px; iOS redondea las esquinas.
async function renderApple(size, file) {
  await page.setViewportSize({ width: size, height: size })
  const inner = `<div style="width:${size}px;height:${size}px;background:#0f5c59;display:grid;place-items:center"><div style="width:${size * 0.86}px;height:${size * 0.86}px">${svg}</div></div>`
  await page.setContent(`<html><body style="margin:0">${inner}</body></html>`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname })
}

// Iconos de los atajos del manifiesto (96 px): el mismo trazo que la app (iconPaths.ts) sobre el color de la marca.
const iconSource = readFileSync(new URL('../src/ui/components/iconPaths.ts', import.meta.url), 'utf8')
const pathOf = (name) => {
  const m = new RegExp(`^  ${name}: '([^']+)'`, 'm').exec(iconSource)
  if (!m) throw new Error(`Icono ${name} no encontrado en iconPaths.ts`)
  return m[1]
}
async function renderShortcut(name, file) {
  const size = 96
  await page.setViewportSize({ width: size, height: size })
  const glyph = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${pathOf(name)}"/></svg>`
  const inner = `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#0f5c59;display:grid;place-items:center">${glyph}</div>`
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`)
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true })
}

await render(192, 'icon-192.png')
await render(512, 'icon-512.png')
await render(512, 'icon-maskable-512.png', true)
await renderApple(180, 'apple-touch-icon.png')
await renderShortcut('arrowUp', 'shortcut-gasto.png')
await renderShortcut('arrowDown', 'shortcut-ingreso.png')
await renderShortcut('sparkles', 'shortcut-asistente.png')
await browser.close()
console.log('Iconos generados en public/')
