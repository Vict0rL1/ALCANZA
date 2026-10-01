/** Borradores de líneas de una compra dividida (texto editable → líneas en centavos). */
import { newId } from '../domain/ids'
import type { SplitLine } from '../domain/types'
import type { Formatter } from './format'
import { parseMoneyText } from './moneyText'

export interface SplitDraft {
  id: string
  categoryId: string
  amountText: string
  note: string
}

export function draftsFromLines(lines: SplitLine[], fmt: Formatter): SplitDraft[] {
  return lines.map((l) => ({ id: l.id, categoryId: l.categoryId, amountText: fmt.moneyInput(l.amountMinor), note: l.note ?? '' }))
}

export function newSplitDraft(categoryId: string, amountText = ''): SplitDraft {
  return { id: newId(), categoryId, amountText, note: '' }
}

/** Importes de las líneas (null si alguno no es válido). */
export function parseDrafts(drafts: SplitDraft[], fmt: Formatter): SplitLine[] | null {
  const out: SplitLine[] = []
  for (const d of drafts) {
    const parsed = parseMoneyText(d.amountText, fmt)
    if (!parsed.ok) return null
    out.push({ id: d.id, categoryId: d.categoryId, amountMinor: parsed.minor, ...(d.note.trim() ? { note: d.note.trim() } : {}) })
  }
  return out
}

