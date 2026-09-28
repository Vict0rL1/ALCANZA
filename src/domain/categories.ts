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

/** Categorías válidas según el tipo de movimiento. Las devoluciones usan categorías de gasto. */
export function categoriesForKind(kind: 'income' | 'expense' | 'refund' | 'transfer'): readonly string[] {
  if (kind === 'income') return INCOME_CATEGORY_IDS
  if (kind === 'transfer') return []
  return EXPENSE_CATEGORY_IDS
}
