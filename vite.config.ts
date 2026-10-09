import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { serviceWorker } from './pwa/serviceWorkerPlugin.ts'

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

/**
 * Hash corto del commit compilado: el que indica CI (`CLARA_BUILD_SHA`, el commit de la rama del PR),
 * el de GitHub Actions o el de git local; «dev» si no hay git.
 */
function buildHash(): string {
  const fromCi = process.env.CLARA_BUILD_SHA || process.env.GITHUB_SHA
  if (fromCi && /^[0-9a-f]{7,40}$/.test(fromCi)) return fromCi.slice(0, 7)
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
  plugins: [react(), serviceWorker({ publicDir: 'public' }), contentSecurityPolicy(loadEnv(mode, process.cwd(), 'VITE_').VITE_AI_ENDPOINT)],
  test: {
    // Las pruebas unitarias cubren la lógica financiera pura (sin navegador).
    include: ['src/**/*.test.ts', 'pwa/**/*.test.ts'],
    environment: 'node',
  },
}))
