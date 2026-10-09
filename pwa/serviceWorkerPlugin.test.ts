import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { serviceWorker } from './serviceWorkerPlugin.ts'

/** Ejecuta el plugin sobre un paquete y una carpeta public/ simulados y devuelve la lista precacheada. */
function precacheFor(publicFiles: string[]): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'clara-public-'))
  for (const f of publicFiles) {
    const path = join(dir, f)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, `contenido de ${f}`)
  }
  const plugin = serviceWorker({ publicDir: dir })
  const bundle = {
    'index.html': { type: 'asset', source: '<html></html>' },
    'assets/index-abc123.js': { type: 'chunk' },
    'assets/index-abc123.js.map': { type: 'asset' },
    'assets/index-def456.css': { type: 'asset' },
  }
  let sw = ''
  const ctx = { emitFile: (f: { fileName: string; source: string }) => (f.fileName === 'sw.js' ? (sw = f.source) : '') }
  const hook = plugin.generateBundle as unknown as (this: typeof ctx, o: unknown, b: typeof bundle) => void
  hook.call(ctx, {}, bundle)
  const match = /const PRECACHE = (\[[\s\S]*?\])/.exec(sw)
  if (!match) throw new Error('sw.js sin lista PRECACHE')
  return JSON.parse(match[1]!) as string[]
}

const PUBLIC = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'shortcut-gasto.png', 'shortcut-ingreso.png', 'shortcut-asistente.png', 'theme.js', '_headers', '_redirects', 'NOTAS.md']

describe('precaché del service worker (H2): sale de public/', () => {
  it('incluye cada archivo de public/ (también los iconos nuevos), «/» y theme.js', () => {
    const list = precacheFor(PUBLIC)
    for (const f of ['/', '/theme.js', '/manifest.webmanifest', '/apple-touch-icon.png', '/shortcut-gasto.png', '/shortcut-ingreso.png', '/shortcut-asistente.png', '/icon-192.png']) expect(list).toContain(f)
    expect(list).toContain('/assets/index-abc123.js')
    expect(list).toContain('/assets/index-def456.css')
  })

  it('excluye _headers, _redirects, notas .md, mapas e index.html', () => {
    const list = precacheFor(PUBLIC)
    for (const f of ['/_headers', '/_redirects', '/NOTAS.md', '/assets/index-abc123.js.map', '/index.html']) expect(list).not.toContain(f)
  })

  it('sin duplicados', () => {
    const list = precacheFor(PUBLIC)
    expect(new Set(list).size).toBe(list.length)
  })
})
