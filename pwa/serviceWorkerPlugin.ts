import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Archivos de `public/` que se copian a `dist/` pero NO se precachean: cabeceras y redirecciones
 * del alojamiento (Cloudflare Pages) y notas en Markdown.
 */
export const PUBLIC_EXCLUDE: readonly RegExp[] = [/(^|\/)_headers$/, /(^|\/)_redirects$/, /\.md$/i]

/** Lista (relativa, con «/») de los archivos de `public/` que forman parte de la app. */
export function publicStatics(publicDir: string): string[] {
  const out: string[] = []
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(join(dir, entry.name), rel)
      else if (!PUBLIC_EXCLUDE.some((rx) => rx.test(rel))) out.push(rel)
    }
  }
  walk(publicDir, '')
  return out.sort()
}

/**
 * Genera `sw.js` al compilar, con la lista exacta de archivos de esta versión: el paquete de Vite
 * más todo lo de `public/` salvo `PUBLIC_EXCLUDE` (antes era una lista escrita a mano y los iconos
 * nuevos se quedaban fuera, H2). La versión de la caché cambia si cambia cualquier archivo, también
 * un icono. Sin dependencias externas. Solo en `npm run build`.
 */
export function serviceWorker(options: { publicDir: string }): Plugin {
  return {
    name: 'margen-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => f !== 'index.html' && f !== 'sw.js' && !f.endsWith('.map'))
        .sort()
      const statics = publicStatics(options.publicDir).filter((f) => !files.includes(f))
      const precache = ['/', ...files.map((f) => `/${f}`), ...statics.map((f) => `/${f}`)]
      const html = bundle['index.html']
      const htmlSource = html && html.type === 'asset' ? String(html.source) : ''
      const hash = createHash('sha256').update(files.join('|')).update(htmlSource)
      for (const f of statics) hash.update(f).update(readFileSync(join(options.publicDir, f)))
      const version = hash.digest('hex').slice(0, 12)
      const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8')
      const source = template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache, null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}
