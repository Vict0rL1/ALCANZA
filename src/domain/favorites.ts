/**
 * Favoritos: plantillas de gastos o ingresos frecuentes (ver docs/FORMULAS.md §13).
 *
 * Un favorito solo rellena el formulario de un movimiento nuevo con la fecha de hoy;
 * la persona revisa y confirma. No es un pago recurrente y nunca registra nada solo.
 */
import { categoriesForKind } from './categories'
import type { AppData, Favorite } from './types'

export interface FavoritePrefill {
  kind: Favorite['kind']
  /** `undefined` si la cuenta ya no existe: el formulario pide elegir otra. */
  accountId?: string
  /** `undefined` si la categoría ya no existe o está archivada. */
  categoryId?: string
  amountMinor?: number
  note: string
  missingAccount: boolean
  missingCategory: boolean
}

export function favoritePrefill(data: Pick<AppData, 'accounts' | 'categories'>, favorite: Favorite): FavoritePrefill {
  const accountOk = data.accounts.some((a) => a.id === favorite.accountId)
  const categoryOk = categoriesForKind(favorite.kind, data.categories).includes(favorite.categoryId)
  return {
    kind: favorite.kind,
    accountId: accountOk ? favorite.accountId : undefined,
    categoryId: categoryOk ? favorite.categoryId : undefined,
    amountMinor: favorite.amountMinor,
    // Si la nota está vacía se usa el nombre del favorito como descripción del movimiento.
    note: favorite.note ?? favorite.name,
    missingAccount: !accountOk,
    missingCategory: !categoryOk,
  }
}

/** Favoritos en su orden, con indicación de referencias rotas. */
export function sortedFavorites(data: Pick<AppData, 'favorites' | 'accounts' | 'categories'>): (Favorite & { broken: boolean })[] {
  return [...data.favorites]
    .sort((a, b) => a.order - b.order)
    .map((f) => {
      const p = favoritePrefill(data, f)
      return { ...f, broken: p.missingAccount || p.missingCategory }
    })
}
