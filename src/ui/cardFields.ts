/** Estado y lectura de los campos de tarjeta (sin componentes, para poder compartirlo). */
import { useState } from 'react'
import { DEFAULT_MIN_PAYMENT_BPS, DEFAULT_MIN_PAYMENT_FLOOR_MINOR } from '../domain/cards'
import { bpsToInputString, parsePercentBps } from '../domain/money'
import type { CardDetails } from '../domain/types'
import type { Translator } from '../i18n'
import type { Formatter } from './format'
import { moneyErrorMessage, parseMoneyText } from './moneyText'

export interface CardFieldsState {
  limit: string
  apr: string
  statementDay: string
  dueDay: string
  minPct: string
  minFloor: string
}

export function useCardFields(card: CardDetails | undefined, fmt: Formatter) {
  return useState<CardFieldsState>(() => ({
    limit: card?.limitMinor !== undefined ? fmt.moneyInput(card.limitMinor) : '',
    apr: card?.aprBps !== undefined ? bpsToInputString(card.aprBps, fmt.numberLocale) : '',
    statementDay: card?.statementDay ? String(card.statementDay) : '',
    dueDay: card?.dueDay ? String(card.dueDay) : '',
    minPct: bpsToInputString(card?.minPaymentBps ?? DEFAULT_MIN_PAYMENT_BPS, fmt.numberLocale),
    minFloor: fmt.moneyInput(card?.minPaymentFloorMinor ?? DEFAULT_MIN_PAYMENT_FLOOR_MINOR),
  }))
}

export type CardErrors = Partial<Record<keyof CardFieldsState, string>>

/** Convierte los textos en datos de tarjeta, o devuelve errores por campo. */
export function parseCardFields(s: CardFieldsState, fmt: Formatter, t: Translator['t']): { card: CardDetails | null; errors: CardErrors } {
  const errors: CardErrors = {}
  const card: CardDetails = {}
  if (s.limit.trim()) {
    const r = parseMoneyText(s.limit, fmt)
    if (r.ok) card.limitMinor = r.minor
    else errors.limit = moneyErrorMessage(t, r) ?? undefined
  }
  for (const [field, key] of [
    ['apr', 'aprBps'],
    ['minPct', 'minPaymentBps'],
  ] as const) {
    if (!s[field].trim()) continue
    const r = parsePercentBps(s[field], fmt.numberLocale)
    if (r.ok) card[key] = r.minor
    else errors[field] = t('card.invalidPercent')
  }
  if (s.minFloor.trim()) {
    const r = parseMoneyText(s.minFloor, fmt, { allowZero: true })
    if (r.ok) card.minPaymentFloorMinor = r.minor
    else errors.minFloor = moneyErrorMessage(t, r) ?? undefined
  }
  if (s.statementDay) card.statementDay = Number(s.statementDay)
  if (s.dueDay) card.dueDay = Number(s.dueDay)
  return { card: Object.keys(errors).length ? null : card, errors }
}
