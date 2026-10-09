/**
 * Tema de la interfaz: «Oscuro» (predeterminado), «Claro» o «Sistema». Es una preferencia visual de este
 * dispositivo (no forma parte de los datos ni de las copias). Cambiarlo solo pone un
 * atributo en <html>: no recarga ni desmonta pantallas, así que los formularios a medias
 * se conservan. `public/theme.js` lo aplica antes de pintar.
 */
import { useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export const THEME_KEY = 'clara.theme'

/** Oscuro es el tema predeterminado (§4); «Sistema» se guarda de forma explícita. */
export const DEFAULT_THEME: ThemePreference = 'dark'

export function readTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

/** Aplica en esta pestaña el tema que se elija en otra (se llama una vez al arrancar). */
export function watchThemeChanges() {
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY || e.key === null) applyTheme(readTheme())
  })
}

export function useThemePreference(): [ThemePreference, (t: ThemePreference) => void] {
  const [theme, setTheme] = useState<ThemePreference>(readTheme)
  // Mantiene el selector sincronizado si otra pestaña cambia el tema.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) setTheme(readTheme())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const choose = (next: ThemePreference) => {
    applyTheme(next)
    setTheme(next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // Sin almacenamiento: se aplica solo en esta visita.
    }
  }
  return [theme, choose]
}
