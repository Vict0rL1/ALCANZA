import { afterEach, describe, expect, it, vi } from 'vitest'

/** Carga playwright.config.ts con las variables de entorno indicadas (el archivo las lee al importarse). */
async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string)
  return (await import('../../playwright.config')).default
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('I2 · playwright.config en CI y en local', () => {
  it('en CI reintenta una vez (para que --fail-on-flaky-tests detecte la inestabilidad) y deja un informe HTML sin abrirlo', async () => {
    const config = await loadConfig({ CI: 'true' })
    expect(config.retries).toBe(1)
    expect(config.reporter).toEqual([['list'], ['html', { open: 'never' }]])
  })

  it('en local no reintenta y solo usa la lista', async () => {
    const config = await loadConfig({ CI: '' })
    expect(config.retries).toBe(0)
    expect(config.reporter).toEqual([['list']])
  })

  it('las capturas visuales quedan fuera de la ejecución por defecto', async () => {
    const config = await loadConfig({ CI: '' })
    expect(config.testDir).toBe('./tests/e2e')
    expect((config.projects ?? []).map((p) => p.name)).toEqual(['celular', 'celular-pequeno', 'escritorio'])
  })
})
