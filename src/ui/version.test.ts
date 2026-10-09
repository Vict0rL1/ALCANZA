import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APP_VERSION, BUILD_HASH } from './version'

describe('versión de la app (H1)', () => {
  it('es la de package.json (1.0.0-beta.1) y lleva el hash corto de la compilación', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(pkg.version).toBe('1.0.0-beta.1')
    expect(APP_VERSION).toBe(pkg.version)
    expect(BUILD_HASH).toMatch(/^([0-9a-f]{7}|dev)$/)
  })
})
