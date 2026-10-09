import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
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
      const statics = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'theme.js']
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

/**
 * Política de seguridad de contenido (solo en la versión compilada: el servidor de
 * desarrollo necesita scripts en línea). Solo se cargan archivos de la propia app y
 * no se permite conectar con otros sitios: si alguna vez se colara texto con código,
 * el navegador no lo ejecutaría ni podría enviar datos fuera.
 */
/**
 * Origen permitido para el proveedor remoto del asistente: solo si la compilación define
 * `VITE_AI_ENDPOINT` con https. Sin él, `connect-src` sigue siendo solo la propia app.
 */
export function remoteOrigin(endpoint: string | undefined): string | null {
  if (!endpoint) return null
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

export function buildCsp(aiEndpoint?: string): string {
  const remote = remoteOrigin(aiEndpoint)
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React aplica algunos estilos en línea (atributo style) para gráficos y barras.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${remote ? ` ${remote}` : ''}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ')
}

function contentSecurityPolicy(aiEndpoint?: string): Plugin {
  const csp = buildCsp(aiEndpoint)
  return {
    name: 'margen-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`)
    },
  }
}

/** Versión de package.json (H1). */
const APP_VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

/** Hash corto del commit compilado: el de GitHub Actions o el de git local; «dev» si no hay git. */
function buildHash(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_HASH__: JSON.stringify(buildHash()),
  },
  plugins: [react(), serviceWorker(), contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_').VITE_AI_ENDPOINT)],
  test: {
    // Las pruebas unitarias cubren la lógica financiera pura (sin navegador).
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}))
