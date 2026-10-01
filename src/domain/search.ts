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
import { minorToDecimalString } from './money'
import { normalizeText } from './rules'
import { txCategoryIds } from './splits'
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
  /** Importe como texto exacto («4.25»; «650» si no tiene centavos) para buscar por importe. */
  amountKeys?: string[]
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
  const currency = data.settings.currency
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]))
  const entries: SearchEntry[] = []

  // Compras divididas: se encuentran por cualquiera de sus categorías y notas de línea.
  const splitText = (t: AppData['transactions'][number]) => [...txCategoryIds(t).map((c) => categoryName(c)), ...(t.splits ?? []).map((l) => l.note)]
  for (const t of data.transactions) {
    const category = t.splits?.length ? txCategoryIds(t).map((c) => categoryName(c)).join(', ') : cat(t.categoryId)
    entries.push({
      kind: 'transaction',
      id: t.id,
      title: t.note || category || '',
      category,
      date: t.date,
      amountMinor: t.amountMinor,
      sortKey: `${t.date}${t.createdAt}`,
      haystack: hay(t.note, category, ...splitText(t), accountName.get(t.accountId), t.toAccountId ? accountName.get(t.toAccountId) : undefined),
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
      haystack: hay(t.note, category, ...splitText(t), accountName.get(t.accountId)),
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
  for (const e of entries) {
    if (e.amountMinor === undefined) continue
    const exact = minorToDecimalString(e.amountMinor, currency)
    e.amountKeys = /\.0+$/.test(exact) ? [exact, exact.replace(/\.0+$/, '')] : [exact]
  }
  return { entries }
}

/**
 * Una palabra que parece un importe («4.25», «4,25», «$4.25», «650») se compara con el
 * importe exacto; así «25» no encuentra todos los importes que contienen 25.
 */
function amountToken(token: string): string | null {
  const cleaned = token.replace(/^[$€£¥]|[$€£¥]$/g, '').replace(',', '.')
  return /^\d+(\.\d{1,3})?$/.test(cleaned) ? cleaned : null
}

function matches(e: SearchEntry, token: string, amount: string | null): boolean {
  if (e.haystack.includes(token)) return true
  if (amount === null || !e.amountKeys) return false
  // «4.2» también encuentra 4.20.
  return e.amountKeys.some((k) => k === amount || (amount.includes('.') && k === amount.padEnd(k.length, '0')))
}

const DESCENDING: ReadonlySet<SearchKind> = new Set(['transaction', 'trash', 'periodBudget'])

export function search(index: SearchIndex, query: string, options: SearchOptions = {}): SearchGroup[] {
  const tokens = normalizeText(query).split(' ').filter(Boolean)
  if (tokens.join('').length < MIN_QUERY_LENGTH) return []
  const limit = options.limitPerGroup ?? 50
  const amounts = tokens.map(amountToken)
  const byKind = new Map<SearchKind, SearchEntry[]>()
  for (const e of index.entries) {
    if (e.kind === 'trash' && !options.includeTrash) continue
    if (!tokens.every((tok, i) => matches(e, tok, amounts[i]!))) continue
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
