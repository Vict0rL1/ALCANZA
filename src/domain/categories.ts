import type { CustomCategory } from './types'

/**
 * Categorías fijas de la primera fase. Los nombres visibles están en i18n
 * (`category.<id>`), así se pueden traducir sin tocar los datos guardados.
 */
export const EXPENSE_CATEGORY_IDS = [
  'groceries',
  'dining',
  'transport',
  'housing',
  'utilities',
  'phone_internet',
  'education',
  'health',
  'entertainment',
  'shopping',
  'subscriptions',
  'personal',
  'gifts',
  'other_expense',
] as const

export const INCOME_CATEGORY_IDS = ['salary', 'freelance', 'scholarship', 'government', 'gift_income', 'other_income'] as const

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number]
export type IncomeCategoryId = (typeof INCOME_CATEGORY_IDS)[number]
export type CategoryId = ExpenseCategoryId | IncomeCategoryId

export function isExpenseCategory(id: string | undefined): id is ExpenseCategoryId {
  return !!id && (EXPENSE_CATEGORY_IDS as readonly string[]).includes(id)
}

export function isIncomeCategory(id: string | undefined): id is IncomeCategoryId {
  return !!id && (INCOME_CATEGORY_IDS as readonly string[]).includes(id)
}

export function isCustomCategoryId(id: string | undefined): boolean {
  return !!id && id.startsWith('c_')
}

/**
 * Categorías válidas según el tipo de movimiento: fijas + personalizadas.
 * Las devoluciones usan categorías de gasto. Por defecto excluye las archivadas
 * (para formularios); la validación las incluye para no invalidar datos antiguos.
 */
export function categoriesForKind(
  kind: 'income' | 'expense' | 'refund' | 'transfer',
  custom: readonly CustomCategory[] = [],
  options: { includeArchived?: boolean } = {},
): readonly string[] {
  if (kind === 'transfer') return []
  const base = kind === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS
  const want = kind === 'income' ? 'income' : 'expense'
  const extra = custom.filter((c) => c.kind === want && (options.includeArchived || !c.archived)).map((c) => c.id)
  return [...base, ...extra]
}
