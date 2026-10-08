import { describe, expect, it } from 'vitest'
import { createFormatter, MASKED_AMOUNT as MASKED } from './format'
import { DEFAULT_PREFERENCES, HOME_SECTIONS, moveSection, normalizePreferences } from './preferences'
import { baseData } from '../test/fixtures'

describe('preferencias de presentación', () => {
  it('repara lo guardado: ids desconocidos fuera, secciones nuevas al final y como mucho 3 accesos', () => {
    const p = normalizePreferences({ view: 'full', sections: [{ id: 'goals', visible: false }, { id: 'nope' }, { id: 'goals' }], quickActions: ['search', 'x', 'search', 'calendar', 'income', 'afford'], privacy: 'yes' })
    expect(p.view).toBe('full')
    expect(p.sections[0]).toEqual({ id: 'goals', visible: false })
    expect(p.sections.map((s) => s.id).sort()).toEqual([...HOME_SECTIONS].sort())
    expect(p.quickActions).toEqual(['search', 'calendar', 'income'])
    expect(p.privacy).toBe(0)
    // El antiguo booleano pasa a nivel 1; los niveles 1 y 2 se conservan; otra cosa, 0.
    expect(normalizePreferences({ privacy: true }).privacy).toBe(1)
    expect(normalizePreferences({ privacy: 2 }).privacy).toBe(2)
    expect(normalizePreferences({ privacy: 7 }).privacy).toBe(0)
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES)
  })

  it('mover una sección con botones respeta los extremos', () => {
    const up = moveSection(DEFAULT_PREFERENCES, 'reminders', -1)
    expect(up.sections.slice(0, 2).map((s) => s.id)).toEqual(['reminders', 'inbox'])
    expect(moveSection(DEFAULT_PREFERENCES, 'inbox', -1)).toBe(DEFAULT_PREFERENCES)
  })

  it('modo privado: solo cambia lo que se muestra; los campos de entrada conservan el importe', () => {
    const settings = baseData().settings
    const shown = createFormatter(settings, { privacy: true })
    expect(shown.money(12345)).toBe(`$${MASKED}`)
    expect(shown.money(-500, { sign: true })).toBe(`-$${MASKED}`)
    expect(shown.money(12345)).not.toMatch(/\d/)
    expect(shown.moneyInput(12345)).toBe(createFormatter(settings).moneyInput(12345))
    expect(createFormatter(settings).money(12345)).toBe('$123.45')
  })
})
