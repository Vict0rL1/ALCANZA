/**
 * Textos de la interfaz. Español es el idioma completo de la primera fase;
 * `en.ts` tiene la misma estructura y se completará en una fase posterior.
 * Una clave que falte en inglés usa el texto en español.
 */
import { createContext, useContext } from 'react'
import type { Language } from '../domain/types'
import { en } from './en'
import { es } from './es'

export type MessageKey = keyof typeof es
export type Params = Record<string, string | number>

const dictionaries: Record<Language, Partial<Record<MessageKey, string>>> = { es, en }

function interpolate(message: string, params?: Params): string {
  if (!params) return message
  return message.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

export function translate(language: Language, key: MessageKey, params?: Params): string {
  const message = dictionaries[language][key] ?? es[key] ?? key
  return interpolate(message, params)
}

/** Plurales: busca `<clave>_one` o `<clave>_other` según la cantidad. */
export function translatePlural(language: Language, base: string, count: number, params?: Params): string {
  const rule = new Intl.PluralRules(language).select(count) === 'one' ? 'one' : 'other'
  const key = `${base}_${rule}` as MessageKey
  return translate(language, key, { count, ...params })
}

export interface Translator {
  language: Language
  t: (key: MessageKey, params?: Params) => string
  tn: (base: string, count: number, params?: Params) => string
}

/**
 * `extra` añade textos que vienen de los datos (nombres de categorías
 * personalizadas: `category.c_…`), así se muestran igual que las fijas.
 */
export function createTranslator(language: Language, extra: Record<string, string> = {}): Translator {
  return {
    language,
    t: (key, params) => (key in extra ? interpolate(extra[key]!, params) : translate(language, key, params)),
    tn: (base, count, params) => translatePlural(language, base, count, params),
  }
}

export const I18nContext = createContext<Translator>(createTranslator('es'))

export function useT(): Translator {
  return useContext(I18nContext)
}
