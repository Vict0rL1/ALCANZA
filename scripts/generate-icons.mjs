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

await render(192, 'icon-192.png')
await render(512, 'icon-512.png')
await render(512, 'icon-maskable-512.png', true)
await browser.close()
console.log('Iconos generados en public/')
