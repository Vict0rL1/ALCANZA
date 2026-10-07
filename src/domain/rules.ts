/**
 * Reglas de categoría por descripción (ver docs/FORMULAS.md §10 e).
 *
 * Una regla solo PROPONE una categoría: al importar un CSV o al escribir la nota de
 * un movimiento nuevo. La persona siempre puede cambiarla. Nunca toca importes.
 */
import { categoriesForKind } from './categories'
import type { AppData, CategoryRule, CustomCategory } from './types'

export const RULE_PATTERN_MIN = 2
export const RULE_PATTERN_MAX = 40

/** Minúsculas, sin acentos y con espacios simples: "  CAFÉ  Central " → "cafe central". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Regla que se aplica a una descripción. Si varias coinciden, gana el texto más
 * largo (el más específico: «uber eats» antes que «uber»); si empatan, la más antigua.
 * Se ignoran las reglas cuya categoría está archivada o ya no existe.
 */
export function matchCategoryRule(
  description: string | undefined,
  kind: 'expense' | 'income' | 'refund' | 'transfer',
  rules: readonly CategoryRule[],
  custom: readonly CustomCategory[] = [],
  prefs?: AppData['categoryPrefs'],
): CategoryRule | undefined {
  if (!description || kind === 'transfer') return undefined
  const wanted = kind === 'income' ? 'income' : 'expense'
  const text = normalizeText(description)
  if (!text) return undefined
  const usable = categoriesForKind(wanted, custom, { prefs })
  let best: CategoryRule | undefined
  for (const rule of rules) {
    if (rule.kind !== wanted || !usable.includes(rule.categoryId)) continue
    const pattern = normalizeText(rule.pattern)
    if (pattern.length < RULE_PATTERN_MIN || !text.includes(pattern)) continue
    if (
      !best ||
      pattern.length > normalizeText(best.pattern).length ||
      (pattern.length === normalizeText(best.pattern).length && rule.createdAt < best.createdAt)
    ) {
      best = rule
    }
  }
  return best
}
