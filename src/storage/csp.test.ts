import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCsp, remoteOrigin, renderHeaders } from '../../vite.config'

describe('CSP de la versión compilada', () => {
  it('solo conecta con la propia app; con un proveedor remoto https añade exactamente su origen', () => {
    expect(buildCsp()).toContain("connect-src 'self';")
    expect(buildCsp('https://ai.example.com/v1/parse?x=1')).toContain("connect-src 'self' https://ai.example.com;")
    expect(remoteOrigin('http://ai.example.com')).toBeNull()
    expect(remoteOrigin('no es una url')).toBeNull()
    expect(buildCsp('http://ai.example.com')).toContain("connect-src 'self';")
    expect(buildCsp()).toContain("font-src 'self'")
  })
})

describe('J2 · cabeceras de Cloudflare Pages (dist/_headers)', () => {
  const template = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')
  const directives = (csp: string) => csp.split(';').map((d) => d.trim()).filter(Boolean)
  const headerCsp = (headers: string) => headers.match(/^\s+Content-Security-Policy: (.+)$/m)?.[1] ?? ''

  it('la CSP de la cabecera es la de la etiqueta <meta> más frame-ancestors (que una <meta> ignora)', () => {
    for (const endpoint of [undefined, 'https://ai.example.com/v1']) {
      const headers = renderHeaders(template, endpoint)
      expect(directives(headerCsp(headers))).toEqual([...directives(buildCsp(endpoint)), "frame-ancestors 'none'"])
      expect(headers).not.toContain('__CSP__')
    }
  })

  it('protege todas las rutas y no deja guardar en caché lo que debe actualizarse', () => {
    const headers = renderHeaders(template)
    for (const line of [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: no-referrer',
      'X-Frame-Options: DENY',
      'Cross-Origin-Opener-Policy: same-origin',
      'Permissions-Policy: camera=(self), microphone=(self), geolocation=(), payment=(), usb=()',
      'X-Robots-Tag: noindex',
    ]) {
      expect(headers).toMatch(new RegExp(`^/\\*\\n(?:  .+\\n)*  ${line.replace(/[()*]/g, '\\$&')}$`, 'm'))
    }
    expect(headers).toMatch(/^\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m)
    for (const path of ['/sw.js', '/index.html', '/manifest.webmanifest']) {
      expect(headers).toContain(`\n${path}\n  Cache-Control: no-cache`)
    }
  })

  it('sin la marca __CSP__ en la plantilla la compilación falla (no publica sin CSP)', () => {
    expect(() => renderHeaders('/*\n  X-Frame-Options: DENY\n')).toThrow(/__CSP__/)
  })
})
