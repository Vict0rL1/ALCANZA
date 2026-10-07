/**
 * Categorías del sistema (§7.1) y grupos. Los nombres visibles están en i18n
 * (`category.<id>`, `categoryGroup.<id>`), así se traducen sin tocar los datos guardados.
 *
 * Las categorías del sistema no se guardan en los datos: `data.categoryPrefs[id]` guarda lo que la
 * persona cambie de ellas (nombre, archivada, grupo, icono, color, orden). Las personalizadas
 * (`c_…`) viven en `data.categories`. `resolveCategories` devuelve todas con la misma forma.
 */
import type { AppData, Category, CategoryColor, CategoryGroup, CustomCategory } from './types'

/** Los 16 colores de categoría (§4), en orden. */
export const CATEGORY_COLOR_LIST: readonly CategoryColor[] = [
  'emerald', 'green', 'lime', 'yellow', 'amber', 'orange', 'red', 'rose',
  'pink', 'purple', 'violet', 'indigo', 'blue', 'sky', 'cyan', 'teal',
]

export const SYSTEM_GROUP_IDS = ['family', 'food', 'home', 'lifestyle', 'transport', 'other', 'income'] as const
export type SystemGroupId = (typeof SYSTEM_GROUP_IDS)[number]

const GROUP_COLORS: Record<SystemGroupId, CategoryColor> = {
  family: 'pink',
  food: 'orange',
  home: 'blue',
  lifestyle: 'purple',
  transport: 'sky',
  other: 'teal',
  income: 'emerald',
}

export const SYSTEM_GROUPS: readonly CategoryGroup[] = SYSTEM_GROUP_IDS.map((id, i) => ({ id, nameKey: `categoryGroup.${id}`, color: GROUP_COLORS[id], sortOrder: i }))

interface SystemCategoryMeta {
  groupId: SystemGroupId
  icon: string
  color: CategoryColor
  /** Se propone marcada en el onboarding (las 16 + 6 de Lukas); las demás son extras de Clara. */
  defaultOn: boolean
}

/**
 * Gasto: las 16 de §7.1 (con los ids históricos de Clara donde ya existían) más `phone_internet`,
 * que Clara ya tenía. Ingreso: las 6 de §7.1 más las que Clara ya tenía.
 */
const EXPENSE_META = {
  groceries: { groupId: 'food', icon: 'basket', color: 'green', defaultOn: true },
  dining: { groupId: 'food', icon: 'utensils', color: 'orange', defaultOn: true },
  housing: { groupId: 'home', icon: 'home', color: 'blue', defaultOn: true },
  utilities: { groupId: 'home', icon: 'bolt', color: 'yellow', defaultOn: true },
  phone_internet: { groupId: 'home', icon: 'wifi', color: 'sky', defaultOn: false },
  subscriptions: { groupId: 'lifestyle', icon: 'repeat', color: 'violet', defaultOn: true },
  shopping: { groupId: 'lifestyle', icon: 'shirt', color: 'pink', defaultOn: true },
  entertainment: { groupId: 'lifestyle', icon: 'film', color: 'purple', defaultOn: true },
  health: { groupId: 'family', icon: 'heart', color: 'red', defaultOn: true },
  education: { groupId: 'family', icon: 'book', color: 'indigo', defaultOn: true },
  personal: { groupId: 'lifestyle', icon: 'sparkles', color: 'rose', defaultOn: true },
  transport: { groupId: 'transport', icon: 'bus', color: 'cyan', defaultOn: true },
  fuel: { groupId: 'transport', icon: 'fuel', color: 'amber', defaultOn: true },
  children: { groupId: 'family', icon: 'baby', color: 'lime', defaultOn: true },
  pets: { groupId: 'family', icon: 'paw', color: 'teal', defaultOn: true },
  gifts: { groupId: 'other', icon: 'gift', color: 'rose', defaultOn: true },
  other_expense: { groupId: 'other', icon: 'tag', color: 'teal', defaultOn: true },
} as const satisfies Record<string, SystemCategoryMeta>

const INCOME_META = {
  salary: { groupId: 'income', icon: 'briefcase', color: 'emerald', defaultOn: true },
  freelance: { groupId: 'income', icon: 'laptop', color: 'green', defaultOn: true },
  bonus: { groupId: 'income', icon: 'star', color: 'yellow', defaultOn: true },
  investments: { groupId: 'income', icon: 'trend', color: 'lime', defaultOn: true },
  rent_received: { groupId: 'income', icon: 'key', color: 'sky', defaultOn: true },
  scholarship: { groupId: 'income', icon: 'book', color: 'indigo', defaultOn: false },
  government: { groupId: 'income', icon: 'landmark', color: 'blue', defaultOn: false },
  gift_income: { groupId: 'income', icon: 'gift', color: 'rose', defaultOn: false },
  other_income: { groupId: 'income', icon: 'tag', color: 'teal', defaultOn: true },
} as const satisfies Record<string, SystemCategoryMeta>

export const EXPENSE_CATEGORY_IDS = Object.keys(EXPENSE_META) as readonly (keyof typeof EXPENSE_META)[]
export const INCOME_CATEGORY_IDS = Object.keys(INCOME_META) as readonly (keyof typeof INCOME_META)[]

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORY_IDS)[number]
export type IncomeCategoryId = (typeof INCOME_CATEGORY_IDS)[number]
export type CategoryId = ExpenseCategoryId | IncomeCategoryId

const SYSTEM_META: Record<string, SystemCategoryMeta> = { ...EXPENSE_META, ...INCOME_META }

export function isExpenseCategory(id: string | undefined): id is ExpenseCategoryId {
  return !!id && id in EXPENSE_META
}

export function isIncomeCategory(id: string | undefined): id is IncomeCategoryId {
  return !!id && id in INCOME_META
}

export function isSystemCategory(id: string | undefined): boolean {
  return !!id && id in SYSTEM_META
}

export function isCustomCategoryId(id: string | undefined): boolean {
  return !!id && id.startsWith('c_')
}

/** Icono y color por defecto de una categoría del sistema (para datos anteriores a v9). */
export function systemCategoryMeta(id: string): SystemCategoryMeta | undefined {
  return SYSTEM_META[id]
}

/** Color de una categoría personalizada sin color guardado: estable por id. */
export function colorForId(id: string): CategoryColor {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CATEGORY_COLOR_LIST[h % CATEGORY_COLOR_LIST.length]!
}

/**
 * Categorías válidas según el tipo de movimiento: del sistema + personalizadas.
 * Las devoluciones usan categorías de gasto. Por defecto excluye las archivadas
 * (para formularios); la validación las incluye para no invalidar datos antiguos.
 * `prefs` permite excluir las del sistema que la persona archivó.
 */
export function categoriesForKind(
  kind: 'income' | 'expense' | 'refund' | 'transfer' | 'adjustment',
  custom: readonly CustomCategory[] = [],
  options: { includeArchived?: boolean; prefs?: AppData['categoryPrefs'] } = {},
): readonly string[] {
  // Transferencias y ajustes de conciliación no llevan categoría.
  if (kind === 'transfer' || kind === 'adjustment') return []
  const base = kind === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS
  const want = kind === 'income' ? 'income' : 'expense'
  const system = options.includeArchived || !options.prefs ? base : base.filter((id) => !options.prefs?.[id]?.archived)
  const extra = custom.filter((c) => c.kind === want && (options.includeArchived || !c.archived)).map((c) => c.id)
  return [...system, ...extra]
}

/** Todas las categorías (sistema + personalizadas) con la forma de §5, ordenadas por `sortOrder`. */
export function resolveCategories(data: Pick<AppData, 'categories' | 'categoryPrefs'>): Category[] {
  const prefs = data.categoryPrefs ?? {}
  const system: Category[] = [...EXPENSE_CATEGORY_IDS, ...INCOME_CATEGORY_IDS].map((id, i) => {
    const meta = SYSTEM_META[id]!
    const pref = prefs[id] ?? {}
    return {
      id,
      kind: isIncomeCategory(id) ? 'income' : 'expense',
      nameKey: `category.${id}`,
      ...(pref.name ? { name: pref.name } : {}),
      groupId: pref.groupId ?? meta.groupId,
      icon: pref.icon ?? meta.icon,
      color: pref.color ?? meta.color,
      isCustom: false,
      archived: pref.archived ?? false,
      sortOrder: pref.sortOrder ?? i,
    }
  })
  const custom: Category[] = (data.categories ?? []).map((c, i) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    groupId: c.groupId ?? (c.kind === 'income' ? 'income' : 'other'),
    icon: c.icon ?? 'tag',
    color: c.color ?? colorForId(c.id),
    isCustom: true,
    archived: c.archived,
    sortOrder: c.sortOrder ?? 1000 + i,
  }))
  return [...system, ...custom].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

/** Grupos del sistema + personalizados, ordenados. */
export function resolveGroups(data: Pick<AppData, 'categoryGroups'>): CategoryGroup[] {
  return [...SYSTEM_GROUPS, ...(data.categoryGroups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Ids de categorías que el onboarding propone marcadas (las 16 + 6 de §7.1). */
export function defaultOnboardingCategoryIds(): string[] {
  return Object.entries(SYSTEM_META)
    .filter(([, m]) => m.defaultOn)
    .map(([id]) => id)
}
