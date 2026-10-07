import { describe, expect, it } from 'vitest'
import { aiUsagePercent, FREE_AI_USES_PER_MONTH, gate, isPro } from './featureGate'
import { baseData, TODAY } from '../test/fixtures'

describe('FeatureGate', () => {
  it('lo esencial es gratis; lo que no existe nunca se ofrece; Pro solo cuenta en desarrollo', () => {
    const s = baseData().settings
    for (const f of ['periods', 'statistics', 'plans', 'localBackups', 'lock', 'exportCsv', 'exportPdf', 'aiLocal'] as const) expect(gate(f, s, { today: TODAY }).allowed).toBe(true)
    expect(gate('cloudSync', s, { today: TODAY })).toEqual({ allowed: false, reason: 'notAvailable', remaining: null })
    const pro = { ...s, proStatus: { active: true } }
    expect(isPro(pro)).toBe(false)
    expect(isPro(pro, { devMode: true })).toBe(true)
    expect(isPro(s, { devMode: true })).toBe(false)
  })

  it('el proveedor remoto tiene cupo mensual gratuito; con Pro simulado es ilimitado', () => {
    const s = baseData().settings
    expect(gate('aiRemote', s, { today: TODAY })).toEqual({ allowed: true, reason: 'ok', remaining: FREE_AI_USES_PER_MONTH })
    const used = { ...s, aiUsage: { month: '2026-09', count: FREE_AI_USES_PER_MONTH - 1 } }
    expect(gate('aiRemote', used, { today: TODAY }).remaining).toBe(1)
    const full = { ...s, aiUsage: { month: '2026-09', count: FREE_AI_USES_PER_MONTH } }
    expect(gate('aiRemote', full, { today: TODAY })).toEqual({ allowed: false, reason: 'aiLimit', remaining: 0 })
    // Otro mes: cupo nuevo.
    expect(gate('aiRemote', full, { today: '2026-10-01' }).remaining).toBe(FREE_AI_USES_PER_MONTH)
    expect(gate('aiRemote', { ...full, proStatus: { active: true } }, { today: TODAY, devMode: true })).toEqual({ allowed: true, reason: 'ok', remaining: null })
    expect(aiUsagePercent(full, { today: TODAY })).toBe(100)
    expect(aiUsagePercent({ ...s, aiUsage: { month: '2026-09', count: 5 } }, { today: TODAY })).toBe(25)
    expect(aiUsagePercent({ ...full, proStatus: { active: true } }, { today: TODAY, devMode: true })).toBe(0)
  })
})
