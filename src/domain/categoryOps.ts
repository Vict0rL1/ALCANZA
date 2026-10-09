/**
 * Operaciones de categorías v2 (§7.6): editar aspecto (grupo, icono, color), renombrar, archivar
 * con reasignación, reordenar, grupos propios y elección del onboarding.
 *
 * Las categorías del sistema no se guardan: sus cambios van a `data.categoryPrefs[id]` (decisión
 * 17). Las personalizadas (`c_…`) viven en `data.categories`. Todas las funciones son puras y
 * devuelven `OpResult`; nunca borran movimientos ni cambian importes.
 */
import { categoriesForKind, EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS, isCustomCategoryId, isIncomeCategory, isSystemCategory, resolveCategories, SYSTEM_GROUP_IDS } from './categories'
import type { OpContext, OpResult } from './operations'
import type { AppData, Category, CategoryColor, CategoryGroup, CategoryPref, CustomCategory, Transaction } from './types'
import { validateCategory, validateCategoryGroup, validateCategoryPrefs, type Issue } from './validation'

function fail<T>(issues: Issue[]): OpResult<T> {
  return { ok: false, issues }
}

function touch(data: AppData, now: string): AppData {
  return { ...data, updatedAt: now }
}

export interface CategoryEditDraft {
  id: string
  /** Para una del sistema, `undefined` o vacío = volver al nombre traducido. */
  name?: string
  kind: 'expense' | 'income'
  groupId?: string
  icon?: string
  color?: CategoryColor
}

function knownGroup(data: AppData, groupId: string | undefined): boolean {
  if (groupId === undefined) return true
  return (SYSTEM_GROUP_IDS as readonly string[]).includes(groupId) || data.categoryGroups.some((g) => g.id === groupId)
}

/** Crea o edita una categoría (del sistema vía preferencias; personalizada en `categories`). */
export function saveCategoryV2(data: AppData, draft: CategoryEditDraft, ctx: OpContext): OpResult<Category> {
  if (!knownGroup(data, draft.groupId)) return fail([{ path: 'groupId', code: 'invalidValue' }])
  if (isSystemCategory(draft.id)) {
    const prev = data.categoryPrefs[draft.id] ?? {}
    const name = draft.name?.trim()
    const pref: CategoryPref = { ...prev }
    if (name) pref.name = name
    else delete pref.name
    if (draft.groupId !== undefined) pref.groupId = draft.groupId
    if (draft.icon !== undefined) pref.icon = draft.icon
    if (draft.color !== undefined) pref.color = draft.color
    const prefs = { ...data.categoryPrefs, [draft.id]: pref }
    const issues = validateCategoryPrefs(prefs)
    if (issues.length) return fail(issues.map((i) => ({ ...i, path: i.path.replace(`categoryPrefs.${draft.id}.`, '') })))
    // Un nombre personalizado no puede chocar con una personalizada del mismo tipo.
    if (name && data.categories.some((c) => c.kind === draft.kind && c.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) return fail([{ path: 'name', code: 'duplicateName' }])
    const next = touch({ ...data, categoryPrefs: prefs }, ctx.now)
    return { ok: true, data: next, value: resolveCategories(next).find((c) => c.id === draft.id)! }
  }
  if (!isCustomCategoryId(draft.id)) return fail([{ path: 'id', code: 'invalidId' }])
  const existing = data.categories.find((c) => c.id === draft.id)
  const category: CustomCategory = {
    id: draft.id,
    name: (draft.name ?? '').trim(),
    kind: existing?.kind ?? draft.kind,
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
    ...(existing?.sortOrder !== undefined ? { sortOrder: existing.sortOrder } : {}),
    ...(draft.groupId !== undefined ? { groupId: draft.groupId } : existing?.groupId ? { groupId: existing.groupId } : {}),
    ...(draft.icon !== undefined ? { icon: draft.icon } : existing?.icon ? { icon: existing.icon } : {}),
    ...(draft.color !== undefined ? { color: draft.color } : existing?.color ? { color: existing.color } : {}),
  }
  const issues = validateCategory(category, data.categories)
  if (issues.length) return fail(issues)
  const categories = existing ? data.categories.map((c) => (c.id === category.id ? category : c)) : [...data.categories, category]
  const next = touch({ ...data, categories }, ctx.now)
  return { ok: true, data: next, value: resolveCategories(next).find((c) => c.id === draft.id)! }
}

function kindOf(id: string, data: AppData): 'expense' | 'income' | null {
  if (isSystemCategory(id)) return isIncomeCategory(id) ? 'income' : 'expense'
  return data.categories.find((c) => c.id === id)?.kind ?? null
}

function usesCategory(tx: Transaction, id: string): boolean {
  return tx.categoryId === id || (tx.splits?.some((l) => l.categoryId === id) ?? false)
}

/** Cuántos registros (movimientos, papelera, programados, favoritos, reglas) usan la categoría. */
export function categoryUsage(data: AppData, id: string): number {
  return (
    data.transactions.filter((t) => usesCategory(t, id)).length +
    data.trash.filter((e) => usesCategory(e.transaction, id)).length +
    data.schedules.filter((s) => s.categoryId === id).length +
    data.favorites.filter((f) => f.categoryId === id).length +
    data.categoryRules.filter((r) => r.categoryId === id).length
  )
}

/**
 * Archiva (o restaura) una categoría. Con `reassignTo`, antes mueve todo lo que la usa a otra
 * categoría activa del mismo tipo (movimientos, líneas divididas, papelera, programados,
 * favoritos y reglas). Nunca se queda sin categorías activas de un tipo.
 */
export function setCategoryArchivedV2(data: AppData, id: string, archived: boolean, ctx: OpContext, options: { reassignTo?: string } = {}): OpResult<Category> {
  const kind = kindOf(id, data)
  if (!kind) return fail([{ path: 'id', code: 'notFound' }])
  const active = categoriesForKind(kind, data.categories, { prefs: data.categoryPrefs })
  if (archived && active.length <= 1 && active.includes(id)) return fail([{ path: 'id', code: 'lastCategoryOfKind' }])
  let next = data
  const target = options.reassignTo
  if (archived && target) {
    if (target === id || kindOf(target, data) !== kind || !active.includes(target)) return fail([{ path: 'reassignTo', code: 'invalidCategory' }])
    const move = (tx: Transaction): Transaction =>
      usesCategory(tx, id)
        ? {
            ...tx,
            ...(tx.categoryId === id ? { categoryId: target } : {}),
            ...(tx.splits ? { splits: tx.splits.map((l) => (l.categoryId === id ? { ...l, categoryId: target } : l)) } : {}),
            updatedAt: ctx.now,
          }
        : tx
    next = {
      ...next,
      transactions: next.transactions.map(move),
      trash: next.trash.map((e) => (usesCategory(e.transaction, id) ? { ...e, transaction: move(e.transaction) } : e)),
      schedules: next.schedules.map((s) => (s.categoryId === id ? { ...s, categoryId: target, updatedAt: ctx.now } : s)),
      favorites: next.favorites.map((f) => (f.categoryId === id ? { ...f, categoryId: target, updatedAt: ctx.now } : f)),
      categoryRules: next.categoryRules.map((r) => (r.categoryId === id ? { ...r, categoryId: target, updatedAt: ctx.now } : r)),
    }
  }
  if (isSystemCategory(id)) {
    const pref = { ...(next.categoryPrefs[id] ?? {}), archived }
    next = { ...next, categoryPrefs: { ...next.categoryPrefs, [id]: pref } }
  } else {
    const c = next.categories.find((x) => x.id === id)!
    if (c.archived === archived && next === data) return { ok: true, data, value: resolveCategories(data).find((x) => x.id === id)!, unchanged: true }
    next = { ...next, categories: next.categories.map((x) => (x.id === id ? { ...x, archived, updatedAt: ctx.now } : x)) }
  }
  next = touch(next, ctx.now)
  return { ok: true, data: next, value: resolveCategories(next).find((x) => x.id === id)! }
}

/** Mueve una categoría un puesto arriba o abajo dentro de las de su tipo; guarda el orden de todas. */
export function moveCategory(data: AppData, id: string, direction: -1 | 1, ctx: OpContext): OpResult<Category[]> {
  const kind = kindOf(id, data)
  if (!kind) return fail([{ path: 'id', code: 'notFound' }])
  const list = resolveCategories(data).filter((c) => c.kind === kind)
  const i = list.findIndex((c) => c.id === id)
  const j = i + direction
  if (j < 0 || j >= list.length) return { ok: true, data, value: list, unchanged: true }
  const reordered = [...list]
  ;[reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!]
  return setCategoryOrder(data, kind, reordered.map((c) => c.id), ctx)
}

/** Fija el orden completo de un tipo (ids activos y archivados; los que falten van al final). */
export function setCategoryOrder(data: AppData, kind: 'expense' | 'income', orderedIds: readonly string[], ctx: OpContext): OpResult<Category[]> {
  const all = resolveCategories(data).filter((c) => c.kind === kind)
  const known = new Set(all.map((c) => c.id))
  const order = [...orderedIds.filter((id) => known.has(id)), ...all.map((c) => c.id).filter((id) => !orderedIds.includes(id))]
  const base = kind === 'income' ? EXPENSE_CATEGORY_IDS.length : 0
  const prefs = { ...data.categoryPrefs }
  let categories = data.categories
  order.forEach((id, idx) => {
    const sortOrder = base + idx
    if (isSystemCategory(id)) prefs[id] = { ...(prefs[id] ?? {}), sortOrder }
    else categories = categories.map((c) => (c.id === id ? { ...c, sortOrder, updatedAt: ctx.now } : c))
  })
  const next = touch({ ...data, categoryPrefs: prefs, categories }, ctx.now)
  return { ok: true, data: next, value: resolveCategories(next).filter((c) => c.kind === kind) }
}

export interface CategoryGroupDraft {
  id: string
  name: string
  color: CategoryColor
}

/** Crea o renombra un grupo propio (los del sistema no se editan). */
export function saveCategoryGroup(data: AppData, draft: CategoryGroupDraft, ctx: OpContext): OpResult<CategoryGroup> {
  if ((SYSTEM_GROUP_IDS as readonly string[]).includes(draft.id)) return fail([{ path: 'id', code: 'invalidId' }])
  const existing = data.categoryGroups.find((g) => g.id === draft.id)
  const group: CategoryGroup = {
    id: draft.id,
    name: draft.name.trim(),
    color: draft.color,
    sortOrder: existing?.sortOrder ?? 100 + data.categoryGroups.length,
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  }
  const issues = validateCategoryGroup(group, data.categoryGroups)
  if (issues.length) return fail(issues)
  const categoryGroups = existing ? data.categoryGroups.map((g) => (g.id === group.id ? group : g)) : [...data.categoryGroups, group]
  return { ok: true, data: touch({ ...data, categoryGroups }, ctx.now), value: group }
}

/** Elimina un grupo propio; sus categorías pasan a «Otros» (o «Ingresos»). Nada más cambia. */
export function deleteCategoryGroup(data: AppData, id: string, ctx: OpContext): OpResult<CategoryGroup> {
  const group = data.categoryGroups.find((g) => g.id === id)
  if (!group) return fail([{ path: 'id', code: 'notFound' }])
  const prefs = { ...data.categoryPrefs }
  for (const [cid, pref] of Object.entries(prefs)) if (pref.groupId === id) prefs[cid] = { ...pref, groupId: isIncomeCategory(cid) ? 'income' : 'other' }
  const categories = data.categories.map((c) => (c.groupId === id ? { ...c, groupId: c.kind === 'income' ? 'income' : 'other', updatedAt: ctx.now } : c))
  return { ok: true, data: touch({ ...data, categoryGroups: data.categoryGroups.filter((g) => g.id !== id), categoryPrefs: prefs, categories }, ctx.now), value: group }
}

/**
 * Elección del onboarding: las del sistema que no se marcaron quedan archivadas (siguen válidas
 * para datos antiguos y se pueden restaurar). Debe quedar al menos una activa de cada tipo.
 */
export function applyOnboardingCategories(data: AppData, selectedIds: readonly string[], ctx: OpContext): OpResult<AppData> {
  const selected = new Set(selectedIds)
  if (!EXPENSE_CATEGORY_IDS.some((id) => selected.has(id))) return fail([{ path: 'categoryIds', code: 'lastCategoryOfKind' }])
  if (!INCOME_CATEGORY_IDS.some((id) => selected.has(id))) return fail([{ path: 'categoryIds', code: 'lastCategoryOfKind' }])
  const prefs = { ...data.categoryPrefs }
  for (const id of [...EXPENSE_CATEGORY_IDS, ...INCOME_CATEGORY_IDS]) {
    const archived = !selected.has(id)
    const prev = prefs[id] ?? {}
    if (archived) prefs[id] = { ...prev, archived: true }
    else if (prev.archived) {
      const { archived: _drop, ...rest } = prev
      prefs[id] = rest
    }
  }
  const next = touch({ ...data, categoryPrefs: prefs }, ctx.now)
  return { ok: true, data: next, value: next }
}
