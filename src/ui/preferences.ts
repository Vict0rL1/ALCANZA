/**
 * Preferencias de presentación de ESTE dispositivo: vista esencial o completa, orden y
 * visibilidad de las secciones secundarias de Inicio, accesos rápidos y modo privado.
 *
 * - No son datos financieros: no cambian ninguna cifra, no viajan en las copias ni entran en
 *   el historial. «Restaurar diseño» solo borra esto (nunca datos).
 * - El modo privado solo oculta importes en pantalla. NO es autenticación ni cifrado, y no
 *   cambia lo que se exporta ni lo que se guarda.
 * - Siempre visibles, sea cual sea la preferencia: el disponible y su explicación, registrar
 *   un movimiento y los avisos críticos para la confianza.
 */
import { useSyncExternalStore } from 'react'

export const PREFS_KEY = 'clara.ui.v1'

export const HOME_SECTIONS = ['inbox', 'reminders', 'upcoming', 'weekly', 'goals', 'freshness'] as const
export type HomeSection = (typeof HOME_SECTIONS)[number]

export const QUICK_ACTIONS = ['afford', 'income', 'transfer', 'whatChanged', 'search', 'calendar', 'reconcile', 'scenarios'] as const
export type QuickAction = (typeof QUICK_ACTIONS)[number]
export const MAX_QUICK_ACTIONS = 3

export interface UiPreferences {
  view: 'full' | 'essential'
  sections: { id: HomeSection; visible: boolean }[]
  quickActions: QuickAction[]
  privacy: boolean
}

export const DEFAULT_PREFERENCES: UiPreferences = {
  view: 'full',
  sections: HOME_SECTIONS.map((id) => ({ id, visible: true })),
  quickActions: ['afford'],
  privacy: false,
}

/** Lee y repara lo guardado: ids desconocidos fuera, secciones nuevas al final, visibles. */
export function normalizePreferences(raw: unknown): UiPreferences {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<UiPreferences>
  const seen = new Set<HomeSection>()
  const sections: UiPreferences['sections'] = []
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    if (s && HOME_SECTIONS.includes(s.id) && !seen.has(s.id)) {
      seen.add(s.id)
      sections.push({ id: s.id, visible: s.visible !== false })
    }
  }
  for (const id of HOME_SECTIONS) if (!seen.has(id)) sections.push({ id, visible: true })
  const quickActions = Array.isArray(r.quickActions) ? [...new Set(r.quickActions.filter((a): a is QuickAction => QUICK_ACTIONS.includes(a)))].slice(0, MAX_QUICK_ACTIONS) : DEFAULT_PREFERENCES.quickActions
  return { view: r.view === 'essential' ? 'essential' : 'full', sections, quickActions, privacy: r.privacy === true }
}

let cache: { raw: string | null; value: UiPreferences } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(PREFS_KEY)
  } catch {
    return null
  }
}

export function readPreferences(): UiPreferences {
  const raw = readRaw()
  if (cache && cache.raw === raw) return cache.value
  let parsed: unknown = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    parsed = null
  }
  cache = { raw, value: normalizePreferences(parsed) }
  return cache.value
}

const listeners = new Set<() => void>()
let memoryOnly: UiPreferences | null = null

export function writePreferences(next: UiPreferences | null): void {
  try {
    if (next === null) localStorage.removeItem(PREFS_KEY)
    else localStorage.setItem(PREFS_KEY, JSON.stringify(next))
    memoryOnly = null
  } catch {
    // Sin almacenamiento: se aplica solo en esta visita.
    memoryOnly = next
  }
  cache = null
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === PREFS_KEY || e.key === null) {
      cache = null
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

const snapshot = () => memoryOnly ?? readPreferences()

export function usePreferences(): [UiPreferences, (update: (p: UiPreferences) => UiPreferences) => void] {
  const prefs = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_PREFERENCES)
  return [prefs, (update) => writePreferences(update(snapshot()))]
}

export function usePrivacy(): boolean {
  return useSyncExternalStore(subscribe, () => snapshot().privacy, () => false)
}

/** Mueve una sección una posición (alternativa accesible a arrastrar). */
export function moveSection(prefs: UiPreferences, id: HomeSection, delta: -1 | 1): UiPreferences {
  const i = prefs.sections.findIndex((s) => s.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= prefs.sections.length) return prefs
  const sections = [...prefs.sections]
  ;[sections[i], sections[j]] = [sections[j]!, sections[i]!]
  return { ...prefs, sections }
}
