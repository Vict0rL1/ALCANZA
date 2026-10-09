/**
 * Contrato del enlace externo a «nuevo movimiento» (L1), para Atajos de iPhone y similares:
 *
 *   #/movimientos/nuevo?kind=expense&importe=12.50&comercio=Starbucks&source=shortcut
 *
 * - `importe`: unidades MAYORES, en el formato que dé Atajos («12.50», «12,50», «C$12.50»,
 *   «1.234,56», «12 USD»…). Se lee con `parseMoney`; si no se entiende, el importe queda vacío y se
 *   dice (nunca se adivina). Si la moneda escrita no es la del presupuesto, se rellena el número tal
 *   cual y se avisa: nunca se convierte.
 * - `amount`: unidades MENORES, solo para enlaces internos (V4). No cambia. Si vienen los dos,
 *   manda `importe`.
 * - `comercio`: rellena el comercio y sugiere categoría (regla > aprendizaje > diccionario).
 * - `source=shortcut`: el movimiento se guarda con ese origen (filtros y CSV).
 * Nada de esto guarda: solo rellena el formulario, que la persona revisa.
 */
import { categoriesForKind } from './categories'
import { parseMoney, SUPPORTED_CURRENCIES } from './money'
import { dictionaryCategory, learnCategories, significantWords } from './parser'
import { matchCategoryRule, normalizeText } from './rules'
import type { AppData, CurrencyCode } from './types'
import { LIMITS } from './validation'

/** Prefijos «C$», «CA$», «US$», «MX$», «R$», «COL$» → moneda. */
const DOLLAR_PREFIX: Record<string, string> = { C: 'CAD', CA: 'CAD', CAN: 'CAD', US: 'USD', U: 'USD', MX: 'MXN', MEX: 'MXN', R: 'BRL', COL: 'COP', CO: 'COP' }
const SYMBOL: Record<string, string> = { '€': 'EUR', '£': 'GBP', '¥': 'JPY' }

const CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code as string))

export type ShortcutAmount = { ok: true; minor: number; foreignCurrency?: string } | { ok: false }

export function parseShortcutAmount(text: string, currency: string, numberLocale: string): ShortcutAmount {
  let s = text.replace(/[  ]/g, ' ').trim()
  let marked: string | undefined
  // Código al final: «12 USD», «12,50 EUR».
  const suffix = /^(.*?)\s*([A-Za-z]{3})$/.exec(s)
  if (suffix && /\d/.test(suffix[1]!)) {
    if (!CODES.has(suffix[2]!.toUpperCase())) return { ok: false }
    marked = suffix[2]!.toUpperCase()
    s = suffix[1]!
  }
  // Prefijo: «CAD 12», «C$12.50», «US$ 12», «€12», «$12».
  const code = /^([A-Za-z]{3})\s*(?=[\d.,])/.exec(s)
  const dollar = /^([A-Za-z]{0,3})\$\s*/.exec(s)
  const symbol = /^([€£¥])\s*/.exec(s)
  if (code) {
    if (!CODES.has(code[1]!.toUpperCase())) return { ok: false }
    marked = code[1]!.toUpperCase()
    s = s.slice(code[0].length)
  } else if (dollar) {
    const letters = dollar[1]!.toUpperCase()
    if (letters && !DOLLAR_PREFIX[letters]) return { ok: false }
    if (letters) marked = DOLLAR_PREFIX[letters]
    s = s.slice(dollar[0].length)
  } else if (symbol) {
    marked = SYMBOL[symbol[1]!]
    s = s.slice(symbol[0].length)
  }
  const parsed = parseMoney(s, currency as CurrencyCode, numberLocale)
  if (!parsed.ok) return { ok: false }
  return marked && marked !== currency ? { ok: true, minor: parsed.minor, foreignCurrency: marked } : { ok: true, minor: parsed.minor }
}

export interface MovementLink {
  kind?: string
  /** Importe en unidades menores, si el enlace trajo uno que se entendió. */
  amountMinor?: number
  /** Vino `importe` pero no se entendió: el campo queda vacío y se avisa. */
  amountUnreadable: boolean
  /** El importe venía en otra moneda (se rellena sin convertir y se avisa). */
  foreignCurrency?: string
  merchant?: string
  fromShortcut: boolean
}

export function readMovementLink(query: { get(name: string): string | null }, settings: { currency: string; numberLocale: string }): MovementLink {
  const link: MovementLink = { amountUnreadable: false, fromShortcut: query.get('source') === 'shortcut' }
  const kind = query.get('kind')
  if (kind) link.kind = kind
  const importe = query.get('importe')
  const amount = query.get('amount')
  if (importe !== null) {
    const parsed = parseShortcutAmount(importe, settings.currency, settings.numberLocale)
    if (parsed.ok) {
      link.amountMinor = parsed.minor
      if (parsed.foreignCurrency) link.foreignCurrency = parsed.foreignCurrency
    } else link.amountUnreadable = true
  } else if (amount && /^\d+$/.test(amount)) {
    link.amountMinor = Number(amount)
  }
  const merchant = query.get('comercio')?.replace(/\s+/g, ' ').trim()
  if (merchant) link.merchant = merchant.slice(0, LIMITS.nameMax)
  return link
}

/** Categoría para un comercio: regla de la persona > aprendido de sus movimientos > diccionario. */
export function suggestCategoryForMerchant(
  merchant: string,
  kind: 'expense' | 'income',
  data: Pick<AppData, 'transactions' | 'categoryRules' | 'categories'> & Partial<Pick<AppData, 'categoryPrefs'>>,
): string | undefined {
  const rule = matchCategoryRule(merchant, kind, data.categoryRules, data.categories, data.categoryPrefs)
  if (rule) return rule.categoryId
  const allowed = new Set(categoriesForKind(kind, data.categories, { prefs: data.categoryPrefs }))
  const norm = normalizeText(merchant)
  const learned = learnCategories(data)
  for (const w of significantWords(norm)) {
    const id = learned[w]
    if (id && allowed.has(id)) return id
  }
  return dictionaryCategory(norm, kind, allowed)
}
