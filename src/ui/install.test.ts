import { describe, expect, it } from 'vitest'
import { daysOfUse, installMode, isIos, showInstallCard } from './install'

describe('K2 · guía para instalar Clara', () => {
  it('reconoce iPhone y iPad (también el iPad que se presenta como Mac)', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', maxTouchPoints: 5 })).toBe(true)
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', maxTouchPoints: 0 })).toBe(false)
    expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 16; Pixel 7) Chrome/153.0 Mobile Safari/537.36', maxTouchPoints: 5 })).toBe(false)
  })

  it('elige qué mostrar: instalada, pasos de Safari, botón del navegador o instrucciones', () => {
    expect(installMode({ standalone: true, ios: true, canPrompt: false })).toBe('installed')
    expect(installMode({ standalone: false, ios: true, canPrompt: false })).toBe('ios')
    expect(installMode({ standalone: false, ios: false, canPrompt: true })).toBe('prompt')
    // Sin evento del navegador no hay botón que no haría nada: solo instrucciones.
    expect(installMode({ standalone: false, ios: false, canPrompt: false })).toBe('manual')
  })

  it('días de uso desde que se creó el presupuesto, en la zona horaria de la persona', () => {
    expect(daysOfUse('2026-09-28T16:00:00.000Z', '2026-09-28', 'America/Toronto')).toBe(0)
    expect(daysOfUse('2026-09-28T16:00:00.000Z', '2026-10-01', 'America/Toronto')).toBe(3)
    // 23:30 en Toronto ya es el día siguiente en UTC: cuenta el día local.
    expect(daysOfUse('2026-09-29T03:30:00.000Z', '2026-09-29', 'America/Toronto')).toBe(1)
  })

  it('la tarjeta de Inicio sale una vez, tras 3 días, fuera de la app instalada y nunca en la demo', () => {
    const base = { mode: 'ios' as const, daysOfUse: 3, dismissed: false, isDemo: false }
    expect(showInstallCard(base)).toBe(true)
    expect(showInstallCard({ ...base, daysOfUse: 2 })).toBe(false)
    expect(showInstallCard({ ...base, dismissed: true })).toBe(false)
    expect(showInstallCard({ ...base, isDemo: true })).toBe(false)
    expect(showInstallCard({ ...base, mode: 'installed' })).toBe(false)
    expect(showInstallCard({ ...base, mode: 'prompt' })).toBe(true)
    expect(showInstallCard({ ...base, mode: 'manual' })).toBe(true)
  })
})

describe('K3 · «Protege tus datos» una sola vez', () => {
  it('justo después de la configuración (día 0) o al abrir por primera vez la app instalada; nunca en la demo ni dos veces', async () => {
    const { showSafetyCard } = await import('./install')
    const base = { isDemo: false, asked: false, daysOfUse: 0, standalone: false }
    expect(showSafetyCard(base)).toBe(true)
    expect(showSafetyCard({ ...base, daysOfUse: 5 })).toBe(false)
    expect(showSafetyCard({ ...base, daysOfUse: 5, standalone: true })).toBe(true)
    expect(showSafetyCard({ ...base, asked: true })).toBe(false)
    expect(showSafetyCard({ ...base, isDemo: true })).toBe(false)
  })
})
