/**
 * Etiquetas (§7.7): nombre y color; un movimiento o favorito puede llevar varias. Borrar una
 * etiqueta la quita de los registros sin tocar importes ni fechas.
 */
import type { OpContext, OpResult } from './operations'
import type { AppData, CategoryColor, Tag } from './types'
import { validateTag, type Issue } from './validation'

function fail(issues: Issue[]): { ok: false; issues: Issue[] } {
  return { ok: false, issues }
}

export function saveTag(data: AppData, draft: { id: string; name: string; color: CategoryColor }, ctx: OpContext): OpResult<Tag> {
  const existing = data.tags.find((t) => t.id === draft.id)
  const tag: Tag = { id: draft.id, name: draft.name.trim(), color: draft.color, createdAt: existing?.createdAt ?? ctx.now, updatedAt: ctx.now }
  const issues = validateTag(tag, data.tags)
  if (issues.length) return fail(issues)
  const tags = existing ? data.tags.map((t) => (t.id === tag.id ? tag : t)) : [...data.tags, tag]
  return { ok: true, data: { ...data, tags, updatedAt: ctx.now }, value: tag }
}

/** Movimientos (sin papelera) que llevan la etiqueta. */
export function tagUsage(data: Pick<AppData, 'transactions' | 'favorites'>, tagId: string): { transactions: number; favorites: number } {
  return {
    transactions: data.transactions.filter((t) => t.tagIds?.includes(tagId)).length,
    favorites: data.favorites.filter((f) => f.tagIds?.includes(tagId)).length,
  }
}

export function deleteTag(data: AppData, id: string, ctx: OpContext): OpResult<Tag> {
  const tag = data.tags.find((t) => t.id === id)
  if (!tag) return fail([{ path: 'id', code: 'notFound' }])
  const without = <T extends { tagIds?: string[]; updatedAt: string }>(item: T): T => {
    if (!item.tagIds?.includes(id)) return item
    const tagIds = item.tagIds.filter((x) => x !== id)
    const { tagIds: _old, ...rest } = item
    return { ...(rest as T), ...(tagIds.length ? { tagIds } : {}), updatedAt: ctx.now }
  }
  return {
    ok: true,
    data: {
      ...data,
      tags: data.tags.filter((t) => t.id !== id),
      transactions: data.transactions.map(without),
      favorites: data.favorites.map(without),
      trash: data.trash.map((e) => ({ ...e, transaction: without(e.transaction) })),
      updatedAt: ctx.now,
    },
    value: tag,
  }
}

/** Restaurar tras borrar (deshacer): solo la etiqueta; los vínculos quitados no se recuperan. */
export function restoreTag(data: AppData, tag: Tag, ctx: OpContext): OpResult<Tag> {
  if (data.tags.some((t) => t.id === tag.id)) return { ok: true, data, value: tag, unchanged: true }
  const issues = validateTag(tag, data.tags)
  if (issues.length) return fail(issues)
  return { ok: true, data: { ...data, tags: [...data.tags, tag], updatedAt: ctx.now }, value: tag }
}
