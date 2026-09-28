import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Genera `sw.js` al compilar, con la lista exacta de archivos de esta versión.
 * Sin dependencias externas. Solo se usa en `npm run build` (no en desarrollo).
 */
function serviceWorker(): Plugin {
  return {
    name: 'margen-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f !== 'index.html' && !f.endsWith('.map'))
        .sort()
      const statics = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']
      const precache = ['/', ...files.map((f) => `/${f}`), ...statics.map((f) => `/${f}`)]
      const html = bundle['index.html']
      const htmlSource = html && html.type === 'asset' ? String(html.source) : ''
      const version = createHash('sha256').update(files.join('|')).update(htmlSource).digest('hex').slice(0, 12)
      const template = readFileSync(new URL('./pwa/sw.template.js', import.meta.url), 'utf8')
      const source = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  test: {
    // Las pruebas unitarias cubren la lógica financiera pura (sin navegador).
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
