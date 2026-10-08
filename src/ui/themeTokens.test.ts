import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * El tema oscuro está definido dos veces en styles.css: dentro de `@media (prefers-color-scheme:
 * dark)` para «Sistema» y en `:root[data-theme='dark']` para «Oscuro». Deben ser idénticos.
 */
function block(css: string, header: string): Record<string, string> {
  const start = css.indexOf(header)
  expect(start, `bloque «${header}»`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  let depth = 0
  let i = open
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) break
  }
  const body = css.slice(open + 1, i)
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim()
  return out
}

describe('tokens del tema oscuro', () => {
  it('«Sistema» (prefers-color-scheme) y «Oscuro» (data-theme) definen los mismos valores', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
    const system = block(css, ":root:not([data-theme='light'])")
    const forced = block(css, ":root[data-theme='dark']")
    expect(Object.keys(system).length).toBeGreaterThan(20)
    expect(forced).toEqual(system)
  })
})
