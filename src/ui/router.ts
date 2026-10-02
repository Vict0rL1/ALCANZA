/**
 * Enrutador mínimo basado en el hash (#/ruta). No necesita servidor ni
 * configuración especial, y funciona igual al instalar la app como PWA.
 */
import { useEffect, useState } from 'react'

export interface Route {
  path: string
  segments: string[]
  query: URLSearchParams
}

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  const [rawPath = '/', rawQuery = ''] = hash.split('?')
  const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(rawQuery) }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const onChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string, options: { replace?: boolean } = {}) {
  const target = `#${to}`
  if (options.replace) window.location.replace(target)
  else window.location.hash = to
}

export function href(to: string): string {
  return `#${to}`
}

export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? `${path}?${s}` : path
}
