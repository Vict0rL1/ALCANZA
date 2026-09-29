/**
 * Búsqueda global (ver docs/FORMULAS.md §22). Todo ocurre en el dispositivo.
 *
 * - Sin distinguir mayúsculas ni acentos (`normalizeText`). Cada palabra de la consulta
 *   debe aparecer en el texto del resultado (Y lógico), en cualquier orden.
 * - Las categorías fijas se buscan por su nombre traducido al idioma activo; las
 *   personalizadas, tal como la persona las escribió. El nombre lo da `categoryName`
 *   (la capa de interfaz), así el dominio no depende de i18n.
 * - La papelera queda fuera salvo que se pida (`includeTrash`).
 * - El índice se construye una vez por versión de los datos e idioma; cada búsqueda
 *   solo recorre cadenas ya normalizadas.
 */
import { EXPENSE_CATEGORY_IDS, INCOME_CATEGORY_IDS } from './categories'
import { normalizeText } from './rules'
import type { AppData, LocalDate } from './types'

export type SearchKind = 'transaction' | 'account' | 'category' | 'goal' | 'schedule' | 'periodBudget' | 'favorite' | 'trash'

export const SEARCH_KINDS: readonly SearchKind[] = ['transaction', 'account', 'category', 'goal', 'schedule', 'periodBudget', 'favorite', 'trash']

export interface SearchEntry {
  kind: SearchKind
  id: string
  /** Texto principal ya legible (nota, nombre o categoría). */
  title: string
  /** Categoría legible, si tiene. */
  category?: string
  date?: LocalDate
  amountMinor?: number
  /** Para ordenar: los más recientes primero en movimientos y papelera. */
  sortKey: string
  haystack: string
}

export interface SearchIndex {
  entries: SearchEntry[]
}

export interface SearchGroup {
  kind: SearchKind
  total: number
  items: SearchEntry[]
}

export interface SearchOptions {
  includeTrash?: boolean
  /** Máximo de resultados mostrados por grupo (el total se informa aparte). */
  limitPerGroup?: number
}

export const MIN_QUERY_LENGTH = 2

function hay(...parts: (string | undefined)[]): string {
  return normalizeText(parts.filter(Boolean).join(' · '))
}

export function buildSearchIndex(data: AppData, categoryName: (id: string) => string): SearchIndex {
  const cat = (id: string | undefined) => (id ? categoryName(id) : undefined)
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]))
  const entries: SearchEntry[] = []

  for (const t of data.transactions) {
    const category = cat(t.categoryId)
    entries.push({
      kind: 'transaction',
      id: t.id,
      title: t.note || category || '',
      category,
      date: t.date,
      amountMinor: t.amountMinor,
      sortKey: `${t.date}${t.createdAt}`,
      haystack: hay(t.note, category, accountName.get(t.accountId), t.toAccountId ? accountName.get(t.toAccountId) : undefined),
    })
  }
  for (const e of data.trash) {
    const t = e.transaction
    const category = cat(t.categoryId)
    entries.push({
      kind: 'trash',
      id: e.id,
      title: t.note || category || '',
      category,
      date: t.date,
      amountMinor: t.amountMinor,
      sortKey: e.deletedAt,
      haystack: hay(t.note, category, accountName.get(t.accountId)),
    })
  }
  for (const a of data.accounts) entries.push({ kind: 'account', id: a.id, title: a.name, sortKey: a.name, haystack: hay(a.name) })
  const fixed = [...EXPENSE_CATEGORY_IDS, ...INCOME_CATEGORY_IDS]
  for (const id of fixed) {
    const name = categoryName(id)
    entries.push({ kind: 'category', id, title: name, sortKey: name, haystack: hay(name) })
  }
  for (const c of data.categories) entries.push({ kind: 'category', id: c.id, title: c.name, sortKey: c.name, haystack: hay(c.name) })
  for (const g of data.goals) {
    entries.push({ kind: 'goal', id: g.id, title: g.name, category: cat(g.plan?.categoryId), date: g.targetDate, amountMinor: g.targetMinor, sortKey: g.name, haystack: hay(g.name, cat(g.plan?.categoryId)) })
  }
  for (const s of data.schedules) {
    const category = cat(s.categoryId)
    entries.push({ kind: 'schedule', id: s.id, title: s.name || category || '', category, date: s.startDate, amountMinor: s.amountMinor, sortKey: s.name, haystack: hay(s.name, s.note, category) })
  }
  for (const b of data.periodBudgets) {
    entries.push({ kind: 'periodBudget', id: b.id, title: b.name, date: b.startDate, amountMinor: b.allocatedMinor, sortKey: b.startDate, haystack: hay(b.name, b.note) })
  }
  for (const f of data.favorites) {
    const category = cat(f.categoryId)
    entries.push({ kind: 'favorite', id: f.id, title: f.name, category, amountMinor: f.amountMinor, sortKey: String(f.order).padStart(4, '0'), haystack: hay(f.name, f.note, category) })
  }
  return { entries }
}

const DESCENDING: ReadonlySet<SearchKind> = new Set(['transaction', 'trash', 'periodBudget'])

export function search(index: SearchIndex, query: string, options: SearchOptions = {}): SearchGroup[] {
  const tokens = normalizeText(query).split(' ').filter(Boolean)
  if (tokens.join('').length < MIN_QUERY_LENGTH) return []
  const limit = options.limitPerGroup ?? 50
  const byKind = new Map<SearchKind, SearchEntry[]>()
  for (const e of index.entries) {
    if (e.kind === 'trash' && !options.includeTrash) continue
    if (!tokens.every((tok) => e.haystack.includes(tok))) continue
    const list = byKind.get(e.kind)
    if (list) list.push(e)
    else byKind.set(e.kind, [e])
  }
  const groups: SearchGroup[] = []
  for (const kind of SEARCH_KINDS) {
    const list = byKind.get(kind)
    if (!list) continue
    const desc = DESCENDING.has(kind)
    list.sort((a, b) => (desc ? b.sortKey.localeCompare(a.sortKey) : a.sortKey.localeCompare(b.sortKey)))
    groups.push({ kind, total: list.length, items: list.slice(0, limit) })
  }
  return groups
}
