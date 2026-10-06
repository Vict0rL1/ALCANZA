/**
 * Comprueba que los datos sintéticos de rendimiento son válidos para la app.
 * Con BENCH_OUT=<carpeta> además escribe los archivos de 1.000, 10.000 y 50.000
 * movimientos que usa `scripts/bench.mjs` (nunca se mezclan con datos del usuario).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateAppData } from '../storage/backup'
import { createSyntheticData, syntheticSpanDays } from './synthetic'

const TODAY = '2026-09-28'

describe('datos sintéticos de rendimiento', () => {
  it('1.000 movimientos: válidos, con divisiones, transferencias, devoluciones, recurrentes y papelera', () => {
    const d = createSyntheticData({ movements: 1000, today: TODAY })
    const r = validateAppData(JSON.parse(JSON.stringify(d)))
    expect(r.ok, JSON.stringify(!r.ok && r.issues.slice(0, 3))).toBe(true)
    expect(d.transactions.length + d.trash.length).toBeGreaterThanOrEqual(990)
    expect(d.transactions.some((t) => t.splits?.length)).toBe(true)
    expect(d.transactions.some((t) => t.kind === 'transfer' && t.toAccountId === 'visa')).toBe(true)
    expect(d.transactions.some((t) => t.kind === 'refund' && t.refundOfId)).toBe(true)
    expect(d.transactions.some((t) => t.scheduleId)).toBe(true)
    expect(d.trash.length).toBeGreaterThan(0)
    expect(d.isDemo).toBe(true)
  })

  const out = process.env.BENCH_OUT
  it.runIf(!!out)('escribe 1k, 10k y 50k para las mediciones', () => {
    mkdirSync(out!, { recursive: true })
    for (const size of [1000, 10000, 50000]) {
      const d = createSyntheticData({ movements: size, today: TODAY })
      const r = validateAppData(JSON.parse(JSON.stringify(d)))
      expect(r.ok, `${size}: ${JSON.stringify(!r.ok && r.issues.slice(0, 3))}`).toBe(true)
      const text = JSON.stringify(d)
      writeFileSync(`${out}/synthetic-${size}.json`, text)
      console.info(`synthetic ${size}: ${d.transactions.length} vivos + ${d.trash.length} papelera, ${syntheticSpanDays(d)} días, ${(text.length / 1024 / 1024).toFixed(2)} MB`)
    }
  }, 120_000)
})
