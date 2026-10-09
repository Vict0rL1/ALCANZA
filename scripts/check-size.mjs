/**
 * Presupuesto de tamaño (I4): el JS inicial —los archivos que `dist/index.html` carga al abrir la app
 * (`<script src>` y `<link rel="modulepreload">`)— no puede crecer más de un 10 % sobre la referencia
 * guardada en `scripts/size-baseline.json`.
 *
 *   npm run build && npm run size            → compara y falla (código 1) si se pasa
 *   npm run size -- --update                 → reescribe la referencia (hazlo a propósito, en su propio commit)
 *
 * Se mide en bytes sin comprimir (lo que el navegador analiza); gzip se muestra solo como dato.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const TOLERANCE = 0.1

/** Rutas (relativas a dist/) de los JS locales que index.html carga al abrir. */
export function initialScripts(html) {
  const files = []
  const tag = /<(script|link)\b([^>]*)>/gi
  for (const [, name, attrs] of html.matchAll(tag)) {
    const attr = (key) => attrs.match(new RegExp(`\\b${key}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1]
    const url = name.toLowerCase() === 'script' ? attr('src') : attr('rel') === 'modulepreload' ? attr('href') : undefined
    if (!url || !url.startsWith('/') || url.startsWith('//') || !url.endsWith('.js')) continue
    files.push(url.slice(1))
  }
  return files
}

/** ¿El tamaño actual cabe en la referencia + 10 %? */
export function compareToBaseline(current, baseline) {
  const limit = Math.floor(baseline.bytes * (1 + TOLERANCE))
  const percent = ((current.bytes - baseline.bytes) / baseline.bytes) * 100
  return { ok: current.bytes <= limit, limit, percent }
}

export function measure(distDir) {
  const html = readFileSync(new URL('index.html', distDir), 'utf8')
  const files = initialScripts(html).map((path) => {
    const content = readFileSync(new URL(path, distDir))
    return { path, bytes: content.length, gzipBytes: gzipSync(content, { level: 9 }).length }
  })
  return {
    files,
    bytes: files.reduce((sum, f) => sum + f.bytes, 0),
    gzipBytes: files.reduce((sum, f) => sum + f.gzipBytes, 0),
  }
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

function main() {
  const root = new URL('../', import.meta.url)
  const distDir = new URL('dist/', root)
  const baselineUrl = new URL('scripts/size-baseline.json', root)
  const current = measure(distDir)
  for (const f of current.files) console.log(`  ${f.path.padEnd(48)} ${kb(f.bytes).padStart(10)} (gzip ${kb(f.gzipBytes)})`)
  console.log(`JS inicial: ${kb(current.bytes)} en ${current.files.length} archivos (gzip ${kb(current.gzipBytes)})`)

  if (process.argv.includes('--update')) {
    const baseline = { bytes: current.bytes, gzipBytes: current.gzipBytes, files: current.files.length }
    writeFileSync(baselineUrl, `${JSON.stringify(baseline, null, 2)}\n`)
    console.log(`Referencia actualizada en ${fileURLToPath(baselineUrl)}.`)
    return
  }
  const baseline = JSON.parse(readFileSync(baselineUrl, 'utf8'))
  const result = compareToBaseline(current, baseline)
  const sign = result.percent >= 0 ? '+' : ''
  console.log(`Referencia: ${kb(baseline.bytes)} · límite ${kb(result.limit)} · cambio ${sign}${result.percent.toFixed(1)} %`)
  if (!result.ok) {
    console.error(
      `El JS inicial creció más de un ${TOLERANCE * 100} % sobre la referencia. Reduce el tamaño (p. ej. carga diferida) ` +
        'o, si el aumento es intencionado, actualiza la referencia con `npm run size -- --update` en su propio commit.',
    )
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
